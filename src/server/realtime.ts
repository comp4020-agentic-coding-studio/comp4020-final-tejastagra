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
import { randomInt, randomUUID } from "node:crypto";
import { newGame, resolveRound, validateChoice, type Choice, type GameState, type Player, type RejectReason } from "../engine/index.ts";
import { createGameService, ROUND_TIMER_MS, type GameService } from "./game-service.ts";
import { DEFAULT_COLOURS, type Colours, type Db, type Ended } from "./db.ts";
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
  // Each seat's colour (R93, R94): public, the same on every screen, so it is safe to send at any time (R22).
  colours: Colours;
  // Whether round 1 has opened (R97): false while waiting for the second player and during the start countdown.
  started: boolean;
}

// The start countdown (R97): sent to both players when it begins, and to a player who connects during it, with the time left.
export interface Countdown {
  type: "countdown";
  ms: number;
}

// Round 1 has opened (R97): the countdown is over and choices are accepted.
export interface Started {
  type: "started";
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
  reason: RejectReason | "already_chosen" | "not_started"; // already_chosen: R4, a choice is final; not_started: R97, the countdown
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

export type ServerMessage = Snapshot | OpponentJoined | OpponentReady | Rejected | GameFull | TabReplaced | GameOver | Watching | Countdown | Started;

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
  // Whether the session behind an upgrade request still exists (R87). A socket whose session ended is closed at its next action,
  // which is how a reset done by the admin's script, in another process, reaches a connection that is already open.
  sessionStillValid?: (request: import("node:http").IncomingMessage) => boolean;
  // Whether the session behind an upgrade request must still choose a new password (R87): such a session does nothing over the
  // game connection either, whatever seat token it holds.
  sessionMustChange?: (request: import("node:http").IncomingMessage) => boolean;
  spectatorMoveMs?: number; // how long a spectator sees a result before moving on (R76); the browser waits this long
  spectatorsPerGame?: number; // R77
  spectatorsTotal?: number; // R77
  spectatorBufferLimit?: number; // R77: bytes waiting to be sent to a spectator before it is closed
  rematchOfferMs?: number; // how long a rematch offer stands (R83); 30 seconds by default
  // How long the start countdown lasts (R97); 3 seconds by default. 0 means no countdown, for checks of other rules (ADR 0014).
  countdownMs?: number;
  finishedRetainMs?: number; // how long a finished game stays known in memory for a rematch or a late visitor (R84); 30 minutes by default
}

export const DISCONNECT_GRACE_MS = 30_000;
export const START_COUNTDOWN_MS = 3_000; // R97
export const REMATCH_OFFER_MS = 30_000; // R83
export const FINISHED_RETAIN_MS = 30 * 60_000; // R84: a finished game is remembered this long, so memory cannot grow without bound
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
  movePerson: (from: string, to: string) => void;
  seatRole: (code: string, person: string | null) => "player" | "spectator" | "ended" | "unknown";
  watchingIn: (code: string) => number;
  spectatorState: () => { watchers: number; watching: number; lastGame: number; addresses: number };
  retained: () => { kinds: number; creators: number; holders: number; rematchGone: number; rematchAsked: number; rematchTimers: number; colours: number; started: number };
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

  // ---- Colours (R93 to R96, ADR 0014) ----
  // Each game's colours, decided at random by the server when the game is made and saved with it, so every screen draws the same
  // seat in the same colour. Drawn from the operating system's random numbers, never the computer's, so the computer's seeded
  // play (R46) is the same whatever the colours.
  const colours = new Map<string, Colours>();
  const randomColours = (): Colours => (randomInt(2) === 0 ? { A: "red", B: "yellow" } : { A: "yellow", B: "red" });
  const coloursOf = (code: string): Colours => colours.get(code) ?? DEFAULT_COLOURS;

  // ---- The start countdown (R97) ----
  // Games whose round 1 has opened. A game past round 0, or over, has started whatever this says (a restored game, R26).
  const countdownMs = options.countdownMs ?? START_COUNTDOWN_MS;
  const startedGames = new Set<string>();
  const countdowns = new Map<string, { timer: NodeJS.Timeout; endsAt: number }>();

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

  function hasStarted(code: string): boolean {
    const record = game.getGame(code);
    return startedGames.has(code) || !record || record.state.round > 0 || record.state.status !== "playing" || forfeited.has(code);
  }

  function clearCountdown(code: string): void {
    const running = countdowns.get(code);
    if (running) clearTimeout(running.timer);
    countdowns.delete(code);
  }

  // Both players are present (R51): round 1 opens after the countdown (R97), or at once if the game has already started.
  function beginWhenBothPresent(code: string): void {
    if (!bothPresent(code) || resolving.has(code)) return;
    if (hasStarted(code)) {
      if (!timers.has(code)) scheduleTimerFor(code);
      return;
    }
    if (countdowns.has(code)) return; // already counting: a reconnecting player is told the time left by the join path
    if (countdownMs <= 0) {
      startedGames.add(code);
      scheduleTimerFor(code);
      return;
    }
    const endsAt = Date.now() + countdownMs;
    const timer = setTimeout(() => {
      countdowns.delete(code);
      const record = game.getGame(code);
      if (!record || record.state.status !== "playing" || forfeited.has(code)) return;
      // A player who left during the countdown and is not back: round 1 does not open, and the countdown runs again when both
      // are present (R51, R97).
      if (!bothPresent(code)) return;
      startedGames.add(code);
      for (const player of ["A", "B"] as const) {
        const socket = connections.get(key(code, player));
        if (socket) send(socket, { type: "started" });
      }
      logEvent("round_open", { game: code, round: 1 });
      scheduleTimerFor(code);
    }, countdownMs);
    countdowns.set(code, { timer, endsAt });
    logEvent("countdown_start", { game: code, ms: countdownMs });
    for (const player of ["A", "B"] as const) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "countdown", ms: countdownMs });
    }
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
          colours: coloursOf(code),
          started: hasStarted(code),
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
  // The person behind each live connection, when they were identified (R28), so an account's open sockets can be closed
  // when its sessions end (R87) and a guest's seats can move to the account they sign in to (R89).
  const socketPersons = new Map<WebSocket, string>();
  const socketRequests = new Map<WebSocket, import("node:http").IncomingMessage>();
  // True while the socket's session still exists. A socket with no identified person has nothing to check.
  function sessionOk(socket: WebSocket): boolean {
    const request = socketRequests.get(socket);
    // A must-change session is not an identified person (so it holds no person), but it must not act on a seat either (R87).
    if (request && options.sessionMustChange?.(request)) {
      socketRequests.delete(socket);
      logEvent("session_ended_socket_closed", {});
      socket.close();
      return false;
    }
    if (!request || !socketPersons.has(socket) || !options.sessionStillValid) return true;
    if (options.sessionStillValid(request)) return true;
    socketPersons.delete(socket);
    socketRequests.delete(socket);
    logEvent("session_ended_socket_closed", {});
    socket.close();
    return false;
  }
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

  // A finished game is shown to a visitor who opens its link, and they stay on it for a rematch (R84).
  function isShowable(code: string): boolean {
    const kind = kinds.get(code);
    return (kind === "quick" || kind === "link") && !!game.getGame(code) && bothSeatsTaken(code);
  }

  // A game is live when it is a quick match game, still being played and both players are connected (R70). Link games
  // are never live in this sense: Watch live never offers or counts them.
  function isLive(code: string): boolean {
    return kinds.get(code) === "quick" && isWatchable(code) && bothPresentFor(code);
  }

  // The live quick match games, forgetting the ones that are over: a finished game can never be live again, so the map
  // (and every scan of it) stays proportional to the games still being played.
  const rematchAsked = new Map<string, { A: boolean; B: boolean }>();
  const rematchTimers = new Map<string, NodeJS.Timeout>();
  const rematchGone = new Map<string, "left" | "expired">();

  function liveWatchable(): string[] {
    sweepFinished();
    const live: string[] = [];
    for (const [code, kind] of [...kinds]) {
      if (kind === "computer") continue;
      const record = game.getGame(code);
      if (!record || record.state.status !== "playing" || forfeited.has(code)) continue; // never live
      if (isLive(code)) live.push(code);
    }
    return live;
  }

  // A finished game stays known while a rematch may still start or a late visitor opens its link (R84), and is then forgotten,
  // so the maps stay proportional to the games of the last half hour and not to every game ever played.
  const finishedAt = new Map<string, number>();
  const finishedRetainMs = options.finishedRetainMs ?? FINISHED_RETAIN_MS;
  function sweepFinished(): void {
    const t = Date.now();
    // Every map keyed by game: a game made by its first join has colours and a started mark but no kind, and is forgotten too.
    for (const code of new Set([...kinds.keys(), ...rematchGone.keys(), ...rematchAsked.keys(), ...colours.keys(), ...startedGames.keys()])) {
      const record = game.getGame(code);
      const over = !record || record.state.status !== "playing" || forfeited.has(code);
      if (!over) {
        finishedAt.delete(code);
        continue;
      }
      const since = finishedAt.get(code) ?? t;
      finishedAt.set(code, since);
      if (t - since < finishedRetainMs) continue;
      kinds.delete(code);
      creators.delete(code);
      holders.delete(code);
      colours.delete(code);
      startedGames.delete(code);
      clearRematch(code);
      rematchGone.delete(code);
      finishedAt.delete(code);
    }
  }
  const sweepTimer = setInterval(sweepFinished, Math.max(1000, Math.min(60_000, finishedRetainMs / 2)));
  sweepTimer.unref();

  // Both seats are taken by someone connected, the computer counting as always connected (R51).
  function bothPresentFor(code: string): boolean {
    return connections.has(key(code, "A")) && presentFor(code, "A");
  }

  // Codes a visitor has just been sent to by their link (R36): a finished game among them may be shown, not only a live one.
  const viaLinkVisit = new Set<string>();

  const spectators = createSpectators(
    {
      send: (socket, message) => send(socket, message as never),
      viewOf(code) {
        if (!isWatchable(code) && !(viaLinkVisit.has(code) && isShowable(code))) return undefined; // a computer game, a seat free, or no such game: all the same answer (R71)
        const record = game.getGame(code)!;
        return { state: record.state, kind: kinds.get(code) as "quick" | "link", names: { A: nameOfSeat(code, "A"), B: nameOfSeat(code, "B") }, colours: coloursOf(code) } satisfies WatchableView;
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
    colours.set(saved.code, saved.colours); // R93: a restart keeps them
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
    colours.set(code, randomColours()); // R93
    db.markWatchable(code, newGame(), coloursOf(code));
    game.createGame(code);
  }

  // A link game (R34): saved as one with the person who made it, who is player 1 (R36).
  function createLinkGame(code: string, creator: string | null): void {
    kinds.set(code, "link");
    if (creator) creators.set(code, creator);
    colours.set(code, randomColours()); // R93
    db.markLink(code, newGame(), creator, coloursOf(code));
    game.createGame(code);
  }

  // A game made by its first join, with no kind saved (R93): its colours are decided and saved before the game is created and
  // broadcast, so nobody is ever told colours the database does not have (R25).
  function createUnmarkedGame(code: string): void {
    if (!colours.has(code)) colours.set(code, randomColours());
    db.saveGame(code, newGame());
    db.setColours(code, coloursOf(code));
    game.createGame(code);
  }

  function createComputerGame(code: string): void {
    kinds.set(code, "computer"); // never watched, by anyone (R71)
    // Mark first: if a later write failed, the game would still be known as
    // a computer game (R37) rather than becoming a human one after a restart.
    colours.set(code, randomColours()); // R93: random against the computer too
    db.markComputer(code, newGame(), coloursOf(code));
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

  // ---- Rematch (R82 to R85) ----
  // Who has asked for a rematch of a finished game, and the timer that ends the offer. Memory only: an offer is a thing of
  // the moment, and a restart simply withdraws it (the players see "left" and start a new game from Home).
  const rematchOfferMs = options.rematchOfferMs ?? REMATCH_OFFER_MS;

  const isOver = (code: string): boolean => {
    const record = game.getGame(code);
    return !!record && (record.state.status !== "playing" || forfeited.has(code));
  };

  function clearRematch(code: string): void {
    rematchAsked.delete(code);
    const timer = rematchTimers.get(code);
    if (timer) clearTimeout(timer);
    rematchTimers.delete(code);
  }

  // The offer is over because it ran out or someone left (R83): whoever is still connected is told, and a later request is
  // answered the same way, so nobody waits for a player who is not coming.
  function endRematchOffer(code: string, reason: "left" | "expired"): void {
    if (!isOver(code)) return;
    clearRematch(code);
    rematchGone.set(code, reason);
    for (const player of ["A", "B"] as const) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "rematch_ended", reason } as never);
    }
  }

  // Someone left a finished game on purpose or did not come back (R83).
  function playerLeftFinished(code: string): void {
    if (!isOver(code) || computerGames.has(code)) return;
    endRematchOffer(code, "left");
  }

  function handleRematch(message: { code?: unknown; player?: unknown; seatToken?: unknown }): void {
    const { code, player, seatToken } = message;
    if (typeof code !== "string" || (player !== "A" && player !== "B")) return;
    const expected = seatTokens.get(key(code, player));
    if (typeof seatToken !== "string" || typeof expected !== "string" || seatToken !== expected) return; // R32
    if (!game.getGame(code) || !kinds.has(code)) {
      // After a restart a finished game is not in memory any more (R26), and a game left long enough is forgotten (R84): there is
      // nothing to start again, so the one who asks is told at once and starts a new game from Home (R83).
      const gone = connections.get(key(code, player));
      if (gone) send(gone, { type: "rematch_ended", reason: "left" } as never);
      return;
    }
    if (!isOver(code)) return; // R82: only about a game that is over
    const socket = connections.get(key(code, player));
    if (computerGames.has(code)) {
      startRematch(code); // R82: against the computer it starts at once
      return;
    }
    const gone = rematchGone.get(code);
    if (gone) {
      if (socket) send(socket, { type: "rematch_ended", reason: gone } as never);
      return;
    }
    const asked = rematchAsked.get(code) ?? { A: false, B: false };
    if (asked[player]) return; // asking twice changes nothing
    asked[player] = true;
    rematchAsked.set(code, asked);
    if (asked.A && asked.B) {
      // A player who asked and then dropped is not there to play: the rematch does not start into an empty seat (R82, R83).
      if (!connections.has(key(code, "A")) || !connections.has(key(code, "B"))) {
        endRematchOffer(code, "left");
        return;
      }
      startRematch(code);
      return;
    }
    if (!rematchTimers.has(code)) rematchTimers.set(code, setTimeout(() => endRematchOffer(code, "expired"), rematchOfferMs));
    const other = connections.get(key(code, opponentOf(player)));
    if (other) send(other, { type: "rematch_offer", from: "opponent" } as never);
  }

  // Both asked (or the computer's human did): the finished game is archived under `<code>#<n>` and the code starts a new game
  // with the same people in the same seats (R84). Saved before anyone is told (R25).
  function startRematch(code: string): void {
    const before = coloursOf(code);
    const swapped: Colours = { A: before.B, B: before.A }; // R96
    try {
      db.archiveGame(code, newGame(), swapped);
    } catch (error) {
      logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      endRematchOffer(code, "left"); // nothing changed in the database; both are told, and start a new game from Home
      return;
    }
    clearRematch(code);
    rematchGone.delete(code);
    clearTimerFor(code);
    clearCountdown(code);
    startedGames.delete(code); // a rematch is a new game, with its own countdown (R85, R97)
    colours.set(code, swapped);
    for (const seat of ["A", "B"] as const) clearGraceTimer(code, seat);
    forfeited.delete(code);
    idleRounds.delete(code);
    pending.set(code, { A: null, B: null });
    game.restart(code);
    logEvent("rematch", { game: code });
    for (const player of ["A", "B"] as const) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "rematch_started" } as never);
    }
    spectators.announce(code, { type: "rematch_started", colours: swapped }); // R96: spectators draw the new colours too
    // The fresh state goes to the players as a snapshot and to the spectators as a round, as for any new game.
    const record = game.getGame(code)!;
    broadcast(code, record.state);
    beginWhenBothPresent(code);
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

  // Ends a game as a forfeit by `player`: the other player wins (R27, R81). Server-side state, not an engine Status: the
  // engine's GameState is left exactly as it was. Saved before anyone is told (R25).
  function forfeit(code: string, player: Player): boolean {
    const winner = opponentOf(player);
    // Save first: if the save fails, memory must not claim an end the database does not have, and nobody is told. The
    // game stays live; a leaving player can try again, and a timed-out one is handled by the next disconnect or timer (R25).
    try {
      db.saveEnded(code, { result: "forfeit", winner });
    } catch (error) {
      logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
    clearTimerFor(code);
    for (const seat of ["A", "B"] as const) clearGraceTimer(code, seat);
    forfeited.set(code, { result: "forfeit", winner });
    // The player who forfeited is gone (left on purpose or did not come back), so a rematch can never start: the one still there
    // is answered "left" at once if they tap Play again, instead of waiting for an offer to expire (R83).
    rematchGone.set(code, "left");
    logEvent("forfeit", { game: code });
    logEvent("game_over", { game: code, result: "forfeit" });
    const winnerSocket = connections.get(key(code, winner));
    if (winnerSocket) send(winnerSocket, { type: "game_over", result: "forfeit", winner });
    spectators.ended(code, { type: "ended", result: "forfeit", winner }); // after the save above (R25, R76)
    closeSlowSpectators();
    return true;
  }

  // A player leaving on purpose (R81): a game being played is a forfeit; one that never started, or is against the
  // computer, is abandoned with nobody told. Only the seat's own token counts (R32), and a game already over is left alone.
  function leaveGame(message: { code?: unknown; player?: unknown; seatToken?: unknown }): void {
    const { code, player, seatToken } = message;
    if (typeof code !== "string" || (player !== "A" && player !== "B")) return;
    const expected = seatTokens.get(key(code, player));
    if (typeof seatToken !== "string" || typeof expected !== "string" || seatToken !== expected) return;
    const record = game.getGame(code);
    if (record && isOver(code)) {
      playerLeftFinished(code); // R83: leaving from the end popup withdraws a rematch offer
      return;
    }
    if (!record || record.state.status !== "playing" || forfeited.has(code)) return;
    const started = !computerGames.has(code) && bothSeatsTaken(code);
    logEvent("leave_game", { game: code, started });
    if (started) {
      forfeit(code, player);
      return;
    }
    try {
      db.saveEnded(code, { result: "abandoned" });
    } catch (error) {
      logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      return;
    }
    clearTimerFor(code);
    for (const seat of ["A", "B"] as const) clearGraceTimer(code, seat);
    forfeited.set(code, { result: "abandoned" });
    idleRounds.delete(code);
    logEvent("game_over", { game: code, result: "abandoned" });
    spectators.ended(code, { type: "ended", result: "abandoned" });
    closeSlowSpectators();
  }

  function startGraceTimer(code: string, player: Player): void {
    const record = game.getGame(code);
    if (!record) return;
    // A finished game has nothing left to forfeit, but a player who does not come back from it withdraws a rematch (R83).
    if (record.state.status !== "playing" || forfeited.has(code)) {
      if (!computerGames.has(code)) {
        clearGraceTimer(code, player);
        graceTimers.set(key(code, player), setTimeout(() => {
          graceTimers.delete(key(code, player));
          playerLeftFinished(code);
        }, disconnectGraceMs));
      }
      return;
    }
    clearGraceTimer(code, player);
    const timer = setTimeout(() => {
      graceTimers.delete(key(code, player));
      if (forfeited.has(code)) return; // already ended (e.g. the other side also left)
      // The round may have resolved to a win or a draw while this player was
      // disconnected (R18's timer keeps running): in that case the game is
      // already over on its own terms and must not also be forfeited, or the
      // winner the opponent is told would contradict the real result.
      const current = game.getGame(code);
      if (!current || current.state.status !== "playing" || forfeited.has(code)) {
        playerLeftFinished(code); // R83: the game was already over, so this is a player who did not come back for a rematch
        return;
      }
      // The disconnected player did not return in time: the game ends as a
      // forfeit (R27), the other player wins. This is server-side state, not
      // an engine Status value (docs/rules.md R27): the engine's GameState is
      // left exactly as it was, with status still "playing". Saved before
      // broadcasting (R25).
      if (!forfeit(code, player)) startGraceTimer(code, player); // the save failed: try again after another grace period
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
      colours: coloursOf(code),
      started: hasStarted(code),
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

    // The start countdown is still running, or round 1 has not opened (R97). Nothing here depends on the opponent (R22).
    if (!hasStarted(code)) {
      const socket = connections.get(key(code, player));
      if (socket) send(socket, { type: "rejected", reason: "not_started" });
      logEvent("action_rejected", { type: "choose", reason: "not_started" });
      return;
    }

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

  // R100: what a join by this person would become, asked before they are seated and never seating them. It is the same decision a
  // join makes (decideSeat) on the same state, with nothing changed. A code that does not exist, a game against the computer and a
  // seat named by a guess are all "unknown", as a join answers them (R32, R71): it teaches nothing a join would not.
  function seatRole(code: string, person: string | null): "player" | "spectator" | "ended" | "unknown" {
    const record = game.getGame(code);
    if (!record) return "unknown";
    if (kinds.get(code) === "computer" || computerGames.has(code)) return "unknown";
    if (forfeited.has(code)) return "ended";
    const seats = roster.get(code) ?? { A: false, B: false };
    const decision = decideSeat(code, seats, undefined, undefined, person);
    if (decision === "full") return "unknown";
    if (decision === "spectator") return record.state.status !== "playing" ? "ended" : "spectator";
    return record.state.status !== "playing" ? "ended" : "player";
  }

  wss.on("connection", (socket, request) => {
    socketRequests.set(socket, request);
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
      if ((parsed.type === "choose" || parsed.type === "rematch" || parsed.type === "leave_game") && !sessionOk(socket)) return; // R87
      if (parsed.type === "rematch") {
        handleRematch(parsed as { code?: unknown; player?: unknown; seatToken?: unknown });
        return;
      }
      if (parsed.type === "leave_game") {
        leaveGame(parsed as { code?: unknown; player?: unknown; seatToken?: unknown });
        return;
      }

      if (parsed.type === "choose") {
        if (!sessionOk(socket)) return; // R87
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
      if (personId) socketPersons.set(socket, personId);

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
          // A finished game is shown with its result, and the visitor stays on it as a spectator, so a rematch reaches them (R84).
          if (typeof code === "string") {
            viaLinkVisit.add(code);
            const placed = spectators.watchLink(socket, addressOf(request), code);
            viaLinkVisit.delete(code);
            if (placed) return;
          }
          send(socket, { type: "spectating", code, kind: kinds.get(code) ?? "link", state: record.state, watching: spectators.watchingCount(code), names: { A: nameOfSeat(code, "A"), B: nameOfSeat(code, "B") }, colours: coloursOf(code), because: "two_players" } as never);
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
        if (!game.getGame(code)) createUnmarkedGame(code); // the row must exist before it can record a seat
        db.seatPlayer(code, player, personId);
        // Remember in memory whose seat this is, as a restart would from the database (R36), so the seat can follow a guest who
        // signs in to an account (R89) and a stranger can never take it while its person is away.
        const owned = holders.get(code) ?? { A: null, B: null };
        if (!owned[player]) owned[player] = personId;
        holders.set(code, owned);
      }
      // Create the game before this connection is registered, so its
      // broadcast (sent to whichever connections already exist) cannot also
      // reach this joiner; sendSnapshot below is this joiner's one snapshot.
      if (!game.getGame(code)) createUnmarkedGame(code);
      connections.set(key(code, player), socket);
      // A game made by POST /api/games (R34) exists before anyone joins. Its first round timer
      // starts only when both players are present (R18, R51).
      logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
      sendSnapshot(code, player);
      // The player already waiting learns that someone has arrived. This carries no choice (R21, R22).
      const waiting = connections.get(key(code, opponentOf(player)));
      if (waiting && waiting !== socket) send(waiting, name ? { type: "opponent_joined", name } : { type: "opponent_joined" });
      // Both are here (R51): round 1 opens after the countdown (R97). A player who connects while it runs is told the time left.
      const running = countdowns.get(code);
      if (running) send(socket, { type: "countdown", ms: Math.max(0, running.endsAt - Date.now()) });
      else beginWhenBothPresent(code);
    });

    socket.on("close", () => {
      socketPersons.delete(socket);
      socketRequests.delete(socket);
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

  // R89: a guest signed in to an account, so the seats the guest holds in live games are the account's from now on, in memory as
  // well as in the database, and the guest's sockets are counted as the account's.
  function movePerson(from: string, to: string): void {
    for (const owned of holders.values()) {
      if (owned.A === from) owned.A = to;
      if (owned.B === from) owned.B = to;
    }
    for (const [code, creator] of [...creators]) if (creator === from) creators.set(code, to);
    for (const [socket, person] of socketPersons) if (person === from) socketPersons.set(socket, to);
  }

  function dispose(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const timer of graceTimers.values()) clearTimeout(timer);
    graceTimers.clear();
    for (const timer of computerTimers.values()) clearTimeout(timer);
    computerTimers.clear();
    for (const timer of rematchTimers.values()) clearTimeout(timer);
    rematchTimers.clear();
    for (const { timer } of countdowns.values()) clearTimeout(timer);
    countdowns.clear();
    colours.clear();
    startedGames.clear();
    clearInterval(sweepTimer);
    finishedAt.clear();
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
    movePerson,
    seatRole,
    liveCount: () => liveWatchable().length, // R80: live quick match games, never link games or computer games
    spectatorState: () => spectators.sizes(),
    retained: () => ({ kinds: kinds.size, creators: creators.size, holders: holders.size, rematchGone: rematchGone.size, rematchAsked: rematchAsked.size, rematchTimers: rematchTimers.size, colours: colours.size, started: startedGames.size }), // for tests: every map empties as games are forgotten (R84)
    kindsKnown: () => [...kinds].sort(),
    watchingIn: (code: string) => spectators.watchingCount(code),
    spectatorMoveMs,
  };
}
