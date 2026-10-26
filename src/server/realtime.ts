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
import { validateChoice, type Choice, type GameState, type Player } from "../engine/index.ts";
import { createGameService, ROUND_TIMER_MS, type GameService } from "./game-service.ts";
import type { Db } from "./db.ts";
import { logEvent } from "./log.ts";

export interface Snapshot {
  type: "snapshot";
  you: Player;
  seatToken: string;
  state: GameState;
  opponentReady: boolean;
}

export interface OpponentReady {
  type: "opponent_ready";
}

export interface Rejected {
  type: "rejected";
  reason: "game_over" | "bad_column" | "column_full" | "no_shield";
}

export interface GameFull {
  type: "game_full";
}

export interface TabReplaced {
  type: "tab_replaced";
}

export interface GameOver {
  type: "game_over";
  result: "forfeit";
  winner: Player;
}

export type ServerMessage = Snapshot | OpponentReady | Rejected | GameFull | TabReplaced | GameOver;

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
  column: number;
  shield?: boolean;
}

type ClientMessage = JoinMessage | ChooseMessage | { type: string; [key: string]: unknown };

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export interface RealtimeOptions {
  roundTimerMs?: number; // overridable so tests do not wait 15 real seconds (R18)
  disconnectGraceMs?: number; // overridable so tests do not wait 30 real seconds (R27)
}

export const DISCONNECT_GRACE_MS = 30_000;

export function attachRealtime(
  server: Server,
  db: Db,
  options: RealtimeOptions = {},
): { wss: WebSocketServer; game: GameService; dispose: () => void } {
  const roundTimerMs = options.roundTimerMs ?? ROUND_TIMER_MS;
  const disconnectGraceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
  // Which player letters have ever been assigned in a game, so a game has at
  // most two players (R36).
  const roster = new Map<string, { A: boolean; B: boolean }>();
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
  const forfeited = new Map<string, Player>();

  function key(code: string, player: Player): string {
    return `${code}:${player}`;
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
    if (saved.ended) forfeited.set(saved.code, saved.ended.winner);
  }

  for (const code of restoredCodes) {
    if (!forfeited.has(code)) scheduleTimerFor(code);
  }

  function clearTimerFor(code: string): void {
    const timer = timers.get(code);
    if (timer) {
      clearTimeout(timer);
      timers.delete(code);
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
      forfeited.set(code, winner);
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
    });
    logEvent("snapshot_sent", { game: code, round: record.state.round, reason: "join" });
  }

  function handleChoose(message: ChooseMessage): void {
    const { code, player, seatToken, column, shield } = message;
    if (typeof code !== "string" || (player !== "A" && player !== "B")) return;
    // A missing or unrecognised token must never be treated as a match: an
    // unissued seat has no token in the map (`undefined`), and a message
    // with no seatToken field is also `undefined`, so this must be an
    // explicit identity check, not a `!==` that two absences can satisfy.
    const expectedToken = seatTokens.get(key(code, player));
    if (typeof seatToken !== "string" || typeof expectedToken !== "string" || seatToken !== expectedToken) return;
    if (typeof column !== "number" || (shield !== undefined && typeof shield !== "boolean")) return;

    const record = game.getGame(code);
    logEvent("action_received", { type: "choose", round: record?.state.round });
    if (!record) return;
    if (resolving.has(code)) return;
    if (forfeited.has(code)) return;

    const choice: Choice = { column, shield: Boolean(shield) };
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
      const forfeitWinner = forfeited.get(code);
      if (forfeitWinner) {
        // Require the same seatToken check as any other reconnect to an
        // occupied seat (R32): a stranger must not learn the forfeit result
        // or take a seat by guessing its letter, even once the game is over.
        if (seats[player] && seatToken !== seatTokens.get(key(code, player))) {
          send(socket, { type: "game_full" });
          return;
        }
        seats[player] = true;
        connections.set(key(code, player), socket);
        send(socket, { type: "game_over", result: "forfeit", winner: forfeitWinner });
        logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
        return;
      }

      seats[player] = true;
      if (!seatTokens.has(key(code, player))) seatTokens.set(key(code, player), randomUUID());
      // Create the game before this connection is registered, so its
      // broadcast (sent to whichever connections already exist) cannot also
      // reach this joiner; sendSnapshot below is this joiner's one snapshot.
      if (!game.getGame(code)) game.createGame(code);
      // A game made by POST /api/games (R34) exists before anyone joins; its
      // first round timer starts when the first player arrives (R18).
      if (!timers.has(code)) scheduleTimerFor(code);
      connections.set(key(code, player), socket);

      logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
      sendSnapshot(code, player);
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
  }

  return { wss, game, dispose };
}
