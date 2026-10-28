// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { MIGRATION_COUNT, openDb } from "../src/server/db.ts";
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

  it("S3 (R26) on restore, the open round's timer restarts at 10 seconds (R18)", () => {
    expect(ROUND_TIMER_MS).toBe(10_000);
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

  it("R48 opening a database created before the tutorial flag existed upgrades it in place", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration6.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 9`); // one per statement in MIGRATIONS: nine had run before the tutorial flag
      old.prepare("INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?)").run("p-old", "Old Timer", Date.now());
      old.close();

      const upgraded = openDb(path);
      // The tutorial flag was the tenth migration, applied once; the Earthquake migration (S4) is the 11th
      // and the shrinking board's (S5) the 12th and the walls' removal (S6) the 13th.
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
      // An existing player has not seen the tutorial, so it is due for them.
      expect(upgraded.playerById("p-old")?.tutorialSeen).toBe(false);
      upgraded.setTutorialSeen("p-old", true);
      expect(upgraded.playerById("p-old")?.tutorialSeen).toBe(true);
      upgraded.setTutorialSeen("p-old", false); // replay
      expect(upgraded.playerById("p-old")?.tutorialSeen).toBe(false);
      upgraded.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});

describe("R53 a game saved before Earthquake is upgraded", () => {
  it("S4 (R53) migration 11 gives a game saved without earthquakesLeft both Earthquakes, once, and leaves newer games alone", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration11.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 10`);
      const { earthquakesLeft: _dropped, ...legacy } = newGame();
      const spent = { ...newGame(), earthquakesLeft: { A: false, B: true } };
      const insert = old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)");
      insert.run("OLD11", JSON.stringify({ ...legacy, round: 3 }), Date.now());
      insert.run("NEW11", JSON.stringify(spent), Date.now());
      old.close();

      const upgraded = openDb(path);
      const games = Object.fromEntries(upgraded.loadGames().map((g) => [g.code, g.state]));
      expect(games.OLD11.earthquakesLeft).toEqual({ A: true, B: true });
      expect(games.OLD11.round).toBe(3);
      expect(games.NEW11.earthquakesLeft).toEqual({ A: false, B: true });
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});

describe("R69 a game saved before the shrinking board is upgraded", () => {
  const oldSchema = (path: string, version: number) => {
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
    old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
    old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
    old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
    old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
    old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
    old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
    old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
    old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
    old.exec(`PRAGMA user_version = ${version}`);
    return old;
  };
  const clean = (path: string) => {
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
  };

  it("S5 (R69) migration 12 gives a game saved without a number of rows the full 6 rows, once, and leaves newer games alone", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration12.db`);
    try {
      const old = oldSchema(path, 11);
      const { rows: _r, ...legacy } = newGame();
      const insert = old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)");
      insert.run("OLD12", JSON.stringify({ ...legacy, round: 14 }), Date.now());
      insert.run("NEW12", JSON.stringify({ ...newGame(), round: 13, rows: 5 }), Date.now());
      old.close();

      const upgraded = openDb(path);
      const games = Object.fromEntries(upgraded.loadGames().map((g) => [g.code, g.state]));
      expect(games.OLD12.rows).toBe(6);
      expect(games.OLD12.round).toBe(14);
      expect(games.NEW12.rows).toBe(5); // never overwritten
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
      const again = openDb(path); // opening again runs nothing a second time
      expect(again.loadGames().find((g) => g.code === "NEW12")?.state.rows).toBe(5);
      again.close();
    } finally {
      clean(path);
    }
  });

  it("S6 (ADR 0011) migration 13 removes the open-columns range that migration 12 had added, and keeps everything else", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration13.db`);
    try {
      const old = oldSchema(path, 12); // a database that already ran migration 12 and so carries firstColumn and lastColumn
      const withWalls = { ...newGame(), round: 13, rows: 4, firstColumn: 1, lastColumn: 5, board: [[], ["A", "B"], [], ["R"], [], [], []] };
      old.prepare("INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)").run("WALL13", JSON.stringify(withWalls), Date.now());
      old.close();

      const upgraded = openDb(path);
      const state = upgraded.loadGames().find((g) => g.code === "WALL13")!.state as unknown as Record<string, unknown>;
      expect("firstColumn" in state).toBe(false);
      expect("lastColumn" in state).toBe(false);
      expect(state.round).toBe(13);
      expect(state.rows).toBe(4);
      expect((state.board as string[][])[1]).toEqual(["A", "B"]);
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
    } finally {
      clean(path);
    }
  });
});

describe("R71 which games are watchable is saved", () => {
  it("S7 (R71) migration 14 adds the watchable mark, now read as a game's kind: an old unmarked game is a link game, a computer game is a computer game (never watched, R71) and a newer game keeps its mark", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration14.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 13`);
      const insert = old.prepare("INSERT INTO games (code, state, updated_at, vs_computer) VALUES (?, ?, ?, ?)");
      insert.run("OLDFRN", JSON.stringify(newGame()), Date.now(), 0); // a friend or quick game made before the change
      insert.run("OLDCMP", JSON.stringify(newGame()), Date.now(), 1); // a game against the computer
      old.close();

      const upgraded = openDb(path);
      const games = Object.fromEntries(upgraded.loadGames().map((g) => [g.code, g]));
      expect(games.OLDFRN.kind).toBe("link"); // never in Watch live: it errs on the side of privacy
      expect(games.OLDCMP.kind).toBe("computer"); // was watchable before 28 October 2026; R71 now says never
      upgraded.markWatchable("NEWQCK", newGame()); // an upsert: the row is created already marked
      upgraded.saveGame("NEWQCK", { ...newGame(), round: 3 }); // saving a round never clears the mark
      expect(upgraded.loadGames().find((g) => g.code === "NEWQCK")?.kind).toBe("quick");
      upgraded.saveGame("PLAIN1", newGame());
      expect(upgraded.loadGames().find((g) => g.code === "PLAIN1")?.kind).toBe("link"); // an unmarked game is a link game, never in Watch live
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
      const again = openDb(path);
      expect(again.loadGames().find((g) => g.code === "NEWQCK")?.kind).toBe("quick");
      again.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});

describe("R36 and R71 the kind of a game and its creator are saved", () => {
  it("S8 (R36, R71) migration 15, 16 and 17 give old games a kind from what is known, saves a link game's creator, and never changes a game that has one", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration15.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN watchable INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 14`);
      const insert = old.prepare("INSERT INTO games (code, state, updated_at, vs_computer, watchable) VALUES (?, ?, ?, ?, ?)");
      insert.run("OLDCMP", JSON.stringify(newGame()), Date.now(), 1, 0); // against the computer
      insert.run("OLDQCK", JSON.stringify(newGame()), Date.now(), 0, 1); // marked watchable: a quick match game
      insert.run("OLDLNK", JSON.stringify(newGame()), Date.now(), 0, 0); // neither: a link game
      old.close();

      const upgraded = openDb(path);
      const games = Object.fromEntries(upgraded.loadGames().map((g) => [g.code, g]));
      expect(games.OLDCMP.kind).toBe("computer");
      expect(games.OLDQCK.kind).toBe("quick");
      expect(games.OLDLNK.kind).toBe("link");
      expect(games.OLDLNK.creator).toBeNull();
      upgraded.markLink("NEWLNK", newGame(), "person-1");
      upgraded.saveGame("NEWLNK", { ...newGame(), round: 2 }); // saving a round never clears the kind or the creator
      const fresh = upgraded.loadGames().find((g) => g.code === "NEWLNK")!;
      expect(fresh.kind).toBe("link");
      expect(fresh.creator).toBe("person-1");
      upgraded.markWatchable("NEWQCK", newGame());
      expect(upgraded.loadGames().find((g) => g.code === "NEWQCK")?.kind).toBe("quick");
      upgraded.markLink("NEWLNK", newGame(), "someone-else"); // the first creator wins
      expect(upgraded.loadGames().find((g) => g.code === "NEWLNK")?.creator).toBe("person-1");
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
      const again = openDb(path);
      expect(again.loadGames().find((g) => g.code === "OLDQCK")?.kind).toBe("quick");
      again.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});

describe("R84 archiving a finished game for a rematch (no schema change: it uses the existing columns)", () => {
  it("S9 (R84) archiveGame copies the finished game under <code>#<n>, resets the code's row and keeps kind, creator and seats", () => {
    const db = openDb(":memory:");
    db.createPlayer("p1", "Alpha");
    db.createPlayer("p2", "Beta");
    db.markLink("ARC001", newGame(), "p1");
    db.seatPlayer("ARC001", "A", "p1");
    db.seatPlayer("ARC001", "B", "p2");
    db.saveRound("ARC001", { ...newGame(), round: 4, status: "won", winner: "A" }, false, true);
    expect(db.archiveGame("ARC001", newGame())).toBe("ARC001#1");
    expect(db.archiveGame("ARC001", newGame())).toBe("ARC001#2");
    const rows = Object.fromEntries(db.loadGames().map((g) => [g.code, g]));
    expect(rows["ARC001#1"].state.status).toBe("won");
    expect(rows["ARC001#1"].missedB).toBe(1);
    expect(rows["ARC001"].state.status).toBe("playing");
    expect(rows["ARC001"].state.round).toBe(0);
    expect(rows["ARC001"].missedB).toBe(0);
    for (const code of ["ARC001", "ARC001#1"]) {
      expect(rows[code].kind).toBe("link");
      expect(rows[code].creator).toBe("p1");
      expect(rows[code].playerA).toBe("p1");
      expect(rows[code].playerB).toBe("p2");
    }
  });

  it("S9 (R84) archived games are never resumed after a restart, and the fresh game under the code is", () => {
    const db = openDb(":memory:");
    db.markLink("ARC002", newGame(), "p1");
    db.saveRound("ARC002", { ...newGame(), round: 4, status: "won", winner: "A" }, false, false);
    db.archiveGame("ARC002", newGame());
    const service = createGameService({ db, broadcast: () => {} });
    expect(service.restore()).toEqual(["ARC002"]);
    expect(service.getGame("ARC002#1")).toBeUndefined();
    expect(service.getGame("ARC002")!.state.round).toBe(0);
  });
});

describe("R93 and R95 player colours are saved with the game", () => {
  it("S8 (R95) migrations 19 and 20 give a game saved before colours seat A red and seat B yellow, once, and keep newer colours", () => {
    expect(MIGRATION_COUNT, "the colours are migrations 19 and 20").toBe(20);
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration19.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN ended TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN vs_computer INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE games ADD COLUMN player_a TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN player_b TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_a INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN missed_b INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN watchable INTEGER NOT NULL DEFAULT 0`);
      old.exec(`ALTER TABLE games ADD COLUMN kind TEXT`);
      old.exec(`ALTER TABLE games ADD COLUMN creator TEXT`);
      old.exec(`ALTER TABLE players ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0`);
      old.exec(`PRAGMA user_version = 18`); // the schema as shipped before colours
      old.prepare("INSERT INTO games (code, state, updated_at, kind) VALUES (?, ?, ?, 'link')").run("OLDCOL", JSON.stringify({ ...newGame(), round: 5 }), Date.now());
      old.close();

      const upgraded = openDb(path);
      expect(upgraded.loadGames().find((g) => g.code === "OLDCOL")!.colours).toEqual({ A: "red", B: "yellow" });
      upgraded.markLink("NEWCOL", newGame(), null, { A: "yellow", B: "red" });
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(20);
      raw.close();
      const again = openDb(path); // opening again runs nothing a second time, so a newer game's colours are kept
      expect(again.loadGames().find((g) => g.code === "NEWCOL")!.colours).toEqual({ A: "yellow", B: "red" });
      expect(again.loadGames().find((g) => g.code === "OLDCOL")!.colours).toEqual({ A: "red", B: "yellow" });
      again.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});
