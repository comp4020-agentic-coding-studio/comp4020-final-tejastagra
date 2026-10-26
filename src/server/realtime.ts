// WebSocket real time (ADR 0002). The server is the referee (ADR 0003): the
// browser only sends choices and displays what the server sends (R20). Each
// player has at most one live connection per game (R32); a game has at most
// two players (R36). A full snapshot is sent on every join (R24).
import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { GameState, Player } from "../engine/index.ts";
import { createGameService, type GameService } from "./game-service.ts";
import type { Db } from "./db.ts";
import { logEvent } from "./log.ts";

export interface Snapshot {
  type: "snapshot";
  you: Player;
  seatToken: string;
  state: GameState;
}

export interface GameFull {
  type: "game_full";
}

export interface TabReplaced {
  type: "tab_replaced";
}

export type ServerMessage = Snapshot | GameFull | TabReplaced;

interface JoinMessage {
  type: "join";
  code: string;
  player?: Player;
  seatToken?: string;
}

type ClientMessage = JoinMessage | { type: string; [key: string]: unknown };

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function attachRealtime(server: Server, db: Db): { wss: WebSocketServer; game: GameService } {
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

  function key(code: string, player: Player): string {
    return `${code}:${player}`;
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
        send(socket, { type: "snapshot", you: player, seatToken: seatTokens.get(key(code, player))!, state });
        recipients++;
      }
    }
    logEvent("broadcast", { type: "snapshot", recipients, game: code });
  }

  const game = createGameService({ db, broadcast });
  game.restore();

  const wss = new WebSocketServer({ server, path: "/ws" });

  function sendSnapshot(code: string, player: Player): void {
    const record = game.getGame(code);
    if (!record) return;
    const socket = connections.get(key(code, player));
    if (!socket) return;
    send(socket, { type: "snapshot", you: player, seatToken: seatTokens.get(key(code, player))!, state: record.state });
    logEvent("snapshot_sent", { game: code, round: record.state.round, reason: "join" });
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

      seats[player] = true;
      if (!seatTokens.has(key(code, player))) seatTokens.set(key(code, player), randomUUID());
      // Create the game before this connection is registered, so its
      // broadcast (sent to whichever connections already exist) cannot also
      // reach this joiner; sendSnapshot below is this joiner's one snapshot.
      if (!game.getGame(code)) game.createGame(code);
      connections.set(key(code, player), socket);

      logEvent("join", { game: code, role: player, clients_in_game: clientsInGame(code) });
      sendSnapshot(code, player);
    });

    socket.on("close", () => {
      for (const [connectionKey, connectionSocket] of connections) {
        if (connectionSocket === socket) {
          connections.delete(connectionKey);
          const code = connectionKey.slice(0, connectionKey.lastIndexOf(":"));
          logEvent("disconnect", { game: code, clients_in_game: clientsInGame(code), grace_s: 30 });
          break;
        }
      }
    });
  });

  return { wss, game };
}
