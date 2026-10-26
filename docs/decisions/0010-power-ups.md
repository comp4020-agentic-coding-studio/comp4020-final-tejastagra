# 0010. Power-ups: block, hide or break, never complete

- **Status:** Accepted
- **Decided by:** Tejas (request of 27 October 2026 to add the Earthquake power-up); the details below were chosen from docs/rules.md and docs/design/

## Context

The shield is the game's only power-up. It makes a crash worth something, which strengthens promise 1 (the game rewards reading your opponent). Tejas wants more of that kind of choice. The risk is a power-up that decides games by itself, which would make guessing matter less, so there needs to be a principle that every power-up must meet.

## The principle

**A power-up may block, hide or break things, but it never completes a player's own line by itself, so no power-up can guarantee a win.** A player still has to drop a disc that is part of the line. Every power-up also costs something: it uses the player's disc for the round or it is spent for the whole game.

## Options considered

| Power-up | What it does | Status | Why |
| --- | --- | --- | --- |
| **Earthquake** | Instead of a disc, the bottom row crumbles and every piece above drops one row | **Built** | It breaks lines (including your own) and changes which squares are reachable, but a line it creates never wins by itself (R13) and it costs your disc for the round |
| Trap | Mark a square so the opponent's disc landing there is lost | Considered, not built | Needs a second hidden choice, so it is a much bigger change to R21 and R22 and to the screen |
| Hidden disc | Your disc is not shown until the round after it lands | Considered, not built | Both screens must show the same result at the same moment (promise 2), and a hidden disc would break that |
| Crack | Weaken a column so the next disc there turns to rubble | Considered, not built | Close to the crash rule (R6), so it adds rules without adding a new kind of guess |
| Double drop | Drop two discs in one round | Considered, not built | It can complete a line by itself, which the principle forbids |
| Brick | Place a rubble block of your own choosing | Considered, not built | Adds a third kind of piece placement and overlaps with Earthquake and Crack |
| Freeze | Stop the opponent's choice for a round | **Rejected** | It only delays a threat. A player with two winning columns could freeze the one opponent move that blocks them, which can guarantee a win |

## Decision

Build Earthquake only, under these rules (R53 to R60 in `docs/rules.md`, U61 to U66 in `docs/design/`):

1. One Earthquake per player per game, as well as the shield, and at most one power-up per round (so the two cannot be combined).
2. Choosing it replaces the player's disc for the round. The choice is hidden until the round resolves, exactly like a column choice (R21, R22).
3. It cannot be chosen while the bottom row is empty (`nothing_to_shake`).
4. The earthquake happens first: the bottom row (discs and rubble) is removed and every piece above drops one row in its own column. Then the other player's disc, if any, drops onto the new board.
5. If both choose it, the board shakes once and no discs drop.
6. A player now wins only when a disc they dropped this round is part of a four (R13). A line made only by pieces moving never wins, but a disc dropped later can complete it. This is the rule that stops Earthquake from completing a line by itself.
7. The computer may use it when it breaks more of the human's potential lines than its own, without seeing the human's choice (R40).

## Decisions made while Tejas was away

- The engine `Choice` becomes either `{ column, shield }` (unchanged) or `{ earthquake: true }`, so every existing caller and test keeps working.
- Besides `nothing_to_shake`, the engine has two more rejection reasons: `no_earthquake` (already spent) and `one_power_up` (a choice that asks for both an Earthquake and a column or shield). The second cannot come from the screen; it protects the server from a hand-made message.
- `earthquakesLeft` follows `shieldsLeft`: a `Record<Player, boolean>`, public once it changes, never the choice before the round resolves.
- Tapping the Earthquake badge chooses it at once and locks it, like a column tap (U62), instead of arming first and confirming second: the brief's labels ("Tap to use Earthquake", armed, spent) read as one tap, and a choice is final either way (R4).
- The client does not need a new message: the snapshot already carries the new board, and an Earthquake is recognised by `earthquakesLeft` going from true to false.
- A column's fullness is checked against the board before the earthquake (R3 is unchanged), even though the earthquake would free a space. A player cannot know the other player is shaking, so the stricter check is the simpler rule.
- Games saved before this change have no `earthquakesLeft`, so a numbered migration adds it (both Earthquakes available).
- Tests and the engine code for each rule go in the same commit, because CLAUDE.md requires `pnpm check:fast` to pass at every commit and a test commit alone would fail it. The tests are still written first.

## What it costs

The win rule (R13) is now less simple: it is about discs dropped this round. The tutorial has one more step and the game screen has one more badge, which is a little more to learn on a phone. If playtests show Earthquake is rarely used or decides games, revisit its cost (for example by making it spend the shield too).

## Evidence

Unit and property tests named for R53 to R60, server tests that an Earthquake choice is not revealed (R21, R22), browser checks for the badge, the animation and the tutorial step, and the mutation score in `docs/testing/mutation-scores.md`.
