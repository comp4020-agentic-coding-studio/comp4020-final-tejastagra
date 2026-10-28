# Rules

This is the single source of truth for how Rubble behaves. Code and tests follow it. To change behaviour, change this file first.

Every rule has an ID. Tests name the rule they protect (for example `R7 shield wins a crash`), and `spec/CHECKS.md` maps each rule to its checks.

## The game in one paragraph

Rubble is Connect 4 played at the same time. In each round both players secretly choose a column, and may also choose to use their one shield. When both have chosen, or the timer runs out, both discs drop together. If both chose the same column the discs crash and leave a grey rubble block that belongs to nobody, unless exactly one player used their shield, in which case that player's disc lands and the other is lost. Four of your own discs in a row wins. Each player also has one Earthquake per game: instead of a disc, they make the bottom row crumble and everything above drop one row (ADR 0010).

## Board and choices

- **R1** The board has 7 columns and 6 rows at the start, and it loses rows as rounds pass (R61, ADR 0011). It never loses columns. Discs and rubble blocks stack from the bottom of a column.
- **R2** A new game has an empty board with all 7 columns and 6 rows open (the open area, R64), round 0, both shields and both Earthquakes available, status `playing` and no winner.
- **R3** A choice is either a column (0 to 6) with a shield flag, or an Earthquake (R54). A column choice is rejected if the game is over, the column is not a whole number from 0 to 6, the column is full or the shield flag is set when that player's shield is already used. Rejections are checked in that order and give the reasons `game_over`, `bad_column`, `column_full` and `no_shield`. An Earthquake choice is checked as in R53 and R55. A column's fullness is checked on the board as it is before the round, even if an earthquake in the same round would free a space.
- **R4** A choice is final for its round. Once a player has chosen a column, with or without the shield, the server accepts no second choice from that player for the same round and answers it with the rejection reason `already_chosen`. This replaces the earlier rule that let a choice change until the round resolved (ADR 0009). `already_chosen` is a server-side rejection, not one of the engine's R3 reasons, and it says nothing about the opponent (R22).

## Resolving a round

- **R5** If the players chose different columns, both discs land.
- **R6** If they chose the same column and neither used a shield, the discs crash and exactly one rubble block lands in that column.
- **R7** If they chose the same column and exactly one used a shield, that player's disc lands, the other disc is lost and no rubble lands.
- **R8** Using a shield spends it, whether or not there was a crash.
- **R9** If they chose the same column and both used shields, both shields are spent and the discs crash as in R6.
- **R10** If only one player made a choice, only that disc lands (or only that earthquake happens). If neither did, the board does not change.
- **R11** Every resolved round adds 1 to the round count, including rounds where nothing lands.
- **R12** Pieces already on the board never move or change, except that an earthquake (R56) removes the bottom row and shifts every piece above down one row in its own column, and a ceiling drop (R61) removes every piece in the row it closes.

## Winning

- **R13** A player wins only when a disc they dropped this round is part of a line of four of their discs, horizontally, vertically or diagonally. Rubble blocks and the opponent's discs break a line. Lines formed only by pieces moving in an earthquake never win, but a disc dropped later can complete them (ADR 0010). A disc that lands because of a shield win counts as dropped.
- **R14** If a disc dropped by each player this round completes a line for that player, the game is a draw.
- **R15** If the open area is full (R66) and nobody has a line, the game is a draw.
- **R16** Once a game is won or drawn, no further choices are accepted.
- **R17** "Rounds to win" is the round count at the moment of the win. Earthquake rounds count like any other round.

## Timing

- **R18** Each round has a 10 second timer that starts when the round begins (D2, ADR 0009). The round resolves as soon as both players have chosen, or when the timer ends.
- **R19** If both players miss 3 rounds in a row (counting only rounds in which both players were connected, R51), the game is **abandoned**: no winner, and it never affects the leaderboard. The engine's `Status` stays `'playing' | 'won' | 'draw'`: the engine never produces an "abandoned" state itself, because nothing it sees (a round of null choices) distinguishes an abandoned game from an ordinary quiet one. The server tracks how a game ended (a line, a draw, a forfeit or abandonment) as server-side state alongside the engine's `GameState`, and the leaderboard reads that server-side record, not the engine's `status` field. Implementation notes: in a game against the computer the computer always chooses, so there it is the human missing 3 rounds in a row that abandons the game, otherwise an unattended game would play on for ever. The count of idle rounds is kept in memory, so a restart gives a game a fresh count (players get more time, never less). If saving the abandonment fails, the game stays live and tries again after its next round.
- **R51** A game starts only when both players are present. In a friend game or Quick match, no round timer runs and no round can be missed until the second player has joined; waiting alone never starts a round, misses one or abandons the game. A computer game starts when the human joins. If a game is restored after a restart, its timer starts when both players are connected again. Abandonment (R19) counts only rounds in which both players were connected at the moment the round resolved (ADR 0009).

## Power-ups: Earthquake

- **R53** Each player has one Earthquake per game, as well as the shield. A player may use at most one power-up per round, so the shield and Earthquake cannot be combined. An Earthquake choice is rejected with `no_earthquake` if that player's Earthquake is already used, and with `one_power_up` if it also names a column or a shield.
- **R54** Using Earthquake replaces the player's disc for that round: they choose "Earthquake" instead of a column. The choice is final (R4) and hidden until the round resolves, exactly like a column choice (R21, R22).
- **R55** Earthquake cannot be chosen when the bottom row is empty. `validateChoice` rejects it with the reason `nothing_to_shake`. Rejections are checked in this order: `game_over`, `one_power_up`, `no_earthquake`, `nothing_to_shake`.
- **R56** Resolution order: the earthquake happens first. Every piece in the bottom row, discs and rubble alike, is removed, and every piece above drops down exactly one row in its own column, keeping its order. Then the other player's disc, if any, drops onto the new board.
- **R57** If both players choose Earthquake in the same round, the board shakes once (one row removed), both Earthquakes are spent and no discs drop.
- **R58** Earthquake is not a crash, so the shield has no effect on it. A shield flag next to an Earthquake is rejected (R53), and the other player's shield is spent only if they used it on their own column.
- **R59** Earthquake never affects the leaderboard rules (R37 to R39). "Rounds to win" still counts rounds (R17).
- **R60** The computer may use Earthquake when removing the bottom row breaks more of the human's potential lines than its own. It still never sees the human's choice (R40).

## The shrinking board

The schedule depends on the round count alone (R11), so the engine needs no clock. "After round n" means once the n-th round has resolved. The numbers are named constants in the engine, first guesses that playtests may tune (ADR 0011); to change one, change this file first. The first version also closed the outer columns (the walls); playtesting found that too complicated and it was removed (ADR 0011, "Playtest finding"). R62 and R63 are retired and their numbers are not reused.

- **R61** The ceiling drops after round 12 and every 8 rounds after that (rounds 12, 20, 28 and so on), and never goes below 4 rows. When it drops, the top row of the open area closes and any piece in it crumbles away. Starting from 6 rows, it therefore drops after round 12 (to 5 rows) and after round 20 (to 4 rows), and round 28 changes nothing. Constants: `CEILING_FIRST_ROUND = 12`, `CEILING_EVERY = 8`, `MIN_ROWS = 4`.
- **R62** *Retired.* The walls no longer collapse: all 7 columns stay open for the whole game.
- **R63** *Retired.* There is only a ceiling, so nothing happens in a set order.
- **R64** The **open area** is the rows below the current number of rows, in all 7 columns. A column is full when its pieces reach the current number of rows. Fullness is checked on the board as it is before the round, so a ceiling drop after a round never changes what that round accepted.
- **R69** A game's rows are set to the schedule's number for its round count each time a round resolves. A game saved before the shrinking board has the full 6 rows whatever its round count, so it takes the rows for its round count at its next resolved round, and every piece above the new ceiling crumbles away at once. `ceilingDue` is true for exactly what the next round will close.
- **R65** A ceiling drop happens after the round's discs have dropped and the round's result has been decided (R13 to R15). A ceiling drop can never create a win: under R13 a win needs a disc dropped this round, and lines broken by a drop are simply broken. A game that ended in this round does not drop, so the winning line stays on the board. A drop never affects the leaderboard rules (R37 to R39), and rounds to win still counts rounds (R17).
- **R66** If the open area is full (every column holds as many pieces as there are rows) and nobody has won, the game is a draw (R15). This is checked after the round's discs have dropped and again after a ceiling drop, because a drop can leave the remaining area full.
- **R67** An Earthquake on a shrunken board removes the bottom row and shifts every column down one (R56). The earthquake happens first, then the discs drop, then any ceiling drop applies to the board as it then stands.
- **R68** The computer chooses only columns that are not full, and it knows the schedule, like a human who can see the warning (docs/design/shrinking-board.md U68): when it has no winning or blocking move it avoids dropping a disc into a square that is about to close. It still never sees the human's choice (R40).

## Server, real time and persistence

- **R20** The server holds the only true copy of every game. The browser only sends choices and displays what the server sends.
- **R21** While a round is open, each player is told only whether the opponent has chosen yet, never what they chose. A spectator is told neither (R72).
- **R22** No message to a player may contain the opponent's column or shield flag for the current round until it resolves, and no message to a spectator (R72) may contain either player's column, shield flag or Earthquake choice for the current round until it resolves. This includes error messages, logs sent to the browser and timing differences in message size.
- **R23** A round's result is sent to both players at the same time and should appear on both screens within 1 second. Spectators get the same result and it should appear on their screens within 1 second as well (R79).
- **R24** When a player connects or reconnects to a game, they receive a full snapshot of the game, without the opponent's pending choice. A spectator's snapshot is described in R73.
- **R25** Every change to a game is saved to the database before it is broadcast.
- **R26** After a restart or redeploy, every game in progress continues from its last saved round. The timer for the open round restarts at 10 seconds, once both players are back (R51).
- **R27** If a player disconnects, the game waits 30 seconds for them. If they return, play continues. If not, the game ends as a **forfeit** and the other player wins. As with R19's abandonment, "forfeit" is not a value the engine's `Status` ever takes: the engine only knows `'playing' | 'won' | 'draw'`. A forfeit is server-side state (who forfeited, who wins) recorded next to the engine's `GameState`, not a new engine outcome, so a forfeited game's `GameState.status` stays `'playing'` even though the server has ended the game and the leaderboard now has a result to show.

## Identity

- **R28** A visitor becomes a **guest** by choosing a nickname of 2 to 16 letters, numbers, spaces, hyphens or underscores. No password is needed. The browser keeps a long-lived, httpOnly cookie so the guest is still themselves next time. Implementation note: a first-time visitor who has not chosen a nickname is given a generated one, such as "Brave Wombat" (docs/design/home.md U32), so they can play at once and change it whenever they like.
- **R29** A guest may sign up for an **account** with a unique username and a password of at least 8 characters. Signing up keeps their past games and wins.
- **R30** Passwords are stored only as a slow, salted hash (argon2id or bcrypt).
- **R31** Guests' nicknames need not be unique. Wherever a guest is shown, a short tag from their ID is shown too (for example `Tejas #a7f3`). The tag is the first 4 hex digits of the guest's id and is the only part of it ever shown, including on the leaderboard.
- **R32** One player has one live connection per game. Opening the same game in a second tab moves the connection there, and the first tab says so.

## Playing modes

- **R33** **Play the computer** starts a game immediately. It never waits for anyone.
- **R34** **Play a friend** creates a game with a 6-character game code from the letters `ABCDEFGHJKMNPQRSTUVWXYZ23456789` and a link `/g/<code>`. The person who creates the game is player 1, and the first other person to open the link or enter the code is player 2 (R36). The game starts when player 2 has joined. The share screen says: "Send this link. The first person to open it plays you, and anyone after that watches." Implementation note: the server limits how many games one address may create (30 per minute), so the endpoint cannot be used to fill memory and disk; the first round's timer starts when the first player joins.
- **R35** **Quick match** pairs a waiting player with the next player to arrive. Two players are never paired into more than one game, even if they arrive at the same moment. If nobody arrives within 20 seconds, the player is offered the computer and may keep waiting.
- **R36** *Replaced on 28 October 2026 (ADR 0012).* A game has two players and any number of spectators up to 50 (R77). In a link game the **creator is player 1** (seat A), the **first other person to open the link or enter the code is player 2** (seat B) and **everyone after that is a spectator**: a visitor to a link game with both seats taken sees "This game already has two players, so you're watching." and watches. If two people arrive at the same moment for the last seat, the first request the server handles takes the seat and the other becomes a spectator. A spectator can never take a player's seat, **including during the 30 second reconnection window** (R27): a seat whose player has dropped stays theirs, and is given back only to them. A seat is held by a person, kept with the game (the player id from the session cookie, or the seat token for a visitor with no session), so a restart does not give it to a spectator. In a quick match game both seats are taken by the pair (R35) and everyone else watches only through Watch live (R70) or the game's code. A game against the computer has one seat and no spectators (R71).

## Spectating

A **spectator** is a person watching a live game without playing in it (ADR 0012, which supersedes D3). A spectator is not a seat: it has no seat token, and it never counts as a player.

- **R70** Anyone can choose "Watch live" and is placed in a random **quick match** game that is live. A game is **live** when it is a quick match game, still being played and both players are present. A game that is waiting for its second player, or that has ended, is not live and is not offered. If no quick match game is live, the spectator sees "No live games right now" and is offered Quick match and Home (nothing is made up for them to watch). A link game can also be watched, but only through its link or code (R36), never through Watch live.
- **R71** **A game against the computer can never be watched, by anyone.** Quick match games can be watched through Watch live and by their code. Link games (R34) can be watched only through their link or code, and are never listed in Watch live or counted. A code that does not exist, a game that is not live and a game against the computer are all answered exactly alike ("unknown"), so a computer game's existence is never revealed. The kind of a game is decided when it is made and is saved with it, so a restart does not change it.
- **R72** A spectator receives exactly what the players see after each round resolves, and nothing before. No message to a spectator ever contains a pending column, shield, Earthquake or other choice, nor whether either player has chosen yet (this extends R21 and R22). A spectator is never sent `opponent_ready`.
- **R73** A spectator who joins mid-game receives a full snapshot of the game, without any pending choice, and the board in it is the board the players have (this extends R24).
- **R74** A spectator cannot act. The server rejects any choice or other game action from a spectator with the reason `spectator`, and tells nobody else.
- **R75** Players and spectators both see how many people are watching. The count is a number only, never who is watching. It changes as spectators join and leave.
- **R76** When a watched game ends, the spectator sees the result, then after 5 seconds is moved to another random live game (R70). The browser does the waiting and then asks the server for a game, so the server never pushes a spectator out of a game. The game the spectator just watched is not chosen again while another live game exists.
- **R77** At most 50 spectators can watch one game, and at most 300 can watch on the whole machine (one 256 MB machine, ADR 0012). A game that is full is skipped when choosing a random game, and a link game that is full tells a new arrival "This game is full of spectators." A spectator who would exceed the machine limit is told the room is full. Watching and the live count are rate limited per client address (`Fly-Client-IP`).
- **R78** *Removed on 28 October 2026 (ADR 0012).* There is no exhibition game: Watch live shows real quick match games only, and says so when there are none (R70). The exception to R25 that the exhibition game needed is gone, so **every round is saved before it is sent, with no exception** (R25).
- **R79** Spectators never affect the leaderboard, round timers, abandonment (R19), presence (R51) or forfeits (R27). A game with spectators and a game without them behave identically for its players, and the players' result is sent first.
- **R80** The home screen shows how many quick match games are live. It is a number only, and counts only live quick match games: never link games and never games against the computer. Under Quick match a count of people playing now is shown the same way (U91).

**Spectator messages** (the WebSocket at `/ws`, as for players):

- A spectator joins with `{ type: "spectate", code? }`. With no `code` the server picks a random live quick match game (R70, R76) or answers `none_live` (R70); with a `code` it joins that game only if it is a quick match game or a link game and is not full. A visitor who opens a link game's page with both seats taken is made a spectator of it by the server (R36) and is told `{ type: "spectating", ... , because: "two_players" }`. It is answered with `{ type: "spectating", code, kind: "quick" | "link", state, watching, names }`, where `state` is the public game state (R73), `watching` is the number of spectators (R75) and `names` is both players' public display names. It never contains `you`, a seat token, `opponentReady` or anything about a pending choice.
- Each resolved round is sent to every spectator as `{ type: "round", state, watching }` after it is saved (R25), and the players' result is sent first (R79). A change in the number watching is sent to players and spectators as `{ type: "watching", watching }`.
- When a game ends by a line or a draw the spectator is sent the final `round` message. When it ends by a forfeit (R27) or by abandonment (R19), which are server-side state and not an engine status, the spectator is sent `{ type: "ended", result: "forfeit", winner: "A" | "B" }` or `{ type: "ended", result: "abandoned" }`, after it is saved (R25). In every case the browser then moves on after 5 seconds (R76) by sending `{ type: "spectate" }` again.
- Anything a spectator sends other than `spectate` and `leave` is answered with `{ type: "rejected", reason: "spectator" }` to that spectator only (R74). A connection that holds a seat in a game is a player and not a spectator: a `spectate` from it is answered `{ type: "rejected", reason: "spectator" }` and changes nothing, so a player can never lose their seat's ability to play (R70).
- A client address (`Fly-Client-IP`, however many connections it opens and however it alternates `spectate` and `leave`) may ask to watch at most 10 times in 10 seconds (a game ending moves a spectator on only every 5 seconds, so this is generous); past that its `spectate` messages are ignored, so one spectator cannot make the server send a stream of count changes to players and other spectators (R77). A spectator that does not read its messages is closed once more than 256 KB are waiting to be sent to it, checked after every send to spectators (a round and the end of a game), so one slow connection cannot hold memory (R77).
- If the game cannot be watched, is full (R77) or does not exist, the answer is `{ type: "not_watchable", reason: "full" | "room_full" | "unknown" }`, and a computer game, a game that is not live and a code that does not exist are all answered `unknown` so a computer game's existence is not revealed (R71). Asking for a random game when none is live is answered `{ type: "none_live" }`.
- `GET /api/live` answers `{ live: number }` (R80), rate limited per client address.

## Tutorial

- **R47** A player who has never finished or skipped the tutorial is shown it automatically before their first game.
- **R48** Finishing or skipping the tutorial is saved with the player, so it does not return after a refresh, a new session, a restart or a redeploy.
- **R49** The tutorial can be skipped at any step and replayed at any time from "How to play".
- **R50** Tutorial games never change the leaderboard.

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
- **R52** The computer "thinks": it waits a random time between 1 and 3 seconds before it chooses, so its Ready status means something. The wait is drawn from the computer's own random numbers and never depends on what the human chose (R40).

## Engine contract

The engine lives in `src/engine/index.ts`. It is pure: no input or output, no clock, no randomness and it never changes its inputs.

```ts
export const COLUMNS = 7;
export const ROWS = 6;                     // the starting number of rows

// The shrinking schedule (R61). Tunable by playtests; change docs/rules.md first.
export const CEILING_FIRST_ROUND = 12;
export const CEILING_EVERY = 8;
export const MIN_ROWS = 4;

export type Player = 'A' | 'B';
export type Cell = Player | 'R';           // 'R' is a rubble block
export type Board = Cell[][];              // board[c] is column c, index 0 is the bottom
export type Choice =
  | { column: number; shield: boolean }    // a disc, with or without the shield (R3)
  | { earthquake: true };                  // Earthquake instead of a disc (R53 to R57)
export type Status = 'playing' | 'won' | 'draw';

export interface GameState {
  board: Board;
  round: number;                           // rounds resolved so far
  shieldsLeft: Record<Player, boolean>;
  earthquakesLeft: Record<Player, boolean>; // R53
  rows: number;                            // R61: the current number of rows (all 7 columns are always open)
  status: Status;
  winner: Player | null;
}

export type RoundOutcome =
  | 'both_landed'   // R5
  | 'crash'         // R6 and R9
  | 'shield_win'    // R7
  | 'one_landed'    // R10, one player chose a column
  | 'earthquake'    // R56 and R57, at least one earthquake; the other player's disc may also have landed
  | 'none';         // R10, nobody chose

export interface RoundResult {
  state: GameState;
  outcome: RoundOutcome;
  shieldWinner: Player | null;
  shaken: boolean;                         // R56: the bottom row was removed this round
  ceilingDropped: boolean;                 // R61: the ceiling dropped after this round
}

// The number of rows after a number of resolved rounds. Pure: a function of the round count.
export function rowsAt(round: number): number;
// Whether the ceiling will drop after the next round resolves, given the state the game is in now. The
// browser uses it only to show the warning (U68) and the computer to avoid squares about to close (R68).
export function ceilingDue(state: GameState): boolean;

export function newGame(): GameState;
export function validateChoice(
  state: GameState, player: Player, choice: Choice,
): { ok: true } | { ok: false; reason: 'game_over' | 'bad_column' | 'column_full' | 'no_shield'
             | 'one_power_up' | 'no_earthquake' | 'nothing_to_shake' };
export function resolveRound(
  state: GameState, choices: { A: Choice | null; B: Choice | null },
): RoundResult;  // throws if either choice fails validateChoice
```

## Open decisions (Tejas to confirm)

- **D1** Accepted (default, pending Tejas's review): yes, a draw is the right result when both players complete a line in the same round (R14).
- **D2** Accepted: 10 seconds is the round timer (R18), set by Tejas on 27 October 2026 (it was 15). Playtests should settle this.
- **D3** Superseded by ADR 0012 (27 October 2026, amended 28 October 2026): spectating is in scope (R70 to R80). A third visitor to a link game now watches it (R36); a game against the computer can never be watched (R71).
- **D4** Accepted (default, pending Tejas's review): yes, forfeits count towards most wins (R38).
- **D5** Accepted (default, pending Tejas's review): guests appear on the leaderboard with their short tag, the same as accounts.
