# Checks register

Every check in `spec/` and `e2e/`, the rule it protects and its status. Keep this in step with the tests. README.md's "enforced and judged" table is built from this file.

Status: **todo** (stub only), **written**, **passing**.

## How checks run in this repo

- **Course checks.** `spec/invariants.test.ts` and `spec/global-setup.ts` ship with the course. Never delete or weaken them. `spec/README.md` explains them.
- **`pnpm check`** (`scripts/check.sh`) starts its own test server on a free port with a temporary data folder, runs `pnpm typecheck`, then every `spec/**/*.test.ts` through `vitest.config.ts` against it, then deletes the folder, so it never touches `data-dev/` (check H1, correction C22). With `APP_URL` set (as CI does, against the Docker image) it runs against that app instead and starts nothing. `pnpm test` alone is the old behaviour: vitest against whatever app is at `APP_URL` (default `http://localhost:8080`). In CI it runs against the Docker image with an empty `/data`, and a failure blocks the deploy.
- **`spec/app-*.test.ts`** are app checks. They talk to the running app with real HTTP and WebSocket clients, using `inject("baseUrl")`.
- **`spec/unit-*.test.ts`** are unit checks. They need no running app. They also run alone with `pnpm check:fast`, which uses `vitest.unit.config.ts` (no global setup, so no app needed), and are what mutation testing uses.
- **`e2e/*.spec.ts`** are Playwright browser checks for phone layout. They run only with `pnpm test:e2e`, never in `pnpm check`, because CI may have no browser.
- **Manual checks** cannot be automated here, because a test cannot restart the server it is testing. They run in the multi-user test session (`docs/testing/multi-user-test-plan.md`).

## Hygiene (`spec/unit-check-isolation.test.ts`)

| ID | Claim | Status |
| --- | --- | --- |
| H1 | A test run never writes to `data-dev/`: `scripts/check.sh` points the test server at a temporary folder and removes it afterwards, and a check fails if the dev database's size or modified time changes during a run | todo |
| H2 | `scripts/check.sh` uses `APP_URL` as it is when one is given, so CI is unchanged | todo |

## Course

| ID | Claim | Status |
| --- | --- | --- |
| K1 | The app answers at `/` | shipped by course |
| K2 | `/readme/` contains every heading of README.md, in order | shipped by course |

## Engine (`spec/unit-engine-rules.test.ts`, `spec/unit-engine-properties.test.ts`)

Written in Phase 2 from `docs/rules.md`, one rule at a time.

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| R-tests | One or more tests per engine rule, named by rule ID | R1 to R17, R53 to R58, R61, R64 to R67, R69 | passing |
| P1 | Each round without an earthquake adds exactly 2, 1 or 0 pieces, as the choices dictate | R5 to R10 | passing |
| P2 | No column holds more than 6 pieces | R1 | passing |
| P3 | A shield is spent exactly when used and never comes back | R8, R9 | passing |
| P4 | The round count goes up by exactly 1 | R11 | passing |
| P5 | A game is won exactly when it has a winner | R13 to R16 | passing |
| P6 | Nothing is accepted after the game ends | R16 | passing |
| P7 | Without an earthquake, pieces never move or change | R12 | passing |
| P8 | An earthquake round removes exactly the bottom row's pieces, adds only the discs dropped, and never overfills a column | R56, R57 | passing |
| P9 | Each player uses Earthquake at most once, and it is never accepted again | R53 | passing |
| P10 | Existing pieces only ever move down by exactly one row, and only in an earthquake round | R12, R56 | passing |
| P11 | No piece ever sits above the current rows, and no column holds more than the current rows | R61, R64 | passing |
| P12 | The rows never grow and never go below 4, and equal the schedule for the round count; no column ever closes | R61, R64 | passing |
| P13 | A win stays possible for the whole game: a vertical four fits at the 4 row floor | R61 | passing |
| M1 | Mutation score of the engine is at least 85% | all engine rules | passing (97.11% after the ceiling-only shrinking board) |

## Spectating (`spec/unit-spectating.test.ts`, `spec/app-spectating.test.ts`, `e2e/spectating.spec.ts`)

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| W1 | A spectator never receives a pending column, shield, Earthquake or whether either player has chosen, in any message, before the round resolves | R72, R21, R22 | passing |
| W2 | A spectator's choice or any other action is rejected with `spectator`, and nobody else hears of it | R74 | passing |
| W3 | Friend games are never chosen, listed, counted or confirmed to exist | R71, R80 | passing |
| W4 | A spectator who joins mid-game gets a snapshot whose board matches the players' and contains no pending choice | R73 | passing |
| W5 | The watching count is correct for players and spectators as spectators join and leave | R75 | passing |
| W6 | A spectator is told the result and moves on to another game after 5 seconds | R76 | passing |
| W7 | At most 50 spectators per game and 300 per machine; a full game is skipped | R77 | passing |
| W8 | With no live game, an exhibition game starts on demand, stops with no audience and never touches the leaderboard | R78, R37 | passing |
| W9 | A spectator gets each round's result within one second of the players, and the players' result is sent first | R79, R23 | passing |
| W10 | Spectators never change round timers, abandonment, presence or forfeits | R79 | passing |
| W11 | Watchable games stay watchable across a restart (migration 14) | R71 | passing |
| E9 | Watching works at both viewports, nothing on the watching screen is interactive, the home count and the players' watcher count update, the exhibition label shows (each browser check names E9) | passing (`e2e/spectating.spec.ts`) |
| U76 to U84 | Watch live button and count, the watching screen, the exhibition label, the result card and the watcher count | `e2e/spectating.spec.ts` | passing |

## No peeking (`spec/app-no-peek.test.ts`)

N1 to N4. See the file. N6 adds: the ceiling warning carries only public information, the same on both screens (R21, R22), passing (`spec/unit-realtime-earthquake.test.ts` and the warning check in `e2e/shrinking-board.spec.ts`). N5 adds: an Earthquake choice is never revealed to the opponent before the round resolves (R21, R22, R54), passing (also `spec/unit-realtime-earthquake.test.ts`).

## Real time (`spec/app-realtime.test.ts`)

T1 to T6. See the file.

## Modes, identity and leaderboard (`spec/app-lobby.test.ts`, `spec/app-identity.test.ts`, `spec/app-leaderboard.test.ts`)

L1 to L5, I1 to I6, B1 to B5. See the files.

## Computer, persistence and logging (`spec/unit-computer.test.ts`, `spec/unit-persistence.test.ts`, `spec/unit-logging.test.ts`)

C1 to C7, S1 to S3, G1 to G3. See the files. C9 adds: the computer plays only open columns and avoids squares about to close (R68), passing. C8 adds: the computer may use Earthquake and never sees the human's choice (R60), passing. S5 adds: a game saved before the shrinking board is upgraded by migration 12 with the full 7 by 6 shape (R61), passing; S6 adds: migration 13 removes the open-columns range that migration 12 had added (ADR 0011), passing; S7 adds: migration 14 adds the watchable mark (R71), passing. S4 adds: a game saved before Earthquake is upgraded by migration 11 with both Earthquakes available (R53), passing.

## Phone layout (`e2e/`, Playwright, `pnpm test:e2e`)

| ID | Claim | Status |
| --- | --- | --- |
| E1 | Two browser contexts with no shared cookies play a full game through a friend link, one at each marking viewport | passing (`e2e/e1-full-game.spec.ts`) |
| E4 | Every screen in `docs/design.md` has no sideways scroll at 320 px, 390 px and laptop width | passing (`e2e/e4-no-sideways-scroll.spec.ts`) |
| E5 | Every tap target is at least 44 x 44 px at the phone viewport | passing (`e2e/e5-tap-targets.spec.ts`) |
| E7 | The Earthquake badge, its states, help, the animation, its reduced-motion version and the tutorial step work at the phone viewport | passing (`e2e/earthquake.spec.ts`) |
| E8 | The collapse warning, the flashing cells, the collapse to rock, its reduced-motion version and the tutorial step work at the phone viewport | passing (`e2e/shrinking-board.spec.ts`) |
| E6 | Every feature (computer, friend link, code entry, quick match, sign up, leaderboard, /readme/) completes at the phone viewport | passing (`e2e/e6-features.spec.ts`) |

## Design and tutorial (docs/design/)

| IDs | Claim | Where | Status |
| --- | --- | --- | --- |
| U1 to U9, U30, U49, U50 | One theme file; no colour, font, outline, radius or duration outside it; contrast; reduced motion; no preview or developer text; `/style-preview` only in development | `spec/unit-theme.test.ts`, `spec/app-screens.test.ts` | passing |
| R47 to R50 | The tutorial is shown once, saved with the player, replayable, and never touches the leaderboard | `spec/app-tutorial.test.ts` | passing |
| U10 to U18 | Play on the board by tap, hover and keyboard; the shield badge | `e2e/design.spec.ts` | passing |
| U19 to U30 | Reveal within one second, end popups, reduced motion | `e2e/design.spec.ts` | passing |
| U31 to U40 | Home menu content and the phone and laptop layouts | `e2e/design.spec.ts` | passing |
| U41 to U48 | Tutorial steps, skip and replay | `e2e/design.spec.ts` | passing |
| U68, U69 | The warning one round before a collapse and the flashing cells | `e2e/shrinking-board.spec.ts` | passing |
| U70, U71, U73 | The collapse to rock within one second, the rock look, its reduced-motion version and the result line | `e2e/shrinking-board.spec.ts` | passing |
| U72 | A full column cannot be chosen; no column is ever closed | `e2e/shrinking-board.spec.ts` | passing |
| U74 | The tutorial's shrinking board step | `e2e/shrinking-board.spec.ts` | passing |
| U61 to U64 | The Earthquake badge: states, exclusive with the shield, help, opponent panel shows availability only | `e2e/earthquake.spec.ts` | passing |
| U65, U66 | The earthquake animation within one second, its reduced-motion version and the result line | `e2e/earthquake.spec.ts` | passing |
| U67 | The tutorial's Earthquake step | `e2e/earthquake.spec.ts` | passing |
| R4, R51, R52 | Locked choices, nothing starts until both are present, the computer thinks | `spec/unit-realtime-timer.test.ts`, `spec/unit-realtime-computer.test.ts` | passing |
| U10 to U13, U54 to U60 | Column highlight, waiting card, names, centred game, 560px limit | `e2e/design.spec.ts` | todo |
| Screenshots | Approved look at both viewports | `e2e/design.spec.ts` | passing |
| Judged | It feels like a cheerful navy toy game and is clearly its own; a newcomer understands crashes and the shield after the tutorial; the reveal is exciting | `/style-preview` approval by Tejas (given 27 October 2026), then playtests in `docs/playtests.md` | judged |

## Manual (multi-user test session)

| ID | Claim | Rule | Scenario |
| --- | --- | --- | --- |
| X1 | After a machine restart mid-game, both players reconnect and continue from the last round | R26 | h |
| X2 | Behaviour with two machines is recorded | ADR 0005 | g |
| X3 | Closing a tab and returning on a real phone resumes the game | R27 | e |

## Judged, not tested

| Claim | How it is judged |
| --- | --- |
| The game rewards reading your opponent (promise 1) | Playtests in `docs/playtests.md` |
| A newcomer understands crashes and shields within one game | Playtests |
| The design feels clean and modern | Playtests and crit feedback |
