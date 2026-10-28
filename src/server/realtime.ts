// WebSocket real time (ADR 0002). The server is the referee (ADR 0003): the
// browser only sends choices and displays what the server sends (R20). Each
// player has at most one live connection per game (R32); a game has at most
// two players (R36). A full snapshot is sent on every join (R24). No message
// to a player ever carries the opponent's pending choice (R21, R22): a
// chosen column only ever sets this server's in-memory pending state and
// tells the opponent opponent_ready, with nothing else, until both have
// chosen and the round resolves.
import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { newGame, resolveRound, validateChoice, type Choice, type GameState, type Player, type RejectReason } from "../engine/index.ts";
import { createGameService, ROUND_TIMER_MS, type GameService } from "./game-service.ts";
import type { Db, Ended } from "./db.ts";
import { logEvent } from "./log.ts";
import { chooseMove, seededRandom } from "./computer.ts";
import { createSpectators, SPECTATOR_MOVE_MS, type WatchableView } from "./spectators.ts";

export interface Snapshot {
  type: "snapshot";
  you: Player;
  seatToken: string;
  state: GameState;
  opponentReady: boolean;
  // Whether the other seat is taken by someone connected, so the waiting panel can go away
  // (docs/design.md "Waiting"). Presence is not a choice: nothing here reveals a column,
  // a shield or whether the opponent has chosen (R21, R22).
  opponentPresent: boolean;
  // Display names for the two panels (docs/design/game-screen.md U57). A name is public
  // identity, never a choice, so it is safe to send before a round resolves (R22). Null when
  // the seat's person is not known; the computer is named "Computer".
  yourName: string | null;
  opponentName: string | null;
  // How many people are watching this game (R75). A number only.
  watching: number;
}

export interface OpponentJoined {
  type: "opponent_joined";
  name?: string; // the arrival's display name, when known
}

export interface OpponentReady {
  type: "opponent_ready";
}

export interface Rejected {
  type: "rejected";
  reason: RejectReason | "already_chosen"; // already_chosen: R4, a choice is final
}

// How many people are watching (R75): a number only, sent to players when it changes.
export interface Watching {
  type: "watching";
  watching: number;
}

export interface GameFull {
  type: "game_full";
}

export interface TabReplaced {
  type: "tab_replaced";
}

export type GameOver =
  | { type: "game_over"; result: "forfeit"; winner: Player }
  | { type: "game_over"; result: "abandoned" }; // R19: no winner

export type ServerMessage = Snapshot | OpponentJoined | OpponentReady | Rejected | GameFull | TabReplaced | GameOver | Watching;

interface JoinMessage {
  type: "join";
  code: string;
  player?: Player;
  seatToken?: string;
}

interface ChooseMessage {
  type: "choose";
  code: string;
  player: Player;
  seatToken: string;
  column?: number;
  shield?: boolean;
  earthquake?: boolean; // Earthquake instead of a column (R54)
}

type ClientMessage = JoinMessage | ChooseMessage | { type: string; [key: string]: unknown };

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export interface RealtimeOptions {
  roundTimerMs?: number; // overridable so tests do not wait 10 real seconds (R18)
  disconnectGraceMs?: number; // overridable so tests do not wait 30 real seconds (R27)
  computerDelayMs?: number; // fixes how long the computer "thinks"; by default 1 to 3 seconds at random (R52)
  computerSeed?: number; // makes the computer's randomness repeatable (R46)
  // Who is connecting, from the upgrade request's cookie (R28). Optional: a
  // seat with no known person is just not counted for the leaderboard.
  identify?: (request: import("node:http").IncomingMessage) => string | null;
  // The public display name for a person id (nickname and tag, or username), for the panels (U57).
  nameFor?: (personId: string) => string | null;
  spectatorMoveMs?: number; // how long a spectator sees a result before moving on (R76); the browser waits this long
  spectatorsPerGame?: number; // R77
  spectatorsTotal?: number; // R77
  spectatorBufferLimit?: number; // R77: bytes waiting to be sent to a spectator before it is closed
}

export const DISCONNECT_GRACE_MS = 30_000;
export const COMPUTER_THINK_MIN_MS = 1_000; // R52
export const COMPUTER_THINK_MAX_MS = 3_000;
export const ABANDON_AFTER_IDLE_ROUNDS = 3; // R19

export function attachRealtime(
  server: Server,
  db: Db,
  options: RealtimeOptions = {},
): {
  wss: WebSocketServer;
  game: GameService;
  dispose: () => void;
  createComputerGame: (code: string) => void;
  createQuickGame: (code: string) => void;
  liveCount: () => number;
  createLinkGame: (code: string, creator: string | null) => void;
  watchingIn: (code: string) => number;
  spectatorState: () => { watchers: number; watching: number; lastGame: number; addresses: number };
  kindsKnown: () => Array<[string, "quick" | "link" | "computer"]>;
  spectatorMoveMs: number;
} {
  const roundTimerMs = options.roundTimerMs ?? ROUND_TIMER_MS;
  const disconnectGraceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
  const computerRandom = seededRandom(options.computerSeed ?? Math.floor(Math.random() * 2 ** 32));
  // How long the computer thinks this round (R52). Drawn from its own random numbers, so it
  // never depends on what the human chose (R40).
  const thinkMs = (): number =>
    options.computerDelayMs ?? COMPUTER_THINK_MIN_MS + computerRandom() * (COMPUTER_THINK_MAX_MS - COMPUTER_THINK_MIN_MS);
  // Games where seat B is the computer (R33). Seat B is reserved for it, so no
  // human can take it (R36); the computer decides inside the server and its
  // choice is held in `pending` like any player's (R21, R22).
  const computerGames = new Set<string>();
  const computerTimers = new Map<string, NodeJS.Timeout>();
  // Which player letters have ever been assigned in a game, so a game has at
  // most two players (R36).
  const roster = new Map<string, { A: boolean; B: boolean }>();
  // Display names by seat, for the panels (U57).
  const seatNames = new Map<string, string>();
  const nameOfSeat = (code: string, player: Player): string | null =>
    computerGames.has(code) && player === "B" ? "Computer" : (seatNames.get(key(code, player)) ?? null);
  // Current live connection per player per game (R32).
  const connections = new Map<string, WebSocket>();
  // Opaque token proving a client previously held this seat. Until proper
  // identity exists (R28, Phase 6), this is what lets the real occupant of a
  // seat reconnect and take it over, while a stranger who only knows the game
  // code and guesses the seat letter is turned away with game_full instead.
  const seatTokens = new Map<string, string>();
  // Choices pending for the open round. Never sent to the opponent (R21,
  // R22): only ever read by broadcast/sendSnapshot to report readiness, and
  // cleared the moment a round resolves.
  const pending = new Map<string, { A: Choice | null; B: Choice | null }>();
  // Games currently inside game.resolve(), so a choice arriving while the
  // save and broadcast are still in flight is rejected rather than accepted
  // for a round the server has not finished moving on from (R25, R23).
  const resolving = new Set<string>();
  // The pending round's timer per game (R18): forces a resolve with whatever
  // choices exist when it fires, even if one or both players never chose.
  const timers = new Map<string, NodeJS.Timeout>();
  // Pending forfeit timer per disconnected seat (R27), keyed the same way as
  // `connections`. Cleared if that seat reconnects within the grace period.
  const graceTimers = new Map<string, NodeJS.Timeout>();
  // Games the server has ended as a forfeit (R27). This is server-side state,
  // not an engine Status value (docs/rules.md R27): the engine never learns
  // about forfeits, so a forfeited game's GameState.status stays "playing".
  // R19's abandonment is recorded the same way, so one map holds both.
  const forfeited = new Map<string, Ended>();
  // Consecutive rounds in which neither player chose (R19). Kept in memory: a
  // restart gives the players a fresh count rather than ending their game.
  const idleRounds = new Map<string, number>();

  function key(code: string, player: Player): string {
    return `${code}:${player}`;
  }

  // The opponent is present when their seat is the computer's, or a person is connected to it.
  function presentFor(code: string, player: Player): boolean {
    const them = opponentOf(player);
    return computerGames.has(code) ? them === "B" : connections.has(key(code, them));
  }

  // Both seats are taken by someone connected (the computer counts as always connected). A round
  // runs, and can be missed, only while this is true (R51).
  function bothPresent(code: string): boolean {
    return connections.has(key(code, "A")) && presentFor(code, "A");
  }

  function opponentOf(player: Player): Player {
    return player === "A" ? "B" : "A";
  }

  function pendingFor(code: string): { A: Choice | null; B: Choice | null } {
    let choices = pending.get(code);
    if (!choices) {
      choices = { A: null, B: null };
      pending.set(code, choices);
    }
    return choices;
  }

  function clientsInGame(code: string): number {
    let count = 0;
    for (const player of ["A", "B"] as const) {
      if (connections.has(key(code, player))) count++;
    }
    return count;
  }

  function broadcast(code: string, state: GameState): void {
    let recipients = 0;
    for (const player of ["A", "B"] as const) {
      const socket = connections.get(key(code, player));
      if (socket) {
        send(socket, {
          type: "snapshot",
          you: player,
          seatToken: seatTokens.get(key(code, player))!,
          state,
          opponentReady: false,
          opponentPresent: presentFor(code, player),
          yourName: nameOfSeat(code, player),
          opponentName: nameOfSeat(code, opponentOf(player)),
          watching: spectators.watchingCount(code),
        });
        recipients++;
      }
    }
    logEvent("broadcast", { type: "snapshot", recipients, game: code });
    // R79: the players' result goes first. Spectators get it after it is saved (R25), because broadcast is only
    // called once the round is in the database, and they are sent public state only (R72).
    spectators.round(code, state);
    closeSlowSpectators();
  }

  // R77: a spectator that does not read its messages is closed once too much is waiting to be sent to it. Called
  // after every send to spectators: a round, the exhibition game and the end of a game.
  function closeSlowSpectators(): void {
    for (const slow of spectators.slowSpectators()) {
      spectators.leave(slow);
      slow.close();
    }
  }

  // The client address Fly passes in, as for every other limit (CLAUDE.md), not the proxy's socket address.
  function addressOf(request: import("node:http").IncomingMessage): string {
    const fly = request.headers["fly-client-ip"];
    return (typeof fly === "string" ? fly : undefined) ?? request.socket.remoteAddress ?? "unknown";
  }

  // ---- Spectating (ADR 0012 amended, R36, R70 to R80) ----
  // What kind of game each code is (R71), set when the game is made and saved with it. A game against the computer is
  // never watched, by anyone. A quick match game is offered by Watch live and can be watched by its code. A link game
  // is watched only through its link or code and is never listed or counted. A code with no kind is not a game.
  type Kind = "quick" | "link" | "computer";
  const kinds = new Map<string, Kind>();
  // The person who made a link game, who is player 1 (R36). Kept with the game, so a restart does not forget them.
  const creators = new Map<string, string>();
  // The person each seat belongs to, when the seat was taken by someone we can identify (R28). After a restart nobody is
  // connected, but these say whose the seats are, so a spectator cannot take one (R36).
  const holders = new Map<string, { A: string | null; B: string | null }>();
  const spectatorMoveMs = options.spectatorMoveMs ?? SPECTATOR_MOVE_MS;

  // Both players have taken their seats, so there is a game to watch (R36). A seat stays taken while its player is away.
  function bothSeatsTaken(code: string): boolean {
    const seats = roster.get(code);
    const owned = holders.get(code);
    return (!!seats?.A || !!owned?.A) && (!!seats?.B || !!owned?.B);
  }

  // A game that spectators may watch, through its link or code (R71): a quick match or link game, still being played, with
  // both seats taken. A game against the computer, a game with a seat free, a finished game and a code that is no game are
  // all the same answer, so a computer game's existence is never revealed.
  function isWatchable(code: string): boolean {
    const kind = kinds.get(code);
    if (kind !== "quick" && kind !== "link") return false;
    const record = game.getGame(code);
    return !!record && record.state.status === "playing" && !forfeited.has(code) && bothSeatsTaken(code);
  }

  // A game is live when it is a quick match game, still being played and both players are connected (R70). Link games
  // are never live in this sense: Watch live never offers or counts them.
  function isLive(code: string): boolean {
    return kinds.get(code) === "quick" && isWatchable(code) && bothPresentFor(code);
  }

  // The live quick match games, forgetting the ones that are over: a finished game can never be live again, so the map
  // (and every scan of it) stays proportional to the games still being played.
  function liveWatchable(): string[] {
    const live: string[] = [];
    for (const [code, kind] of [...kinds]) {
      if (kind === "computer") continue;
      const record = game.getGame(code);
      if (!record || record.state.status !== "playing" || forfeited.has(code)) {
        kinds.delete(code);
        creators.delete(code);
        holders.delete(code);
        continue;
      }
      if (isLive(code)) live.push(code);
    }
    return live;
  }

  // Both seats are taken by someone connected, the computer counting as always connected (R51).
  function bothPresentFor(code: string): boolean {
    return connections.has(key(code, "A")) && presentFor(code, "A");
  }

  const spectators = createSpectators(
    {
      send: (socket, message) => send(socket, message as never),
      viewOf(code) {
        if (!isWatchable(code)) return undefined; // a computer game, a seat free, over or no such game: all the same answer (R71)
        const record = game.getGame(code)!;
        return { state: record.state, kind: kinds.get(code) as "quick" | "link", names: { A: nameOfSeat(code, "A"), B: nameOfSeat(code, "B") } } satisfies WatchableView;
      },
      liveCodes: () => liveWatchable(),
      watchingChanged(code, watching) {
        for (const player of ["A", "B"] as const) {
          const socket = connections.get(key(code, player));
          if (socket) send(socket, { type: "watching", watching });
        }
      },
      log: (event, fields) => logEvent(event, fields),
    },
    { perGame: options.spectatorsPerGame, total: options.spectatorsTotal, bufferLimit: options.spectatorBufferLimit },
  );

  const game = createGameService({ db, broadcast, roundTimerMs });
  const restoredCodes = game.restore();
  // The kind of every game still being played, its creator and the people who hold its seats come back with it, so a restart
  // changes nothing about who plays and who watches (R36, R71).
  for (const saved of db.loadGames()) {
    if (saved.state.status !== "playing" || saved.ended) continue;
    kinds.set(saved.code, saved.kind);
    if (saved.creator) creators.set(saved.code, saved.creator);
    if (saved.playerA || saved.playerB) holders.set(saved.code, { A: saved.playerA, B: saved.playerB });
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  // A forfeit is server-side state (docs/rules.md R27), not an engine Status
  // value, so it is not covered by game.restore(): load it separately from
  // the same rows, so a forfeit survives a restart instead of silently
  // reverting to "playing".
  for (const saved of db.loadGames()) {
    if (saved.ended) forfeited.set(saved.code, saved.ended);
  }

  for (const saved of db.loadGames()) {
    if (saved.vsComputer) reserveComputerSeat(saved.code);
  }

  for (const code of restoredCodes) {
    // A restored game waits for its players: its timer starts when both are
    // connected again (the join path, R51), so nobody misses a round while away.
  }

  function clearTimerFor(code: string): void {
    const timer = timers.get(code);
    if (timer) {
      clearTimeout(timer);
      timers.delete(code);
    }
    const computerTimer = computerTimers.get(code);
    if (computerTimer) {
      clearTimeout(computerTimer);
      computerTimers.delete(code);
    }
  }

  function reserveComputerSeat(code: string): void {
    computerGames.add(code);
    const seats = roster.get(code) ?? { A: false, B: false };
    seats.B = true;
    roster.set(code, seats);
    if (!seatTokens.has(key(code, "B"))) seatTokens.set(key(code, "B"), randomUUID()); // never given to anyone
  }

  // A quick match game (R35): saved as one, so a restart does not change it (R71).
  function createQuickGame(code: string): void {
    kinds.set(code, "quick");
    db.markWatchable(code, newGame());
    game.createGame(code);
  }

  // A link game (R34): saved as one with the person who made it, who is player 1 (R36).
  function createLinkGame(code: string, creator: string | null): void {
    kinds.set(code, "link");
    if (creator) creators.set(code, creator);
    db.markLink(code, newGame(), creator);
    game.createGame(code);
  }

  function createComputerGame(code: string): void {
    kinds.set(code, "computer"); // never watched, by anyone (R71)
    // Mark first: if a later write failed, the game would still be known as
    // a computer game (R37) rather than becoming a human one after a restart.
    db.markComputer(code, newGame());
    reserveComputerSeat(code);
    game.createGame(code);
  }

  // The computer chooses after a short delay, using only public information
  // (R40). If the human has chosen already this resolves the round; if not,
  // the human is told only that the opponent is ready (R21).
  function computerChoose(code: string): void {
    computerTimers.delete(code);
    const record = game.getGame(code);
    if (!record || record.state.status !== "playing" || forfeited.has(code) || resolving.has(code)) return;
    const choices = pendingFor(code);
    if (choices.B !== null) return;
    choices.B = chooseMove(
      {
        board: record.state.board,
        round: record.state.round,
        shieldsLeft: record.state.shieldsLeft,
        earthquakesLeft: record.state.earthquakesLeft,
        rows: record.state.rows,
        opponentReady: choices.A !== null,
      },
      "B",
      computerRandom,
    );
    if (choices.A !== null) {
      resolveNow(code, { A: choices.A, B: choices.B });
    } else {
      const human = connections.get(key(code, "A"));
      if (human) send(human, { type: "opponent_ready" });
    }
  }

  function resolveNow(code: string, choices: { A: Choice | null; B: Choice | null }): void {
    clearTimerFor(code);
    pending.set(code, { A: null, B: null });
    resolving.add(code);
    game
      .resolve(code, choices)
      .then(() => {
        resolving.delete(code);
        // R19: both players missing 3 rounds in a row ends the game with no
        // winner. Any choice resets the count.
        // In a game against the computer the computer always chooses, so the
        // human missing the round is what counts (docs/rules.md R19 note).
        // Only rounds in which both players were connected count (R51).
        const nobodyChose = computerGames.has(code) ? choices.A === null : choices.A === null && choices.B === null;
        const before = idleRounds.get(code) ?? 0;
        const idle = !bothPresent(code) ? before : nobodyChose ? before + 1 : 0;
        idleRounds.set(code, idle);
        if (idle >= ABANDON_AFTER_IDLE_ROUNDS && game.getGame(code)?.state.status === "playing" && !forfeited.has(code)) {
          abandon(code);
          return;
        }
        scheduleTimerFor(code);
      })
      .catch((error) => {
        // The round did not actually advance (resolve's save failed before
        // broadcasting), so put the choices back rather than lose them
        // silently, and do not re-arm the timer: a game that cannot be
        // saved should stop, not keep retrying on its own every tick.
        logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
        pending.set(code, choices);
        resolving.delete(code);
      });
  }

  // Ends the game as abandoned (R19): server-side state like a forfeit, not an
  // engine Status. Saved before anyone is told (R25).
  function abandon(code: string): void {
    clearTimerFor(code);
    for (const player of ["A", "B"] as const) clearGraceTimer(code, player);
    // Save first: if the save fails, memory must not claim an end the
    // database does not have. The game stays live and tries again after its
    // next round (the idle count is still at the limit).
    try {
      db.saveEnded(code, { result: "abandoned" });
    } catch (error) {
      logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      scheduleTimerFor(code);
      return;
    }
    forfeited.set(code, { result: "abandoned" });
    idleRounds.delete(code);
    logEvent("game_over", { game: code, result: "abandoned" });
    spectators.ended(code, { type: "ended", result: "abandoned" }); // after the save above (R25, R76)
    closeSlowSpectators();
    for (const player of ["A", "B"] as const) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "game_over", result: "abandoned" });
    }
  }

  function scheduleTimerFor(code: string): void {
    clearTimerFor(code);
    const record = game.getGame(code);
    if (!record || record.state.status !== "playing" || forfeited.has(code)) return;
    const timer = setTimeout(() => {
      // The timer firing is itself "the round ending": resolve with
      // whatever choices exist, even none (R18, R10).
      const choices = pendingFor(code);
      resolveNow(code, { A: choices.A, B: choices.B });
    }, roundTimerMs);
    timers.set(code, timer);
    if (computerGames.has(code)) computerTimers.set(code, setTimeout(() => computerChoose(code), thinkMs()));
  }

  function clearGraceTimer(code: string, player: Player): void {
    const timer = graceTimers.get(key(code, player));
    if (timer) {
      clearTimeout(timer);
      graceTimers.delete(key(code, player));
    }
  }

  function startGraceTimer(code: string, player: Player): void {
    const record = game.getGame(code);
    if (!record || record.state.status !== "playing" || forfeited.has(code)) return;
    clearGraceTimer(code, player);
    const timer = setTimeout(() => {
      graceTimers.delete(key(code, player));
      if (forfeited.has(code)) return; // already ended (e.g. the other side also left)
      // The round may have resolved to a win or a draw while this player was
      // disconnected (R18's timer keeps running): in that case the game is
      // already over on its own terms and must not also be forfeited, or the
      // winner the opponent is told would contradict the real result.
      const current = game.getGame(code);
      if (!current || current.state.status !== "playing") return;
      // The disconnected player did not return in time: the game ends as a
      // forfeit (R27), the other player wins. This is server-side state, not
      // an engine Status value (docs/rules.md R27): the engine's GameState is
      // left exactly as it was, with status still "playing". Saved before
      // broadcasting (R25).
      clearTimerFor(code);
      const winner = opponentOf(player);
      forfeited.set(code, { result: "forfeit", winner });
      db.saveEnded(code, { result: "forfeit", winner });
      logEvent("forfeit", { game: code });
      logEvent("game_over", { game: code, result: "forfeit" });
      const winnerSocket = connections.get(key(code, winner));
      if (winnerSocket) send(winnerSocket, { type: "game_over", result: "forfeit", winner });
      spectators.ended(code, { type: "ended", result: "forfeit", winner }); // after the save above (R25, R76)
      closeSlowSpectators();
    }, disconnectGraceMs);
    graceTimers.set(key(code, player), timer);
  }

  function sendSnapshot(code: string, player: Player): void {
    const record = game.getGame(code);
    if (!record) return;
    const socket = connections.get(key(code, player));
    if (!socket) return;
    const choices = pendingFor(code);
    send(socket, {
      type: "snapshot",
      you: player,
      seatToken: seatTokens.get(key(code, player))!,
      state: record.state,
      opponentReady: choices[opponentOf(player)] !== null,
      opponentPresent: presentFor(code, player),
      yourName: nameOfSeat(code, player),
      opponentName: nameOfSeat(code, opponentOf(player)),
      watching: spectators.watchingCount(code),
    });
    logEvent("snapshot_sent", { game: code, round: record.state.round, reason: "join" });
  }

  function handleChoose(message: ChooseMessage): void {
    const { code, player, seatToken, column, shield, earthquake } = message;
    if (typeof code !== "string" || (player !== "A" && player !== "B")) return;
    // A missing or unrecognised token must never be treated as a match: an
    // unissued seat has no token in the map (`undefined`), and a message
    // with no seatToken field is also `undefined`, so this must be an
    // explicit identity check, not a `!==` that two absences can satisfy.
    const expectedToken = seatTokens.get(key(code, player));
    if (typeof seatToken !== "string" || typeof expectedToken !== "string" || seatToken !== expectedToken) return;
    if (earthquake !== undefined && earthquake !== true) return; // a malformed flag is not a choice
    if (earthquake === undefined && typeof column !== "number") return;
    if (shield !== undefined && typeof shield !== "boolean") return;
    if (column !== undefined && typeof column !== "number") return;

    const record = game.getGame(code);
    logEvent("action_received", { type: "choose", round: record?.state.round });
    if (!record) return;
    if (resolving.has(code)) return;
    if (forfeited.has(code)) return;

    // A choice is final for its round (R4). Nothing here depends on the opponent (R22).
    if (pendingFor(code)[player] !== null) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "rejected", reason: "already_chosen" });
      logEvent("action_rejected", { type: "choose", reason: "already_chosen" });
      return;
    }

    // R53: an Earthquake carrying a column or a shield is passed on as it is, so the engine rejects
    // it as one_power_up rather than the server guessing what was meant.
    const choice = (earthquake === true ? { earthquake: true, ...(column !== undefined ? { column } : {}), ...(shield ? { shield } : {}) } : { column: column as number, shield: Boolean(shield) }) as Choice;
    const result = validateChoice(record.state, player, choice);
    if (!result.ok) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "rejected", reason: result.reason });
      logEvent("action_rejected", { type: "choose", reason: result.reason });
      return;
    }

    const choices = pendingFor(code);
    choices[player] = choice;

    if (choices.A !== null && choices.B !== null) {
      // Both have chosen: resolve and broadcast the result instead of also
      // telling the opponent "ready", which the result message supersedes.
      // `resolving` closes the window between here and the save+broadcast
      // inside game.resolve() completing, so a choice arriving in between is
      // rejected rather than silently accepted for a round already in flight.
      resolveNow(code, { A: choices.A, B: choices.B });
    } else {
      const opponentSocket = connections.get(key(code, opponentOf(player)));
      if (opponentSocket) send(opponentSocket, { type: "opponent_ready" });
    }
  }

  // What a join becomes: a seat, a place among the spectators, or a refusal (R36). In order:
  //  1. a game against the computer has one seat, and nobody else may watch it (R71);
  //  2. a seat goes back to the person it belongs to, or to whoever holds its token (R32);
  //  3. a new arrival takes the first seat that is not taken and not kept for the game's creator (R36);
  //  4. with no seat left for them, a new arrival is a spectator, and never takes a seat, however long its player has been
  //     away (R27). A seat is "taken" once anyone has sat in it, so it stays its player's while they reconnect.
  function decideSeat(
    code: string,
    seats: { A: boolean; B: boolean },
    wanted: Player | undefined,
    token: string | undefined,
    person: string | null,
  ): Player | "spectator" | "full" {
    const owned = holders.get(code);
    const taken = (seat: Player): boolean => seats[seat] || !!owned?.[seat];

    // 1. A game against the computer: the human's seat only.
    if (kinds.get(code) === "computer" || computerGames.has(code)) {
      if (wanted === "B") return "full";
      const mine = !taken("A") || token === seatTokens.get(key(code, "A")) || (!!person && owned?.A === person);
      return mine ? "A" : "full";
    }

    // 2. A seat that is already someone's goes back to them, and only them.
    for (const seat of ["A", "B"] as const) {
      if (wanted !== undefined && wanted !== seat) continue;
      const theirs = !!person && owned?.[seat] === person;
      const holdsToken = token !== undefined && wanted === seat && token === seatTokens.get(key(code, seat));
      if (theirs || holdsToken) return seat;
    }

    // 3. A new arrival. Seat A is kept for the person who made a link game until they arrive.
    const creator = creators.get(code) ?? null;
    const keptForCreator = (seat: Player): boolean => seat === "A" && creator !== null && person !== creator && !taken("A");
    const candidates: Player[] = wanted ? [wanted] : ["A", "B"];
    for (const seat of candidates) {
      if (!taken(seat) && !keptForCreator(seat)) return seat;
    }

    // 4. No seat for this arrival. Someone who names a seat they cannot prove is theirs is not a visitor opening a link (the page
    //    names no seat for a new arrival) but someone guessing, so it is refused and told nothing about the game (R32).
    //    A new arrival who names none watches (R36).
    return wanted !== undefined ? "full" : "spectator";
  }

  wss.on("connection", (socket, request) => {
    logEvent("connect", { ua: request.headers["user-agent"]?.includes("Mobile") ? "phone" : "desktop" });

    socket.on("message", (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof message !== "object" || message === null || !("type" in message)) return;
      const parsed = message as ClientMessage;

      // A spectator is not a seat (R70). Whatever it sends, apart from asking to watch or leave, is refused,
      // and only it is told (R74): a spectator can never choose, join a seat or change a game.
      if (spectators.isSpectator(socket) && parsed.type !== "spectate" && parsed.type !== "leave") {
        spectators.reject(socket);
        logEvent("action_rejected", { type: String(parsed.type).slice(0, 20), reason: "spectator" }); // client-controlled, so bounded
        return;
      }
      if (parsed.type === "spectate") {
        // A connection that holds a seat is a player (R70): it is refused and changes nothing.
        if ([...connections.values()].includes(socket)) {
          send(socket, { type: "rejected", reason: "spectator" } as never);
          return;
        }
        const wanted = (parsed as { code?: unknown }).code;
        spectators.join(socket, addressOf(request), typeof wanted === "string" ? wanted : undefined);
        return;
      }
      if (parsed.type === "leave") {
        spectators.leave(socket);
        return;
      }

      if (parsed.type === "choose") {
        handleChoose(parsed as ChooseMessage);
        return;
      }

      if (parsed.type !== "join") return;
      const { code, seatToken } = parsed as JoinMessage;
      let { player } = parsed as JoinMessage;
      if (typeof code !== "string" || code === "") return;
      if (player !== undefined && player !== "A" && player !== "B") return;

      let seats = roster.get(code);
      if (!seats) {
        seats = { A: false, B: false };
        roster.set(code, seats);
      }
      const personId = options.identify?.(request) ?? null;

      // Who sits where, and who watches, is decided here and nowhere else (R36). The first request the server handles
      // takes a free seat, so two people arriving at the same moment for the last seat give one player and one spectator.
      const decision = decideSeat(code, seats, player, seatToken, personId);
      if (decision === "full") {
        send(socket, { type: "game_full" });
        return;
      }
      if (decision === "spectator") {
        // Both seats are taken. A seat is never given to a spectator, even while its player is away (R36, R27).
        const record = game.getGame(code);
        const ended = forfeited.get(code);
        if (ended) {
          // The game is over: the visitor is shown how it ended, and given nothing else (R36).
          send(socket, ended.result === "forfeit" ? ({ type: "ended", result: "forfeit", winner: ended.winner } as never) : ({ type: "ended", result: "abandoned" } as never));
          return;
        }
        if (record && record.state.status !== "playing" && kinds.get(code) !== "computer") {
          send(socket, { type: "spectating", code, kind: kinds.get(code) ?? "link", state: record.state, watching: spectators.watchingCount(code), names: { A: nameOfSeat(code, "A"), B: nameOfSeat(code, "B") }, because: "two_players" } as never);
          return;
        }
        if (typeof code === "string" && !spectators.watchLink(socket, addressOf(request), code)) {
          // Not placed: the game is full of spectators (R77), or it is not a game that can be watched.
          send(socket, { type: "not_watchable", reason: spectators.watchingCount(code) > 0 ? "full" : "unknown" } as never);
        }
        return;
      }
      player = decision;

      const existing = connections.get(key(code, player));
      if (existing && existing !== socket) {
        send(existing, { type: "tab_replaced" });
        existing.close();
        logEvent("tab_replaced", { game: code });
      }

      // A reconnect within the grace period (R27) means this seat returned
      // in time, so the forfeit that would otherwise fire must not.
      clearGraceTimer(code, player);
      const endedState = forfeited.get(code);
      if (endedState) {
        // Require the same seatToken check as any other reconnect to an
        // occupied seat (R32): a stranger must not learn the forfeit result
        // or take a seat by guessing its letter, even once the game is over.
        if (seats[player] && seatToken !== seatTokens.get(key(code, player))) {
          send(socket, { type: "game_full" });
          return;
        }
        seats[player] = true;
        connections.set(key(code, player), socket);
        send(socket, endedState.result === "forfeit" ? { type: "game_over", result: "forfeit", winner: endedState.winner } : { type: "game_over", result: "abandoned" });
        logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
        return;
      }

      seats[player] = true;
      if (!seatTokens.has(key(code, player))) seatTokens.set(key(code, player), randomUUID());
      const name = personId ? (options.nameFor?.(personId) ?? null) : null;
      if (name) seatNames.set(key(code, player), name);
      if (personId && !computerGames.has(code)) {
        if (!game.getGame(code)) game.createGame(code); // the row must exist before it can record a seat
        db.seatPlayer(code, player, personId);
      }
      // Create the game before this connection is registered, so its
      // broadcast (sent to whichever connections already exist) cannot also
      // reach this joiner; sendSnapshot below is this joiner's one snapshot.
      if (!game.getGame(code)) game.createGame(code);
      connections.set(key(code, player), socket);
      // A game made by POST /api/games (R34) exists before anyone joins. Its first round timer
      // starts only when both players are present (R18, R51).
      if (!timers.has(code) && !resolving.has(code) && bothPresent(code)) scheduleTimerFor(code);

      logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
      sendSnapshot(code, player);
      // The player already waiting learns that someone has arrived. This carries no choice (R21, R22).
      const waiting = connections.get(key(code, opponentOf(player)));
      if (waiting && waiting !== socket) send(waiting, name ? { type: "opponent_joined", name } : { type: "opponent_joined" });
    });

    socket.on("close", () => {
      spectators.leave(socket);
      for (const [connectionKey, connectionSocket] of connections) {
        if (connectionSocket === socket) {
          connections.delete(connectionKey);
          const separatorIndex = connectionKey.lastIndexOf(":");
          const code = connectionKey.slice(0, separatorIndex);
          const player = connectionKey.slice(separatorIndex + 1) as Player;
          logEvent("disconnect", {
            game: code,
            clients_in_game: clientsInGame(code),
            grace_s: Math.round(disconnectGraceMs / 1000),
          });
          startGraceTimer(code, player);
          break;
        }
      }
    });
  });

  function dispose(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const timer of graceTimers.values()) clearTimeout(timer);
    graceTimers.clear();
    for (const timer of computerTimers.values()) clearTimeout(timer);
    computerTimers.clear();
    spectators.clear();
    kinds.clear();
    creators.clear();
    holders.clear();
  }

  return {
    wss,
    game,
    dispose,
    createComputerGame,
    createQuickGame,
    createLinkGame,
    liveCount: () => liveWatchable().length, // R80: live quick match games, never link games or computer games
    spectatorState: () => spectators.sizes(),
    kindsKnown: () => [...kinds].sort(),
    watchingIn: (code: string) => spectators.watchingCount(code),
    spectatorMoveMs,
  };
}
