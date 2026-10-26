// The Rubble engine. Pure: no input or output, no clock, no randomness, and
// it never changes its inputs. See the Engine contract in docs/rules.md.

export const COLUMNS = 7;
export const ROWS = 6;

export type Player = "A" | "B";
export type Cell = Player | "R"; // 'R' is a rubble block
export type Board = Cell[][]; // board[c] is column c, index 0 is the bottom
export interface Choice {
  column: number;
  shield: boolean;
}
export type Status = "playing" | "won" | "draw";

export interface GameState {
  board: Board;
  round: number; // rounds resolved so far
  shieldsLeft: Record<Player, boolean>;
  status: Status;
  winner: Player | null;
}

export type RoundOutcome =
  | "both_landed" // R5
  | "crash" // R6 and R9
  | "shield_win" // R7
  | "one_landed" // R10, one player chose
  | "none"; // R10, nobody chose

export interface RoundResult {
  state: GameState;
  outcome: RoundOutcome;
  shieldWinner: Player | null;
}

export function newGame(): GameState {
  const board: Board = [];
  for (let c = 0; c < COLUMNS; c++) {
    board.push([]);
  }
  return {
    board,
    round: 0,
    shieldsLeft: { A: true, B: true },
    status: "playing",
    winner: null,
  };
}

export function validateChoice(
  state: GameState,
  player: Player,
  choice: Choice,
): { ok: true } | { ok: false; reason: "game_over" | "bad_column" | "column_full" | "no_shield" } {
  if (state.status !== "playing") {
    return { ok: false, reason: "game_over" };
  }
  if (!Number.isInteger(choice.column) || choice.column < 0 || choice.column >= COLUMNS) {
    return { ok: false, reason: "bad_column" };
  }
  if (state.board[choice.column].length >= ROWS) {
    return { ok: false, reason: "column_full" };
  }
  if (choice.shield && !state.shieldsLeft[player]) {
    return { ok: false, reason: "no_shield" };
  }
  return { ok: true };
}

export function resolveRound(
  state: GameState,
  choices: { A: Choice | null; B: Choice | null },
): RoundResult {
  throw new Error("not implemented");
}
