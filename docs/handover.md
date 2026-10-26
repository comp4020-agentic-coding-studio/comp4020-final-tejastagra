# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## Where we are

Phase 3 (server, real time, persistence and logging) is done. Phases 0, 1 and 2 are also done: harness committed, ADRs 0001 to 0005 and D1 to D5 accepted as defaults, engine finished with a 97.17% mutation score and compared against `../rubble-reference-tests/`.

Phase 3's pieces:
- HTTP server (`src/server/index.ts`) serving `/` and `/readme/` (README.md rendered with `marked`), and the key=value logger (`src/server/log.ts`, G1 to G3 passing).
- SQLite persistence (`src/server/db.ts`, `node:sqlite`, WAL, numbered migrations tracked with `PRAGMA user_version`) and the game service (`src/server/game-service.ts`): save before broadcast (R25), restore in-progress games with their timer reset (R26). `RUBBLE_DB_PATH` overrides the db path; local dev defaults to `./data-dev/rubble.db` (gitignored), production to `/data/rubble.db`.
- WebSocket real time (`src/server/realtime.ts`, attached in `index.ts`): join and snapshot (R24, R32, R36), choosing and resolving a round with nothing leaked to the opponent before it resolves (R21, R22), the 15 second round timer (R18), and the 30 second disconnect grace period ending in a forfeit (R27). A forfeit is server-side state, not an engine `Status` value (docs/rules.md's R19/R27 notes), persisted in the `games.ended` column.
- The real `Dockerfile` (Node 24 slim, no build step per ADR 0001), replacing the busybox placeholder. `placeholder/` is deleted.

All of N1 to N4, T1 to T4 and T6 are passing; T5 covers the "reconnects in time" half against the live app (the "forfeits after 30 real seconds" half is covered by `spec/unit-realtime-forfeit.test.ts` against an ephemeral server with an injectable grace period). S1 to S3 are passing, plus several extra cases. G1 to G3 are passing. 87 tests pass in total as of commit `c87b520`.

## Next step: Phase 4, phone-first interface

Follow `docs/design.md`. Build at phone width first (320 px and 390 px, plus the laptop width once confirmed), and run the phone-tester subagent after every screen. The server currently has no HTML beyond a stub `/` page and `/readme/`; the game, lobby, identity and leaderboard screens in `docs/design.md`'s table are all still to build. Nothing in `src/` outside `src/server/` and `src/engine/` exists yet, so the browser code (bundled with esbuild per ADR 0001) starts from nothing.

Suggested order, matching the design doc's screens and the test hooks it lists:
1. The game screen itself (`/g/<code>`), wired to the existing WebSocket protocol in `realtime.ts` (`join`, `choose`, `snapshot`, `opponent_ready`, `rejected`, `game_over`, `tab_replaced`, `game_full`). This is the screen every other mode eventually leads to, so building it first gives something playable early, per START-HERE.md's general guidance ("build a simple playable version early, then improve it screen by screen").
2. Home (`/`), Waiting and the lobby modes (R33 to R36), which need game-code creation that does not exist on the server yet (currently `realtime.ts` creates a game lazily on first join to whatever code the client sends, with no R34 code generation, no `/g/<code>` routing and no quick match). This is new server work, not just a browser screen.
3. Identity (R28 to R32), leaderboard (R37 to R39) and the computer player (Phase 5, R40 to R46) come after, per START-HERE.md's phase order.

## Known gaps to revisit

- **Home is partly built (Phase 4):** `/` has Play a friend and Enter a game code working. `play-computer` and `quick-match` are disabled placeholders until Phase 5 and R35. `nickname-input`, the leaderboard preview (`leaderboard-wins`, `leaderboard-rounds`) and links to `/account` and `/leaderboard` are missing until identity (R28 to R32) and the leaderboard (R37 to R39) exist. The phone-tester confirmed no overflow and 44 px targets at 320 and 390 px.
- **Phase 6, R28 identity (correction C4):** without R28, seat reconnection in `realtime.ts` uses a bearer `seatToken` handed to whoever first joins a seat, not a real identity check. A stranger who knows a game code and an occupied seat's letter gets `game_full`, not the seat, but this is a stand-in, not real identity. Revisit when guest cookies land.
- **R19, needs building (decided, not yet done):** Tejas decided (see `docs/rules.md` R19 and R27, and correction C6) that abandonment and forfeit are server-side state, not new engine `Status` values. Forfeit (R27) is now built this way. R19 (abandonment after 3 missed rounds in a row) is NOT yet built: a game nobody is connected to will currently keep re-arming its 15 second timer forever, resolving empty rounds against the database (correction C6 documents this as a known, accepted gap until R19 lands). R19 can now be built the same way R27 was (a server-side "ended" state, not an engine change) whenever it is picked up; no further decision from Tejas is needed for it.
- **Game codes don't follow R34 yet:** `realtime.ts`'s `createGame` is called with whatever code string a client's `join` message sends, with no validation against the `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 6-character alphabet in R34, and no server-side code generation for "play a friend" exists. This needs building in Phase 4/6 alongside the lobby screens.
- **Database schema changes now require a migration (CLAUDE.md, correction C7):** `src/server/db.ts`'s `openDb` runs a numbered `MIGRATIONS` array tracked via `PRAGMA user_version`. Any future column or table change must add to that array (never edit a migration already shipped) and add a test in `spec/unit-persistence.test.ts` that opens an old-schema database and checks it upgrades. Skipping this crashed the dev server once already (correction C7) and would crash production the same way after a deploy.

## Unreviewed commits

None. Every commit from `8f9ad48` to `c87b520` has been reviewed, either in the catch-up review (correction C3) or individually before being committed (persistence, WebSocket join/snapshot, choose/resolve, the R18 timer, R27/forfeit, the real Dockerfile), with findings recorded in corrections C4 through C7.

## Problems not in the docs

- **The `reviewer` subagent never loaded** in earlier sessions when started from `/Users/tejastagra/comp4020` instead of the repo itself. Start `claude` from inside `comp4020-final-tejastagra` and check with `/agents`. Do not fall back to a general-purpose agent: Tejas asked for the reviewer by name, and to be told if it is unavailable. (It has loaded and run correctly every time this session, started from inside the repo.)
- **Stryker needs `"plugins": ["@stryker-mutator/vitest-runner"]`** in `stryker.config.json` because pnpm's layout hides the plugin from its discovery. Already fixed in `5100c05`. `reports/` and `.stryker-tmp/` are gitignored.
- **A reference-comparison test of mine was wrong, not the engine:** five discs of one player in a column is a vertical four in a row. Alternate A and B when filling a column in tests.
- **Dependencies added:** `ws`, `marked`, `esbuild` (runtime) and `@types/ws` (dev), each justified in `75f32ad`. `esbuild` is not used yet; it is for bundling the browser code (ADR 0001), needed as soon as Phase 4 starts. `node:sqlite` and `node:crypto` are built into Node 24, so no new dependency was needed for persistence, the seat token or the Dockerfile.
- **Two `pnpm dev` processes running at once** crash-loop on "database is locked", because two processes cannot hold the same SQLite file's lock. If the dev server will not start with "database is locked" and `touch`ing a source file does not fix it after a few seconds, check for a duplicate `pnpm dev` with `ps aux | grep "server/index"` first; if the lock persists after confirming only one process is running, check `data-dev/rubble.db`'s WAL file size and try `PRAGMA wal_checkpoint(TRUNCATE)` directly against it with the server stopped.
- **The local dev database accumulates test games.** Every `pnpm check` run against the live dev server creates real rows in `data-dev/rubble.db` (it is not a throwaway database like CI's). This is harmless for correctness but makes the file grow; it is gitignored and can be deleted to start fresh (the server recreates it, fully migrated, on next start).
- **Docker images used for local testing are not cleaned up automatically.** When testing a Dockerfile change locally, remember `docker rmi` the test image and `docker stop` any test container afterwards; this session built and removed two (`rubble-test`, `rubble-test2`) while verifying the real Dockerfile.
- **Nothing is pushed and nothing is deployed.** Keep it that way until Tejas reviews.
- **Phase 8 needs real people.** Stop there and wait for Tejas.
- Corrections so far, all in `docs/corrections.md`: C1 (harness assumed the wrong test setup), C2 (reviews too slow), C3 (R16 and log-injection gaps found by a catch-up review), C4 (seat takeover without identity), C5 (seat-token check failed open for an unissued seat, a real auth bypass), C6 (R18 timer test-timing risk, a leaked test timer, a stale constant and a silent-drop-on-save-failure bug) and C7 (R27 forfeit review found a wrong-winner bug, an unpersisted result and a missing database migration that crashed the dev server).

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`:

```
pnpm dev
```

This runs `DEV=1 node --watch --watch-path=src --watch-path=README.md src/server/index.ts`, listening on `0.0.0.0:8080` with live reload (open pages poll `/__dev/version` and refresh after each restart). To run it in the background and keep it going:

```
nohup pnpm dev > /tmp/rubble-dev.log 2>&1 &
```

Links to give Tejas: `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone on the same Wi-Fi. Get the IP with `ipconfig getifaddr en0`. `pnpm check` needs the app running on port 8080.

To test the real Dockerfile locally (not needed for every change, but useful before trusting a Dockerfile edit): `docker build -t rubble-test .`, then run it with a `/data` volume mounted, e.g. `docker run --rm -d -p 18080:8080 -e PORT=8080 -v /tmp/some-dir:/data rubble-test`, then point `APP_URL` at it for `pnpm check`'s full suite. Remember to `docker stop`/`docker rmi` afterwards.
