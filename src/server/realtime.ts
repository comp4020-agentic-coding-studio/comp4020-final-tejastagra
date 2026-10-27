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
import { newGame, validateChoice, type Choice, type GameState, type Player, type RejectReason } from "../engine/index.ts";
import { createGameService, ROUND_TIMER_MS, type GameService } from "./game-service.ts";
import type { Db, Ended } from "./db.ts";
import { logEvent } from "./log.ts";
import { chooseMove, seededRandom } from "./computer.ts";

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

export interface GameFull {
  type: "game_full";
}

export interface TabReplaced {
  type: "tab_replaced";
}

export type GameOver =
  | { type: "game_over"; result: "forfeit"; winner: Player }
  | { type: "game_over"; result: "abandoned" }; // R19: no winner

export type ServerMessage = Snapshot | OpponentJoined | OpponentReady | Rejected | GameFull | TabReplaced | GameOver;

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
}

export const DISCONNECT_GRACE_MS = 30_000;
export const COMPUTER_THINK_MIN_MS = 1_000; // R52
export const COMPUTER_THINK_MAX_MS = 3_000;
export const ABANDON_AFTER_IDLE_ROUNDS = 3; // R19

export function attachRealtime(
  server: Server,
  db: Db,
  options: RealtimeOptions = {},
): { wss: WebSocketServer; game: GameService; dispose: () => void; createComputerGame: (code: string) => void } {
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
        });
        recipients++;
      }
    }
    logEvent("broadcast", { type: "snapshot", recipients, game: code });
  }

  const game = createGameService({ db, broadcast, roundTimerMs });
  const restoredCodes = game.restore();

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

  function createComputerGame(code: string): void {
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

      if (player === undefined) {
        if (!seats.A) player = "A";
        else if (!seats.B) player = "B";
        else {
          send(socket, { type: "game_full" });
          return;
        }
      } else if (!seats[player]) {
        if (seats.A && seats.B) {
          send(socket, { type: "game_full" });
          return;
        }
      } else {
        // The seat is already assigned. Only the client presenting that
        // seat's token may take over its live connection (R32); a visitor
        // who only knows the game code and names a held seat is a stranger
        // as far as the server can tell, so it is turned away as if the game
        // were full. Revisit once R28 identity (Phase 6) replaces this.
        if (seatToken !== seatTokens.get(key(code, player))) {
          send(socket, { type: "game_full" });
          return;
        }
      }

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
      const personId = options.identify?.(request) ?? null;
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
  }

  return { wss, game, dispose, createComputerGame };
}
