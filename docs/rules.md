# Rules

This is the single source of truth for how Rubble behaves. Code and tests follow it. To change behaviour, change this file first.

Every rule has an ID. Tests name the rule they protect (for example `R7 shield wins a crash`), and `spec/CHECKS.md` maps each rule to its checks.

## The game in one paragraph

Rubble is Connect 4 played at the same time. In each round both players secretly choose a column, and may also choose to use their one shield. When both have chosen, or the timer runs out, both discs drop together. If both chose the same column the discs crash and leave a grey rubble block that belongs to nobody, unless exactly one player used their shield, in which case that player's disc lands and the other is lost. Four of your own discs in a row wins.

## Board and choices

- **R1** The board has 7 columns and 6 rows. Discs and rubble blocks stack from the bottom of a column.
- **R2** A new game has an empty board, round 0, both shields available, status `playing` and no winner.
- **R3** A choice is a column (0 to 6) and a shield flag. A choice is rejected if the game is over, the column is not a whole number from 0 to 6, the column is full or the shield flag is set when that player's shield is already used. Rejections are checked in that order and give the reasons `game_over`, `bad_column`, `column_full` and `no_shield`.
- **R4** A player may change their choice freely until the round resolves. Only the last choice counts.

## Resolving a round

- **R5** If the players chose different columns, both discs land.
- **R6** If they chose the same column and neither used a shield, the discs crash and exactly one rubble block lands in that column.
- **R7** If they chose the same column and exactly one used a shield, that player's disc lands, the other disc is lost and no rubble lands.
- **R8** Using a shield spends it, whether or not there was a crash.
- **R9** If they chose the same column and both used shields, both shields are spent and the discs crash as in R6.
- **R10** If only one player made a choice, only that disc lands. If neither did, the board does not change.
- **R11** Every resolved round adds 1 to the round count, including rounds where nothing lands.
- **R12** Pieces already on the board never move or change.

## Winning

- **R13** A player wins when four of their discs are in a line horizontally, vertically or diagonally. Rubble blocks and the opponent's discs break a line.
- **R14** If both players complete a line in the same round, the game is a draw.
- **R15** If the board is full and nobody has a line, the game is a draw.
- **R16** Once a game is won or drawn, no further choices are accepted.
- **R17** "Rounds to win" is the round count at the moment of the win.

## Timing

- **R18** Each round has a 15 second timer that starts when the round begins. The round resolves as soon as both players have chosen, or when the timer ends.
- **R19** If both players miss 3 rounds in a row, the game is **abandoned**: no winner, and it never affects the leaderboard. The engine's `Status` stays `'playing' | 'won' | 'draw'`: the engine never produces an "abandoned" state itself, because nothing it sees (a round of null choices) distinguishes an abandoned game from an ordinary quiet one. The server tracks how a game ended (a line, a draw, a forfeit or abandonment) as server-side state alongside the engine's `GameState`, and the leaderboard reads that server-side record, not the engine's `status` field.

## Server, real time and persistence

- **R20** The server holds the only true copy of every game. The browser only sends choices and displays what the server sends.
- **R21** While a round is open, each player is told only whether the opponent has chosen yet, never what they chose.
- **R22** No message to a player may contain the opponent's column or shield flag for the current round until it resolves. This includes error messages, logs sent to the browser and timing differences in message size.
- **R23** A round's result is sent to both players at the same time and should appear on both screens within 1 second.
- **R24** When a player connects or reconnects to a game, they receive a full snapshot of the game, without the opponent's pending choice.
- **R25** Every change to a game is saved to the database before it is broadcast.
- **R26** After a restart or redeploy, every game in progress continues from its last saved round. The timer for the open round restarts at 15 seconds.
- **R27** If a player disconnects, the game waits 30 seconds for them. If they return, play continues. If not, the game ends as a **forfeit** and the other player wins. As with R19's abandonment, "forfeit" is not a value the engine's `Status` ever takes: the engine only knows `'playing' | 'won' | 'draw'`. A forfeit is server-side state (who forfeited, who wins) recorded next to the engine's `GameState`, not a new engine outcome, so a forfeited game's `GameState.status` stays `'playing'` even though the server has ended the game and the leaderboard now has a result to show.

## Identity

- **R28** A visitor becomes a **guest** by choosing a nickname of 2 to 16 letters, numbers, spaces, hyphens or underscores. No password is needed. The browser keeps a long-lived, httpOnly cookie so the guest is still themselves next time.
- **R29** A guest may sign up for an **account** with a unique username and a password of at least 8 characters. Signing up keeps their past games and wins.
- **R30** Passwords are stored only as a slow, salted hash (argon2id or bcrypt).
- **R31** Guests' nicknames need not be unique. Wherever a guest is shown, a short tag from their ID is shown too (for example `Tejas #a7f3`).
- **R32** One player has one live connection per game. Opening the same game in a second tab moves the connection there, and the first tab says so.

## Playing modes

- **R33** **Play the computer** starts a game immediately. It never waits for anyone.
- **R34** **Play a friend** creates a game with a 6-character game code from the letters `ABCDEFGHJKMNPQRSTUVWXYZ23456789` and a link `/g/<code>`. The game starts when a second player opens the link or enters the code. Implementation note: the server limits how many games one address may create (30 per minute), so the endpoint cannot be used to fill memory and disk; the first round's timer starts when the first player joins.
- **R35** **Quick match** pairs a waiting player with the next player to arrive. Two players are never paired into more than one game, even if they arrive at the same moment. If nobody arrives within 20 seconds, the player is offered the computer and may keep waiting.
- **R36** A game has at most two players. A third visitor to a full game sees a message saying the game is full and a button to start their own.

## Leaderboard

- **R37** Games against the computer never change the leaderboard.
- **R38** **Most wins** counts wins against another person, including forfeits.
- **R39** **Fewest rounds to win** counts only wins by four in a row against another person who made a choice in every round of that game, so a friend cannot hand you a fast win by sitting still.

## Computer player

- **R40** The computer chooses using only what a human opponent could see: the board, the round, both shields' status and whether the human has chosen yet. It never sees the human's choice.
- **R41** The computer never chooses a full column.
- **R42** If the computer has a column that wins immediately, it chooses it.
- **R43** If the human has a column that wins immediately, the computer chooses it to force a crash at least 70% of the time.
- **R44** Otherwise it prefers central columns, with some randomness so it cannot be predicted perfectly.
- **R45** It uses its shield when it has an immediate winning column that the human also needs, or else at a random point after round 6.
- **R46** It is beatable: a simple scripted strategy must beat it in at least 20% of 500 seeded games. Its randomness is seeded so tests are repeatable.

## Engine contract

The engine lives in `src/engine/index.ts`. It is pure: no input or output, no clock, no randomness and it never changes its inputs.

```ts
export const COLUMNS = 7;
export const ROWS = 6;

export type Player = 'A' | 'B';
export type Cell = Player | 'R';           // 'R' is a rubble block
export type Board = Cell[][];              // board[c] is column c, index 0 is the bottom
export interface Choice { column: number; shield: boolean }
export type Status = 'playing' | 'won' | 'draw';

export interface GameState {
  board: Board;
  round: number;                           // rounds resolved so far
  shieldsLeft: Record<Player, boolean>;
  status: Status;
  winner: Player | null;
}

export type RoundOutcome =
  | 'both_landed'   // R5
  | 'crash'         // R6 and R9
  | 'shield_win'    // R7
  | 'one_landed'    // R10, one player chose
  | 'none';         // R10, nobody chose

export interface RoundResult {
  state: GameState;
  outcome: RoundOutcome;
  shieldWinner: Player | null;
}

export function newGame(): GameState;
export function validateChoice(
  state: GameState, player: Player, choice: Choice,
): { ok: true } | { ok: false; reason: 'game_over' | 'bad_column' | 'column_full' | 'no_shield' };
export function resolveRound(
  state: GameState, choices: { A: Choice | null; B: Choice | null },
): RoundResult;  // throws if either choice fails validateChoice
```

## Open decisions (Tejas to confirm)

- **D1** Accepted (default, pending Tejas's review): yes, a draw is the right result when both players complete a line in the same round (R14).
- **D2** Accepted (default, pending Tejas's review): 15 seconds is the round timer (R18). Playtests should settle this.
- **D3** Accepted (default, pending Tejas's review): no spectating. A third visitor sees "game full" (R36). Watching is not in scope unless Tejas adds it here.
- **D4** Accepted (default, pending Tejas's review): yes, forfeits count towards most wins (R38).
- **D5** Accepted (default, pending Tejas's review): guests appear on the leaderboard with their short tag, the same as accounts.
