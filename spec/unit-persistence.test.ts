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
    const realSave = db.saveGame.bind(db);
    db.saveGame = (code, state) => {
      calls.push("save");
      realSave(code, state);
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
});
