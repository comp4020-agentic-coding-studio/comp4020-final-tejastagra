# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## Where we are

Phase 3 (server, real time, persistence and logging), with persistence and the first WebSocket slice done. Phases 0, 1 and 2 are done: harness committed, ADRs 0001 to 0005 and D1 to D5 accepted as defaults, engine finished with a 97.17% mutation score and compared against `../rubble-reference-tests/`.

Phase 3 so far:
- A minimal HTTP server serving `/` (placeholder) and `/readme/` (README.md rendered with `marked`), and the key=value logger (G1 to G3 passing).
- SQLite persistence (`src/server/db.ts`, `node:sqlite`, WAL) and the game service (`src/server/game-service.ts`): save before broadcast (R25), restore in-progress games with their timer reset (R26). S1 to S3 passing, plus extra cases for multiple restored games, the timer floor and a corrupt row. `RUBBLE_DB_PATH` overrides the db path; local dev defaults to `./data-dev/rubble.db` (gitignored), production to `/data/rubble.db`.
- WebSocket join and snapshot (`src/server/realtime.ts`, attached in `index.ts`): a client joins a game over `/ws`, is assigned seat A or B or told `game_full` (R36), and gets a full snapshot (R24). A reconnect to the same seat replaces the live connection and tells the old one `tab_replaced` (R32). See correction C4: seat takeover needed a stand-in `seatToken` because R28 identity does not exist yet; revisit in Phase 6.
- Choosing and resolving a round (`choose` message in `realtime.ts`): a column and shield go into per-game pending state, never forwarded to the opponent (R21, R22, correction C5 fixed a seat-token bypass here), the opponent is told only `opponent_ready`, and `game.resolve()` runs and broadcasts once both have chosen. N1 to N4 and T1 to T3 passing.
- The 15 second round timer (R18): `realtime.ts` schedules a per-game timer on creation and after every resolve, forcing a resolve with whatever choices exist (including none) when it fires; restored games (R26) get a fresh full-length timer. `roundTimerMs` is injectable through `attachRealtime`'s options and `game-service.ts`'s `createGameService`, so tests use a short timer instead of waiting 15 real seconds. See correction C6.

## Next step

R27 (disconnect handling) and T5, written test first:

1. When a player's connection closes mid-game (`socket.on("close", ...)` in `realtime.ts`), start a 30 second grace period for that seat rather than doing nothing as it does now. If the player reconnects (rejoins with the right `seatToken`) within 30 seconds, play continues. If not, the game ends as a **forfeit** and the other player wins — this needs a `forfeit` outcome somewhere; check whether that belongs in the engine's `Status`/`winner` fields or is server-only state, since the engine contract in `docs/rules.md` does not currently have a forfeit concept (stop and ask Tejas if it is unclear whether this is an engine change or a server-only one).
2. Turn T5 in `spec/app-realtime.test.ts` into a real test: a client that disconnects and reconnects within 30 seconds continues the same game (use an injectable grace period the same way `roundTimerMs` was made injectable, so the test does not wait 30 real seconds).
3. R19 (3 missed rounds in a row abandons the game, no winner, never affects the leaderboard) is still not implemented. It needs a new engine `Status` value ("abandoned") that is not in the current engine contract in `docs/rules.md` — this is a contract change, not a bug fix, so it needs Tejas's say-so before building. The same is true of the forfeit outcome above: check with Tejas whether "forfeit" extends the engine's `Status`/`winner` shape or is tracked only in the game service, since `docs/rules.md`'s Engine contract section currently only allows `'playing' | 'won' | 'draw'`.
4. Then the real `Dockerfile` (keep 256 MB, `/data`, `0.0.0.0:$PORT`), replacing the busybox placeholder.

R4 (last choice counts) is already supported: `handleChoose` in `realtime.ts` simply overwrites `choices[player]` on every valid `choose` message, so the last one before resolution counts; no extra work needed there.

## Known gaps to revisit

- **Phase 6, R28 identity (correction C4):** without R28, seat reconnection in `realtime.ts` uses a bearer `seatToken` handed to whoever first joins a seat, not a real identity check. A server restart currently loses all `seatTokens` (they are in-memory only), so after a restart nobody can reconnect to their old seat even though R26 restores the game itself — this needs a fix, most likely moving seat identity into the database row or deferring it to R28's cookie, before T5 (R27, reconnect within 30 seconds) can be tested properly against a restarted server.
- **R19, needs Tejas (correction C6):** without R19 (abandonment after 3 missed rounds in a row), a game nobody is connected to any more will keep re-arming its 15 second timer forever, writing an empty round to the database on every tick. This does not break any currently-implemented rule, but it needs an engine `Status` value the contract in `docs/rules.md` does not have yet, so it is deliberately not built. Ask Tejas whether to add `'abandoned'` to `Status` (and, relatedly, whatever R27's forfeit outcome needs) before continuing past R27/T5 in the next step above.

## Unreviewed commits

None currently. `8f9ad48` to `c37e4ac` were reviewed in this session (see correction C3); every commit since (persistence, WebSocket join/snapshot, choose/resolve, the R18 timer) was reviewed before being committed, with findings recorded in corrections C4, C5 and C6.

## Problems not in the docs

- **The `reviewer` subagent never loaded.** `.claude/agents/reviewer.md` is valid (`model: haiku`), but both sessions listed only the built-in agents. The likely cause is that the session was started from `/Users/tejastagra/comp4020`, not the repo. Start `claude` from inside `comp4020-final-tejastagra` and check with `/agents`. Do not fall back to a general-purpose agent: Tejas asked for the reviewer by name, and to be told if it is unavailable. (In this session, started from inside the repo, the reviewer loaded and ran correctly each time.)
- **Stryker needs `"plugins": ["@stryker-mutator/vitest-runner"]`** in `stryker.config.json` because pnpm's layout hides the plugin from its discovery. Already fixed in `5100c05`. `reports/` and `.stryker-tmp/` are gitignored.
- **A reference-comparison test of mine was wrong, not the engine:** five discs of one player in a column is a vertical four in a row. Alternate A and B when filling a column in tests.
- **Dependencies added:** `ws`, `marked`, `esbuild` (runtime) and `@types/ws` (dev), each justified in `75f32ad`. `esbuild` is not used yet; it is for bundling the browser code (ADR 0001). `node:sqlite` and `node:crypto` are built into Node 24, so no new dependency was needed for persistence or the seat token.
- **`docker` was not running** at the start of Phase 0. I started Docker Desktop with `open -a Docker`.
- **The early `git reset` runs** (before this harness was in place) discarded uncommitted harness files twice. They came back each time, so the branch `archive/abandoned-2026-10-26` holds earlier abandoned work and can be ignored.
- **Two `pnpm dev` processes were running at once** (one left over from an earlier session, started 20:51; one from this session, started 20:58), which crash-looped once SQLite was wired in, because two processes cannot hold the same SQLite file's lock. Tejas chose to stop the older one. If the dev server will not start with "database is locked", check for a duplicate `pnpm dev` with `ps aux | grep "server/index"` first.
- **Nothing is pushed and nothing is deployed.** Keep it that way until Tejas reviews.
- **Phase 8 needs real people.** Stop there and wait for Tejas.
- Corrections so far: C1 (harness assumed the wrong test setup), C2 (reviews too slow), C3 (R16 and log-injection gaps found by a catch-up review), C4 (seat takeover without identity), C5 (seat-token check failed open for an unissued seat, a real auth bypass) and C6 (R18 timer test-timing risk, a leaked test timer, a stale constant and a silent-drop-on-save-failure bug), all in `docs/corrections.md`.

## Run the dev server

From `/Users/tejastagra/comp4020/comp4020-final-tejastagra`:

```
pnpm dev
```

This runs `DEV=1 node --watch --watch-path=src --watch-path=README.md src/server/index.ts`, listening on `0.0.0.0:8080` with live reload (open pages poll `/__dev/version` and refresh after each restart). To run it in the background and keep it going:

```
nohup pnpm dev > /tmp/rubble-dev.log 2>&1 &
```

Links to give Tejas: `http://localhost:8080` for the laptop and `http://<LAN IP>:8080` for the phone on the same Wi-Fi. Get the IP with `ipconfig getifaddr en0` (it was `10.28.65.100`). `pnpm check` needs the app running on port 8080.
