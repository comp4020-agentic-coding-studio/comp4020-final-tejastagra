// The Rubble engine. Pure: no input or output, no clock, no randomness, and
// it never changes its inputs. See the Engine contract in docs/rules.md.

export const COLUMNS = 7;
export const ROWS = 6;

export type Player = "A" | "B";
export type Cell = Player | "R"; // 'R' is a rubble block
export type Board = Cell[][]; // board[c] is column c, index 0 is the bottom
export type Choice =
  | { column: number; shield: boolean } // a disc, with or without the shield (R3)
  | { earthquake: true }; // Earthquake instead of a disc (R53 to R57)
export type Status = "playing" | "won" | "draw";

export interface GameState {
  board: Board;
  round: number; // rounds resolved so far
  shieldsLeft: Record<Player, boolean>;
  earthquakesLeft: Record<Player, boolean>; // R53
  status: Status;
  winner: Player | null;
}

export type RoundOutcome =
  | "both_landed" // R5
  | "crash" // R6 and R9
  | "shield_win" // R7
  | "one_landed" // R10, one player chose a column
  | "earthquake" // R56 and R57, at least one earthquake; the other player's disc may also have landed
  | "none"; // R10, nobody chose

export interface RoundResult {
  state: GameState;
  outcome: RoundOutcome;
  shieldWinner: Player | null;
  shaken: boolean; // R56: the bottom row was removed this round
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
    earthquakesLeft: { A: true, B: true },
    status: "playing",
    winner: null,
  };
}

export type RejectReason =
  | "game_over"
  | "bad_column"
  | "column_full"
  | "no_shield"
  | "one_power_up"
  | "no_earthquake"
  | "nothing_to_shake";

export function isEarthquake(choice: Choice): choice is { earthquake: true } {
  return "earthquake" in choice && choice.earthquake === true;
}

export function validateChoice(
  state: GameState,
  player: Player,
  choice: Choice,
): { ok: true } | { ok: false; reason: RejectReason } {
  if (state.status !== "playing") {
    return { ok: false, reason: "game_over" };
  }
  if (isEarthquake(choice)) {
    // R53: a power-up per round at most, so Earthquake cannot carry a column or a shield.
    const extra = choice as { column?: unknown; shield?: unknown };
    if (extra.column !== undefined || extra.shield) return { ok: false, reason: "one_power_up" };
    if (!state.earthquakesLeft[player]) return { ok: false, reason: "no_earthquake" };
    if (state.board.every((column) => column.length === 0)) return { ok: false, reason: "nothing_to_shake" }; // R55
    return { ok: true };
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

// R13: a line wins only if a disc dropped this round is part of it, so a line made only by pieces
// moving in an earthquake never wins.
function completesLine(board: Board, column: number, row: number): boolean {
  const player = board[column][row];
  const directions: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dc, dr] of directions) {
    let count = 1;
    for (let step = 1; step < 4 && cellAt(board, column + dc * step, row + dr * step) === player; step++) count++;
    for (let step = 1; step < 4 && cellAt(board, column - dc * step, row - dr * step) === player; step++) count++;
    if (count >= 4) return true;
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
  if (state.status !== "playing") {
    throw new Error("cannot resolve a round once the game is over");
  }
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
  const earthquakesLeft = { ...state.earthquakesLeft };
  const dropped: Array<[number, number]> = []; // the discs that landed this round (R13)
  const drop = (column: number, piece: Cell): void => {
    board[column].push(piece);
    if (piece !== "R") dropped.push([column, board[column].length - 1]);
  };

  // R56: the earthquake happens first. The bottom row goes and every piece above drops one row.
  const quaking = (["A", "B"] as const).filter((player) => choices[player] && isEarthquake(choices[player]!));
  const shaken = quaking.length > 0;
  if (shaken) {
    for (const column of board) column.shift();
    for (const player of quaking) earthquakesLeft[player] = false; // R57: both are spent, one row goes
  }

  let outcome: RoundOutcome;
  let shieldWinner: Player | null = null;
  const discs = (["A", "B"] as const).flatMap((player) => {
    const choice = choices[player];
    return choice && !isEarthquake(choice) ? [{ player, choice }] : [];
  });
  for (const { player, choice } of discs) if (choice.shield) shieldsLeft[player] = false; // R8
  if (shaken) {
    outcome = "earthquake";
    for (const { player, choice } of discs) drop(choice.column, player);
  } else if (discs.length === 2) {
    const [a, b] = discs;
    if (a.choice.column === b.choice.column) {
      if (a.choice.shield !== b.choice.shield) {
        const winner = a.choice.shield ? a : b;
        drop(winner.choice.column, winner.player);
        outcome = "shield_win";
        shieldWinner = winner.player;
      } else {
        drop(a.choice.column, "R");
        outcome = "crash";
      }
    } else {
      drop(a.choice.column, a.player);
      drop(b.choice.column, b.player);
      outcome = "both_landed";
    }
  } else if (discs.length === 1) {
    drop(discs[0].choice.column, discs[0].player);
    outcome = "one_landed";
  } else {
    outcome = "none";
  }

  const aWins = dropped.some(([c, r]) => board[c][r] === "A" && completesLine(board, c, r));
  const bWins = dropped.some(([c, r]) => board[c][r] === "B" && completesLine(board, c, r));
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
      earthquakesLeft,
      status,
      winner,
    },
    outcome,
    shieldWinner,
    shaken,
  };
}
