// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
import { describe, expect, it } from "vitest";
import { COLUMNS, ROWS, newGame, resolveRound, validateChoice, type Choice, type GameState, type Player } from "../src/engine/index.ts";
import { chooseMove, seededRandom, type PublicView } from "../src/server/computer.ts";

function view(state: GameState, opponentReady = false): PublicView {
  return { board: state.board, round: state.round, shieldsLeft: state.shieldsLeft, opponentReady };
}

// Plays random legal discs into a board without ending the game, for position sampling.
function randomPosition(rng: () => number): GameState {
  for (;;) {
    let state = newGame();
    const rounds = Math.floor(rng() * 20);
    for (let i = 0; i < rounds && state.status === "playing"; i++) {
      const pick = (): Choice | null => {
        const open = [...Array(COLUMNS).keys()].filter((c) => state.board[c].length < ROWS);
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
    if (state.board[c].length >= ROWS) continue;
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
    expect(chooseMove(view(state), "B", seededRandom(3)).column).toBe(4);
  });

  it("C2 (R42) always chooses an immediately winning column", () => {
    const rng = seededRandom(2);
    let tested = 0;
    for (let i = 0; i < 20000 && tested < 200; i++) {
      const state = randomPosition(rng);
      const wins = winningColumns(state, "B");
      if (!wins.length) continue;
      tested++;
      expect(wins).toContain(chooseMove(view(state), "B", rng).column);
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
      if (theirs.includes(chooseMove(view(state), "B", rng).column)) blocked++;
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
        const column = win ?? order.find((c) => state.board[c].length < ROWS)!;
        state = resolveRound(state, { A: { column, shield: false }, B: chooseMove(view(state), "B", rng) }).state;
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
      expect(chooseMove(view(state), "B", rng).shield).toBe(false);
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
      const choice = chooseMove(view(s), "B", rng);
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
