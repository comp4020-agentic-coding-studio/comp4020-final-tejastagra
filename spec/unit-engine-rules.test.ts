// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// One or more tests per engine rule from docs/rules.md, named by rule ID. See spec/CHECKS.md (R-tests).
import { describe, expect, it } from "vitest";
import {
  CEILING_EVERY,
  CEILING_FIRST_ROUND,
  COLUMNS,
  MIN_ROWS,
  ROWS,
  ceilingDue,
  newGame,
  rowsAt,
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

describe("R7 and R13 player B is treated the same as player A", () => {
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

describe("cases found by comparing with the reference tests", () => {
  const a = (column: number, shield = false) => ({ A: { column, shield }, B: null });
  const b = (column: number) => ({ A: null, B: { column, shield: false } });
  const threeInARow = () => {
    let state = newGame();
    for (const column of [0, 1, 2]) state = resolveRound(state, a(column)).state;
    return state;
  };

  it("R6 rubble lands on top of what is already in the column", () => {
    let state = resolveRound(newGame(), a(3)).state;
    state = resolveRound(state, {
      A: { column: 3, shield: false },
      B: { column: 3, shield: false },
    }).state;
    expect(state.board[3]).toEqual(["A", "R"]);
  });

  it("R12 the same input always gives the same result", () => {
    const state = threeInARow();
    const choices = { A: { column: 3, shield: true }, B: { column: 3, shield: false } };
    expect(resolveRound(state, choices)).toEqual(resolveRound(state, choices));
  });

  it("R13 a crash in the winning column blocks the win", () => {
    const result = resolveRound(threeInARow(), {
      A: { column: 3, shield: false },
      B: { column: 3, shield: false },
    });
    expect(result.outcome).toBe("crash");
    expect(result.state.status).toBe("playing");
    expect(result.state.board[3]).toEqual(["R"]);
  });

  it("R7 and R13 a shield pushes a winning disc through a crash", () => {
    const result = resolveRound(threeInARow(), {
      A: { column: 3, shield: true },
      B: { column: 3, shield: false },
    });
    expect(result.outcome).toBe("shield_win");
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });

  it("R13 an opponent's disc breaks a line", () => {
    let state = resolveRound(newGame(), a(0)).state;
    state = resolveRound(state, a(1)).state;
    state = resolveRound(state, b(2)).state;
    const result = resolveRound(state, a(3));
    expect(result.state.status).toBe("playing");
    expect(result.state.winner).toBeNull();
  });

  it("R15 a crash can fill the last space in a column", () => {
    // Hand-built at round 0, so the ceiling (R61) has not dropped: five pieces, then a crash fills the sixth.
    const state = newGame();
    state.board[3] = ["A", "B", "A", "B", "A"];
    const result = resolveRound(state, {
      A: { column: 3, shield: false },
      B: { column: 3, shield: false },
    });
    expect(result.state.board[3].length).toBe(ROWS);
    expect(result.state.board[3][ROWS - 1]).toBe("R");
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

describe("R15 a full open area with no line is a draw", () => {
  it("R15 draws when the open area is full and nobody has a line", () => {
    // Crash in the first column that has room, bottom to top, until the game ends. Rubble breaks every
    // line, so nobody wins. The board shrinks as rounds pass (R61), so the game ends when the open area
    // as it then stands is full (R66), not at 7 by 6.
    let state = newGame();
    let guard = 0;
    while (state.status === "playing" && guard++ < 200) {
      const column = [...Array(COLUMNS).keys()].find((c) => state.board[c].length < state.rows)!;
      state = resolveRound(state, { A: { column, shield: false }, B: { column, shield: false } }).state;
    }
    expect(state.status).toBe("draw");
    expect(state.winner).toBeNull();
    for (let c = 0; c < COLUMNS; c++) expect(state.board[c].length).toBe(state.rows);
  });

  it("R15 draws on a full 7 by 6 board too, when the last space is filled before anything closes", () => {
    // No four in a row anywhere: the rows alternate in pairs (AABBAAB, then BBAABBA, and so on).
    const rows = ["AABBAAB", "BBAABBA", "AABBAAB", "BBAABBA", "AABBAAB", "BBAABBA"];
    const state = newGame();
    for (let c = 0; c < COLUMNS; c++) state.board[c] = rows.map((row) => row[c]) as GameState["board"][number];
    const top = state.board[3].pop()!; // leave exactly one space, in column 3
    const result = resolveRound(state, { A: top === "A" ? { column: 3, shield: false } : null, B: top === "B" ? { column: 3, shield: false } : null });
    expect(result.state.board[3].length).toBe(ROWS);
    expect(result.state.status).toBe("draw");
    expect(result.state.winner).toBeNull();
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

  it("R16 resolveRound throws rather than resolve a round once the game is over, even with no choices", () => {
    let state = newGame();
    for (const column of [0, 1, 2]) {
      state = resolveRound(state, { A: { column, shield: false }, B: null }).state;
    }
    state = resolveRound(state, { A: { column: 3, shield: false }, B: null }).state;
    expect(state.status).toBe("won");
    expect(() => resolveRound(state, { A: null, B: null })).toThrow();
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

// ---- Earthquake (ADR 0010, R53 to R60) ----

// A game with the given columns filled from the bottom, for example { 0: "ABR" }.
function withBoard(columns: Record<number, string>): GameState {
  const state = newGame();
  for (const [column, pieces] of Object.entries(columns)) state.board[Number(column)] = pieces.split("") as GameState["board"][number];
  return state;
}
const quake = { earthquake: true } as const;
const disc = (column: number, shield = false) => ({ column, shield });

describe("R2 a new game has both Earthquakes", () => {
  it("R2 starts with both Earthquakes available", () => {
    expect(newGame().earthquakesLeft).toEqual({ A: true, B: true });
  });
});

describe("R55 Earthquake cannot be chosen when the bottom row is empty", () => {
  it("R55 rejects with nothing_to_shake on an empty board", () => {
    expect(validateChoice(newGame(), "A", quake)).toEqual({ ok: false, reason: "nothing_to_shake" });
  });

  it("R55 accepts it as soon as one piece is on the board, even rubble", () => {
    expect(validateChoice(withBoard({ 3: "R" }), "B", quake)).toEqual({ ok: true });
  });

  it("R55 resolveRound throws for an Earthquake on an empty board", () => {
    expect(() => resolveRound(newGame(), { A: quake, B: null })).toThrow();
  });
});

describe("R53 one Earthquake per player, and one power-up per round", () => {
  it("R53 rejects with no_earthquake once that player's Earthquake is spent", () => {
    const state = withBoard({ 0: "A" });
    state.earthquakesLeft.A = false;
    expect(validateChoice(state, "A", quake)).toEqual({ ok: false, reason: "no_earthquake" });
    expect(validateChoice(state, "B", quake)).toEqual({ ok: true });
  });

  it("R53 the shield and Earthquake cannot be combined: a shield flag on an Earthquake is one_power_up", () => {
    const state = withBoard({ 0: "A" });
    const both = { earthquake: true, shield: true } as unknown as Parameters<typeof validateChoice>[2];
    expect(validateChoice(state, "A", both)).toEqual({ ok: false, reason: "one_power_up" });
    expect(() => resolveRound(state, { A: both, B: null })).toThrow();
  });

  it("R53 a column on an Earthquake is one_power_up too", () => {
    const state = withBoard({ 0: "A" });
    const both = { earthquake: true, column: 2 } as unknown as Parameters<typeof validateChoice>[2];
    expect(validateChoice(state, "A", both)).toEqual({ ok: false, reason: "one_power_up" });
  });

  it("R53 rejection order: game_over, then one_power_up, then no_earthquake, then nothing_to_shake", () => {
    const over: GameState = { ...newGame(), status: "won", winner: "A" };
    over.earthquakesLeft.A = false;
    expect(validateChoice(over, "A", quake)).toEqual({ ok: false, reason: "game_over" });
    const empty = newGame();
    empty.earthquakesLeft.A = false;
    expect(validateChoice(empty, "A", quake)).toEqual({ ok: false, reason: "no_earthquake" });
    const both = { earthquake: true, shield: true } as unknown as Parameters<typeof validateChoice>[2];
    expect(validateChoice(empty, "A", both)).toEqual({ ok: false, reason: "one_power_up" });
  });

  it("R53 Earthquake is spent after use, for the player who used it only", () => {
    const result = resolveRound(withBoard({ 0: "A" }), { A: quake, B: null });
    expect(result.state.earthquakesLeft).toEqual({ A: false, B: true });
    expect(validateChoice(result.state, "A", quake)).toEqual({ ok: false, reason: "no_earthquake" });
  });
});

describe("R54 only an explicit earthquake: true is an Earthquake", () => {
  it("R54 a choice with earthquake: false is a column choice, checked as one", () => {
    const state = withBoard({ 0: "ABABAB" });
    const notQuake = { column: 0, shield: false, earthquake: false } as unknown as Parameters<typeof validateChoice>[2];
    expect(validateChoice(state, "A", notQuake)).toEqual({ ok: false, reason: "column_full" });
    expect(validateChoice(newGame(), "A", { column: 1, shield: false, earthquake: false } as unknown as Parameters<typeof validateChoice>[2])).toEqual({ ok: true });
  });
});

describe("R56 the earthquake removes the bottom row and shifts each column down one", () => {
  it("R56 removes exactly the bottom row, discs and rubble alike, and keeps the order above", () => {
    const state = withBoard({ 0: "ABA", 1: "R", 2: "BRA", 4: "AB" });
    const result = resolveRound(state, { A: quake, B: null });
    expect(result.outcome).toBe("earthquake");
    expect(result.shaken).toBe(true);
    expect(result.state.board).toEqual([["B", "A"], [], ["R", "A"], [], ["B"], [], []]);
  });

  it("R56 the other player's disc drops after the earthquake, onto the new board", () => {
    const state = withBoard({ 3: "AB" });
    const result = resolveRound(state, { A: null, B: quake });
    expect(result.state.board[3]).toEqual(["B"]);
    const both = resolveRound(withBoard({ 3: "AB" }), { A: disc(3), B: quake });
    expect(both.outcome).toBe("earthquake");
    expect(both.state.board[3]).toEqual(["B", "A"]); // A's disc landed on the shifted column, not under it
    const other = resolveRound(withBoard({ 3: "AB" }), { A: quake, B: disc(0) });
    expect(other.state.board[0]).toEqual(["B"]);
    expect(other.state.board[3]).toEqual(["B"]);
  });

  it("R56 a disc dropped in the same column as the earthquake lands on top of what is left", () => {
    const state = withBoard({ 2: "R" });
    const result = resolveRound(state, { A: quake, B: disc(2) });
    expect(result.state.board[2]).toEqual(["B"]); // the rubble went, then the disc landed on an empty column
  });

  it("R56 a full column can still be chosen as before the round: fullness is checked before the earthquake (R3)", () => {
    const state = withBoard({ 0: "ABABAB" });
    expect(validateChoice(state, "B", disc(0))).toEqual({ ok: false, reason: "column_full" });
    expect(() => resolveRound(state, { A: quake, B: disc(0) })).toThrow();
  });

  it("R56 does not change its input", () => {
    const state = withBoard({ 0: "AB" });
    const snapshot = JSON.parse(JSON.stringify(state));
    resolveRound(state, { A: quake, B: disc(1) });
    expect(state).toEqual(snapshot);
  });

  it("R56 counts as a resolved round (R11) and the earthquake outcome is not a crash", () => {
    const result = resolveRound(withBoard({ 0: "A" }), { A: quake, B: disc(0) });
    expect(result.state.round).toBe(1);
    expect(result.outcome).toBe("earthquake");
    expect(result.shieldWinner).toBeNull();
    expect(result.state.board[0]).toEqual(["B"]); // no rubble: it was not a crash
  });
});

describe("R57 both players choosing Earthquake: one row goes, no discs drop", () => {
  it("R57 shakes once, spends both Earthquakes and drops nothing", () => {
    const state = withBoard({ 0: "AB", 1: "B", 5: "RA" });
    const result = resolveRound(state, { A: quake, B: quake });
    expect(result.outcome).toBe("earthquake");
    expect(result.state.board).toEqual([["B"], [], [], [], [], ["A"], []]);
    expect(result.state.earthquakesLeft).toEqual({ A: false, B: false });
  });
});

describe("R58 the shield has no effect on Earthquake", () => {
  it("R58 the other player's shield on their own column is spent and has no crash to win", () => {
    const state = withBoard({ 2: "A" });
    const result = resolveRound(state, { A: quake, B: disc(2, true) });
    expect(result.state.shieldsLeft).toEqual({ A: true, B: false });
    expect(result.shieldWinner).toBeNull();
    expect(result.state.board[2]).toEqual(["B"]);
  });
});

describe("R13 only a disc dropped this round can win", () => {
  it("R13 a line formed only by the earthquake does not win", () => {
    // Row 1 holds A A A A with a piece under each; the earthquake drops them all into the bottom row.
    const state = withBoard({ 0: "RA", 1: "RA", 2: "RA", 3: "RA" });
    const result = resolveRound(state, { A: null, B: quake });
    expect(result.state.board.slice(0, 4).map((c) => c[0])).toEqual(["A", "A", "A", "A"]);
    expect(result.state.status).toBe("playing");
    expect(result.state.winner).toBeNull();
  });

  it("R13 a line formed only by the earthquake does not win even for the player who shook", () => {
    const state = withBoard({ 0: "RB", 1: "RB", 2: "RB", 3: "RB" });
    const result = resolveRound(state, { A: null, B: quake });
    expect(result.state.status).toBe("playing");
  });

  it("R13 a disc dropped after the earthquake that completes a line wins", () => {
    const state = withBoard({ 0: "RA", 1: "RA", 2: "RA" });
    const result = resolveRound(state, { A: disc(3), B: quake });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
    expect(result.state.board[3]).toEqual(["A"]);
  });

  it("R13 a disc dropped by the other player after the earthquake can win for them", () => {
    const state = withBoard({ 0: "RB", 1: "RB", 2: "RB" });
    const result = resolveRound(state, { A: quake, B: disc(3) });
    expect(result.state.winner).toBe("B");
    expect(result.state.round).toBe(1);
  });

  it("R13 a line made only by the earthquake is ignored while the other player's dropped disc wins", () => {
    const state = withBoard({ 0: "RA", 1: "RA", 2: "RA", 3: "RA", 5: "RBBB" });
    const result = resolveRound(state, { A: quake, B: disc(5) });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("B");
  });

  it("R13 a disc in the middle of a line completes it: the dropped disc need not be at the end", () => {
    const state = withBoard({ 0: "A", 1: "A", 3: "A" });
    const result = resolveRound(state, { A: disc(2), B: disc(6) });
    expect(result.state.winner).toBe("A");
  });

  it("R13 a vertical line is completed by a dropped disc", () => {
    expect(resolveRound(withBoard({ 0: "AAA" }), { A: disc(0), B: disc(6) }).state.winner).toBe("A");
  });

  it("R13 a rising diagonal is completed by a dropped disc", () => {
    const state = withBoard({ 0: "A", 1: "BA", 2: "BBA", 3: "BBB" });
    expect(resolveRound(state, { A: disc(3), B: disc(6) }).state.winner).toBe("A");
  });

  it("R13 a falling diagonal is completed by a dropped disc", () => {
    const state = withBoard({ 0: "BBBA", 1: "BBA", 2: "BA" });
    expect(resolveRound(state, { A: disc(3), B: disc(6) }).state.winner).toBe("A");
  });

  it("R13 an existing line that no disc this round is part of does not win", () => {
    const state = withBoard({ 0: "A", 1: "A", 2: "A", 3: "A" });
    const result = resolveRound(state, { A: disc(6), B: disc(5) });
    expect(result.state.status).toBe("playing");
  });
});

describe("R14 both players' dropped discs complete a line: a draw", () => {
  it("R14 is a draw when each player's disc dropped this round completes their own line", () => {
    const state = withBoard({ 0: "AAA", 1: "BBB" });
    const result = resolveRound(state, { A: disc(0), B: disc(1) });
    expect(result.state.status).toBe("draw");
    expect(result.state.winner).toBeNull();
  });

  it("R14 is not a draw when one player's line was only formed by the earthquake: the other player wins", () => {
    const state = withBoard({ 0: "RA", 1: "RA", 2: "RA", 3: "RA", 5: "RBBB" });
    const result = resolveRound(state, { A: quake, B: disc(5) });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("B");
  });
});

describe("R59 Earthquake never affects the round count", () => {
  it("R17 and R59 rounds to win still counts rounds, earthquake rounds included", () => {
    let state = withBoard({ 0: "RA", 1: "RA", 2: "RA" });
    state = resolveRound(state, { A: null, B: quake }).state;
    expect(state.round).toBe(1);
    const final = resolveRound(state, { A: disc(3), B: disc(6) });
    expect(final.state.winner).toBe("A");
    expect(final.state.round).toBe(2);
  });
});

// ---- The shrinking board (ADR 0011, R61 to R69): one ceiling, no walls ----

// Plays `rounds` rounds in which nobody chooses (R10), so only the schedule changes the board.
function quietRounds(state: GameState, rounds: number): GameState {
  for (let i = 0; i < rounds; i++) state = resolveRound(state, { A: null, B: null }).state;
  return state;
}

describe("R61 the schedule is named constants", () => {
  it("R61 the constants are the ones in docs/rules.md", () => {
    expect([CEILING_FIRST_ROUND, CEILING_EVERY, MIN_ROWS]).toEqual([12, 8, 4]);
  });
});

describe("R61 the ceiling drops after round 12 and every 8 rounds after that, never below 4 rows", () => {
  it("R2 and R61 a new game has all 6 rows open, and all 7 columns", () => {
    const state = newGame();
    expect(state.rows).toBe(6);
    expect(state.board.length).toBe(COLUMNS);
    expect("firstColumn" in state || "lastColumn" in state).toBe(false); // the walls are gone (ADR 0011)
  });

  it("R61 the ceiling drops exactly after rounds 12 and 20, and not after any round in between", () => {
    const rowsAfter = (round: number) => quietRounds(newGame(), round).rows;
    expect([6, 11, 12, 13, 19, 20, 21, 27, 28, 29, 60].map(rowsAfter)).toEqual([6, 6, 5, 5, 5, 4, 4, 4, 4, 4, 4]);
  });

  it("R61 round 28 is on the schedule but changes nothing, because the board is already at 4 rows", () => {
    expect(quietRounds(newGame(), 27).rows).toBe(4);
    const result = resolveRound(quietRounds(newGame(), 27), { A: null, B: null });
    expect(result.state.round).toBe(28);
    expect(result.state.rows).toBe(4);
    expect(result.ceilingDropped).toBe(false);
  });

  it("R61 the ceiling stops at 4 rows, however long the game runs", () => {
    expect(quietRounds(newGame(), 100).rows).toBe(4);
    expect(rowsAt(10_000)).toBe(4);
  });

  it("R61 the round that resolves a drop reports ceilingDropped, and only that round", () => {
    const flags = [];
    let state = newGame();
    for (let round = 1; round <= 30; round++) {
      const result = resolveRound(state, { A: null, B: null });
      flags.push(result.ceilingDropped);
      state = result.state;
    }
    const dropped = flags.map((flag, index) => (flag ? index + 1 : 0)).filter(Boolean);
    expect(dropped).toEqual([12, 20]);
  });

  it("R61 the top row closes and any piece in it crumbles away, and the rest stays where it is", () => {
    const quiet = { ...withBoard({ 0: "ABABAB", 1: "AB", 2: "BABAB", 4: "A" }), round: 11 };
    const result = resolveRound(quiet, { A: null, B: null });
    expect(result.state.rows).toBe(5);
    expect(result.state.board[0]).toEqual(["A", "B", "A", "B", "A"]); // the sixth piece crumbled
    expect(result.state.board[1]).toEqual(["A", "B"]);
    expect(result.state.board[2]).toEqual(["B", "A", "B", "A", "B"]); // the fifth stays: only row 6 closed
    expect(result.state.board[4]).toEqual(["A"]);
  });

  it("R61 the second drop closes the next row down, leaving 4 rows", () => {
    const state = { ...withBoard({ 0: "ABABA", 3: "ABAB" }), round: 19, rows: 5 };
    const result = resolveRound(state, { A: null, B: null });
    expect(result.state.rows).toBe(4);
    expect(result.state.board[0]).toEqual(["A", "B", "A", "B"]);
    expect(result.state.board[3]).toEqual(["A", "B", "A", "B"]);
  });

  it("R61 no column ever closes: every column accepts a disc at every round while it has room", () => {
    for (const round of [0, 11, 12, 20, 40]) {
      const state = { ...quietRounds(newGame(), round) };
      for (let column = 0; column < COLUMNS; column++) {
        expect(validateChoice(state, "A", { column, shield: false }), `round ${round} column ${column}`).toEqual({ ok: true });
      }
    }
  });

  it("R61 a vertical four still fits at the floor: a win stays possible at 4 rows", () => {
    const state = { ...withBoard({ 3: "AAA" }), round: 40, rows: 4 };
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: { column: 6, shield: false } });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
  });
});

describe("R64 a column is full at the current row count", () => {
  it("R64 a column is full when its pieces reach the current number of rows, not 6", () => {
    const state = { ...withBoard({ 3: "ABAB" }), rows: 4 };
    expect(validateChoice(state, "A", { column: 3, shield: false })).toEqual({ ok: false, reason: "column_full" });
    expect(validateChoice({ ...state, rows: 5 }, "A", { column: 3, shield: false })).toEqual({ ok: true });
  });

  it("R3 and R64 rejection order is game_over, bad_column, column_full, no_shield", () => {
    const state = { ...newGame(), rows: 4 };
    state.shieldsLeft.A = false;
    state.board[2] = ["A", "B", "A", "B"];
    expect(validateChoice(state, "A", { column: 7, shield: true })).toEqual({ ok: false, reason: "bad_column" });
    expect(validateChoice(state, "A", { column: 2, shield: true })).toEqual({ ok: false, reason: "column_full" });
    expect(validateChoice(state, "A", { column: 3, shield: true })).toEqual({ ok: false, reason: "no_shield" });
  });

  it("R64 there is no closed-column rejection: column_closed is never a reason", () => {
    const state = { ...quietRounds(newGame(), 40) };
    for (let column = -1; column <= 7; column++) {
      const result = validateChoice(state, "A", { column, shield: false });
      if (!result.ok) expect(["bad_column", "column_full"]).toContain(result.reason);
    }
  });

  it("R64 fullness is judged on the board as it is before the round: a drop after a round does not change what it accepted", () => {
    const state = { ...withBoard({ 3: "ABABA" }), round: 11 };
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.ceilingDropped).toBe(true);
    expect(result.state.board[3]).toEqual(["A", "B", "A", "B", "A"]); // the sixth, just dropped, crumbled
  });
});

describe("R65 a ceiling drop never creates a win and never undoes one", () => {
  it("R65 a line that a drop breaks no longer wins: the disc that would have completed it does not", () => {
    const topLine = { ...withBoard({ 2: "BBBBBA", 3: "BBBBBA", 4: "BBBBBA" }), round: 11 };
    const crumbled = resolveRound(topLine, { A: null, B: null });
    expect(crumbled.state.board.slice(2, 5).map((c) => c.length)).toEqual([5, 5, 5]); // the A row crumbled
    expect(resolveRound(crumbled.state, { A: { column: 5, shield: false }, B: null }).state.status).toBe("playing");
    // Without the drop the same position wins, so it really was the drop that broke the line.
    const kept = { ...withBoard({ 2: "BBBBBA", 3: "BBBBBA", 4: "BBBBBA" }), round: 0 };
    expect(resolveRound(kept, { A: { column: 5, shield: false }, B: null }).state.status).toBe("playing");
    const low = { ...withBoard({ 2: "A", 3: "A", 4: "A" }), round: 3 };
    expect(resolveRound(low, { A: { column: 5, shield: false }, B: null }).state.winner).toBe("A");
  });

  it("R65 a drop cannot create a win: a line the drop leaves in place does not win by itself", () => {
    const state = { ...withBoard({ 0: "ABABAB", 1: "BABABA" }), round: 11 };
    const result = resolveRound(state, { A: null, B: null });
    expect(result.state.status).toBe("playing");
    expect(result.state.winner).toBeNull();
  });

  it("R65 a game that ends this round does not drop, so the winning line stays on the board", () => {
    const state = { ...withBoard({ 0: "BBB", 1: "AAA" }), round: 11 };
    const result = resolveRound(state, { A: { column: 1, shield: false }, B: { column: 6, shield: false } });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
    expect(result.state.rows).toBe(6);
    expect(result.ceilingDropped).toBe(false);
    expect(result.state.board[1]).toEqual(["A", "A", "A", "A"]);
  });

  it("R65 and R13 a win in the top row stands: the line is judged before the drop closes that row", () => {
    const state = { ...newGame(), round: 11 };
    for (const c of [0, 1, 2]) state.board[c] = ["B", "A", "B", "A", "B", "A"];
    state.board[3] = ["A", "B", "A", "B", "A"];
    const result = resolveRound(state, { A: { column: 3, shield: false }, B: null });
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
    expect(result.state.rows).toBe(6); // the game ended, so nothing dropped (R65)
    expect(result.state.board[3]).toEqual(["A", "B", "A", "B", "A", "A"]);
  });
});

describe("R61 the board always has exactly 7 columns", () => {
  it("R61 the board still has 7 columns after every round of a long game", () => {
    let state = newGame();
    for (let round = 0; round < 40; round++) {
      state = resolveRound(state, { A: null, B: null }).state;
      expect(state.board.length, `after round ${round + 1}`).toBe(COLUMNS);
    }
  });
});

describe("R66 a full open area with no winner is a draw", () => {
  it("R66 the draw is judged on the open area, so a shrunken board can be full with room above the ceiling", () => {
    // 4 rows, every column holding 4 pieces except one, with no four in a row anywhere.
    const rows = ["AABBAAB", "BBAABBA", "AABBAAB", "BBAABBA"];
    const state = { ...newGame(), rows: 4, round: 25 };
    for (let c = 0; c < COLUMNS; c++) state.board[c] = rows.map((row) => row[c]) as GameState["board"][number];
    const top = state.board[3].pop()!;
    const result = resolveRound(state, { A: top === "A" ? { column: 3, shield: false } : null, B: top === "B" ? { column: 3, shield: false } : null });
    expect(result.state.board[3].length).toBe(4);
    expect(result.state.status).toBe("draw");
    expect(result.state.winner).toBeNull();
  });

  it("R66 a column holding 4 pieces on a 4 row board is full even though the board started with 6", () => {
    const state = { ...newGame(), rows: 4, round: 25 };
    state.board[0] = ["R", "R", "R", "R"];
    expect(resolveRound(state, { A: null, B: null }).state.status).toBe("playing"); // the rest is empty
  });

  it("R66 a drop can leave the remaining area full, which is a draw", () => {
    // 5 rows with 4 pieces in every column: not full yet, so the game goes on. After round 20 the ceiling
    // drops to 4 rows, and 4 pieces in every column is now a full open area, with no line anywhere.
    const state = { ...newGame(), round: 19, rows: 5 };
    const rows = ["AABBAAB", "BBAABBA", "AABBAAB", "BBAABBA"];
    for (let c = 0; c < COLUMNS; c++) state.board[c] = rows.map((row) => row[c]) as GameState["board"][number];
    expect(resolveRound({ ...state, round: 3 }, { A: null, B: null }).state.status).toBe("playing"); // 5 rows: not full
    const result = resolveRound(state, { A: null, B: null });
    expect(result.ceilingDropped).toBe(true);
    expect(result.state.rows).toBe(4);
    expect(result.state.status).toBe("draw");
    expect(result.state.winner).toBeNull();
  });
});

describe("R67 an Earthquake on a shrunken board", () => {
  it("R67 removes the bottom row and shifts every column down one", () => {
    const state = { ...withBoard({ 1: "ABA", 2: "BAB", 3: "AB" }), round: 12, rows: 5 };
    const result = resolveRound(state, { A: { earthquake: true }, B: null });
    expect(result.state.board[1]).toEqual(["B", "A"]);
    expect(result.state.board[2]).toEqual(["A", "B"]);
    expect(result.state.board[3]).toEqual(["B"]);
    expect(result.state.board[0]).toEqual([]);
  });

  it("R67 the earthquake comes first, then the other disc, then any ceiling drop", () => {
    const state = { ...withBoard({ 1: "ABABA", 3: "AB" }), round: 11 };
    const result = resolveRound(state, { A: { earthquake: true }, B: { column: 1, shield: false } });
    expect(result.shaken).toBe(true);
    expect(result.ceilingDropped).toBe(true);
    // column 1: ABABA -> BABA after the shift, B lands on top (BABAB, five pieces), then the ceiling (5 rows) keeps all five.
    expect(result.state.board[1]).toEqual(["B", "A", "B", "A", "B"]);
    expect(result.state.board[3]).toEqual(["B"]);
  });

  it("R67 an Earthquake that shifts a column below the new ceiling loses nothing to the drop", () => {
    const state = { ...withBoard({ 2: "ABABAB" }), round: 11 };
    const result = resolveRound(state, { A: { earthquake: true }, B: null });
    expect(result.state.board[2]).toEqual(["B", "A", "B", "A", "B"]); // shifted to 5, then the ceiling is 5
  });

  it("R67 and R55 Earthquake is rejected with nothing_to_shake when the board is empty, and allowed with one piece in any column", () => {
    expect(validateChoice({ ...newGame(), round: 12, rows: 5 }, "A", { earthquake: true })).toEqual({ ok: false, reason: "nothing_to_shake" });
    for (let column = 0; column < COLUMNS; column++) {
      const state = { ...withBoard({ [column]: "A" }), round: 12, rows: 5 };
      expect(validateChoice(state, "A", { earthquake: true }), `column ${column}`).toEqual({ ok: true });
    }
  });
});

describe("R69 a game's rows follow the schedule, never backwards, and ceilingDue says what is next", () => {
  it("R69 a game saved before the shrinking board has 6 rows and catches up at its next round", () => {
    const old = { ...withBoard({ 0: "AB", 3: "ABABAB", 6: "A" }), round: 25 }; // 6 rows, whatever the round count
    const result = resolveRound(old, { A: null, B: null });
    expect(result.ceilingDropped).toBe(true);
    expect(result.state.rows).toBe(rowsAt(26));
    expect(result.state.rows).toBe(4);
    expect(result.state.board[3].length).toBe(4);
    expect(result.state.board[0]).toEqual(["A", "B"]);
  });

  it("R69 ceilingDue is true for exactly the round before a drop", () => {
    const due = (round: number) => ceilingDue(quietRounds(newGame(), round));
    expect([10, 11, 12, 18, 19, 20, 26, 27, 28, 60].map(due)).toEqual([false, true, false, false, true, false, false, false, false, false]);
  });

  it("R69 rowsAt is a pure function of the round count", () => {
    expect([0, 11, 12, 19, 20, 27, 28, 500].map(rowsAt)).toEqual([6, 6, 5, 5, 4, 4, 4, 4]);
  });
});
