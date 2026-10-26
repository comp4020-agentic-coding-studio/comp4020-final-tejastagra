// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// One or more tests per engine rule from docs/rules.md, named by rule ID. See spec/CHECKS.md (R-tests).
import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  ROWS,
  newGame,
  validateChoice,
  resolveRound,
  type GameState,
} from "../src/engine/index.ts";

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

describe("R5 different columns: both discs land", () => {
  it("R5 lands both players' discs in their own chosen columns", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 2, shield: false },
      B: { column: 4, shield: false },
    });
    expect(result.outcome).toBe("both_landed");
    expect(result.state.board[2]).toEqual(["A"]);
    expect(result.state.board[4]).toEqual(["B"]);
  });

  it("R5 throws if either choice fails validateChoice, per the engine contract", () => {
    const state = newGame();
    expect(() =>
      resolveRound(state, { A: { column: 9, shield: false }, B: { column: 4, shield: false } }),
    ).toThrow();
    expect(() =>
      resolveRound(state, { A: { column: 2, shield: false }, B: { column: 9, shield: false } }),
    ).toThrow();
  });
});

describe("R6 same column, no shields: a crash leaves one rubble block", () => {
  it("R6 crashes and lands exactly one rubble block, no discs", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 3, shield: false },
      B: { column: 3, shield: false },
    });
    expect(result.outcome).toBe("crash");
    expect(result.state.board[3]).toEqual(["R"]);
  });
});

describe("R7 same column, exactly one shield: the shielded disc lands", () => {
  it("R7 lands the shielded player's disc and loses the other, with no rubble", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 3, shield: true },
      B: { column: 3, shield: false },
    });
    expect(result.outcome).toBe("shield_win");
    expect(result.shieldWinner).toBe("A");
    expect(result.state.board[3]).toEqual(["A"]);
  });
});

describe("R8 using a shield spends it, win or not", () => {
  it("R8 spends the shield on a shield win", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 3, shield: true },
      B: { column: 3, shield: false },
    });
    expect(result.state.shieldsLeft.A).toBe(false);
    expect(result.state.shieldsLeft.B).toBe(true);
  });

  it("R8 spends a shield even when it lands cleanly in different columns", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 2, shield: true },
      B: { column: 4, shield: false },
    });
    expect(result.state.shieldsLeft.A).toBe(false);
  });
});

describe("R9 same column, both shields: both are spent and it crashes", () => {
  it("R9 crashes as in R6 and spends both shields", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 3, shield: true },
      B: { column: 3, shield: true },
    });
    expect(result.outcome).toBe("crash");
    expect(result.shieldWinner).toBeNull();
    expect(result.state.board[3]).toEqual(["R"]);
    expect(result.state.shieldsLeft).toEqual({ A: false, B: false });
  });
});

describe("R10 one or neither player chose", () => {
  it("R10 lands only the disc of the player who chose", () => {
    const state = newGame();
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.outcome).toBe("one_landed");
    expect(result.state.board[3]).toEqual(["A"]);
  });

  it("R10 leaves the board unchanged when neither player chose", () => {
    const state = newGame();
    const result = resolveRound(state, { A: null, B: null });
    expect(result.outcome).toBe("none");
    expect(result.state.board).toEqual(state.board);
  });
});

describe("R13 a player wins with four in a row", () => {
  it("R13 wins horizontally", () => {
    let state = newGame();
    for (const column of [0, 1, 2]) {
      state = resolveRound(state, { A: { column, shield: false }, B: null }).state;
    }
    // A now has one disc each in columns 0, 1 and 2 at row 0; drop a 4th.
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });

  it("R13 wins vertically", () => {
    let state = newGame();
    for (let i = 0; i < 3; i++) {
      state = resolveRound(state, { A: { column: 0, shield: false }, B: null }).state;
    }
    const result = resolveRound(state, { A: { column: 0, shield: false }, B: null });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });

  it("R13 wins diagonally", () => {
    // Build a rising diagonal for A at (0,0) (1,1) (2,2) (3,3), with B
    // filling underneath so A's discs land at the right heights.
    let state = newGame();
    state = resolveRound(state, { A: { column: 0, shield: false }, B: null }).state; // A col0 row0
    state = resolveRound(state, { A: null, B: { column: 1, shield: false } }).state; // B col1 row0
    state = resolveRound(state, { A: { column: 1, shield: false }, B: null }).state; // A col1 row1
    state = resolveRound(state, { A: null, B: { column: 2, shield: false } }).state; // B col2 row0
    state = resolveRound(state, { A: null, B: { column: 2, shield: false } }).state; // B col2 row1
    state = resolveRound(state, { A: { column: 2, shield: false }, B: null }).state; // A col2 row2
    state = resolveRound(state, { A: null, B: { column: 3, shield: false } }).state; // B col3 row0
    state = resolveRound(state, { A: null, B: { column: 3, shield: false } }).state; // B col3 row1
    state = resolveRound(state, { A: null, B: { column: 3, shield: false } }).state; // B col3 row2
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null }); // A col3 row3
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });

  it("R13 rubble and the opponent's discs break a line", () => {
    let state = newGame();
    // A at col0 row0, col1 row0, rubble at col2 row0 (crash), A at col3 row0.
    state = resolveRound(state, { A: { column: 0, shield: false }, B: null }).state;
    state = resolveRound(state, { A: { column: 1, shield: false }, B: null }).state;
    state = resolveRound(state, {
      A: { column: 2, shield: false },
      B: { column: 2, shield: false },
    }).state;
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.state.status).toBe("playing");
    expect(result.state.winner).toBeNull();
  });
});

describe("R13 to R7 player B is treated the same as player A", () => {
  it("R7 lands B's disc when only B used a shield", () => {
    const result = resolveRound(newGame(), {
      A: { column: 3, shield: false },
      B: { column: 3, shield: true },
    });
    expect(result.outcome).toBe("shield_win");
    expect(result.shieldWinner).toBe("B");
    expect(result.state.board[3]).toEqual(["B"]);
    expect(result.state.shieldsLeft).toEqual({ A: true, B: false });
  });

  it("R13 B wins with four in a row", () => {
    let state = newGame();
    for (const column of [0, 1, 2]) {
      state = resolveRound(state, { A: null, B: { column, shield: false } }).state;
    }
    const result = resolveRound(state, { A: null, B: { column: 3, shield: false } });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("B");
  });

  it("R13 wins on a falling diagonal", () => {
    // A at (3,0) (2,1) (1,2) (0,3), with B filling underneath.
    let state = newGame();
    const a = (column: number) => ({ A: { column, shield: false }, B: null });
    const b = (column: number) => ({ A: null, B: { column, shield: false } });
    for (const step of [a(3), b(2), a(2), b(1), b(1), a(1), b(0), b(0), b(0)]) {
      state = resolveRound(state, step).state;
    }
    const result = resolveRound(state, a(0));
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });

  it("R3 resolveRound throws for B's full column or spent shield even when A's choice is fine", () => {
    const full = newGame();
    full.board[0] = Array.from({ length: ROWS }, () => "R" as const);
    expect(() =>
      resolveRound(full, { A: { column: 2, shield: false }, B: { column: 0, shield: false } }),
    ).toThrow(/column_full/);
    const spent = newGame();
    spent.shieldsLeft.B = false;
    expect(() =>
      resolveRound(spent, { A: { column: 2, shield: false }, B: { column: 3, shield: true } }),
    ).toThrow(/no_shield/);
  });
});

describe("R14 both players completing a line in the same round is a draw", () => {
  it("R14 draws when both complete a line in the same round", () => {
    // A builds a horizontal three at columns 0,1,2 row 0; B builds a
    // vertical three in column 4. Both complete their fourth in one round,
    // in different columns so both discs land.
    let state = newGame();
    state = resolveRound(state, {
      A: { column: 0, shield: false },
      B: { column: 4, shield: false },
    }).state;
    state = resolveRound(state, {
      A: { column: 1, shield: false },
      B: { column: 4, shield: false },
    }).state;
    state = resolveRound(state, {
      A: { column: 2, shield: false },
      B: { column: 4, shield: false },
    }).state;
    const result = resolveRound(state, {
      A: { column: 3, shield: false },
      B: { column: 4, shield: false },
    });
    expect(result.state.status).toBe("draw");
    expect(result.state.winner).toBeNull();
  });
});

describe("R15 a full board with no line is a draw", () => {
  it("R15 draws when the board is full and nobody has a line", () => {
    // Fill every column to the top with alternating rubble (via crashes),
    // so nobody ever gets four in a row, until the board is full.
    let state = newGame();
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        state = resolveRound(state, {
          A: { column, shield: false },
          B: { column, shield: false },
        }).state;
      }
    }
    expect(state.board.every((column) => column.length === ROWS)).toBe(true);
    expect(state.status).toBe("draw");
    expect(state.winner).toBeNull();
  });
});

describe("R16 once a game is won or drawn, no further choices are accepted", () => {
  it("R16 rejects any choice with game_over once the game has a winner", () => {
    let state = newGame();
    for (const column of [0, 1, 2]) {
      state = resolveRound(state, { A: { column, shield: false }, B: null }).state;
    }
    state = resolveRound(state, { A: { column: 3, shield: false }, B: null }).state;
    expect(state.status).toBe("won");
    expect(validateChoice(state, "B", { column: 5, shield: false })).toEqual({
      ok: false,
      reason: "game_over",
    });
  });
});

describe("R17 rounds to win is the round count at the moment of the win", () => {
  it("R17 records the round count when the winning round resolves", () => {
    let state = newGame();
    for (const column of [0, 1, 2]) {
      state = resolveRound(state, { A: { column, shield: false }, B: null }).state;
    }
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.state.status).toBe("won");
    expect(result.state.round).toBe(4);
  });
});

describe("R11 every resolved round adds 1 to the round count", () => {
  it("R11 increases the round count even when nothing lands", () => {
    const state = newGame();
    const result = resolveRound(state, { A: null, B: null });
    expect(result.state.round).toBe(1);
  });

  it("R11 increases the round count by exactly 1 when both discs land", () => {
    const state = newGame();
    const result = resolveRound(state, {
      A: { column: 2, shield: false },
      B: { column: 4, shield: false },
    });
    expect(result.state.round).toBe(1);
  });
});

describe("R12 pieces already on the board never move or change", () => {
  it("R12 does not mutate the input state, only returns a new one", () => {
    const state = newGame();
    const before = JSON.parse(JSON.stringify(state.board));
    resolveRound(state, { A: { column: 2, shield: false }, B: { column: 4, shield: false } });
    expect(state.board).toEqual(before);
  });

  it("R12 keeps earlier pieces in place across rounds", () => {
    let state = newGame();
    state = resolveRound(state, {
      A: { column: 2, shield: false },
      B: { column: 4, shield: false },
    }).state;
    const afterFirst = JSON.parse(JSON.stringify(state.board));
    state = resolveRound(state, {
      A: { column: 5, shield: false },
      B: { column: 6, shield: false },
    }).state;
    expect(state.board[2]).toEqual(afterFirst[2]);
    expect(state.board[4]).toEqual(afterFirst[4]);
  });
});
