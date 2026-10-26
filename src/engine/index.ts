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

function cloneBoard(board: Board): Board {
  return board.map((column) => [...column]);
}

export function resolveRound(
  state: GameState,
  choices: { A: Choice | null; B: Choice | null },
): RoundResult {
  const { A, B } = choices;
  if (A) {
    const result = validateChoice(state, "A", A);
    if (!result.ok) throw new Error(`invalid choice for A: ${result.reason}`);
  }
  if (B) {
    const result = validateChoice(state, "B", B);
    if (!result.ok) throw new Error(`invalid choice for B: ${result.reason}`);
  }

  const board = cloneBoard(state.board);
  const shieldsLeft = { ...state.shieldsLeft };
  let outcome: RoundOutcome;
  let shieldWinner: Player | null = null;
  if (A && B && A.column === B.column) {
    if (A.shield) shieldsLeft.A = false;
    if (B.shield) shieldsLeft.B = false;
    if (A.shield && !B.shield) {
      board[A.column].push("A");
      outcome = "shield_win";
      shieldWinner = "A";
    } else if (B.shield && !A.shield) {
      board[B.column].push("B");
      outcome = "shield_win";
      shieldWinner = "B";
    } else {
      board[A.column].push("R");
      outcome = "crash";
    }
  } else if (A && B) {
    if (A.shield) shieldsLeft.A = false;
    if (B.shield) shieldsLeft.B = false;
    board[A.column].push("A");
    board[B.column].push("B");
    outcome = "both_landed";
  } else if (A || B) {
    const chooser: Player = A ? "A" : "B";
    const choice = (A ?? B)!;
    if (choice.shield) shieldsLeft[chooser] = false;
    board[choice.column].push(chooser);
    outcome = "one_landed";
  } else {
    outcome = "none";
  }

  return {
    state: {
      board,
      round: state.round + 1,
      shieldsLeft,
      status: state.status,
      winner: state.winner,
    },
    outcome,
    shieldWinner,
  };
}
