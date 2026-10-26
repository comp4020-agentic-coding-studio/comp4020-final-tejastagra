# Handover

For a fresh Claude Code session. Read `START-HERE.md` and `CLAUDE.md` first, then this.

## Where we are

Phase 3 (server, real time, persistence and logging), just after the logger. Phases 0, 1 and 2 are done: harness committed, ADRs 0001 to 0005 and D1 to D5 accepted as defaults, engine finished with a 97.17% mutation score and compared against `../rubble-reference-tests/`.

Phase 3 so far: a minimal HTTP server serving `/` (placeholder) and `/readme/` (README.md rendered with `marked`), and the key=value logger (G1 to G3 passing).

## Next step

Persistence and the game service, written test first:

1. Turn the S1 to S3 stubs in `spec/unit-persistence.test.ts` into real tests (R25 save before broadcast, R26 restore in-progress games, timer restarts at 15 seconds).
2. Build `src/server/db.ts` (`node:sqlite`, WAL, file at `/data/rubble.db`, path overridable by an environment variable for local runs and tests) and a game service that takes `save` and `broadcast` as injected dependencies so S1 can check their order.
3. Then WebSockets with `ws`, the no-peek tests N1 to N4 and the real-time tests T1 to T6, then the real `Dockerfile` (keep 256 MB, `/data`, `0.0.0.0:$PORT`).

R4 (last choice counts) is session state, not engine state, so it needs a server test rather than an engine test.

## Unreviewed commits

`8f9ad48` to `c37e4ac`, none run through the reviewer subagent:

- `8f9ad48` R13 to R17 win and draw detection
- `cc449b8` property tests P1 to P7
- `5100c05` Stryker plugin fix and first mutation score
- `7fdc7e7` player B and falling diagonal tests
- `d7b27ba` cases from the reference tests
- `75f32ad` minimal server with live reload
- `c37e4ac` key=value logger

Run the reviewer once over `git diff 8f9ad48^ HEAD -- src spec stryker.config.json package.json` and fix anything it finds in new commits. An earlier general-purpose review of R13 to R17 (before haiku and the diff-only brief) passed, so `8f9ad48` is lower risk than the rest. The persistence and no-peek work needs the reviewer before it is committed (R21, R22, R25).

## Problems not in the docs

- **The `reviewer` subagent never loaded.** `.claude/agents/reviewer.md` is valid (`model: haiku`), but both sessions listed only the built-in agents. The likely cause is that the session was started from `/Users/tejastagra/comp4020`, not the repo. Start `claude` from inside `comp4020-final-tejastagra` and check with `/agents`. Do not fall back to a general-purpose agent: Tejas asked for the reviewer by name, and to be told if it is unavailable.
- **Stryker needs `"plugins": ["@stryker-mutator/vitest-runner"]`** in `stryker.config.json` because pnpm's layout hides the plugin from its discovery. Already fixed in `5100c05`. `reports/` and `.stryker-tmp/` are gitignored.
- **A reference-comparison test of mine was wrong, not the engine:** five discs of one player in a column is a vertical four in a row. Alternate A and B when filling a column in tests.
- **Dependencies added:** `ws`, `marked`, `esbuild` (runtime) and `@types/ws` (dev), each justified in `75f32ad`. `esbuild` is not used yet; it is for bundling the browser code (ADR 0001).
- **`docker` was not running** at the start of Phase 0. I started Docker Desktop with `open -a Docker`.
- **The early `git reset` runs** (before this harness was in place) discarded uncommitted harness files twice. They came back each time, so the branch `archive/abandoned-2026-10-26` holds earlier abandoned work and can be ignored.
- **Nothing is pushed and nothing is deployed.** Keep it that way until Tejas reviews.
- **Phase 8 needs real people.** Stop there and wait for Tejas.
- Corrections so far: C1 (harness assumed the wrong test setup) and C2 (reviews too slow), both in `docs/corrections.md`.

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
