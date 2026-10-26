# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## Where we are

Phases 0 to 7 and the navy toy restyle (docs/design/plan.md, steps 9.1 to 9.7) are done. The app is ready to deploy. **Phase 8 (the multi-user test session) needs real people: stop and wait for Tejas.** Nothing is pushed and nothing is deployed; the assistant cannot push (permissions deny it), so Tejas pushes and deploys himself.

What exists:
- **Engine** (`src/engine/`), pure, 97.17% mutation score.
- **Server** (`src/server/`): HTTP and WebSocket (`index.ts`, `realtime.ts`), save-before-broadcast persistence in SQLite with 10 numbered migrations (`db.ts`), the computer player, game codes, Quick match, identity, leaderboard rules, rate limiting. `screens.ts` renders every screen; `arcade-html.ts` holds the shared pieces (title with cracks and chips, buttons, icons).
- **Look:** `public/theme.css` holds every colour, font, radius, shadow and duration; `public/components.css` uses only those variables. `spec/unit-theme.test.ts` enforces this and recomputes contrast. The design pack is in `docs/design/`; ADR 0006 has the history.
- **Screens** (`src/client/`, esbuild, target es2020, so no top-level await): Home (laptop: two halves, phone: one column), Game (tap a column to choose, shield badge, countdown only after the server's result, end popup), Tutorial (runs in the browser on a practice board, R47 to R50), Quick match, Leaderboard, Account, `/readme/`.
- **Protocol additions:** snapshot `opponentPresent` and the `opponent_joined` message (no choice information, R21, R22); `/api/visitor`, `/api/tutorial`, `tutorialDue` on `/api/me`.
- **`/style-preview`** answers only when `DEV=1` (U50) and no page links to it.
- **Checks:** `pnpm check` (207 passed, 3 todo), `pnpm check:fast` (153), `pnpm test:e2e` (44 browser checks incl. axe-core on every screen and screenshots), `pnpm check:isolated` (temporary server and data folder). Run `pnpm check` twice in a row; it must stay repeatable.
- **Docker:** built and run with an empty `/data`; `/`, `/readme/`, `/leaderboard` and `/theme.css` answered 200 and `/style-preview` 404.

## Next step: Phase 8, then polish

Phase 8: run the multi-user test session from `docs/testing/multi-user-test-plan.md` with real people on a deployed app. Deployment and pushing are Tejas's call.

- `pnpm check:evidence` fails only on the PROCESS.md template comment and missing reflections, which Tejas writes. Because of that the CI deploy job is skipped until he does; that is expected.
- Fill `docs/playtests.md` once people have played (promise 1 is judged there).

## Things for Tejas to look at

- **The marking viewports are not in the repo.** `playwright.config.ts` uses 390 x 844 and 1366 x 768 plus 320 px wide, as `docs/design.md` says to until they are confirmed. Change `PHONE` and `LAPTOP` there once he reads them off the course assessment page.
- **ADR 0004 and the other ADRs are "Accepted (default, pending Tejas's review)".** The identity implementation notes in ADR 0004 record two behaviours to review: a taken username is shown as taken at sign-up, and a guest cookie keeps working as the account after sign-up.
- **Rule notes added without asking** (the standing instruction was to pick the simpler option and record it): R19 (a computer game is abandoned when the human misses 3 rounds; idle count restarts after a restart), R31 (the 4 hex digit tag is shown), R34 (30 games a minute per address; first timer starts at first join).
- **Two app-level leaderboard checks are todo** (B3, B4): they need real 15 second rounds. Their rules are covered by `spec/unit-leaderboard.test.ts` and `spec/unit-realtime-abandon.test.ts`.
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
- **Corrections so far** are C1 to C16 in `docs/corrections.md`.

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`: `pnpm dev` (Tejas runs it himself; do not start another). `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone (`ipconfig getifaddr en0`). `pnpm check` and `pnpm test:e2e` need the app running on port 8080 (or `APP_URL`).
