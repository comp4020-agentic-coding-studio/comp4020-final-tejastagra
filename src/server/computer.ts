// The computer player (R40 to R46). It sees only what a human opponent could
// see (R40): the board, the round, both shields and whether the human has
// chosen yet. Its input type has no field for the human's column or shield,
// so it cannot be handed them. Randomness comes from a seeded generator so
// tests repeat (R46).
import { COLUMNS, ROWS, resolveRound, type Board, type Choice, type GameState, type Player } from "../engine/index.ts";

export interface PublicView {
  board: Board;
  round: number;
  shieldsLeft: Record<Player, boolean>;
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

function winsAt(view: PublicView, player: Player, column: number): boolean {
  const other: Player = player === "A" ? "B" : "A";
  const state: GameState = {
    board: view.board,
    round: view.round,
    shieldsLeft: view.shieldsLeft,
    status: "playing",
    winner: null,
  };
  const choices = { A: null, B: null, [player]: { column, shield: false }, [other]: null } as {
    A: Choice | null;
    B: Choice | null;
  };
  const result = resolveRound(state, choices);
  return result.state.status === "won" && result.state.winner === player;
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function chooseMove(view: PublicView, me: Player, rng: () => number): Choice {
  const them: Player = me === "A" ? "B" : "A";
  const open: number[] = [];
  for (let c = 0; c < COLUMNS; c++) if (view.board[c].length < ROWS) open.push(c); // R41
  const myWins = open.filter((c) => winsAt(view, me, c));
  const theirWins = open.filter((c) => winsAt(view, them, c));
  const haveShield = view.shieldsLeft[me];

  const shared = myWins.filter((c) => theirWins.includes(c));
  if (shared.length) return { column: pick(shared, rng), shield: haveShield }; // R45
  if (myWins.length) return { column: pick(myWins, rng), shield: false }; // R42
  if (theirWins.length && rng() < BLOCK_CHANCE) return { column: pick(theirWins, rng), shield: false }; // R43

  // R44: central columns are more likely, but any open column can be chosen.
  const weights = open.map((c) => COLUMNS - Math.abs(c - (COLUMNS - 1) / 2) * 1.5);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let column = open[open.length - 1];
  for (let i = 0; i < open.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      column = open[i];
      break;
    }
  }
  const shield = haveShield && view.round >= SHIELD_FROM_ROUND && rng() < LATE_SHIELD_CHANCE;
  return { column, shield };
}
