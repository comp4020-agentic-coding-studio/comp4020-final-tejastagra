# 0011. Shrinking board: the playable area closes in over rounds

- **Status:** Accepted
- **Decided by:** Tejas (request of 27 October 2026 for the shrinking board); the details below were chosen from docs/rules.md and docs/design/

## Context

A simultaneous game where both players can block each other can drag on: every column fills slowly and a careful pair can play for dozens of rounds. Long games make the leaderboard's "fewest rounds" list pointless and make a friend game feel endless on a phone. The board should create urgency and stop long games without a clock the players have to watch. This touches promise 1 (the game rewards reading your opponent) and promise 2 (both screens show the same result at the same moment).

## Options

1. **A shrinking schedule based on seconds.** Simple to explain, but the engine is pure and has no clock (CLAUDE.md, rules.md "Engine contract"), rounds end early when both players have chosen so they vary in length from about two seconds to ten, and a player who is thinking cannot plan around "the board shrinks at 90 seconds".
2. **A shrinking schedule based on rounds.** The engine already counts rounds, so the schedule can be a pure function of the round count. Every player can count rounds, plan around "the ceiling drops after round 6" and see the warning one round ahead.
3. **No shrinking, a round limit instead (a draw at round N).** Stops long games but gives no urgency and no new decisions.

## Decision

Option 2, under these rules (R61 to R68 in `docs/rules.md`, U68 to U74 in `docs/design/shrinking-board.md`):

- The ceiling drops after round 6 and every 6 rounds after that, until the board has 3 rows. The top row of the open area closes and any piece in it crumbles away.
- The walls collapse after round 12 and every 6 rounds after that, until 3 columns remain. The leftmost and rightmost open columns close and every piece in them crumbles away.
- If both happen after the same round, the ceiling drops first, then the walls collapse.
- A closed column cannot be chosen (`column_closed`). A column is full when its pieces reach the current number of rows.
- A collapse happens after the round's discs have dropped and the round's result has been decided. A collapse never creates a win, because under R13 a win needs a disc dropped this round. If the open area is full and nobody has won, the game is a draw.
- The schedule numbers are **named constants** in the engine (`CEILING_FIRST_ROUND`, `CEILING_EVERY`, `MIN_ROWS`, `WALLS_FIRST_ROUND`, `WALLS_EVERY`, `MIN_COLUMNS`). They are first guesses. **Playtests may tune them** (`docs/playtests.md`); changing one means changing `docs/rules.md` first.
- The engine stays pure: the current rows and the range of open columns are stored in `GameState` but are derived only from the round count (`shapeAt(round)`).

## Decisions made while Tejas was away

- `GameState` gains `rows`, `firstColumn` and `lastColumn` (the open range). A game saved before this change gets a full board shape from a numbered migration (12) and catches up at its next resolved round, when the engine moves it to the shape for that round count. This is simpler and safer than rewriting saved boards in SQL, and only games in progress at deploy time are affected.
- A collapse is never applied to a game that ended this round (a win or a draw), so the winning line stays on the board for the highlight and the end popup.
- The board on screen is always drawn as 7 by 6 cells. Closed cells turn into solid rock, so the board never changes size and the phone layout cannot change (promise 4).
- The warning sits on the round line above the board, not in a new row, because the 320 x 568 screen has about 19px to spare.
- The browser imports `shapeAt` from the engine, so the warning banner uses the one schedule and never a copy of the numbers. It uses it only to show the warning, never to decide a result (R20); every board and shape it draws is the one the server sent.
- The computer knows the schedule: besides playing only open columns, when it has no winning or blocking move it avoids a disc that would land in a row or column that is about to close.

## What it costs

- **After round 18 no win is possible.** With 3 rows no vertical four fits and with 3 columns no horizontal four fits, so a game that reaches round 18 can only end as a draw by filling the open area (at most 9 pieces). This is what the numbers the request asked for do. It stops long games, but it also means rounds 18 and up are a race to fill a small board. If playtests dislike it, raise `MIN_ROWS` or `MIN_COLUMNS` to 4, which keeps wins possible.
- Pieces vanish, so a player can lose a line they built. That is the point, and the warning one round ahead lets them react.
- The win rule, the draw rule and the Earthquake rule all now depend on the current shape, which is a little more to learn. The tutorial gets one more step.

## Evidence

Unit and property tests named for R61 to R68, a migration test (S5), browser checks for the warning, the collapse, its reduced-motion version and the tutorial step, and the mutation score in `docs/testing/mutation-scores.md`.
