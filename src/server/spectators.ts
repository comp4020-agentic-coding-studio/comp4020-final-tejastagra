// Spectating (ADR 0012, R70 to R80). A spectator is a connection that watches a game without being a
// seat: it has no seat token and never counts as a player, so it cannot change a round timer, an
// abandonment, presence or a forfeit (R79).
//
// This module is handed only PUBLIC game state (the board, the round, which shields and Earthquakes are
// spent, both players' public names). It is never given the pending choices, so a pending column, shield or
// Earthquake cannot reach a spectator by any path through it (R72, R22).
import type { WebSocket } from "ws";
import type { GameState } from "../engine/index.ts";

export const SPECTATORS_PER_GAME = 50; // R77
export const SPECTATORS_TOTAL = 300; // R77, ADR 0012: one 256 MB machine
export const SPECTATOR_MOVE_MS = 5_000; // R76
export const SPECTATE_BURST = 10; // R77: at most this many spectate messages from one connection...
export const SPECTATE_WINDOW_MS = 10_000; // ...in this long
export const SPECTATOR_BUFFER_LIMIT = 256 * 1024; // R77: a spectator with more than this waiting to be sent is closed

export type GameKind = "quick" | "link";

// What the spectator module needs to know about a game, and nothing more. `names` are public identity.
export interface WatchableView {
  state: GameState;
  kind: GameKind;
  names: { A: string | null; B: string | null };
}

export type SpectatorMessage =
  | { type: "spectating"; code: string; kind: GameKind; state: GameState; watching: number; names: { A: string | null; B: string | null }; because?: "two_players" }
  | { type: "none_live" }
  | { type: "round"; state: GameState; watching: number }
  | { type: "watching"; watching: number }
  | { type: "ended"; result: "forfeit"; winner: "A" | "B" }
  | { type: "ended"; result: "abandoned" }
  | { type: "not_watchable"; reason: "full" | "room_full" | "unknown" }
  | { type: "rejected"; reason: "spectator" }
  | { type: "rematch_started" };

export interface SpectatorHooks {
  send(socket: WebSocket, message: SpectatorMessage): void;
  // Public view of a game, or undefined when it cannot be watched right now (friend, over, waiting, unknown).
  viewOf(code: string): WatchableView | undefined;
  // The codes of every game that is live and watchable (R70), not counting the exhibition game.
  liveCodes(): string[];
  // Tells the players of a game how many are watching (R75).
  watchingChanged(code: string, watching: number): void;
  log(event: "spectate_join" | "spectate_leave" | "spectate_move", fields: Record<string, string | number>): void;
}

export interface SpectatorOptions {
  perGame?: number;
  total?: number;
  bufferLimit?: number;
  now?: () => number;
}

export function createSpectators(hooks: SpectatorHooks, options: SpectatorOptions = {}) {
  const perGame = options.perGame ?? SPECTATORS_PER_GAME;
  const total = options.total ?? SPECTATORS_TOTAL;
  const bufferLimit = options.bufferLimit ?? SPECTATOR_BUFFER_LIMIT;
  const now = options.now ?? Date.now;
  // When each client address last asked to watch, so one address (however many connections it opens, and
  // however it alternates spectate and leave) cannot make the server send a stream of count changes to the
  // players and the other spectators (R77). The history is kept until it ages out, never cleared on leave.
  const asked = new Map<string, number[]>();
  // game code -> the sockets watching it. A socket watches at most one game.
  const watchers = new Map<string, Set<WebSocket>>();
  const watching = new Map<WebSocket, string>();
  // The game a spectator just watched, so moving on (R76) does not pick it again while another is live.
  const lastGame = new Map<WebSocket, string>();

  const count = (code: string): number => watchers.get(code)?.size ?? 0;

  function pickLive(socket: WebSocket): string | undefined {
    const avoid = lastGame.get(socket);
    const open = hooks.liveCodes().filter((code) => count(code) < perGame);
    const fresh = open.filter((code) => code !== avoid);
    const pool = fresh.length ? fresh : open;
    if (!pool.length) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function detach(socket: WebSocket): string | undefined {
    const code = watching.get(socket);
    if (code === undefined) return undefined;
    watching.delete(socket);
    const set = watchers.get(code);
    set?.delete(socket);
    if (set && set.size === 0) watchers.delete(code);
    lastGame.set(socket, code);
    return code;
  }

  // After a socket leaves a game: tell everyone the new count.
  function left(code: string, event: "spectate_leave" | "spectate_move" | null): void {
    const n = count(code);
    for (const other of watchers.get(code) ?? []) hooks.send(other, { type: "watching", watching: n });
    hooks.watchingChanged(code, n);
    if (event) hooks.log(event, { game: code, spectators: n });
  }

  function attach(socket: WebSocket, code: string, kind: GameKind, view: WatchableView, isMove: boolean, from?: string, because?: "two_players"): void {
    let set = watchers.get(code);
    if (!set) watchers.set(code, (set = new Set()));
    set.add(socket);
    watching.set(socket, code);
    const n = set.size;
    hooks.send(socket, { type: "spectating", code, kind, state: view.state, watching: n, names: view.names, ...(because ? { because } : {}) });
    for (const other of set) if (other !== socket) hooks.send(other, { type: "watching", watching: n });
    hooks.watchingChanged(code, n);
    if (isMove) hooks.log("spectate_move", { game: code, from: from ?? "none", spectators: n });
    else hooks.log("spectate_join", { game: code, spectators: n, kind });
  }

  // The per-address history is also pruned on a timer, not only when someone asks, so a burst from many addresses
  // cannot leave entries behind for ever (R77). unref'd, so it never keeps the process alive.
  const sweep = setInterval(() => {
    const t = now();
    for (const [who, times] of asked) if (times.every((at) => t - at >= SPECTATE_WINDOW_MS)) asked.delete(who);
  }, SPECTATE_WINDOW_MS);
  sweep.unref();

  return {
    // R70: join the game in `code`, or a random live one. Answers with the game's public snapshot (R73), or why not.
    join(socket: WebSocket, address: string, code?: string, because?: "two_players"): void {
      const t = now();
      for (const [who, times] of asked) if (times.every((at) => t - at >= SPECTATE_WINDOW_MS)) asked.delete(who); // so the map cannot grow
      const recent = (asked.get(address) ?? []).filter((at) => t - at < SPECTATE_WINDOW_MS);
      if (recent.length >= SPECTATE_BURST) return; // R77: ignored, and nobody is told
      recent.push(t);
      asked.set(address, recent);
      // Asking again for the game it is already in changes nothing, and must not stop an exhibition game.
      if (code !== undefined && watching.get(socket) === code) {
        const view = hooks.viewOf(code);
        if (view) {
          hooks.send(socket, { type: "spectating", code, kind: view.kind, state: view.state, watching: count(code), names: view.names, ...(because ? { because } : {}) });
          return;
        }
      }
      const previous = watching.has(socket) ? detach(socket) : undefined;
      const wasMove = previous !== undefined;
      if (previous !== undefined) left(previous, null);

      // The machine-wide limit (R77): a spectator past it is told the room is full. Players are never refused.
      if (watching.size >= total) {
        hooks.send(socket, { type: "not_watchable", reason: "room_full" });
        return;
      }

      let target = code;
      if (target === undefined) target = pickLive(socket);
      if (target === undefined) {
        hooks.send(socket, { type: "none_live" }); // R70: nothing is live, and nothing is made up to watch
        return;
      }
      const view = hooks.viewOf(target);
      // A friend game, an unknown code and a game that is not live are all answered "unknown", so a friend
      // game's existence is never revealed (R71).
      if (!view) {
        hooks.send(socket, { type: "not_watchable", reason: "unknown" });
        return;
      }
      if (count(target) >= perGame) {
        hooks.send(socket, { type: "not_watchable", reason: "full" });
        return;
      }
      attach(socket, target, view.kind, view, wasMove, previous, because);
    },

    // A visitor opened a link game's page and both seats are taken: the server makes them a spectator (R36). The same caps
    // and limits apply, and a seat is never given (R36). Returns false when they could not be placed (a full game).
    watchLink(socket: WebSocket, address: string, code: string): boolean {
      const before = watching.has(socket);
      this.join(socket, address, code, "two_players");
      return watching.get(socket) === code || (!before && watching.has(socket));
    },

    // The socket is gone, or asked to stop watching.
    leave(socket: WebSocket): void {
      const code = detach(socket);
      lastGame.delete(socket);
      if (code !== undefined) left(code, "spectate_leave");
    },

    // A round resolved and was saved (R25): send every spectator the result (R79).
    round(code: string, state: GameState): void {
      const set = watchers.get(code);
      if (!set) return;
      const n = set.size;
      for (const socket of set) hooks.send(socket, { type: "round", state, watching: n });
    },

    // A game ended by a forfeit or abandonment, which are server-side state and not an engine status (R27, R19):
    // tell every spectator, after it is saved (R25). Their browsers then move on after 5 seconds (R76).
    ended(code: string, message: { type: "ended"; result: "forfeit"; winner: "A" | "B" } | { type: "ended"; result: "abandoned" }): void {
      for (const socket of watchers.get(code) ?? []) hooks.send(socket, message);
    },

    // A rematch started (R85): every spectator is told, after the new game is saved, then sees its first round as a `round`.
    announce(code: string, message: { type: "rematch_started" }): void {
      for (const socket of watchers.get(code) ?? []) hooks.send(socket, message);
    },

    // R77: a spectator that does not read its messages is closed once too much is waiting to be sent to it.
    // Returns the sockets it dropped, so the caller can close them.
    slowSpectators(): WebSocket[] {
      return [...watching.keys()].filter((socket) => socket.bufferedAmount > bufferLimit);
    },

    // How much state is held, for tests: every map empties as spectators leave (R77).
    sizes: () => ({ watchers: watchers.size, watching: watching.size, lastGame: lastGame.size, addresses: asked.size }),
    // Forget everything: the server is shutting down.
    clear(): void {
      watchers.clear();
      watching.clear();
      lastGame.clear();
      asked.clear();
      clearInterval(sweep);
    },
    isSpectator: (socket: WebSocket): boolean => watching.has(socket),
    watchingCount: count,
    totalWatching: (): number => watching.size,
    // R74: anything a spectator sends other than spectate and leave is refused, and only the spectator hears it.
    reject(socket: WebSocket): void {
      hooks.send(socket, { type: "rejected", reason: "spectator" });
    },
  };
}
