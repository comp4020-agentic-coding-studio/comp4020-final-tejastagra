import { describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newGame, resolveRound, type GameState } from "../src/engine/index.ts";
import { openDb } from "../src/server/db.ts";
import { leaderboardFrom, tally, topRounds, topWins, type FinishedGame } from "../src/server/leaderboard.ts";

const base: FinishedGame = {
  playerA: "p1",
  playerB: "p2",
  vsComputer: false,
  status: "won",
  winner: "A",
  round: 7,
  ended: null,
  missedA: 0,
  missedB: 0,
};
const game = (over: Partial<FinishedGame>): FinishedGame => ({ ...base, ...over });

describe("B: leaderboard rules", () => {
  it("B1 (R37) a win against the computer changes neither list", () => {
    const t = tally([game({ vsComputer: true })]);
    expect(t.size).toBe(0);
  });

  it("B2 (R38) a win against a person adds one to most wins", () => {
    const t = tally([game({}), game({ round: 9 })]);
    expect(t.get("p1")?.wins).toBe(2);
    expect(t.get("p2")).toBeUndefined();
  });

  it("B2 (R38) a forfeit counts as a win for the player who stayed", () => {
    const t = tally([game({ status: "playing", winner: null, ended: { result: "forfeit", winner: "B" } })]);
    expect(t.get("p2")?.wins).toBe(1);
    expect(t.get("p1")).toBeUndefined();
  });

  it("B3 (R39) a win where the opponent missed a round does not count for fewest rounds", () => {
    const t = tally([game({ missedB: 1 })]);
    expect(t.get("p1")?.wins).toBe(1); // still a win for R38
    expect(t.get("p1")?.bestRounds).toBeNull();
  });

  it("B3 (R39) a forfeit never counts for fewest rounds, only a four in a row", () => {
    const t = tally([game({ status: "playing", winner: null, round: 2, ended: { result: "forfeit", winner: "A" } })]);
    expect(t.get("p1")?.bestRounds).toBeNull();
  });

  it("B3 (R39) the opponent's missed rounds are what matter, not the winner's own", () => {
    const t = tally([game({ missedA: 3 })]);
    expect(t.get("p1")?.bestRounds).toBe(7);
  });

  it("B4 (R19) an abandoned game changes neither list", () => {
    expect(tally([game({ status: "playing", winner: null, ended: { result: "abandoned" } })]).size).toBe(0);
  });

  it("B4 (R19) a draw and an unfinished game change neither list", () => {
    expect(tally([game({ status: "draw", winner: null }), game({ status: "playing", winner: null })]).size).toBe(0);
  });

  it("B5 (R17) fewest rounds records the round count at the win, keeping each player's best", () => {
    const t = tally([game({ round: 12 }), game({ round: 5 }), game({ round: 9 })]);
    expect(t.get("p1")?.bestRounds).toBe(5);
  });

  it("R38 a seat with no identity, or one person in both seats, is never counted", () => {
    expect(tally([game({ playerA: null })]).size).toBe(0);
    expect(tally([game({ playerB: null })]).size).toBe(0);
    expect(tally([game({ playerB: "p1" })]).size).toBe(0);
  });

  it("B2 and B5 the two lists order by wins (most first) and rounds (fewest first)", () => {
    const t = tally([
      game({ playerA: "p1", playerB: "p2", round: 8 }),
      game({ playerA: "p1", playerB: "p2", round: 8 }),
      game({ playerA: "p3", playerB: "p2", round: 4 }),
    ]);
    const names = (id: string) => id.toUpperCase();
    expect(topWins(t, names, 10)).toEqual([{ name: "P1", value: 2 }, { name: "P3", value: 1 }]);
    expect(topRounds(t, names, 10)).toEqual([{ name: "P3", value: 4 }, { name: "P1", value: 8 }]);
    expect(topWins(t, names, 1)).toHaveLength(1);
  });
});

// A's four discs in column 0 against B's in columns 1 and 2: A wins in round 4.
function aWins(): GameState {
  let state = newGame();
  for (let i = 0; i < 4; i++) {
    state = resolveRound(state, { A: { column: 0, shield: false }, B: { column: 1 + (i % 2), shield: false } }).state;
  }
  return state;
}

const ANN = "a7f3c1d2-1111-4222-8333-444455556666";
const BOB = "b8e4d2c3-1111-4222-8333-444455556666";

describe("B1 (R37) and B2 (R38) the leaderboard read from saved games", () => {
  function seed(db: ReturnType<typeof openDb>) {
    db.createPlayer(ANN, "Ann");
    db.createPlayer(BOB, "Bob");
    // A human game: p1 beats p2.
    db.saveGame("HUMAN1", newGame());
    db.seatPlayer("HUMAN1", "A", ANN);
    db.seatPlayer("HUMAN1", "B", BOB);
    db.saveRound("HUMAN1", aWins(), false, false);
    // The same finished game against the computer: must not count.
    db.markComputer("COMP01", newGame());
    db.seatPlayer("COMP01", "A", ANN); // even if a person were recorded in it
    db.saveRound("COMP01", aWins(), false, false);
  }

  it("B1 (R37) a won game against the computer changes neither list, while the same human game counts", () => {
    const db = openDb(":memory:");
    seed(db);
    const lists = leaderboardFrom(db, 10);
    expect(lists.wins).toEqual([{ name: expect.stringMatching(/^Ann #[0-9a-f]{4}$/), value: 1 }]); // one win, not two
    expect(lists.rounds).toEqual([{ name: expect.stringMatching(/^Ann #/), value: 4 }]);
    db.close();
  });

  it("B2 (R38) the lists are the same after the database is closed and reopened", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-board.db`);
    try {
      const first = openDb(path);
      seed(first);
      const before = leaderboardFrom(first, 10);
      first.close();
      const second = openDb(path);
      expect(leaderboardFrom(second, 10)).toEqual(before);
      expect(before.wins).toHaveLength(1);
      second.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it("R31 the public name carries a short tag only, never the full id", () => {
    const db = openDb(":memory:");
    seed(db);
    const text = JSON.stringify(leaderboardFrom(db, 10));
    expect(text).not.toContain(ANN);
    expect(text).not.toContain(ANN.slice(0, 8));
    db.close();
  });
});

describe("R92 the asking player's own line", () => {
  const rows = (...games: Array<Partial<FinishedGame>>) => games.map((g) => game(g));

  it("R92 you are null for a visitor with no player", async () => {
    const { viewerRecord } = await import("../src/server/leaderboard.ts");
    expect(viewerRecord(tally(rows({})), null, () => "Nobody #0000")).toBeNull();
  });

  it("R92 you carry the asking player's name, wins and fewest rounds, and nothing else", async () => {
    const { viewerRecord } = await import("../src/server/leaderboard.ts");
    const t = tally(rows({ round: 9 }, { round: 5 }, { missedB: 1, round: 3 })); // p1 won three, fastest clean win in 5
    const mine = viewerRecord(t, "p1", () => "Pip #a7f3");
    expect(mine).toEqual({ name: "Pip #a7f3", wins: 3, bestRounds: 5 });
    expect(Object.keys(mine!).sort()).toEqual(["bestRounds", "name", "wins"]); // no id
  });

  it("R92 a player with no wins is shown with 0 wins and no best, not left out", async () => {
    const { viewerRecord } = await import("../src/server/leaderboard.ts");
    expect(viewerRecord(tally(rows({})), "p2", () => "Sam #b2c1")).toEqual({ name: "Sam #b2c1", wins: 0, bestRounds: null });
  });

  it("R92 and R37 wins against the computer never appear in your record", async () => {
    const { viewerRecord } = await import("../src/server/leaderboard.ts");
    expect(viewerRecord(tally(rows({ vsComputer: true })), "p1", () => "Pip #a7f3")).toEqual({ name: "Pip #a7f3", wins: 0, bestRounds: null });
  });
});
