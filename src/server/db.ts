// SQLite persistence for games (R25, R26, ADR 0005). The file lives at
// /data/rubble.db in production; tests pass ":memory:" or their own path.
import { DatabaseSync } from "node:sqlite";
import type { GameState, Player } from "../engine/index.ts";
import { logEvent } from "./log.ts";

export type Ended = { result: "forfeit"; winner: Player } | { result: "abandoned" };

// Each seat's colour (R93): one seat red with the ring marker, the other yellow with the cross marker.
export type Colour = "red" | "yellow";
export type Colours = Record<Player, Colour>;
export const DEFAULT_COLOURS: Colours = { A: "red", B: "yellow" }; // R95: a game saved before colours existed

const parseColours = (text: unknown): Colours => {
  try {
    const c = JSON.parse(String(text));
    if ((c?.A === "red" && c?.B === "yellow") || (c?.A === "yellow" && c?.B === "red")) return { A: c.A, B: c.B };
  } catch {
    // an unreadable value falls back to the default, so one bad row never stops the app
  }
  return { ...DEFAULT_COLOURS };
};

export interface SavedGame {
  code: string;
  state: GameState;
  updatedAt: number;
  ended: Ended | null;
  vsComputer: boolean; // R33, R37: the opponent is the computer
  // R36, R71: what kind of game this is. Old games get a kind from what was known (migration 15).
  kind: "quick" | "link" | "computer";
  creator: string | null; // the person who made a link game, who is player 1 (R36)
  playerA: string | null; // player ids of the people in each seat (R28), when known
  playerB: string | null;
  missedA: number; // rounds in which that seat made no choice (R39)
  missedB: number;
  colours: Colours; // R93, R95
}

export interface PlayerRow {
  id: string;
  nickname: string;
  username: string | null;
  passwordHash: string | null;
  tutorialSeen: boolean; // R48: finished or skipped, saved with the player
  mustChange: boolean; // R86, R87: signed in with a temporary password, so a new one must be chosen first
}

export interface Db {
  // Identity (R28 to R31). Sessions are stored by the hash of their token.
  createPlayer(id: string, nickname: string): void;
  setNickname(id: string, nickname: string): void;
  // Turns a guest into an account in place, keeping the same id (R29).
  // Returns false when the username is already taken (case-insensitive).
  upgradeToAccount(id: string, username: string, passwordHash: string): boolean;
  // R48 and R49: whether this player has finished or skipped the tutorial.
  setTutorialSeen(id: string, seen: boolean): void;
  // R86: sets a new password hash and marks the account "must change" (an admin reset) or not. Every session of the account
  // ends, so a stolen cookie does not survive a reset. R87: choosing a new password clears the mark and ends every session
  // except `keepSession`, the one that is making the change.
  setPassword(id: string, passwordHash: string, options?: { mustChange?: boolean; keepSession?: string }): void;
  // R89: gives every game of the guest `from` to the account `to` (either seat), hands the guest's sessions to the account (so a
  // connection that is already open keeps working) and removes the guest.
  moveGames(from: string, to: string): void;
  // R47: whether this person has finished a game with a round played (a line, a draw or a forfeit, R98): an account that has is never
  // offered the tutorial.
  hasFinishedGame(id: string): boolean;
  playerByUsername(username: string): PlayerRow | undefined;
  createSession(tokenHash: string, playerId: string): void;
  // Sessions older than maxAgeMs are not honoured, whatever the cookie says.
  playerBySession(tokenHash: string, maxAgeMs: number): PlayerRow | undefined;
  deleteExpiredSessions(maxAgeMs: number): void;
  deleteSession(tokenHash: string): void;
  saveGame(code: string, state: GameState): void;
  // Saves a resolved round and adds this round's missed choices in one
  // statement, so the board and the missed counts can never disagree (R25, R39).
  saveRound(code: string, state: GameState, missedA: boolean, missedB: boolean): void;
  // Records which person sits in a seat, once (R28). The first identity wins.
  seatPlayer(code: string, seat: Player, playerId: string): void;
  playerById(id: string): PlayerRow | undefined;
  // How the game ended, outside the engine's own Status (docs/rules.md R19,
  // R27): a forfeit is server-side state, so it is stored alongside the
  // engine's state rather than inside it.
  saveEnded(code: string, ended: Ended): void;
  // Marks a game as against the computer (R33), so it survives a restart and
  // never counts for the leaderboard (R37).
  // An upsert, so the mark can be written before the game itself (one source of truth).
  // Each mark also saves the game's colours (R93), decided by the caller when the game is made.
  markComputer(code: string, state: GameState, colours?: Colours): void;
  // Marks a game as a quick match game (R35, R71). An upsert, like markComputer.
  markWatchable(code: string, state: GameState, colours?: Colours): void;
  // Marks a game as a link game and records who made it (R34, R36). The first creator wins. An upsert.
  markLink(code: string, state: GameState, creator: string | null, colours?: Colours): void;
  // A rematch (R84): copies the finished game under `<code>#<n>` (the first n not used) and resets the game under `code` to
  // `fresh`, keeping its kind, creator and seats, in one transaction. The new game's colours are `colours` (R96: swapped).
  // Returns the archive's code.
  archiveGame(code: string, fresh: GameState, colours?: Colours): string;
  // The colours of a game made by a join with no kind (it has none saved yet), decided when it is made (R93).
  setColours(code: string, colours: Colours): void;
  loadGames(): SavedGame[];
  // The games one player sat in (R90): a query on the seats, so the account page does not read and parse every saved game.
  loadGamesOf(playerId: string): SavedGame[];
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
  `CREATE TABLE players (
     id TEXT PRIMARY KEY,
     nickname TEXT NOT NULL,
     username TEXT COLLATE NOCASE UNIQUE,
     password_hash TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     player_id TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `ALTER TABLE games ADD COLUMN player_a TEXT`,
  `ALTER TABLE games ADD COLUMN player_b TEXT`,
  `ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`,
  // R53: games saved before Earthquake have no earthquakesLeft in their state; both are available.
  `UPDATE games SET state = json_set(state, '$.earthquakesLeft', json('{"A":true,"B":true}')) WHERE json_extract(state, '$.earthquakesLeft') IS NULL`,
  // R69: games saved before the shrinking board have the full 7 by 6 shape, whatever their round count.
  // They take the shape for their round count at their next resolved round.
  `UPDATE games SET state = json_set(state, '$.rows', 6, '$.firstColumn', 0, '$.lastColumn', 6) WHERE json_extract(state, '$.rows') IS NULL`,
  // ADR 0011 (amended): the walls were removed, so every saved game drops the open-columns range that
  // migration 12 may have added. A game's rows are kept, and the engine sets them from the round count at
  // its next resolved round (R69).
  `UPDATE games SET state = json_remove(state, '$.firstColumn', '$.lastColumn')`,
  // R71 (ADR 0012): which games spectators may watch. Existing quick match games cannot be told apart from
  // friend games, so none is marked: only games made after this change are watchable, which errs on the
  // side of privacy. Games against the computer are watchable already, through vs_computer.
  `ALTER TABLE games ADD COLUMN watchable INTEGER NOT NULL DEFAULT 0`,
  // R36, R71 (ADR 0012 amended): the kind of every game, and a link game's creator. A game saved before this knows only
  // whether it was against the computer or marked watchable, so that is what its kind is made from; the rest are link games.
  `ALTER TABLE games ADD COLUMN kind TEXT`,
  `ALTER TABLE games ADD COLUMN creator TEXT`,
  `UPDATE games SET kind = CASE WHEN vs_computer = 1 THEN 'computer' WHEN watchable = 1 THEN 'quick' ELSE 'link' END WHERE kind IS NULL`,
  // R86, R87 (ADR 0013): an account reset by the admin must choose a new password at its next sign-in. No account is marked.
  `ALTER TABLE players ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0`,
  // R93, R95 (ADR 0014): each seat's colour, decided by the server when the game is made. Games saved before this change get
  // seat A red and seat B yellow, which is what their spectators were shown.
  `ALTER TABLE games ADD COLUMN colours TEXT`,
  `UPDATE games SET colours = '{"A":"red","B":"yellow"}' WHERE colours IS NULL`,
  // R98 (ADR 0015, asked for by Tejas on 29 October 2026): a game that never started is never recorded. Rows of games that are
  // over with no round played are deleted, and their rematch archives with no round played; a game still waiting is kept (R26).
  `DELETE FROM games WHERE json_extract(state, '$.round') = 0 AND (ended IS NOT NULL OR json_extract(state, '$.status') <> 'playing' OR instr(code, '#') > 0)`,
  // R48 (second fix list, 31 October 2026): an account that has finished at least one game has already seen how the game works, so
  // it is never offered the tutorial. A finished game is one that is over (a line, a draw, a forfeit or an abandonment) with at least one round played (R98); only
  // accounts are marked (a guest keeps the browser's own mark).
  `UPDATE players SET tutorial_seen = 1 WHERE username IS NOT NULL AND tutorial_seen = 0 AND id IN (
     SELECT player_a FROM games WHERE player_a IS NOT NULL AND json_extract(state, '$.round') > 0 AND (ended IS NOT NULL OR json_extract(state, '$.status') <> 'playing')
     UNION
     SELECT player_b FROM games WHERE player_b IS NOT NULL AND json_extract(state, '$.round') > 0 AND (ended IS NOT NULL OR json_extract(state, '$.status') <> 'playing')
   )`,
];

// How many migrations there are: a database opened by this code has run exactly this many (`PRAGMA user_version`).
export const MIGRATION_COUNT = MIGRATIONS.length;

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
  // The admin's reset script (ADR 0013) opens this same file while the server has it open. A writer that finds the file busy
  // waits up to 5 seconds instead of failing with "database is locked", for the script and for the server alike.
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);

  const upsert = db.prepare(`
    INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `);
  const updateEnded = db.prepare(`UPDATE games SET ended = ? WHERE code = ?`);
  // A game's colours are decided once, when it is made (R93): a later mark never changes them.
  const markComputerRow = db.prepare(`
    INSERT INTO games (code, state, updated_at, vs_computer, kind, colours) VALUES (?, ?, ?, 1, 'computer', ?)
    ON CONFLICT(code) DO UPDATE SET vs_computer = 1, kind = 'computer', colours = COALESCE(colours, excluded.colours)
  `);
  const markWatchableRow = db.prepare(`
    INSERT INTO games (code, state, updated_at, watchable, kind, colours) VALUES (?, ?, ?, 1, 'quick', ?)
    ON CONFLICT(code) DO UPDATE SET watchable = 1, kind = 'quick', colours = COALESCE(colours, excluded.colours)
  `);
  const markLinkRow = db.prepare(`
    INSERT INTO games (code, state, updated_at, kind, creator, colours) VALUES (?, ?, ?, 'link', ?, ?)
    ON CONFLICT(code) DO UPDATE SET kind = 'link', creator = COALESCE(creator, excluded.creator), colours = COALESCE(colours, excluded.colours)
  `);
  const saveRoundRow = db.prepare(`
    UPDATE games SET state = ?, updated_at = ?, missed_a = missed_a + ?, missed_b = missed_b + ? WHERE code = ?
  `);
  const copyRow = db.prepare(`
    INSERT INTO games (code, state, updated_at, ended, vs_computer, watchable, kind, creator, player_a, player_b, missed_a, missed_b, colours)
    SELECT ?, state, updated_at, ended, vs_computer, watchable, kind, creator, player_a, player_b, missed_a, missed_b, colours FROM games WHERE code = ?
  `);
  const resetRow = db.prepare(`UPDATE games SET state = ?, updated_at = ?, ended = NULL, missed_a = 0, missed_b = 0, colours = COALESCE(?, colours) WHERE code = ?`);
  const codeTaken = db.prepare(`SELECT 1 AS taken FROM games WHERE code = ?`);
  const updateColours = db.prepare(`UPDATE games SET colours = ? WHERE code = ?`);
  const seatA = db.prepare(`UPDATE games SET player_a = ? WHERE code = ? AND player_a IS NULL`);
  const seatB = db.prepare(`UPDATE games SET player_b = ? WHERE code = ? AND player_b IS NULL`);
  const selectById = db.prepare(`SELECT id, nickname, username, password_hash, tutorial_seen, must_change FROM players WHERE id = ?`);
  const gameColumns = "code, state, updated_at, ended, vs_computer, watchable, kind, creator, player_a, player_b, missed_a, missed_b, colours";
  const selectAll = db.prepare(`SELECT ${gameColumns} FROM games`);
  const selectOf = db.prepare(`SELECT ${gameColumns} FROM games WHERE player_a = ? OR player_b = ?`);

  const updatePassword = db.prepare(`UPDATE players SET password_hash = ?, must_change = ? WHERE id = ?`);
  const deleteSessionsOf = db.prepare(`DELETE FROM sessions WHERE player_id = ?`);
  const deleteSessionsExcept = db.prepare(`DELETE FROM sessions WHERE player_id = ? AND token_hash <> ?`);
  const moveA = db.prepare(`UPDATE games SET player_a = ? WHERE player_a = ?`);
  const moveB = db.prepare(`UPDATE games SET player_b = ? WHERE player_b = ?`);
  const moveCreator = db.prepare(`UPDATE games SET creator = ? WHERE creator = ?`);
  const deletePlayerRow = db.prepare(`DELETE FROM players WHERE id = ?`);
  const moveSessions = db.prepare(`UPDATE sessions SET player_id = ? WHERE player_id = ?`);
  const insertPlayer = db.prepare(`INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?)`);
  const updateNickname = db.prepare(`UPDATE players SET nickname = ? WHERE id = ?`);
  const finishedGame = db.prepare(`
    SELECT 1 FROM games
    WHERE (player_a = ? OR player_b = ?) AND json_extract(state, '$.round') > 0 AND (ended IS NOT NULL OR json_extract(state, '$.status') <> 'playing')
    LIMIT 1`);
  const updateTutorial = db.prepare(`UPDATE players SET tutorial_seen = ? WHERE id = ?`);
  const upgrade = db.prepare(`UPDATE players SET username = ?, password_hash = ? WHERE id = ? AND username IS NULL`);
  const selectByUsername = db.prepare(`SELECT id, nickname, username, password_hash, tutorial_seen, must_change FROM players WHERE username = ?`);
  const insertSession = db.prepare(`INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)`);
  const selectBySession = db.prepare(`
    SELECT p.id, p.nickname, p.username, p.password_hash, p.tutorial_seen, p.must_change FROM sessions s
    JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.created_at > ?
  `);
  const purgeSessions = db.prepare(`DELETE FROM sessions WHERE created_at <= ?`);
  const removeSession = db.prepare(`DELETE FROM sessions WHERE token_hash = ?`);
  const toRow = (row: Record<string, unknown> | undefined): PlayerRow | undefined =>
    row
      ? {
          id: row.id as string,
          nickname: row.nickname as string,
          username: (row.username as string | null) ?? null,
          passwordHash: (row.password_hash as string | null) ?? null,
          tutorialSeen: row.tutorial_seen === 1,
          mustChange: row.must_change === 1,
        }
      : undefined;

  // Turns saved rows into games, skipping (and logging) a row that cannot be read, so one bad row never stops the app.
  const parseGames = (rows: Array<Record<string, unknown>>): SavedGame[] => {
    const saved: SavedGame[] = [];
    for (const row of rows) {
      try {
        const endedColumn = row.ended as string | null;
        saved.push({
          code: row.code as string,
          state: JSON.parse(row.state as string) as GameState,
          updatedAt: row.updated_at as number,
          ended: endedColumn ? (JSON.parse(endedColumn) as Ended) : null,
          vsComputer: row.vs_computer === 1,
          kind: ((row.kind as string | null) ?? (row.vs_computer === 1 ? "computer" : row.watchable === 1 ? "quick" : "link")) as "quick" | "link" | "computer",
          creator: (row.creator as string | null) ?? null,
          playerA: (row.player_a as string | null) ?? null,
          playerB: (row.player_b as string | null) ?? null,
          missedA: row.missed_a as number,
          missedB: row.missed_b as number,
          colours: parseColours(row.colours),
        });
      } catch (error) {
        logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    return saved;
  };

  return {
    createPlayer(id: string, nickname: string): void {
      insertPlayer.run(id, nickname, Date.now());
    },
    setPassword(id: string, passwordHash: string, options: { mustChange?: boolean; keepSession?: string } = {}): void {
      updatePassword.run(passwordHash, options.mustChange ? 1 : 0, id);
      if (options.keepSession) deleteSessionsExcept.run(id, options.keepSession);
      else deleteSessionsOf.run(id);
    },
    moveGames(from: string, to: string): void {
      db.exec("BEGIN");
      try {
        moveA.run(to, from);
        moveB.run(to, from);
        moveCreator.run(to, from);
        moveSessions.run(to, from);
        deletePlayerRow.run(from);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    setTutorialSeen(id: string, seen: boolean): void {
      updateTutorial.run(seen ? 1 : 0, id);
    },
    hasFinishedGame(id: string): boolean {
      return finishedGame.get(id, id) !== undefined;
    },
    setNickname(id: string, nickname: string): void {
      updateNickname.run(nickname, id);
    },
    upgradeToAccount(id: string, username: string, passwordHash: string): boolean {
      try {
        return Number(upgrade.run(username, passwordHash, id).changes) === 1;
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) return false;
        throw error;
      }
    },
    playerByUsername(username: string): PlayerRow | undefined {
      return toRow(selectByUsername.get(username));
    },
    createSession(tokenHash: string, playerId: string): void {
      insertSession.run(tokenHash, playerId, Date.now());
    },
    playerBySession(tokenHash: string, maxAgeMs: number): PlayerRow | undefined {
      return toRow(selectBySession.get(tokenHash, Date.now() - maxAgeMs));
    },
    deleteExpiredSessions(maxAgeMs: number): void {
      purgeSessions.run(Date.now() - maxAgeMs);
    },
    deleteSession(tokenHash: string): void {
      removeSession.run(tokenHash);
    },
    saveRound(code: string, state: GameState, missedA: boolean, missedB: boolean): void {
      saveRoundRow.run(JSON.stringify(state), Date.now(), missedA ? 1 : 0, missedB ? 1 : 0, code);
    },
    seatPlayer(code: string, seat: Player, playerId: string): void {
      (seat === "A" ? seatA : seatB).run(playerId, code);
    },
    playerById(id: string): PlayerRow | undefined {
      return toRow(selectById.get(id));
    },
    saveGame(code: string, state: GameState): void {
      upsert.run(code, JSON.stringify(state), Date.now());
    },
    saveEnded(code: string, ended: Ended): void {
      updateEnded.run(JSON.stringify(ended), code);
    },
    markComputer(code: string, state: GameState, colours: Colours = DEFAULT_COLOURS): void {
      markComputerRow.run(code, JSON.stringify(state), Date.now(), JSON.stringify(colours));
    },
    markWatchable(code: string, state: GameState, colours: Colours = DEFAULT_COLOURS): void {
      markWatchableRow.run(code, JSON.stringify(state), Date.now(), JSON.stringify(colours));
    },
    markLink(code: string, state: GameState, creator: string | null, colours: Colours = DEFAULT_COLOURS): void {
      markLinkRow.run(code, JSON.stringify(state), Date.now(), creator, JSON.stringify(colours));
    },
    archiveGame(code: string, fresh: GameState, colours?: Colours): string {
      let n = 1;
      while (codeTaken.get(`${code}#${n}`)) n++;
      const archive = `${code}#${n}`;
      db.exec("BEGIN");
      try {
        copyRow.run(archive, code);
        resetRow.run(JSON.stringify(fresh), Date.now(), colours ? JSON.stringify(colours) : null, code);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return archive;
    },
    setColours(code: string, colours: Colours): void {
      updateColours.run(JSON.stringify(colours), code);
    },
    loadGames(): SavedGame[] {
      return parseGames(selectAll.all());
    },
    loadGamesOf(playerId: string): SavedGame[] {
      return parseGames(selectOf.all(playerId, playerId));
    },
    close(): void {
      db.close();
    },
  };
}
