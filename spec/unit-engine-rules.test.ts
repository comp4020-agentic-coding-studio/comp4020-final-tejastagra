// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// One or more tests per engine rule from docs/rules.md, named by rule ID. See spec/CHECKS.md (R-tests).
import { describe, expect, it } from "vitest";
import { COLUMNS, ROWS, newGame, validateChoice, type GameState } from "../src/engine/index.ts";

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

describe("R3 a choice is rejected for the right reason, checked in order", () => {
  it("R3 accepts a choice on an empty column with no shield used", () => {
    const state = newGame();
    expect(validateChoice(state, "A", { column: 3, shield: false })).toEqual({ ok: true });
  });

  it("R3 rejects with game_over when the game is over, even if the column is also bad", () => {
    const state: GameState = { ...newGame(), status: "won", winner: "A" };
    expect(validateChoice(state, "B", { column: 99, shield: false })).toEqual({
      ok: false,
      reason: "game_over",
    });
  });

  it("R3 rejects with bad_column when the column is not a whole number from 0 to 6", () => {
    const state = newGame();
    expect(validateChoice(state, "A", { column: -1, shield: false })).toEqual({
      ok: false,
      reason: "bad_column",
    });
    expect(validateChoice(state, "A", { column: 7, shield: false })).toEqual({
      ok: false,
      reason: "bad_column",
    });
    expect(validateChoice(state, "A", { column: 2.5, shield: false })).toEqual({
      ok: false,
      reason: "bad_column",
    });
  });

  it("R3 rejects with column_full when the column already holds ROWS pieces, before checking the shield", () => {
    const state = newGame();
    state.board[0] = Array.from({ length: ROWS }, () => "A" as const);
    state.shieldsLeft.A = false;
    expect(validateChoice(state, "A", { column: 0, shield: true })).toEqual({
      ok: false,
      reason: "column_full",
    });
  });

  it("R3 rejects with no_shield when the shield flag is set but that player's shield is already used", () => {
    const state = newGame();
    state.shieldsLeft.A = false;
    expect(validateChoice(state, "A", { column: 3, shield: true })).toEqual({
      ok: false,
      reason: "no_shield",
    });
  });
});
