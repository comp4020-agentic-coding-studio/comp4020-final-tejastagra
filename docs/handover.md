# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## The large fix list of 28 and 29 October 2026 (done, ready to deploy)

Seven parts and a finish, each change as harness first (rules, design, ADR, `spec/CHECKS.md`), then tests, then code, one logical commit at a time. **Never pushed or deployed.** I never touched your dev server on port 8080 (`pnpm check`, `pnpm test:e2e` and `/visual-qa` each start their own server on a free port with a temporary data folder, and delete it). The reviewer ran on every server change, and the design-reviewer and phone-tester on every screen change; each finding they made has a test that I saw fail without its fix.

### The commits, in order

| Commit | Part | What it did |
| --- | --- | --- |
| `6830c1f` `0b7dce9` `fb4487b` | 1 | `pnpm check` and `pnpm test:e2e` run their own test server with a temporary data folder and never write to `data-dev/`; a check that fails if they do (correction C22) |
| `500bfe0` `b5c2dad` | 1 | The QA checklist Q1 to Q11, the popup spec, `/visual-qa` (command, `scripts/visual-qa.sh`, `scripts/visual-qa.ts`) and the layout rules in CLAUDE.md |
| `164c270` | 2 | Rules first: link games seat two and the rest watch; no exhibition game; R36 replaced |
| `9a633c7` | 2 | Link games (creator is player 1, first other is player 2, everyone after watches, up to 50), Watch live shows quick match games only, computer games never watched, the exhibition game removed (corrections C23) |
| `9ea857d` | 3 | The tagline is "Four in a row, with a twist." everywhere |
| `105cc1a` | 3 | Nickname and code popups (the new popup component `src/client/dialog.ts`), one line of subtext under each home button |
| `13f6c20` | 3 | Quick match redesigned: header, one compact card with animated discs, live count, the computer offer inside the card after 20 seconds, Cancel under it |
| `5ac376c` | 4 | The keyboard hint line is gone; the keys are written once, in the last How to play step |
| `d1e80af` | 4 | Rule R81 and the server: Leave game forfeits at once, saved first, with the reviewer's save-failure retry |
| `463d68d` | 4 | Power-up rows with info popups, "Playing with <opponent>", Leave game with its popup, the centred waiting card with Cancel game, end popup buttons on one line (correction C24) |
| `7956c32` | 5 | Rematch: rules R82 to R85, `rematch.md`, archive as `<code>#<n>`, spectators stay, bounded memory, browser checks with two contexts |
| `0c89c93` | 6 and 7 | ADR 0013, rules R30 and R86 to R92, `scripts/admin-reset-password.ts`, forced change, change password, sign-in limit, history and stats, the account page, the leaderboard page, `e2e/layout.spec.ts` (corrections C25 to C27). One commit because the account and leaderboard pages share `screens.ts` and `components.css` and could not be split without rewriting hunks |
| `0ccde3a` | finish | `/visual-qa` run over every screen: six defects found by looking and fixed, 45 states covered (correction C28) |
| `c6d7e45` | finish | 32px between the icon row and Top players, with a check |

### Rule changes

R29 and R30 (guest history moves into the account; passwords at least 8 characters, never in plain text, a response or a log); R36 replaced and R70 to R80 changed for link games and Watch live (R71, R77 and R78 removed or reworded; the exhibition exception to R25 is gone); **new R81** (Leave game), **R82 to R85** (rematch), **R86 to R89** (admin reset, forced change, sign-in limit, guest history into the account), **R90 and R91** (stats and history), **R92** (the leaderboard says who is asking). New design files: `account.md` (U114 to U122), `leaderboard.md` (U123 to U130), `quick-match.md` (U96 to U101), `rematch.md` (U109 to U113), `qa-checklist.md`, `popups.md`; game-screen U102 to U108; U31 to U33b on the home screen. New ADR **0013** (password reset by the admin) and the amendment of ADR 0012. **Migrations 15 to 18** (kind, creator, must change), each with an old-schema test. `docs/admin.md` is new.

### Corrections added: C22 to C28

C22 `pnpm check` wrote to the dev database; C23 link seats for people with no session, and a finished game answered as unwatchable; C24 a screenshot baseline that depended on other checks; C25 a popup that went back to the wrong place, and a quadratic limiter; C26 sessions that closed their own connection, a reset that could hit a locked database, tests that proved nothing; C27 a hover mistaken for a layout shift, a stale screenshot, and browser checks sharing one queue; C28 six things only looking at screenshots found.

### Decisions I made while you were away

- **Layout spec kept as a worklist until green**, then committed with Part 6 (72 checks, every screen at 320, 390 and 1366, passing three runs in a row).
- **A link game's seat A is reserved for its creator by player id**, saved with the game. A visitor who opens a page or makes a link game with no session is given a nameless guest session (ADR 0012), so seats can always be named. A raw client with no cookie at all holds a seat only in memory: after a restart its seat looks free until its real owner returns. Browsers always get the cookie from the page.
- **A visitor who names a seat without proof gets "game full"**, not a spectator place, so a guess learns nothing (R32).
- **Old games:** unmarked games became link games (never in Watch live); old computer games became never-watchable.
- **A finished game stays known for 30 minutes** (a rematch can start, a late visitor sees the result), then it is forgotten; the maps cannot grow without bound.
- **A rematch is not started into an empty seat**: if a player who asked has dropped, the one still there is told "left". Home and Leave from the end popup withdraw the offer. There is no separate Cancel while waiting (Home does it).
- **Leave game, with nobody joined or against the computer, ends the game as abandoned**, never deleted (you asked to be told before any data is deleted).
- **The forced change needs only the new password** (the sign-in already proved the temporary one), so the page never holds it and a reload shows the popup again. A session that must change its password does nothing over a game connection either.
- **Sessions end connections at their next action**, not instantly: a reset is run by the admin's script in another process, so there is no event to react to. A stolen cookie with an open socket cannot keep playing; **signing out in another tab also stops a connection left open there** (my call, recorded in R87).
- **A blocked username is never evicted** from the limiter's memory, and a full memory of blocked names tracks no new name. `openDb` now waits up to 5 seconds on a busy database, because the admin's script opens the file the server has open.
- **The reset script refuses a missing database** and never creates one; on a laptop it needs `RUBBLE_DB_PATH`.
- **The banner on the watching screen shows nicknames without tags, and at 320px without the word "Watching"** (still read out), so two ordinary names fit one line; the tags are in the panels below.
- **The "Waiting" rematch state wraps** the opponent's name and tag onto two or three lines at 320px rather than cutting it.
- **Both `spec/quick-lock.ts` and `e2e/quick-lock.ts`** serialise any check that uses Quick match, because it is one queue for the whole app and test files run in parallel.
- **The Dockerfile, `checks.yml` and the layout of `scripts/` changed:** the admin script is copied into the image; CI sets `CHECK_RESET_COMMAND` so the reset runs inside the container as it does on Fly. Machine size, `/data`, the port and the shipped checks are untouched. In `spec/unit-realtime-forfeit.test.ts` the "no message after the grace period" check now allows one specified message (`rematch_ended` with reason `left`) and still forbids a forfeit `game_over`; the rule (R83) was changed first. Three expectations that compared an exact object shape (`nickname` on the public player, `you` on the leaderboard) gained their new field. Tell me if you want the forfeit test stricter.

### What still needs you

- **Deploy.** Nothing is pushed. `docker build` succeeded and the image served `/` and `/readme/` with an empty `/data`; `pnpm check` also passed against that image with the reset run inside it (456 checks), and I removed the container and image afterwards.
- **A password reset needs you to read `docs/admin.md`** and to receive the email at game@tejastagra.com. The command is `mise exec -- flyctl ssh console -a comp4020-final-tejastagra -C "node scripts/admin-reset-password.ts <username>"`. I did not run it against Fly.
- **A flake I could not fully explain:** one `pnpm check` run in about thirty failed a check that uses the Quick match queue while two review agents were loading the machine, and one run had 13 failures that passed on the next run (the server not up in time while the previous run shut down). Both were before I added the locks or after a back-to-back start; none since in more than ten clean runs. `spectating` "a player leaves and does not return" takes 31 real seconds and is the most load-sensitive browser check.
- **The mutation score** was last measured before this list (97.11%). I did not rerun Stryker on the engine, which I did not change.
- **Not done by choice:** the end popup's side-by-side buttons are 8px apart (Q4 speaks of stacked ones); a forfeit in the history says "0 rounds" when the game never played one, which is true; `README.md`, `PROCESS.md` and the reflections are untouched, and `pnpm check:evidence` still fails only for the PROCESS.md template, as expected.
- **At 320 x 568 the Leave game button is below the first screen** (the board and timer keep it); it is reached by scrolling.

**Checks at the end:** `pnpm check:fast` 368; `pnpm check` 456 passed and 3 todo, twice in a row and once against the Docker image; `pnpm test:e2e` 243 passed, none skipped; `/visual-qa` 135 screenshots (45 states by 3 sizes), all looked at.

## Slower ceiling, no walls, and spectating of 27 October 2026 (done, ready to deploy)

Two changes in the order Tejas gave them, each as harness first (rules, design, ADR, `spec/CHECKS.md`), then tests, then code. Never pushed or deployed. There is no `/visual-qa` skill or command in this repo or among the available skills, so I did the equivalent by hand: real screenshots of every changed screen at 320, 390 and 1366 wide, and the design-reviewer and phone-tester on every screen change.

### Part A: a slower ceiling and no walls

| Commit | What it did |
| --- | --- |
| `4720892` | ADR 0011 amended with the playtest finding and the decision; R61 now drops the ceiling after rounds 12 and 20 and never below 4 rows; R62 and R63 retired; `column_closed`, `firstColumn` and `lastColumn` removed from the contract |
| `2f8e30c` | Design: one banner, one ceiling animation, one tutorial step, no closed columns |
| `b6b5020` | Engine, computer, migration 13 (removes the open-columns range from saved games), client and tests. The wall-only tests were removed with the rule; the rest were rewritten for one ceiling. Five deliberate faults (a drop a round early, every 6 rounds, a floor of 3, an off-by-one, a warning a round late) each fail several tests |
| `7715a34` | A bolt on the banner and stale wording from the walls |

**Constants:** `CEILING_FIRST_ROUND = 12`, `CEILING_EVERY = 8`, `MIN_ROWS = 4`. From 6 rows the ceiling drops exactly twice (after rounds 12 and 20); round 28 is on the schedule and changes nothing. **A win stays possible for the whole game** (a vertical four fits at 4 rows, property P13), so the old cost "after round 18 nobody can win" no longer applies. Removed: R62, R63, `column_closed`, the wall warning, animation and tutorial step. R62 and R63 numbers are retired, not reused.

### Part B: spectating

| Commit | What it did |
| --- | --- |
| `d19df40` | ADR 0012 (supersedes D3) and rules R70 to R80 with the spectator messages; R21, R22, R23, R24, R36 extended |
| `cdb4f9a` | Logging: `spectate_join`, `spectate_leave`, `spectate_move` |
| `c688e5a` | Design: `docs/design/spectating.md` (U76 to U84) |
| `acff4ce` | Server: `src/server/spectators.ts`, wiring in `realtime.ts`, migration 14 (the watchable mark), `/api/live`, the exhibition game, caps and flood limits, 36 unit and 7 app checks |
| `e90b55b` | Screen: Watch live button, `/watch`, the watcher count; `e2e/spectating.spec.ts` |
| `965c54b` | The live count as a corner badge; a tidier 320px watching screen |
| `5b48822` | A finished exhibition game stays for its watchers; cleanup; no skipped check |
| `a76c237` | The spectating app checks name their own games and own addresses |
| `608419b` | Mutation score recorded (97.11%) |

**What was built:** "Watch live" on the home screen with a live count badge; `/watch` (the game screen with nothing to act on: no columns, badges, ghost disc or timer); `/watch?game=CODE` for one exact game; a "N watching" count on the players' screen; the result card with a 5 second count down; an exhibition game of two computers when nothing is live. Only quick match and computer games can be watched; a friend game is answered exactly like a code that does not exist.

**Decisions I made while Tejas was away** (all in ADR 0012 or `docs/design/spectating.md`):
- A spectator is not a seat: it never gets a seat token and never touches presence, timers, abandonment, forfeits or the leaderboard. `spectators.ts` is handed only public state, never the pending choices, so a pending choice cannot reach a spectator by any path; spectators are never sent `opponent_ready`.
- A forfeit or abandonment is not an engine status, so spectators are told with a separate `ended` message, after it is saved.
- Caps: 50 per game, **300 on the whole machine** (a number I chose for one 256 MB machine), 10 asks to watch per 10 seconds per client address, a slow reader is closed at 256 KB waiting, `/api/live` limited to 60 a minute per address. All are named constants.
- Quick match games made before migration 14 are not watchable (they cannot be told from friend games, so it errs towards privacy); computer games always are.
- The exhibition game is held only in memory, never saved (the one exception to R25, stated in the rules), never counted live, and stops when its last watcher leaves.
- The players' watcher count shows only the number with an eye icon, and "watching" is visually hidden text, because the words did not fit at 320px.
- The icon row on the home screen is now a grid (five buttons on one row from 380px; three and two below), because a fifth button made the flex row leave an orphan.

**Checks at the end:** `pnpm check` 356 passed and 3 todo, **twice in a row against a Docker image with an empty `/data`** and on the dev server; `pnpm check:fast` 294; `pnpm test:e2e` 119 browser checks against that image, none skipped; mutation score 97.11%. The image built and served `/`, `/readme/`, `/theme.css` and `/watch` with an empty `/data`, `/style-preview` 404.

**Known problems, for Tejas:**
- **An old leaderboard check flakes on the dev database** (`app-leaderboard` B2, about one run in fifteen). Cause: `/api/leaderboard` caps `limit` at 1000 and `data-dev/` now holds 5286 games and over 1000 one-win players, so a new winner is sometimes past the end of the list. It never happens on a fresh database (0 failures in 65 runs; clean Docker image passed twice) and cannot happen in CI. I did not change the check or the endpoint. Decide: delete `data-dev/` (it is gitignored), raise the cap, or rewrite the check. Correction C21.
- **The home screen at 320 x 568 scrolls more:** the icon row's second row (Account, About) is below the fold, and the first row's labels are cut by about 4px. It was partly below the fold before; no rule on the first screen names it, and nothing scrolls sideways.
- **360 x 640 is not on one screen** for the game, watching or home screens. It is not a marking viewport.
- With the widest nicknames at 320 x 568 the result line is below the fold on the game screen; board, timer, badges and names fit.
- The Earthquake animation unlocks the next round after it plays (about 450ms), where the ceiling drop unlocks first. A tap in that half second is swallowed. Not fixed.
- "Collapse" still appears in internal names (`--ms-collapse`, comments). Not player-visible, not in the glossary, left alone.
- The abandonment path closes slow spectators with the same helper as the forfeit path, but only the forfeit path has its own test.
- A game that was in progress at deploy time and had no `rows` takes the new ceiling at its next resolved round (R69); a watching spectator's screen is not touched by migrations.

## Shrinking board of 27 October 2026 (done; amended above: the walls are gone and the ceiling is slower)

Tejas's request, built in the order the harness asks: ADR and rules, then design docs, then tests, then code. Never pushed or deployed. Tejas's message was cut off in the middle of step 7 ("Update docs/handover.md with the commits, rule"), so I took the rest to mean the commits, the rule changes and the decisions, as for the Earthquake.

| Commit | What it did |
| --- | --- |
| `f2f1038` | ADR 0011 (why the schedule is in rounds, not seconds, and that the numbers are tunable constants) and rules R61 to R68, with R1, R2, R3, R12, R15 and R41 changed and the glossary words Ceiling, Walls, Rock and Open area |
| `3d0912b` | Design: new `docs/design/shrinking-board.md` (U68 to U74), U23b, U44b, the rock tokens and checks registered as todo |
| `e3ad172` | Rules: R69 (a game's shape moves to the schedule at each resolved round, never backwards) and `collapseDue` in the contract |
| `9f611ad` | Theme: `--rock`, `--rock-dark` and the collapse durations |
| `5b89286` | Engine: `shapeAt`, `collapseDue`, `rows`, `firstColumn`, `lastColumn`, `column_closed`, the collapse after the result is decided, draw on a full open area; the computer plays the open area and avoids squares about to close; migration 12; unit and property tests |
| `48b8fcd` | Screen: warning banner, flashing cells, rock, the collapse animation, closed columns, result line, the tutorial step, `e2e/shrinking-board.spec.ts` |
| `561c2d1` | Correction C19 |
| `6315d4a` | Two tests for gaps mutation testing found; mutation score recorded (97.61%) |

**Rule changes:** new R61 to R69; R1, R2, R3, R12, R15 and R41 changed. **Design IDs:** U68 to U75, U23b, U44b. **ADR:** 0011. **Correction:** C19. **Migration:** 12 (a game saved before the change gets the full 7 by 6 shape and takes the shape for its round count at its next resolved round, R69).

**The schedule** (named constants in `src/engine/index.ts`, first guesses for playtests to tune; change `docs/rules.md` first): ceiling after rounds 6, 12 and 18 down to 3 rows; walls after rounds 12 and 18 down to 3 columns.

**What the numbers you asked for mean, which you should look at:** with 3 rows no vertical four fits and with 3 columns no horizontal four fits, so **from round 18 on nobody can win**: the only way out is a draw by filling the 3 by 3 open area (at most 9 pieces), or a forfeit or abandonment. It does stop long games. If playtests dislike it, set `MIN_ROWS` or `MIN_COLUMNS` to 4, which keeps wins possible. It is in ADR 0011 under "What it costs".

**Decisions I made while Tejas was away** (also in ADR 0011 or `docs/design/shrinking-board.md`):
- `GameState` gains `rows`, `firstColumn` and `lastColumn`, derived only from the round count by `shapeAt`, so the engine stays pure. The browser imports `shapeAt` and `collapseDue` from the engine, only to show the warning (R20).
- A game that ends in a round does not collapse in that round, so the winning line stays on the board for the highlight.
- The board on screen is always 7 by 6. Closed cells turn into rock, so the phone layout cannot change.
- In a round with a collapse the result line lists only what is still on the board (U73): a disc that landed in a square that then closed is not in the state the server sends, and a new "last round" message was not worth adding.
- The banner for a ceiling drop and a wall collapse in the same round reads "Ceiling and walls close after this round" (you gave the wording for the two single cases only). The longer sentence wrapped at 320px and pushed the timer off the screen.
- At 320px the banner shares the round line's row in smaller type, so it costs no height.
- The opponent's panel now shows its shield and Earthquake as two small icons with the words ("available", "used") as visually hidden text, because the words cost a line the banner needed (U75).
- The banner keeps the shared `--outline`; the design doc had said `--timer-warn`, so I changed the doc.
- The computer, when it has no winning or blocking move and no Earthquake to play, avoids dropping into a square that is about to close.
- The new round is opened before the collapse animation runs, so a tap during the animation is a real choice (found by a check, correction C19).

**Checks at the end:** `pnpm check` 306 passed and 3 todo, twice in a row and once against the Docker image; `pnpm check:fast` 251; `pnpm test:e2e` 98 browser checks; mutation score 97.61%. The Docker image built and ran with an empty `/data`: `/`, `/readme/` and `/theme.css` answered 200 and `/style-preview` 404.

**Known gaps:**
- **360 x 640 is not on one screen.** The board and timer end about 46px below the fold with no banner at all (the timer bar ends at y=686), and more with it. That is not caused by this work, 360 x 640 is not a marking viewport and `docs/design.md` only asks for the first-screen fit at the marking viewports and 320 x 568, but a real 360 x 640 phone would scroll. It would need the player panels to shrink at that size.
- **The Earthquake animation unlocks the next round after it plays** (about 450ms), where the collapse now unlocks first. A tap in that half second after an earthquake round is swallowed ("Your choice is locked in"). Not tested or fixed.
- **First-screen fit at 320 x 568 with the banner has about 15px to spare** with the widest allowed nicknames, and no more to give.
- **No screenshot baselines** were regenerated; the shrinking board does not appear in them.
- **No playtest of the schedule** has happened (promise 1 is judged in `docs/playtests.md`), and the numbers are guesses.
- Games saved before this change only catch up at their next resolved round, so a game that is mid-round at deploy shows the full board until then.

## Earthquake power-up of 27 October 2026 (done, ready to deploy)

Tejas's request, built in the order the harness asks: ADR and rules, then design docs, then tests, then code. Never pushed or deployed.

| Commit | What it did |
| --- | --- |
| `c16afae` | ADR 0010, Power-ups: the principle (block, hide or break, never complete a line), Earthquake as built, Trap, Hidden disc, Crack, Double drop and Brick considered, Freeze rejected |
| `13b4832` | Rules: R53 to R60 added, R2, R3, R10, R12, R13, R14 and R17 changed, the engine contract extended, glossary words added |
| `6548164` | Design: new `docs/design/earthquake.md` (U61 to U67), U23a, U44a and the E key; new checks registered as todo in `spec/CHECKS.md` |
| `efe94a6` | Engine: `Choice` union, `earthquakesLeft`, `shaken`, three new rejection reasons, wins only from discs dropped this round; unit tests R53 to R59 and properties P8 to P10 |
| `a58e5e0` | Server: `choose` accepts `earthquake: true`, migration 11, no-peek check N5 and server tests |
| `6b1a3fd` | Computer may use Earthquake (R60), check C8, C5 now runs with Earthquake available |
| `4a46b53` | Test that only `earthquake: true` is an Earthquake, mutation score recorded (97.13%) |
| `56f8a79` | Screen: badge, info, shake and crumble and slide, result lines, E key, tutorial step, `e2e/earthquake.spec.ts` |
| `e28aa20` | Correction C18 and the checks marked passing |

**Rule changes:** R13 (a player wins only when a disc dropped this round is in the line; lines made by pieces moving never win), R14 (a draw needs both players' dropped discs to complete lines), R12 (pieces move only in an earthquake), R3, R2, R10, R17, and new R53 to R60. **Design IDs:** U61 to U67, U23a, U44a. **ADR:** 0010. **Correction:** C18. **Migration:** 11, gives games saved before this change both Earthquakes.

**Decisions I made while Tejas was away** (also in ADR 0010 or `docs/design/earthquake.md`):
- `Choice` is `{ column, shield } | { earthquake: true }`, so every old caller keeps working. Extra rejection reasons: `no_earthquake` and `one_power_up` (an Earthquake that also names a column or shield; the screen cannot send it, but a hand-made message can).
- Tapping the Earthquake badge chooses it at once and locks it, like a column tap, instead of arm then confirm. Tapping it puts an armed shield down first and the shield is never sent with it.
- A column's fullness is checked on the board before the round (R3), even though an earthquake in the same round would free a space.
- The browser learns that an earthquake happened from `earthquakesLeft` going from available to used, so no new message was needed; the result line is worked out from that and the new board.
- The opponent's panel shows Earthquake availability on the shield line (an icon, struck through when used, with hidden text), because a separate line pushed the board off 320 x 568 screens.
- The computer shakes with a 50% chance when removing the bottom row breaks more of the human's potential lines than its own (windows of four squares with one of the player's discs and nothing of the other's), after its win and block logic.
- The R50 browser check now compares only the tutorial player's own entries, not the whole global leaderboard, because other checks finished games while it ran (C18).
- The glossary says "shake" is to be avoided for Earthquake, but U61 asks for "Nothing to shake yet". I kept the specified words; Tejas may want to change either.

**Checks at the end:** `pnpm check` 262 passed and 3 todo, twice in a row and once against the Docker image; `pnpm check:fast` 207; `pnpm test:e2e` 79 browser checks. Docker image built and run with an empty `/data`: `/`, `/readme/` and `/theme.css` answered 200 and `/style-preview` 404.

**Not done for Tejas:** the screenshot baselines in `e2e/design.spec.ts-snapshots/` were not regenerated (the game screen now has a second badge, and they still passed), and no playtest of Earthquake with real people has happened (promise 1 is judged in `docs/playtests.md`).

## Fix list of 27 October 2026 (done)

Tejas's fix list, in the order he gave it. Every item was recorded in `docs/rules.md`, `docs/design/` or an ADR first, then tested, then coded. Never pushed or deployed.

| Commit | What it fixed |
| --- | --- |
| `8636f0a` | Rules: R4 replaced (choices lock, `already_chosen`), R18 and D2 at 10 seconds, R19 and R26 only with both players, new R51 and R52, ADR 0009 |
| `91deb35` | Server: no timer, round or missed round until both players are present (also for restored games); `already_chosen`; computer thinks 1 to 3 seconds; tests for R51, R4 and R52 |
| `743391f` | Design docs: U10 to U16, U19 (no countdown), U25 (timer bar), U27a (centred popup), U35a, U41 to U46 (interactive tutorial), new `docs/design/game-screen.md` U54 to U60 |
| `1353004` | Correction C17 and the new theme tokens in the docs |
| `e2e7c04` | Real names in each panel (U57), waiting card and game markup, "Save nickname", message inside the player card |
| `cac351f` | Client: locked choice and ghost disc lift, no countdown, "Get ready" once, slim timer bar, shield badge with info, popup centred over the board, narrow 320px layout, 560px lists and forms |
| `fe83e07` | Interactive tutorial (six steps, Next only after acting, scripted shield step) |
| `99c4172` | Final review fixes: tutorial Next and Skip stay on screen at 320 x 568 (sticky footer), Share copies the link when there is no share sheet |
| `19bf6b5` | Browser checks: highlight edges within 2px at three widths, centred game group, popup titles, 560px limit, timer bar, tutorial played by tapping; screenshot baselines |

Earlier stage (restyle): `999273d`, `120f355`, `47dbc61`.

**New rules:** R4 (final choices), R18 (10 seconds), R51 (a game starts only with both players), R52 (computer thinks 1 to 3 seconds). **Correction added:** C17. **ADR:** 0009.

**Decisions I made while Tejas was away** (all recorded in ADR 0009 or the docs):
- `already_chosen` is a server check before the engine's R3 validation, so the engine contract is unchanged.
- A restored game, and a game whose seat is empty, runs no timer; the timer starts when both are connected. A seat that disconnects mid-game still lets the round timer run until the 30 second grace ends (R27), but those rounds are not counted towards abandonment.
- `opponent_joined` and the snapshot now carry public display names only (never a choice, R22).
- The 320px game screen drops the keyboard hint and tightens spacing so the board, timer bar and both names fit 568px; the result line sits just below the first screen.
- The shield help is an overlay over the board so it never pushes the board off screen.
- The tutorial's last step offers "Play the computer" or "Back home" (skip becomes "Back home" there).

## State of the app

What exists:
- **Engine** (`src/engine/`), pure, 97.11% mutation score. Earthquake (R53 to R60) and the ceiling-only shrinking board (R61, R64 to R69) are in it.
- **Server** (`src/server/`): HTTP and WebSocket (`index.ts`, `realtime.ts`), save-before-broadcast persistence in SQLite with 14 numbered migrations (`db.ts`), the computer player, game codes, Quick match, identity, leaderboard rules, rate limiting. `screens.ts` renders every screen; `arcade-html.ts` holds the shared pieces (title with cracks and chips, buttons, icons).
- **Look:** `public/theme.css` holds every colour, font, radius, shadow and duration; `public/components.css` uses only those variables. `spec/unit-theme.test.ts` enforces this and recomputes contrast. The design pack is in `docs/design/`; ADR 0006 has the history.
- **Screens** (`src/client/`, esbuild, target es2020, so no top-level await): Watch (`/watch`, spectating), Home (laptop: two halves, phone: one column), Game (tap a column to choose, shield badge, countdown only after the server's result, end popup), Tutorial (runs in the browser on a practice board, R47 to R50), Quick match, Leaderboard, Account, `/readme/`.
- **Protocol additions:** snapshot `opponentPresent` and the `opponent_joined` message (no choice information, R21, R22); `/api/visitor`, `/api/tutorial`, `tutorialDue` on `/api/me`.
- **`/style-preview`** answers only when `DEV=1` (U50) and no page links to it.
- **Checks:** `pnpm check` (356 passed, 3 todo), `pnpm check:fast` (294), `pnpm test:e2e` (119 browser checks incl. axe-core on every screen and screenshots), `pnpm check:isolated` (temporary server and data folder). Run `pnpm check` twice in a row; it must stay repeatable.
- **Docker:** built and run with an empty `/data`; `/`, `/readme/`, `/leaderboard` and `/theme.css` answered 200 and `/style-preview` 404.

## Next step: Phase 8, then polish

Phase 8: run the multi-user test session from `docs/testing/multi-user-test-plan.md` with real people on a deployed app. Deployment and pushing are Tejas's call.

- `pnpm check:evidence` fails only on the PROCESS.md template comment and missing reflections, which Tejas writes. Because of that the CI deploy job is skipped until he does; that is expected.
- Fill `docs/playtests.md` once people have played (promise 1 is judged there).

## Things for Tejas to look at

- **The marking viewports are not in the repo.** `playwright.config.ts` uses 390 x 844 and 1366 x 768 plus 320 px wide, as `docs/design.md` says to until they are confirmed. Change `PHONE` and `LAPTOP` there once he reads them off the course assessment page.
- **ADR 0004 and the other ADRs are "Accepted (default, pending Tejas's review)".** The identity implementation notes in ADR 0004 record two behaviours to review: a taken username is shown as taken at sign-up, and a guest cookie keeps working as the account after sign-up.
- **Rule notes added without asking** (the standing instruction was to pick the simpler option and record it): R19 (a computer game is abandoned when the human misses 3 rounds; idle count restarts after a restart), R31 (the 4 hex digit tag is shown), R34 (30 games a minute per address; first timer starts at first join).
- **Two app-level leaderboard checks are todo** (B3, B4): they need real 10 second rounds. Their rules are covered by `spec/unit-leaderboard.test.ts` and `spec/unit-realtime-abandon.test.ts`.
- **Per-address limits behind Fly:** the code reads `Fly-Client-IP` (CLAUDE.md). Anyone on one shared network shares a bucket; the limits are generous (30 guests, 30 games, 60 sign-ins, 120 reads a minute).
- **The Web Share button only shows where the browser supports it** (phones, mostly). Copy link works everywhere over HTTPS, but over plain HTTP on a LAN address the clipboard is unavailable and it says "Copy failed".

## Known gaps

- **Screenshot baselines are darwin-only** (`e2e/design.spec.ts-snapshots/`) and e2e never runs in CI. Regenerate with `pnpm test:e2e e2e/design.spec.ts -g Screenshots --update-snapshots` after checking the new look by eye. `/play/quick` is left out of screenshots because it joins the shared lobby.
- Pieces on the board are marked relative to the viewer in the DOM (`data-piece` "A" is you, "B" the opponent), so the two screens show mirrored values.
- On a laptop a bubble can pass behind the gaps between the round icons; the design-reviewer flagged this against U3a (bubbles never overlap a button, text or board). Bubbles stay behind opaque buttons and panels, so nothing is covered, but the wording of U3a may want softening.

- Seat reconnection uses a `seatToken` held in `sessionStorage`, as well as the guest cookie for leaderboard identity. A cleared tab loses its seat, by design (correction C4).
- Games are never deleted. The dev database grows with every `pnpm check`; it is gitignored and can be deleted (`data-dev/`).
- `/api/leaderboard` reads every saved game per request (rate limited). Fine for a class; cache it if the data grows large.
- An empty (nobody ever joined) game made by `POST /api/games` stays in memory and the database. Creation is rate limited but there is no expiry.

## Problems not in the docs

- **The `reviewer` and `phone-tester` subagents** load only when `claude` starts inside this repo. Always call them by name; if unavailable, tell Tejas.
- **The phone-tester must measure in a real browser,** not read source (correction C9). Scripts from earlier sessions are in `/tmp/pw` and `/tmp/pw2` and are not part of the repo.
- **Stryker needs `"plugins": ["@stryker-mutator/vitest-runner"]`** in `stryker.config.json` (already done).
- **Two `pnpm dev` processes** crash-loop on "database is locked". Check `ps aux | grep "server/index"`.
- **Test the real Dockerfile locally** before trusting an edit: `docker build -t rubble-test .`, run with `-v /tmp/some-dir:/data -p 18080:8080 -e PORT=8080`, point `APP_URL` at it, then `docker stop` and `docker rmi`. Dependencies are `ws`, `marked`, `esbuild` and `bcryptjs`.
- **Corrections so far** are C1 to C21 in `docs/corrections.md`.

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`: `pnpm dev` (Tejas runs it himself; do not start another). `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone (`ipconfig getifaddr en0`). `pnpm check` and `pnpm test:e2e` need the app running on port 8080 (or `APP_URL`).
