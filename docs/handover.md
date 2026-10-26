# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

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
- **Engine** (`src/engine/`), pure, 97.13% mutation score. Earthquake (R53 to R60) is in it.
- **Server** (`src/server/`): HTTP and WebSocket (`index.ts`, `realtime.ts`), save-before-broadcast persistence in SQLite with 11 numbered migrations (`db.ts`), the computer player, game codes, Quick match, identity, leaderboard rules, rate limiting. `screens.ts` renders every screen; `arcade-html.ts` holds the shared pieces (title with cracks and chips, buttons, icons).
- **Look:** `public/theme.css` holds every colour, font, radius, shadow and duration; `public/components.css` uses only those variables. `spec/unit-theme.test.ts` enforces this and recomputes contrast. The design pack is in `docs/design/`; ADR 0006 has the history.
- **Screens** (`src/client/`, esbuild, target es2020, so no top-level await): Home (laptop: two halves, phone: one column), Game (tap a column to choose, shield badge, countdown only after the server's result, end popup), Tutorial (runs in the browser on a practice board, R47 to R50), Quick match, Leaderboard, Account, `/readme/`.
- **Protocol additions:** snapshot `opponentPresent` and the `opponent_joined` message (no choice information, R21, R22); `/api/visitor`, `/api/tutorial`, `tutorialDue` on `/api/me`.
- **`/style-preview`** answers only when `DEV=1` (U50) and no page links to it.
- **Checks:** `pnpm check` (262 passed, 3 todo), `pnpm check:fast` (207), `pnpm test:e2e` (79 browser checks incl. axe-core on every screen and screenshots), `pnpm check:isolated` (temporary server and data folder). Run `pnpm check` twice in a row; it must stay repeatable.
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
- **Corrections so far** are C1 to C18 in `docs/corrections.md`.

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`: `pnpm dev` (Tejas runs it himself; do not start another). `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone (`ipconfig getifaddr en0`). `pnpm check` and `pnpm test:e2e` need the app running on port 8080 (or `APP_URL`).
