// The computer player (R40 to R46). It sees only what a human opponent could
// see (R40): the board, the round, both shields and whether the human has
// chosen yet. Its input type has no field for the human's column or shield,
// so it cannot be handed them. Randomness comes from a seeded generator so
// tests repeat (R46).
import { COLUMNS, ceilingDue, resolveRound, rowsAt, type Board, type Choice, type GameState, type Player } from "../engine/index.ts";

export interface PublicView {
  board: Board;
  round: number;
  shieldsLeft: Record<Player, boolean>;
  earthquakesLeft: Record<Player, boolean>;
  // The current number of rows (R64): public, like the board. The computer knows the schedule, like a
  // human who can see the warning (R68).
  rows: number;
  opponentReady: boolean;
}

// mulberry32: small, fast and repeatable for a given seed.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCK_CHANCE = 0.75; // R43: at least 70%, with margin for the rest of the logic
const LATE_SHIELD_CHANCE = 0.12; // R45: a random point after round 6
const SHIELD_FROM_ROUND = 6;
const EARTHQUAKE_CHANCE = 0.5; // R60: it may, not always, so it cannot be predicted perfectly

function stateOf(view: PublicView): GameState {
  return {
    board: view.board,
    round: view.round,
    shieldsLeft: view.shieldsLeft,
    earthquakesLeft: view.earthquakesLeft,
    rows: view.rows,
    status: "playing",
    winner: null,
  };
}

function winsAt(view: PublicView, player: Player, column: number): boolean {
  const other: Player = player === "A" ? "B" : "A";
  const state = stateOf(view);
  const choices = { A: null, B: null, [player]: { column, shield: false }, [other]: null } as {
    A: Choice | null;
    B: Choice | null;
  };
  const result = resolveRound(state, choices);
  return result.state.status === "won" && result.state.winner === player;
}

// R60: a window is four squares in a line (inside the open area, empty squares included) holding at
// least one of the player's discs and nothing of the other player's or rubble. The count of such
// windows is the player's "potential lines": how much of a line they have started and could still finish.
function potentialLines(view: PublicView, board: Board, player: Player): number {
  const directions: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let count = 0;
  for (let column = 0; column < COLUMNS; column++) {
    for (let row = 0; row < view.rows; row++) {
      for (const [dc, dr] of directions) {
        const endColumn = column + dc * 3;
        const endRow = row + dr * 3;
        if (endColumn < 0 || endColumn >= COLUMNS || endRow < 0 || endRow >= view.rows) continue;
        let mine = 0;
        let blocked = false;
        for (let step = 0; step < 4; step++) {
          const cell = board[column + dc * step][row + dr * step];
          if (cell === player) mine++;
          else if (cell !== undefined) blocked = true;
        }
        if (!blocked && mine > 0) count++;
      }
    }
  }
  return count;
}

// R60: shaking is worth it when it breaks more of the human's potential lines than the computer's own.
function earthquakeHelps(view: PublicView, me: Player, them: Player): boolean {
  if (!view.earthquakesLeft[me] || view.board.every((column) => column.length === 0)) return false;
  const shaken = view.board.map((column) => column.slice(1));
  const theirLoss = potentialLines(view, view.board, them) - potentialLines(view, shaken, them);
  const myLoss = potentialLines(view, view.board, me) - potentialLines(view, shaken, me);
  return theirLoss > myLoss;
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function chooseMove(view: PublicView, me: Player, rng: () => number): Choice {
  const them: Player = me === "A" ? "B" : "A";
  const open: number[] = [];
  for (let c = 0; c < COLUMNS; c++) if (view.board[c].length < view.rows) open.push(c); // R41: not full
  const myWins = open.filter((c) => winsAt(view, me, c));
  const theirWins = open.filter((c) => winsAt(view, them, c));
  const haveShield = view.shieldsLeft[me];

  const shared = myWins.filter((c) => theirWins.includes(c));
  if (shared.length) return { column: pick(shared, rng), shield: haveShield }; // R45
  if (myWins.length) return { column: pick(myWins, rng), shield: false }; // R42
  if (theirWins.length && rng() < BLOCK_CHANCE) return { column: pick(theirWins, rng), shield: false }; // R43

  // R60: after the winning and blocking logic, and without looking at the human's choice.
  if (earthquakeHelps(view, me, them) && rng() < EARTHQUAKE_CHANCE) return { earthquake: true };

  // R68: it knows the schedule, so when nothing more urgent is on, it avoids dropping a disc into a
  // square the ceiling is about to close, unless every column is about to lose its next square.
  const nextRows = rowsAt(view.round + 1);
  const aboutToClose = (c: number): boolean => ceilingDue(stateOf(view)) && view.board[c].length >= nextRows;
  const safe = open.filter((c) => !aboutToClose(c));
  const choices = safe.length ? safe : open;

  // R44: central columns are more likely, but any open column can be chosen.
  const weights = choices.map((c) => COLUMNS - Math.abs(c - (COLUMNS - 1) / 2) * 1.5);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let column = choices[choices.length - 1];
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      column = choices[i];
      break;
    }
  }
  const shield = haveShield && view.round >= SHIELD_FROM_ROUND && rng() < LATE_SHIELD_CHANCE;
  return { column, shield };
}
