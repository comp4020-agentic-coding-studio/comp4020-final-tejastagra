// SQLite persistence for games (R25, R26, ADR 0005). The file lives at
// /data/rubble.db in production; tests pass ":memory:" or their own path.
import { DatabaseSync } from "node:sqlite";
import type { GameState, Player } from "../engine/index.ts";
import { logEvent } from "./log.ts";

export interface Ended {
  result: "forfeit";
  winner: Player;
}

export interface SavedGame {
  code: string;
  state: GameState;
  updatedAt: number;
  ended: Ended | null;
  vsComputer: boolean; // R33, R37: the opponent is the computer
}

export interface Db {
  saveGame(code: string, state: GameState): void;
  // How the game ended, outside the engine's own Status (docs/rules.md R19,
  // R27): a forfeit is server-side state, so it is stored alongside the
  // engine's state rather than inside it.
  saveEnded(code: string, ended: Ended): void;
  // Marks a game as against the computer (R33), so it survives a restart and
  // never counts for the leaderboard (R37).
  // An upsert, so the mark can be written before the game itself (one source of truth).
  markComputer(code: string, state: GameState): void;
  loadGames(): SavedGame[];
  close(): void;
}

// Each migration runs once, in order, against whatever schema the last
// deploy left behind: SQLite's `user_version` pragma records how many have
// already run, so a fresh database and an upgraded one both end up here.
// Every schema change must add a migration and a test that an old database
// is upgraded (see CLAUDE.md).
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS games (
     code TEXT PRIMARY KEY,
     state TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `ALTER TABLE games ADD COLUMN ended TEXT`,
  `ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`,
];

function migrate(db: DatabaseSync): void {
  const { user_version: appliedCount } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let i = appliedCount; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.exec(`PRAGMA user_version = ${i + 1}`);
  }
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);

  const upsert = db.prepare(`
    INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `);
  const updateEnded = db.prepare(`UPDATE games SET ended = ? WHERE code = ?`);
  const markComputerRow = db.prepare(`
    INSERT INTO games (code, state, updated_at, vs_computer) VALUES (?, ?, ?, 1)
    ON CONFLICT(code) DO UPDATE SET vs_computer = 1
  `);
  const selectAll = db.prepare("SELECT code, state, updated_at, ended, vs_computer FROM games");

  return {
    saveGame(code: string, state: GameState): void {
      upsert.run(code, JSON.stringify(state), Date.now());
    },
    saveEnded(code: string, ended: Ended): void {
      updateEnded.run(JSON.stringify(ended), code);
    },
    markComputer(code: string, state: GameState): void {
      markComputerRow.run(code, JSON.stringify(state), Date.now());
    },
    loadGames(): SavedGame[] {
      const saved: SavedGame[] = [];
      for (const row of selectAll.all()) {
        try {
          const endedColumn = row.ended as string | null;
          saved.push({
            code: row.code as string,
            state: JSON.parse(row.state as string) as GameState,
            updatedAt: row.updated_at as number,
            ended: endedColumn ? (JSON.parse(endedColumn) as Ended) : null,
            vsComputer: row.vs_computer === 1,
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
