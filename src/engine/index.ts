// The Rubble engine. Pure: no input or output, no clock, no randomness, and
// it never changes its inputs. See the Engine contract in docs/rules.md.

export const COLUMNS = 7;
export const ROWS = 6; // the starting number of rows

// The shrinking schedule (R61, R62). Tunable by playtests; change docs/rules.md first.
export const CEILING_FIRST_ROUND = 6;
export const CEILING_EVERY = 6;
export const MIN_ROWS = 3;
export const WALLS_FIRST_ROUND = 12;
export const WALLS_EVERY = 6;
export const MIN_COLUMNS = 3;

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
  rows: number; // R61: the current number of rows
  firstColumn: number; // R62: the open columns run from firstColumn to lastColumn, inclusive
  lastColumn: number;
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
  collapsed: { ceiling: boolean; walls: boolean }; // R61, R62: what closed after this round
}

export interface Shape {
  rows: number;
  firstColumn: number;
  lastColumn: number;
}

// How many times something has happened by `round` when it first happens at `first` and then every `every`.
function steps(round: number, first: number, every: number): number {
  return round < first ? 0 : Math.floor((round - first) / every) + 1;
}

// The shape of the open area after `round` resolved rounds (R61 to R63). Pure: it depends on the
// round count alone, so the engine needs no clock (ADR 0011).
export function shapeAt(round: number): Shape {
  const rows = Math.max(MIN_ROWS, ROWS - steps(round, CEILING_FIRST_ROUND, CEILING_EVERY));
  const open = Math.max(MIN_COLUMNS, COLUMNS - 2 * steps(round, WALLS_FIRST_ROUND, WALLS_EVERY));
  const firstColumn = Math.floor((COLUMNS - open) / 2);
  return { rows, firstColumn, lastColumn: firstColumn + open - 1 };
}

// What the next resolved round will close, given the shape the game is in now (R69). Used only to
// show the warning (U68) and by the computer (R68); a result is always decided by resolveRound.
export function collapseDue(state: GameState): { ceiling: boolean; walls: boolean } {
  const next = shapeAt(state.round + 1);
  return { ceiling: next.rows < state.rows, walls: next.firstColumn > state.firstColumn };
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
    rows: ROWS,
    firstColumn: 0,
    lastColumn: COLUMNS - 1,
    status: "playing",
    winner: null,
  };
}

export type RejectReason =
  | "game_over"
  | "bad_column"
  | "column_closed"
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
    // R55, R67: it needs a piece in the bottom row of the open area.
    const bottomRowEmpty = state.board.every((column, c) => c < state.firstColumn || c > state.lastColumn || column.length === 0);
    if (bottomRowEmpty) return { ok: false, reason: "nothing_to_shake" };
    return { ok: true };
  }
  if (!Number.isInteger(choice.column) || choice.column < 0 || choice.column >= COLUMNS) {
    return { ok: false, reason: "bad_column" };
  }
  if (choice.column < state.firstColumn || choice.column > state.lastColumn) {
    return { ok: false, reason: "column_closed" }; // R64
  }
  if (state.board[choice.column].length >= state.rows) {
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

// R66: the open area is full when every open column holds as many pieces as there are rows.
function isFull(board: Board, shape: Shape): boolean {
  for (let column = shape.firstColumn; column <= shape.lastColumn; column++) {
    if (board[column].length < shape.rows) return false;
  }
  return true;
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

  const shape: Shape = { rows: state.rows, firstColumn: state.firstColumn, lastColumn: state.lastColumn };
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
  } else if (isFull(board, shape)) {
    status = "draw";
    winner = null;
  }

  // R65: a collapse happens after the discs have dropped and the result is decided, and never in the
  // round that ended the game, so the winning line stays on the board. Pieces in the closed area
  // crumble away (R61, R62). A collapse cannot create a win, because only dropped discs win (R13).
  const round = state.round + 1;
  const next = status === "playing" ? shapeAt(round) : shape;
  const collapsed = { ceiling: next.rows < shape.rows, walls: next.firstColumn > shape.firstColumn };
  if (collapsed.ceiling || collapsed.walls) {
    for (let column = 0; column < COLUMNS; column++) {
      if (column < next.firstColumn || column > next.lastColumn) board[column] = [];
      else board[column].length = Math.min(board[column].length, next.rows);
    }
    if (isFull(board, next)) {
      status = "draw"; // R66: a collapse can leave the remaining area full
      winner = null;
    }
  }

  return {
    state: {
      board,
      round,
      shieldsLeft,
      earthquakesLeft,
      rows: next.rows,
      firstColumn: next.firstColumn,
      lastColumn: next.lastColumn,
      status,
      winner,
    },
    outcome,
    shieldWinner,
    shaken,
    collapsed,
  };
}
