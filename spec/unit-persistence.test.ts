// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { openDb } from "../src/server/db.ts";
import { createGameService, ROUND_TIMER_MS } from "../src/server/game-service.ts";
import { newGame, resolveRound, type GameState } from "../src/engine/index.ts";

describe("S: what happens is kept (promise 5)", () => {
  it("S1 (R25) the game service writes a round result to the database before calling broadcast", async () => {
    const db = openDb(":memory:");
    const calls: string[] = [];
    // A resolved round is saved with saveRound (the board and the missed
    // counts in one statement); it must still land before the broadcast.
    const realSave = db.saveRound.bind(db);
    db.saveRound = (code, state, missedA, missedB) => {
      calls.push("save");
      realSave(code, state, missedA, missedB);
    };
    const service = createGameService({
      db,
      broadcast: () => {
        calls.push("broadcast");
      },
    });
    service.createGame("ABC123");
    calls.length = 0; // ignore the save from createGame itself

    await service.resolve("ABC123", { A: { column: 3, shield: false }, B: { column: 4, shield: false } });

    expect(calls).toEqual(["save", "broadcast"]);
    db.close();
  });

  it("S2 (R26) a game service started on an existing database restores every game in progress at its last saved round", () => {
    const db = openDb(":memory:");
    let state1: GameState = newGame();
    state1 = resolveRound(state1, { A: { column: 2, shield: false }, B: { column: 5, shield: false } }).state;
    state1 = resolveRound(state1, { A: { column: 2, shield: false }, B: { column: 5, shield: false } }).state;
    db.saveGame("GAME01", state1);

    let state2: GameState = newGame();
    state2 = resolveRound(state2, { A: { column: 0, shield: false }, B: { column: 6, shield: false } }).state;
    db.saveGame("GAME03", state2);

    const restarted = createGameService({ db, broadcast: () => {} });
    restarted.restore();

    const record1 = restarted.getGame("GAME01");
    expect(record1).toBeDefined();
    expect(record1!.state.round).toBe(2);
    expect(record1!.state).toEqual(state1);

    const record2 = restarted.getGame("GAME03");
    expect(record2).toBeDefined();
    expect(record2!.state.round).toBe(1);
    expect(record2!.state).toEqual(state2);
    db.close();
  });

  it("S2 (R26) a finished game is not restored as in progress", () => {
    const db = openDb(":memory:");
    let state: GameState = newGame();
    for (const column of [0, 1, 2, 3]) {
      state = resolveRound(state, { A: { column, shield: false }, B: null }).state;
    }
    expect(state.status).toBe("won");
    db.saveGame("DONE01", state);

    const restarted = createGameService({ db, broadcast: () => {} });
    restarted.restore();

    expect(restarted.getGame("DONE01")).toBeUndefined();
    db.close();
  });

  it("S3 (R26) on restore, the open round's timer restarts at 15 seconds", () => {
    const db = openDb(":memory:");
    db.saveGame("GAME02", newGame());

    let fakeNow = 1_000_000;
    const restarted = createGameService({ db, broadcast: () => {}, now: () => fakeNow });
    restarted.restore();

    expect(restarted.timeRemainingMs("GAME02")).toBe(ROUND_TIMER_MS);

    fakeNow += 5_000;
    expect(restarted.timeRemainingMs("GAME02")).toBe(ROUND_TIMER_MS - 5_000);
    db.close();
  });

  it("S3 timeRemainingMs never goes below zero once the timer has run out", () => {
    const db = openDb(":memory:");
    db.saveGame("GAME04", newGame());

    let fakeNow = 1_000_000;
    const restarted = createGameService({ db, broadcast: () => {}, now: () => fakeNow });
    restarted.restore();

    fakeNow += ROUND_TIMER_MS + 10_000;
    expect(restarted.timeRemainingMs("GAME04")).toBe(0);
    db.close();
  });

  it("S2 (R26) a row with unparseable state is skipped on load, so one corrupt game does not stop the rest restoring", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}.db`);
    try {
      const db = openDb(path);
      db.saveGame("GOOD01", newGame());
      db.close();

      // Write a corrupt row directly, bypassing saveGame's JSON.stringify.
      const raw = new DatabaseSync(path);
      raw.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)").run(
        "BAD01",
        "not valid json",
        Date.now(),
      );
      raw.close();

      const reopened = openDb(path);
      const loaded = reopened.loadGames();
      expect(loaded.map((g) => g.code)).toEqual(["GOOD01"]);
      reopened.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("S2 opening a database created before the 'ended' column existed upgrades it in place", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration.db`);
    try {
      // Build a database with exactly the schema that shipped before the
      // forfeit column was added, with no ended column and no user_version.
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE games (
          code TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)").run(
        "OLD01",
        JSON.stringify(newGame()),
        Date.now(),
      );
      old.close();

      const upgraded = openDb(path);
      const loaded = upgraded.loadGames();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].code).toBe("OLD01");
      expect(loaded[0].ended).toBeNull();

      // The upgraded schema actually has the column: saveEnded must work.
      upgraded.saveEnded("OLD01", { result: "forfeit", winner: "A" });
      const reloaded = upgraded.loadGames();
      expect(reloaded[0].ended).toEqual({ result: "forfeit", winner: "A" });
      upgraded.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("S2 opening the same database twice does not re-run a migration that already applied", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration2.db`);
    try {
      const first = openDb(path);
      first.saveGame("TWICE01", newGame());
      first.close();

      // Re-running ALTER TABLE ... ADD COLUMN on a column that already
      // exists would throw; opening the same (already migrated) file again
      // must not attempt it a second time.
      expect(() => {
        const second = openDb(path);
        second.close();
      }).not.toThrow();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("R37 opening a database created before the vs_computer column existed upgrades it in place", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration3.db`);
    try {
      // The schema as shipped after the 'ended' column: two migrations applied.
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`PRAGMA user_version = 2`);
      old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)").run("OLD02", JSON.stringify(newGame()), Date.now());
      old.close();

      const upgraded = openDb(path);
      const loaded = upgraded.loadGames();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].vsComputer).toBe(false); // existing games are human games
      upgraded.markComputer("OLD02", newGame());
      expect(upgraded.loadGames()[0].vsComputer).toBe(true);
      upgraded.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("R28 opening a database created before the players and sessions tables existed upgrades it in place", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration4.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 3`);
      old.close();

      const upgraded = openDb(path);
      upgraded.createPlayer("p1", "Tejas");
      upgraded.createSession("hash1", "p1");
      expect(upgraded.playerBySession("hash1", 60_000)?.nickname).toBe("Tejas");
      // An expired session is not honoured, and is purged.
      expect(upgraded.playerBySession("hash1", -1)).toBeUndefined();
      upgraded.deleteExpiredSessions(-1);
      expect(upgraded.playerBySession("hash1", 60_000)).toBeUndefined();
      upgraded.createSession("hash1", "p1");
      // R29: usernames are unique, ignoring case; the guest keeps their id.
      expect(upgraded.upgradeToAccount("p1", "TJ", "hashA")).toBe(true);
      upgraded.createPlayer("p2", "Other");
      expect(upgraded.upgradeToAccount("p2", "tj", "hashB")).toBe(false);
      expect(upgraded.playerByUsername("tj")?.id).toBe("p1");
      upgraded.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("R25 opening a database created before seats and missed rounds were recorded upgrades it in place", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration5.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`PRAGMA user_version = 5`);
      old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)").run("OLD03", JSON.stringify(newGame()), Date.now());
      old.close();

      const upgraded = openDb(path);
      const before = upgraded.loadGames()[0];
      expect(before.playerA).toBeNull();
      expect(before.missedA).toBe(0);
      upgraded.seatPlayer("OLD03", "A", "p1");
      upgraded.seatPlayer("OLD03", "A", "p9"); // the first identity wins
      upgraded.saveRound("OLD03", newGame(), true, false);
      upgraded.saveRound("OLD03", newGame(), true, false);
      const after = upgraded.loadGames()[0];
      expect(after.playerA).toBe("p1");
      expect([after.missedA, after.missedB]).toEqual([2, 0]);
      upgraded.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});
