# 0011. Shrinking board: the playable area closes in over rounds

- **Status:** Accepted, amended on 27 October 2026 after playtesting (see "Playtest finding": the walls were removed and the ceiling slowed down)
- **Decided by:** Tejas (request of 27 October 2026 for the shrinking board, and his amendment the same day); the details below were chosen from docs/rules.md and docs/design/

## Playtest finding and the amended decision

**This section replaces the schedule and the walls described below, which are kept as history.** Tejas playtested the first version and found two things: the rows closed too quickly, and the collapsing walls made the game too complicated to follow. He decided:

- **The collapsing walls are removed completely.** All 7 columns stay open for the whole game. That removes the `column_closed` rejection, the open-columns range in `GameState` (`firstColumn` and `lastColumn`), the wall warning and animation, and the wall step of the tutorial. The tests that belonged only to the walls were removed with them (this is the removal of a rule, not a weakened test).
- **The ceiling is slower.** It first drops after round 12 and then every 8 rounds after that (rounds 12, 20, 28 and so on), and it never goes below 4 rows. The constants are now `CEILING_FIRST_ROUND = 12`, `CEILING_EVERY = 8` and `MIN_ROWS = 4`.
- **Starting from 6 rows with a floor of 4, the ceiling drops exactly twice:** after round 12 (to 5 rows) and after round 20 (to 4 rows). Round 28 is on the schedule but changes nothing, because the board has already reached its floor. The tests say so.
- **A win stays possible for the whole game.** With 4 rows a vertical four still fits, which the old floor of 3 rows did not allow. The cost recorded below ("After round 18 no win is possible") no longer applies.
- The warning banner now has one message, "The ceiling drops after this round", and there is only one tutorial step about shrinking.
- **Migration.** Migration 12 had added the shape to saved games and had never been deployed, but a database that already ran it carries `firstColumn` and `lastColumn`. Rather than rewrite a migration, migration 13 removes those two keys from every saved game. The engine would drop them at the next round anyway; this keeps the stored state tidy and tested.

The decision that the schedule counts rounds and not seconds stands, and so do the other choices below, except where the walls are mentioned.

## Context

A simultaneous game where both players can block each other can drag on: every column fills slowly and a careful pair can play for dozens of rounds. Long games make the leaderboard's "fewest rounds" list pointless and make a friend game feel endless on a phone. The board should create urgency and stop long games without a clock the players have to watch. This touches promise 1 (the game rewards reading your opponent) and promise 2 (both screens show the same result at the same moment).

## Options

1. **A shrinking schedule based on seconds.** Simple to explain, but the engine is pure and has no clock (CLAUDE.md, rules.md "Engine contract"), rounds end early when both players have chosen so they vary in length from about two seconds to ten, and a player who is thinking cannot plan around "the board shrinks at 90 seconds".
2. **A shrinking schedule based on rounds.** The engine already counts rounds, so the schedule can be a pure function of the round count. Every player can count rounds, plan around "the ceiling drops after round 6" and see the warning one round ahead.
3. **No shrinking, a round limit instead (a draw at round N).** Stops long games but gives no urgency and no new decisions.

## Decision

Option 2, under these rules (R61 to R69 in `docs/rules.md`, U68 to U74 in `docs/design/shrinking-board.md`):

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
- On a round with a collapse the result line lists only what is still on the board (U73). A disc that landed in a square that then closed is not in the state the server sends, and adding a "last round" message to the protocol only to describe a disc that no longer exists was not worth the new surface.
- The computer knows the schedule: besides playing only open columns, when it has no winning or blocking move it avoids a disc that would land in a row or column that is about to close.

## What it costs

- **After round 18 no win is possible.** With 3 rows no vertical four fits and with 3 columns no horizontal four fits, so a game that reaches round 18 can only end as a draw by filling the open area (at most 9 pieces). This is what the numbers the request asked for do. It stops long games, but it also means rounds 18 and up are a race to fill a small board. If playtests dislike it, raise `MIN_ROWS` or `MIN_COLUMNS` to 4, which keeps wins possible.
- Pieces vanish, so a player can lose a line they built. That is the point, and the warning one round ahead lets them react.
- The win rule, the draw rule and the Earthquake rule all now depend on the current shape, which is a little more to learn. The tutorial gets one more step.

## Evidence

Unit and property tests named for R61 to R68, a migration test (S5), browser checks for the warning, the collapse, its reduced-motion version and the tutorial step, and the mutation score in `docs/testing/mutation-scores.md`.
