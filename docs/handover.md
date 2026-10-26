# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## Where we are

Phases 0 to 7 are done. **Phase 8 (the multi-user test session) needs real people: stop and wait for Tejas.** Nothing is pushed and nothing is deployed.

What exists:
- **Engine** (`src/engine/`), pure, 97.17% mutation score.
- **Server** (`src/server/`): HTTP and WebSocket (`index.ts`, `realtime.ts`), save-before-broadcast persistence in SQLite with numbered migrations (`db.ts`), the computer player (`computer.ts`), game codes (`codes.ts`), Quick match (`matchmaker.ts`), identity (`identity.ts`), the leaderboard rules (`leaderboard.ts`), rate limiting (`rate-limit.ts`).
- **Screens** (`src/client/`, bundled with esbuild): Home, Game (with the share panel), Quick match, Leaderboard, Account, plus `/readme/`.
- **Rules built:** R1 to R46 including R19 abandonment, R27 forfeit, R28 to R31 identity, R33 to R36 modes, R37 to R39 leaderboard.
- **Checks:** `pnpm check` (175 tests, 2 todo) and `pnpm test:e2e` (13 browser checks: E1, E4, E5, E6). Run each twice in a row; both must stay repeatable (CLAUDE.md).

## Next step: Phase 8, then polish

Phase 8: run the multi-user test session from `docs/testing/multi-user-test-plan.md` with real people on a deployed app. That needs Tejas: stop and wait. Deployment (`fly deploy`) and pushing are also his call.

Things worth doing before then, none of which needs a decision:
- Run `pnpm check:evidence` (expected to fail only on the PROCESS.md template comment and missing reflections, which Tejas writes).
- Re-run `pnpm check`, `pnpm test:e2e` and the Docker image test (below) from a clean state.
- Fill `docs/playtests.md` once people have played (promise 1 is judged there).

## Things for Tejas to look at

- **The marking viewports are not in the repo.** `playwright.config.ts` uses 390 x 844 and 1366 x 768 plus 320 px wide, as `docs/design.md` says to until they are confirmed. Change `PHONE` and `LAPTOP` there once he reads them off the course assessment page.
- **ADR 0004 and the other ADRs are "Accepted (default, pending Tejas's review)".** The identity implementation notes in ADR 0004 record two behaviours to review: a taken username is shown as taken at sign-up, and a guest cookie keeps working as the account after sign-up.
- **Rule notes added without asking** (the standing instruction was to pick the simpler option and record it): R19 (a computer game is abandoned when the human misses 3 rounds; idle count restarts after a restart), R31 (the 4 hex digit tag is shown), R34 (30 games a minute per address; first timer starts at first join).
- **Two app-level leaderboard checks are todo** (B3, B4): they need real 15 second rounds. Their rules are covered by `spec/unit-leaderboard.test.ts` and `spec/unit-realtime-abandon.test.ts`.
- **Per-address limits behind Fly:** the code reads `Fly-Client-IP` (CLAUDE.md). Anyone on one shared network shares a bucket; the limits are generous (30 guests, 30 games, 60 sign-ins, 120 reads a minute).
- **The Web Share button only shows where the browser supports it** (phones, mostly). Copy link works everywhere over HTTPS, but over plain HTTP on a LAN address the clipboard is unavailable and it says "Copy failed".

## Known gaps

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
- **Corrections so far** are C1 to C14 in `docs/corrections.md`.

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`: `pnpm dev` (Tejas runs it himself; do not start another). `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone (`ipconfig getifaddr en0`). `pnpm check` and `pnpm test:e2e` need the app running on port 8080 (or `APP_URL`).
