// SQLite persistence for games (R25, R26, ADR 0005). The file lives at
// /data/rubble.db in production; tests pass ":memory:" or their own path.
import { DatabaseSync } from "node:sqlite";
import type { GameState } from "../engine/index.ts";
import { logEvent } from "./log.ts";

export interface SavedGame {
  code: string;
  state: GameState;
  updatedAt: number;
}

export interface Db {
  saveGame(code: string, state: GameState): void;
  loadGames(): SavedGame[];
  close(): void;
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const upsert = db.prepare(`
    INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `);
  const selectAll = db.prepare("SELECT code, state, updated_at FROM games");

  return {
    saveGame(code: string, state: GameState): void {
      upsert.run(code, JSON.stringify(state), Date.now());
    },
    loadGames(): SavedGame[] {
      const saved: SavedGame[] = [];
      for (const row of selectAll.all()) {
        try {
          saved.push({
            code: row.code as string,
            state: JSON.parse(row.state as string) as GameState,
            updatedAt: row.updated_at as number,
          });
        } catch (error) {
          logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
        }
      }
      return saved;
    },
    close(): void {
      db.close();
    },
  };
}
