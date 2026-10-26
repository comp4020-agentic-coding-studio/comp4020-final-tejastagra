// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// One or more tests per engine rule from docs/rules.md, named by rule ID. See spec/CHECKS.md (R-tests).
import { describe, expect, it } from "vitest";
import { COLUMNS, ROWS, newGame } from "../src/engine/index.ts";

describe("R1 the board has 7 columns and 6 rows", () => {
  it("R1 a new game's board has COLUMNS columns, each starting empty", () => {
    const state = newGame();
    expect(COLUMNS).toBe(7);
    expect(ROWS).toBe(6);
    expect(state.board.length).toBe(COLUMNS);
    for (const column of state.board) {
      expect(column).toEqual([]);
    }
  });
});

describe("R2 a new game's starting state", () => {
  it("R2 has round 0, both shields available, status playing and no winner", () => {
    const state = newGame();
    expect(state.round).toBe(0);
    expect(state.shieldsLeft).toEqual({ A: true, B: true });
    expect(state.status).toBe("playing");
    expect(state.winner).toBeNull();
  });
});
