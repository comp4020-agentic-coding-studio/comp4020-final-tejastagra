// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
import { describe, expect, it } from "vitest";
import { COLUMNS, ROWS, newGame, resolveRound, shapeAt, validateChoice, type Choice, type GameState, type Player } from "../src/engine/index.ts";
import { chooseMove, seededRandom, type PublicView } from "../src/server/computer.ts";

// The column and shield tests (C1 to C7) are about discs, so their view has both Earthquakes
// spent. C8 below uses quakeView, where they are available (R60).
function view(state: GameState, opponentReady = false): PublicView {
  return { board: state.board, round: state.round, shieldsLeft: state.shieldsLeft, earthquakesLeft: { A: false, B: false }, rows: state.rows, firstColumn: state.firstColumn, lastColumn: state.lastColumn, opponentReady };
}
function quakeView(state: GameState, opponentReady = false): PublicView {
  return { board: state.board, round: state.round, shieldsLeft: state.shieldsLeft, earthquakesLeft: state.earthquakesLeft, rows: state.rows, firstColumn: state.firstColumn, lastColumn: state.lastColumn, opponentReady };
}
function boardOf(columns: Record<number, string>): GameState {
  const state = newGame();
  for (const [column, pieces] of Object.entries(columns)) state.board[Number(column)] = pieces.split("") as GameState["board"][number];
  return state;
}

// The computer's choice, as a disc (these tests are about columns and the shield).
function disc(choice: Choice): { column: number; shield: boolean } {
  if (!("column" in choice)) throw new Error("expected a disc");
  return choice;
}

// Plays random legal discs into a board without ending the game, for position sampling.
function randomPosition(rng: () => number): GameState {
  for (;;) {
    let state = newGame();
    const rounds = Math.floor(rng() * 20);
    for (let i = 0; i < rounds && state.status === "playing"; i++) {
      const pick = (): Choice | null => {
        const open = [...Array(COLUMNS).keys()].filter((c) => c >= state.firstColumn && c <= state.lastColumn && state.board[c].length < state.rows);
        return open.length ? { column: open[Math.floor(rng() * open.length)], shield: false } : null;
      };
      state = resolveRound(state, { A: pick(), B: pick() }).state;
    }
    if (state.status === "playing") return state;
  }
}

// A column where `player` wins immediately if it lands alone.
function winningColumns(state: GameState, player: Player): number[] {
  const other: Player = player === "A" ? "B" : "A";
  const cols: number[] = [];
  for (let c = 0; c < COLUMNS; c++) {
    if (!validateChoice(state, player, { column: c, shield: false }).ok) continue; // closed or full (R64)
    const r = resolveRound(state, { [player]: { column: c, shield: false }, [other]: null } as never);
    if (r.state.status === "won" && r.state.winner === player) cols.push(c);
  }
  return cols;
}

describe("C: computer player (R40 to R46)", () => {
  it("C1 (R41) never chooses a full column over 10000 random positions", () => {
    const rng = seededRandom(1);
    let checked = 0;
    while (checked < 10000) {
      const state = randomPosition(rng);
      const choice = chooseMove(view(state), "B", rng);
      expect(validateChoice(state, "B", choice).ok).toBe(true);
      checked++;
    }
  });

  it("C1 (R41) with only one open column it chooses that column", () => {
    const state = newGame();
    for (let c = 0; c < COLUMNS; c++) if (c !== 4) state.board[c] = Array(ROWS).fill("R");
    expect(disc(chooseMove(view(state), "B", seededRandom(3))).column).toBe(4);
  });

  it("C2 (R42) always chooses an immediately winning column", () => {
    const rng = seededRandom(2);
    let tested = 0;
    for (let i = 0; i < 20000 && tested < 200; i++) {
      const state = randomPosition(rng);
      const wins = winningColumns(state, "B");
      if (!wins.length) continue;
      tested++;
      expect(wins).toContain(disc(chooseMove(view(state), "B", rng)).column);
    }
    expect(tested).toBeGreaterThan(50);
  });

  it("C3 (R43) takes the human's immediately winning column at least 70% of the time over 1000 seeded positions", () => {
    const rng = seededRandom(4);
    let positions = 0;
    let blocked = 0;
    for (let i = 0; i < 200000 && positions < 1000; i++) {
      const state = randomPosition(rng);
      const theirs = winningColumns(state, "A");
      if (!theirs.length || winningColumns(state, "B").length) continue; // R42 comes first
      positions++;
      if (theirs.includes(disc(chooseMove(view(state), "B", rng)).column)) blocked++;
    }
    expect(positions).toBe(1000);
    expect(blocked / positions).toBeGreaterThanOrEqual(0.7);
  });

  it("C4 (R46) the same seed gives the same choices", () => {
    const run = (seed: number) => {
      const rng = seededRandom(seed);
      const out: Choice[] = [];
      let state = newGame();
      for (let i = 0; i < 15 && state.status === "playing"; i++) {
        const mine = chooseMove(view(state), "B", rng);
        out.push(mine);
        state = resolveRound(state, { A: { column: i % COLUMNS, shield: false }, B: mine }).state;
      }
      return out;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it("C5 (R46) a simple scripted strategy beats it in at least 20% of 500 seeded games", () => {
    const order = [3, 2, 4, 1, 5, 0, 6];
    let scriptedWins = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rng = seededRandom(seed);
      let state = newGame();
      for (let i = 0; i < 80 && state.status === "playing"; i++) {
        const win = winningColumns(state, "A")[0];
        const column = win ?? order.find((c) => validateChoice(state, "A", { column: c, shield: false }).ok)!;
        state = resolveRound(state, { A: { column, shield: false }, B: chooseMove(quakeView(state), "B", rng) }).state; // as it really plays: Earthquake available (R60)
      }
      if (state.status === "won" && state.winner === "A") scriptedWins++;
    }
    expect(scriptedWins / 500).toBeGreaterThanOrEqual(0.2);
  });

  it("C6 (R45) never uses a shield it has already spent", () => {
    const rng = seededRandom(9);
    for (let i = 0; i < 3000; i++) {
      const state = randomPosition(rng);
      state.shieldsLeft = { A: true, B: false };
      state.round = 6 + Math.floor(rng() * 20);
      expect(disc(chooseMove(view(state), "B", rng)).shield).toBe(false);
    }
  });

  it("C6 (R45) uses its shield when it and the human both need the same winning column", () => {
    const rng = seededRandom(11);
    let tested = 0;
    for (let i = 0; i < 200000 && tested < 30; i++) {
      const s = randomPosition(rng);
      const shared = winningColumns(s, "B").filter((c) => winningColumns(s, "A").includes(c));
      if (!shared.length) continue;
      tested++;
      const choice = disc(chooseMove(view(s), "B", rng));
      expect(shared).toContain(choice.column);
      expect(choice.shield).toBe(true);
    }
    expect(tested).toBeGreaterThan(0);
  });

  it("C7 (R40) chooseMove takes only public state: extra fields, such as a human's choice, change nothing", () => {
    expect(chooseMove.length).toBe(3); // view, seat, random: no fourth place to pass a choice
    const state = newGame();
    const plain = chooseMove(view(state), "B", seededRandom(5));
    const smuggled = chooseMove({ ...view(state), humanColumn: 3, humanShield: true } as PublicView, "B", seededRandom(5));
    expect(smuggled).toEqual(plain);
  });

  it("C7 (R40) the human having chosen does not change the computer's column", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const state = newGame();
      const a = chooseMove(view(state, false), "B", seededRandom(seed));
      const b = chooseMove(view(state, true), "B", seededRandom(seed));
      expect(a).toEqual(b);
    }
  });
});

describe("C8 (R60) the computer and Earthquake", () => {
  // The human's discs sit in the bottom row and the computer's are above them: removing the
  // bottom row breaks the human's potential lines and keeps the computer's.
  const humanBottom = () => boardOf({ 1: "AB", 2: "AB" });
  // The mirror: the computer's discs are in the bottom row, the human's above.
  const computerBottom = () => boardOf({ 1: "BA", 2: "BA" });

  const picks = (state: GameState, seeds: number): number => {
    let quakes = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const choice = chooseMove(quakeView(state), "B", seededRandom(seed));
      if (!("column" in choice)) quakes++;
    }
    return quakes;
  };

  it("C8 (R60) uses Earthquake sometimes when it breaks more of the human's potential lines than its own", () => {
    expect(picks(humanBottom(), 300)).toBeGreaterThan(30);
  });

  it("C8 (R60) never uses Earthquake when it would break more of its own potential lines", () => {
    expect(picks(computerBottom(), 300)).toBe(0);
  });

  it("C8 (R60) never uses Earthquake on an empty board, or once it is spent (R53, R55)", () => {
    expect(picks(newGame(), 100)).toBe(0);
    const spent = humanBottom();
    spent.earthquakesLeft.B = false;
    expect(picks(spent, 100)).toBe(0);
  });

  it("C8 (R42) a winning move still comes before Earthquake", () => {
    const state = boardOf({ 0: "BBB", 1: "A", 2: "A" }); // the computer wins at column 0 by a vertical four
    for (let seed = 1; seed <= 100; seed++) {
      const choice = chooseMove(quakeView(state), "B", seededRandom(seed));
      expect("column" in choice && choice.column === 0).toBe(true);
    }
  });

  it("C8 (R40) its choice never depends on whether the human has chosen: Ready only changes nothing about Earthquake", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = chooseMove(quakeView(humanBottom(), false), "B", seededRandom(seed));
      const b = chooseMove(quakeView(humanBottom(), true), "B", seededRandom(seed));
      expect(a).toEqual(b);
    }
  });

  it("C8 (R40) extra fields, such as the human's Earthquake choice, change nothing", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const plain = chooseMove(quakeView(humanBottom()), "B", seededRandom(seed));
      const smuggled = chooseMove({ ...quakeView(humanBottom()), humanEarthquake: true, humanColumn: 3 } as PublicView, "B", seededRandom(seed));
      expect(smuggled).toEqual(plain);
    }
    // The type itself: this literal must be exactly what the computer is given.
    const exact: PublicView = { board: [], round: 0, shieldsLeft: { A: true, B: true }, earthquakesLeft: { A: true, B: true }, rows: 6, firstColumn: 0, lastColumn: 6, opponentReady: false };
    expect(Object.keys(exact).sort()).toEqual(["board", "earthquakesLeft", "firstColumn", "lastColumn", "opponentReady", "round", "rows", "shieldsLeft"]);
  });
});

describe("C9 (R68) the computer plays the open area and knows the schedule", () => {
  const shrunk = (round: number) => {
    const state = newGame();
    const shape = shapeAt(round);
    state.round = round;
    state.rows = shape.rows;
    state.firstColumn = shape.firstColumn;
    state.lastColumn = shape.lastColumn;
    return state;
  };

  it("C9 (R41, R64) it never chooses a closed or full column, over many positions on every shape", () => {
    for (const round of [0, 6, 12, 18, 30]) {
      const rng = seededRandom(round + 1);
      for (let i = 0; i < 400; i++) {
        const state = shrunk(round);
        for (let c = state.firstColumn; c <= state.lastColumn; c++) {
          const filled = Math.floor(rng() * state.rows);
          state.board[c] = Array.from({ length: filled }, (_, k) => (k % 2 ? "A" : "B")) as GameState["board"][number];
        }
        const choice = chooseMove(quakeView(state), "B", rng);
        if ("column" in choice) expect(validateChoice(state, "B", choice).ok, `round ${round}`).toBe(true);
      }
    }
  });

  it("C9 (R68) with nothing more urgent it avoids a column the walls are about to close", () => {
    const state = shrunk(11); // after the next round the walls collapse: columns 0 and 6 close, and the ceiling drops
    let closing = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const choice = chooseMove(quakeView(state), "B", seededRandom(seed));
      if ("column" in choice && (choice.column === 0 || choice.column === 6)) closing++;
    }
    expect(closing).toBe(0);
  });

  it("C9 (R68) it avoids a square the ceiling is about to close, when another column is safe", () => {
    const state = shrunk(5); // the ceiling drops to 5 rows after the next round
    state.board[3] = ["A", "B", "A", "B", "A"]; // the next disc here would land in row 6, which is about to close
    let into = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const choice = chooseMove(quakeView(state), "B", seededRandom(seed));
      if ("column" in choice && choice.column === 3) into++;
    }
    expect(into).toBe(0);
  });

  it("C9 (R68) when every open column is about to close, it still chooses one, and a win still comes first (R42)", () => {
    const state = shrunk(5);
    for (let c = 0; c < COLUMNS; c++) state.board[c] = ["A", "B", "A", "B", "A"];
    for (let seed = 1; seed <= 50; seed++) {
      const choice = chooseMove(view(state), "B", seededRandom(seed)); // Earthquake spent, so it must choose a column
      expect("column" in choice).toBe(true);
      if ("column" in choice) expect(validateChoice(state, "B", choice).ok).toBe(true);
    }
    const winning = shrunk(11);
    winning.board[3] = ["B", "B", "B"];
    for (let seed = 1; seed <= 50; seed++) {
      const choice = chooseMove(quakeView(winning), "B", seededRandom(seed));
      expect("column" in choice && choice.column === 3).toBe(true);
    }
  });
});
