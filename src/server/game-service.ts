// The game service: the only thing that calls the engine on the server side.
// Every change to a game is saved before it is broadcast (R25). After a
// restart, every in-progress game resumes at its last saved round with its
// timer restarted at 15 seconds (R26).
import { newGame, resolveRound, type Choice, type GameState } from "../engine/index.ts";
import type { Db } from "./db.ts";

export const ROUND_TIMER_MS = 15_000;

export interface GameRecord {
  state: GameState;
  roundStartedAt: number;
}

export interface GameServiceOptions {
  db: Db;
  broadcast: (code: string, state: GameState) => void;
  now?: () => number;
}

export interface GameService {
  createGame(code: string): GameRecord;
  resolve(code: string, choices: { A: Choice | null; B: Choice | null }): Promise<void>;
  restore(): void;
  getGame(code: string): GameRecord | undefined;
  timeRemainingMs(code: string): number;
}

export function createGameService(options: GameServiceOptions): GameService {
  const { db, broadcast } = options;
  const now = options.now ?? Date.now;
  const games = new Map<string, GameRecord>();

  function save(code: string, state: GameState): void {
    db.saveGame(code, state);
  }

  return {
    createGame(code: string): GameRecord {
      const state = newGame();
      const record: GameRecord = { state, roundStartedAt: now() };
      games.set(code, record);
      save(code, state);
      broadcast(code, state);
      return record;
    },

    async resolve(code: string, choices: { A: Choice | null; B: Choice | null }): Promise<void> {
      const record = games.get(code);
      if (!record) throw new Error(`no such game: ${code}`);
      const result = resolveRound(record.state, choices);
      save(code, result.state);
      record.state = result.state;
      record.roundStartedAt = now();
      broadcast(code, result.state);
    },

    restore(): void {
      for (const saved of db.loadGames()) {
        if (saved.state.status !== "playing") continue;
        games.set(saved.code, { state: saved.state, roundStartedAt: now() });
      }
    },

    getGame(code: string): GameRecord | undefined {
      return games.get(code);
    },

    timeRemainingMs(code: string): number {
      const record = games.get(code);
      if (!record) throw new Error(`no such game: ${code}`);
      return Math.max(0, ROUND_TIMER_MS - (now() - record.roundStartedAt));
    },
  };
}
