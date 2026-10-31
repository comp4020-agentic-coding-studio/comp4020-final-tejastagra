# Checks register

Every check in `spec/` and `e2e/`, the rule it protects and its status. Keep this in step with the tests. README.md's "enforced and judged" table is built from this file.

Status: **todo** (stub only), **written**, **passing**.

## How checks run in this repo

- **Course checks.** `spec/invariants.test.ts` and `spec/global-setup.ts` ship with the course. Never delete or weaken them. `spec/README.md` explains them.
- **`pnpm check`** (`scripts/check.sh`) starts its own test server on a free port with a temporary data folder, runs `pnpm typecheck`, then every `spec/**/*.test.ts` through `vitest.config.ts` against it, then deletes the folder, so it never touches `data-dev/` (check H1, correction C22). With `APP_URL` set (as CI does, against the Docker image) it runs against that app instead and starts nothing. `pnpm test:e2e` (`scripts/e2e.sh`) does the same for the browser checks. `pnpm test` alone is the old behaviour: vitest against whatever app is at `APP_URL` (default `http://localhost:8080`). In CI it runs against the Docker image with an empty `/data`, and a failure blocks the deploy.
- **`spec/app-account.test.ts`** runs the admin's password reset script against the app under test: `pnpm check` gives it the database (`CHECK_DB_PATH`), and a run against Docker or another app sets `CHECK_RESET_COMMAND` (CI sets it to `docker exec app node scripts/admin-reset-password.ts`). Without either it fails and says what to set.
- **`spec/app-*.test.ts`** are app checks. They talk to the running app with real HTTP and WebSocket clients, using `inject("baseUrl")`.
- **`spec/unit-*.test.ts`** are unit checks. They need no running app. They also run alone with `pnpm check:fast`, which uses `vitest.unit.config.ts` (no global setup, so no app needed), and are what mutation testing uses.
- **`e2e/*.spec.ts`** are Playwright browser checks for phone layout. They run only with `pnpm test:e2e`, never in `pnpm check`, because CI may have no browser.
- **Manual checks** cannot be automated here, because a test cannot restart the server it is testing. They run in the multi-user test session (`docs/testing/multi-user-test-plan.md`).

## Layout and polish (`e2e/layout.spec.ts`, `/visual-qa`)

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| Q1 | Nothing behind a popup moves by more than 1px when it opens or closes; every popup is a dialog with a close button and Escape | `docs/design/qa-checklist.md` | todo |
| Q2 | Every button label is one line at every viewport | | todo |
| Q3 | No card is wider than 480px (forms and messages) or 560px (lists) | | todo |
| Q4 | At least 16px between stacked cards and buttons | | todo |
| Q5 | Every heading's left edge matches its content's within 4px | | todo |
| Q6 | Each page's main column is centred within 16px | | todo |
| Q7 | The nickname editor opens prefilled | | todo |
| Q8 | A guest never sees Sign out; a signed-in player never sees sign-in or sign-up | | todo |
| Q9 | Every screen except home has a Home, Cancel or Leave button | | todo |
| Q10, Q11 | Empty states explain themselves; no page looks plain | `/visual-qa` (judged by looking) | judged |
| Q12 | On every screen except home, the header bar's Home button is inside the viewport on load at 320, 390 and 1366 wide, and the bar is the first thing on the page | `docs/design/qa-checklist.md` Q12 | passing |
| Q13 | On the game screen and the friend waiting screen the board's centre is within 16px of the page's centre at 320, 390 and 1366 wide | Q13 | passing |
| U33 | The home menu buttons have no subtext line under them (changed 29 October 2026) | `e2e/layout.spec.ts` | passing |
| U98 | Nothing on the quick match screen moves by more than 1px when the live count arrives | `e2e/layout.spec.ts` | passing |
| Q14 | A player's colour and marker are the same on both players' screens and a spectator's (`e2e/player-colours.spec.ts`) | Q14 | passing |
| Q18 | Every popup (dialogs, the end popup) has 16px between its edge and its content, 16px between side-by-side buttons, 12px between stacked buttons and 12px between a label (with its icon) and its button's edge | `e2e/layout.spec.ts` | passing |
| Q19 | With the end popup open, the result line under the power-ups is not visible | `e2e/layout.spec.ts` | passing |
| Q20 | A name takes at most two lines and its tag stays whole inside its card at 320 and 390 | `e2e/layout.spec.ts` | passing |
| Q21, U91, U92 | With the visible area 300px tall (an open keyboard) the focused field and the primary button of each form popup are fully visible at 320 and 390; Enter in a username moves to the password and Enter in the last field submits; the autocomplete and enterkeyhint attributes | `e2e/layout.spec.ts` | passing |
| Q22, U153 to U155 | Each avatar in a game and on the watching screen is the colour of its player's discs with a ring or cross badge, the same on both players' screens and the spectator's; no VS badge on a phone; the header's Round is 16px from the edge; nothing in the header or versus bar overlaps or wraps past two lines | `e2e/player-colours.spec.ts`, `e2e/layout.spec.ts` | passing |
| Q23, U32, U35, U35a | The home player card is taller than a menu button with 16px padding, the gaps are equal, round labels are 8px under their circles, there is no Top players and no Nickname saved. message, and on a laptop the right column is centred on the left within 24px | `e2e/layout.spec.ts` | passing |
| Q24, U156 | The waiting screen has Cancel game and no Home button; the card's edges are inside the board's (or the board is dimmed right back when it shows round the card) at 320, 390 and 1366 | `e2e/layout.spec.ts` | passing |
| R35, U96, U100 | Quick match has Home and no Cancel button; Home returns to the home screen and a second player arriving afterwards is not paired with the one who left; leaving by the browser's back button also leaves the queue; a ticket that is left is never paired | `e2e/layout.spec.ts`, `spec/unit-matchmaker.test.ts`, `spec/app-lobby.test.ts` | passing |
| Q25, U157, U159 | The ghost disc never overlaps any text, card, badge or button on the game screen or in any tutorial step; gaps match the fixed order within 4px; nothing moves when the disc appears | `e2e/layout.spec.ts` | passing |
| Q26, U158 | On a laptop the versus bar, board and power-up row share a width, the board is at least 60% of the screen height, the cards and the power-up buttons match | `e2e/layout.spec.ts`, `e2e/design.spec.ts` | passing |
| Q27, U52a, U52b | Every popup and overlay uses `--backdrop`, its card uses `--outline-popup` and `--shadow-popup`, the card against the backdrop is at least 1.5:1 and its text 4.5:1; `--scrim` is gone; `/visual-qa` shows each overlay | `spec/unit-theme.test.ts`, `e2e/layout.spec.ts`, `/visual-qa` | todo |
| Q15 | The game screen, every tutorial step and every popup fit one screen with no vertical scrolling at 390 x 844, 1366 x 768 and 320 x 568 | `e2e/layout.spec.ts` | passing |
| Q16 | No button or caption's box intersects the board on the game screen or in the tutorial | `e2e/layout.spec.ts` | passing |
| Q17 | On the home screen the gaps between the player card and each menu button are equal within 2px, on a phone and a laptop | `e2e/layout.spec.ts` | passing |

## Hygiene (`spec/unit-check-isolation.test.ts`)

| ID | Claim | Status |
| --- | --- | --- |
| H1 | A test run never writes to `data-dev/`: `scripts/check.sh` points the test server at a temporary folder and removes it afterwards, and a check fails if the dev database's size or modified time changes during a run | passing |
| H2 | `scripts/check.sh` uses `APP_URL` as it is when one is given, so CI is unchanged | passing |

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
| W3 | Link games are never chosen by Watch live, listed or counted; a computer game can never be watched and is answered like a code that does not exist | R71, R80 | todo |
| W4 | A spectator who joins mid-game gets a snapshot whose board matches the players' and contains no pending choice | R73 | passing |
| W5 | The watching count is correct for players and spectators as spectators join and leave | R75 | passing |
| W6 | A spectator is told the result and moves on to another game after 5 seconds | R76 | passing |
| W7 | At most 50 spectators per game and 300 per machine; a full game is skipped | R77 | passing |
| W8 | *Removed 28 October 2026 (R78): there is no exhibition game.* With no live quick match game Watch live says "No live games right now" and offers Quick match and Home | R70 | todo |
| W9 | A spectator gets each round's result within one second of the players, and the players' result is sent first | R79, R23 | passing |
| W10 | Spectators never change round timers, abandonment, presence or forfeits | R79 | passing |
| W11 | Watchable games stay watchable across a restart (migration 14) | R71 | passing |
| W12 | The first two arrivals at a link game play and every later arrival watches; two simultaneous arrivals for the last seat give exactly one player and one spectator | R36 | passing |
| W13 | A spectator cannot take a seat during the 30 second reconnection window, nor after a restart | R36, R27 | passing |
| W14 | A browser check: the third person to open a link becomes a spectator and sees the notice, on one line at 320 | R36, U92 | passing |
| E9 | Watching works at both viewports, nothing on the watching screen is interactive, the home count and the players' watcher count update, the exhibition label shows (each browser check names E9) | passing (`e2e/spectating.spec.ts`) |
| U76 to U84 | Watch live button and count, the watching screen, the exhibition label, the result card and the watcher count | `e2e/spectating.spec.ts` | passing |

## Rematch and leaving (`spec/unit-realtime-rematch.test.ts`, `spec/unit-realtime-leave.test.ts`, `e2e/rematch.spec.ts`)

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| RM1 | Leaving a game being played forfeits it at once, saved first; a game that never started or is against the computer is abandoned; a wrong token does nothing; a failed save leaves the game as it was | R81, R25, R32 | passing |
| RM2 | A rematch against a person starts only when both have asked; a request about a game still being played, without the token, or twice, changes nothing | R82, R32 | passing |
| RM3 | An offer expires after 30 seconds and is withdrawn when either leaves or drops; nothing starts into an empty seat; a failed archive tells both | R83, R25 | passing |
| RM4 | A rematch keeps the code, the seats and the spectators, is archived as `<code>#<n>`, counts as a separate game for the leaderboard, and starts fresh (all rows open, power-ups unspent) | R84, R85, R38 | passing |
| RM5 | A computer game rematches at once under the same code and never touches the leaderboard | R82, R37 | passing |
| RM6 | Browser: both players tap Play again and a new game starts on the same link; the other leaving shows "<opponent> left"; a spectator stays and sees the new game | U109 to U113 | passing |

## Accounts, history and the leaderboard (`spec/unit-accounts.test.ts`, `spec/app-account.test.ts`, `spec/unit-leaderboard.test.ts`, `spec/app-leaderboard.test.ts`, `e2e/account.spec.ts`, `e2e/leaderboard.spec.ts`)

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| AC1 | The admin reset sets a random 12 character temporary password from an alphabet without look-alikes, stores only its hash, ends the account's sessions, marks must change, and logs the username only; an unknown username changes nothing | R86, R30 | passing |
| AC2 | A reset password signs in once and demands a new one: everything else is refused with 403, over HTTP and over a game connection; choosing one clears the mark and the temporary password stops working | R87 | passing |
| AC3 | Changing a password needs the current one, 8 characters or more, and ends the account's other sessions but not this device's; a thief's open connection is closed at its next action | R87 | passing |
| AC4 | Five failed sign-ins for one username in 15 minutes block it with the given words, per username, the same for unknown names; a flood of names cannot unblock a victim; memory is capped | R88 | passing |
| AC5 | Signing in moves the guest's games and live seats to the account, and the guest's open connection goes on | R89 | passing |
| AC6 | Stats and history are counted from saved games, split by people and the computer, win rate over finished games, abandoned games shown but not counted, last 20 newest first, only the caller's, no ids | R90, R91 | passing |
| AC7 | Migration 18 upgrades an old database once; the reset works while the server process has the database open (two processes) | R87 | passing |
| AC8 | No response and no log line from any account call contains a password, a temporary password or a hash | R30 | passing |
| LB1 | `GET /api/leaderboard` carries the asker's own line only, null for no session, never an id; a full game puts the winner on both lists | R92, R38, R39 | passing |
| LB3 | The page shows at most 10 players: the podium holds exactly the top 3 (fewer if fewer players) and the list starts at 4 and has at most 7 rows, given 15 players | R99, U131b | passing (`e2e/leaderboard.spec.ts`) |
| LB2 | The page: tabs, podium of three, compact rows 12px apart, your row highlighted with a tag, Your best under each list, an empty state that explains itself, an error with Try again | U123 to U130 | passing |

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
| R47, R48, R100, U136, U146 | The seat check says player, spectator and ended; an account with a finished game or a seen mark is never offered the tutorial and a guest's mark is copied to the account on sign-in; migration 22; the tutorial never opens for a third person at a friend's link or for an ended game or for an experienced account in a fresh browser; step 10's caption and illustration | `spec/app-tutorial.test.ts`, `spec/unit-accounts.test.ts`, `e2e/tutorial.spec.ts`, `e2e/design.spec.ts` | passing |
| R47, U136 to U147 | The tutorial never opens on home load or for Quick match or a spectator; it opens before the first game from Play the computer, Play a friend, Join with a code and a game link, once per browser (local storage); finishing or skipping starts the chosen match; every one of the 11 steps is reachable with its progress line; How to play replays it and starts nothing | `e2e/tutorial.spec.ts` | passing |
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
| R98 | A game with 0 rounds is never in a player's history or stats, nor a forfeit at round 0 on the leaderboard; migration 21 deletes such games that are over (and their archives) and keeps one still waiting; an opponent with no known person is "A guest" | `spec/unit-accounts.test.ts`, `spec/unit-leaderboard.test.ts`, `spec/unit-persistence.test.ts` | passing |
| R93 to R96 | The server decides colours at random and saves them; both players and spectators are sent the same colours; colours vary across many games; a computer game's too; a rematch swaps them; migrations 19 and 20 give old games A red and B yellow | `spec/unit-player-colours.test.ts`, `spec/unit-persistence.test.ts` | passing |
| R97 | A 3 second countdown starts when both are present; no round, timer or computer choice runs during it; a choice in it is refused with `not_started`; round 1 starts when it ends with `started`; a reconnect is told the time left; again after a rematch; spectators are never sent it | `spec/unit-realtime-countdown.test.ts` | passing |
| Q14, U133, U134 | In a friend game both screens and a spectator's show the same seat in the same colour and marker, and each player is told "You are Red" or "You are Yellow" | `e2e/player-colours.spec.ts` | passing |
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
