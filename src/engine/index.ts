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

function cellAt(board: Board, column: number, row: number): Cell | undefined {
  return board[column]?.[row];
}

function hasLine(board: Board, player: Player): boolean {
  const directions: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let column = 0; column < board.length; column++) {
    for (let row = 0; row < board[column].length; row++) {
      if (board[column][row] !== player) continue;
      for (const [dc, dr] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step++) {
          if (cellAt(board, column + dc * step, row + dr * step) === player) {
            count++;
          } else {
            break;
          }
        }
        if (count >= 4) return true;
      }
    }
  }
  return false;
}

function isFull(board: Board): boolean {
  return board.every((column) => column.length >= ROWS);
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

  const aWins = hasLine(board, "A");
  const bWins = hasLine(board, "B");
  let status: Status = state.status;
  let winner: Player | null = state.winner;
  if (aWins && bWins) {
    status = "draw";
    winner = null;
  } else if (aWins) {
    status = "won";
    winner = "A";
  } else if (bWins) {
    status = "won";
    winner = "B";
  } else if (isFull(board)) {
    status = "draw";
    winner = null;
  }

  return {
    state: {
      board,
      round: state.round + 1,
      shieldsLeft,
      status,
      winner,
    },
    outcome,
    shieldWinner,
  };
}
