# Agent progress

## Current status
- Phase: Hour 2/3 combined — core canvas, persistence, realtime, identity and
  logging all implemented and locally verified. Starting documentation (ADRs,
  README, PROCESS.md) next, then deploy.
- Last updated: 2026-10-19
- Current git commit: 5c3250b (Hour 1 audit); this hour's work not yet committed
- Deployment status: not yet attempted (Dockerfile replaced, untested in Docker/Fly)

## Completed and verified
- [x] Repository audit (Hour 1) — see `docs/implementation-audit.md`.
- [x] `src/db.ts`: SQLite schema (`branches`, `objects` keyed by
      `(branch_id, id)`, `audit_log`), `Store` with create/list/update/delete,
      `forkBranch` (snapshot copy, no live link).
- [x] `src/identity.ts`: anonymous per-browser identity via `HttpOnly` cookie.
- [x] `src/markdown.ts`: minimal renderer for `/readme/`.
- [x] `src/log.ts`: structured JSON logs for the six required events
      (user_join, user_leave, action_received, update_broadcast,
      action_rejected, state_snapshot_sent), mirrored into `audit_log`.
- [x] `src/realtime.ts` + WS handling in `src/server.ts`: branch-scoped
      broadcast, ephemeral cursor relay (never persisted, never logged).
- [x] `public/index.html`, `public/styles.css`, `public/app.js`: white/warm
      canvas, draw + text tools, colour palette, fork button, presence
      cursors, reconnect-with-backoff, keyboard shortcuts (d/t/s).
- [x] `Dockerfile` replaced: `node:24-slim`, `pnpm install --prod`, runs
      `src/server.ts` directly via Node's built-in TS stripping (no build
      step, no native compiler needed — `ws` is pure JS, `node:sqlite` is
      built in on Node 24).
- [x] Fixed a real bug found by testing: TypeScript parameter-property
      constructor (`constructor(private db: DatabaseSync)`) isn't supported
      by Node's strip-only mode — same class of bug seen in the reference
      backup. Rewrote as an explicit field assignment.
- [x] Fixed a real bug found by testing: `objects.id` was a global PRIMARY
      KEY, so forking (which intentionally keeps the same object ids in the
      new branch) hit a UNIQUE constraint violation. Changed the primary key
      to `(branch_id, id)`.
- [x] Manually verified against `node src/server.ts` on :8081: create →
      list round-trip; fork → parent edits after fork don't appear in fork
      (count stayed at 1); fork edits don't affect parent's copy of the same
      object id (parent still read `"hi"`, not `"fork-edit"`).
- [x] Manually verified persistence across a real process restart (not just
      the vitest harness): created object on `main`, killed the process,
      restarted pointed at the same `WALL_DB_PATH`, object was still there
      with the same id.
- [x] `pnpm check` (typecheck + vitest) passes against the real running app
      on :8080 — 11/11 tests: the supplied 2 invariants
      (`/` 200, `/readme/` full headings) + 5 in `spec/branches.test.ts`
      (persistence, distinct identity, fork isolation, invalid-type
      rejection, unknown-branch rejection) + 4 in `spec/realtime.test.ts`
      (broadcast within ~1s, cross-branch isolation, concurrent edits to
      different objects both retained, late-join snapshot).
- [x] Fixed a real bug found by testing: the realtime spec's `nextMessage`
      attached its listener after the predicate could already have been
      satisfied (the snapshot arrives immediately on connect), so it
      timed out nondeterministically — same class of bug as the reference
      backup hit. Fixed by buffering every message from connection open and
      draining the buffer against the predicate instead of listening fresh.

## Completed but not yet verified
- [ ] Docker build (`docker build` / `docker run --tmpfs /data`) — not yet run.
- [ ] Fly deploy — not yet attempted.
- [ ] Image upload / link cards (P3) — not started, deliberately deferred.
- [ ] Accessibility pass (keyboard-only full flow, contrast check) — only
      partially done (shortcuts + focus-visible exist, not exhaustively tested).

## Completed and verified (continued — Hour 4/5: documentation)
- [x] `docs/adr/0001-realtime-and-conflicts.md`,
      `docs/adr/0002-identity-and-permissions.md`,
      `docs/adr/0003-branches-and-forks.md` written.
- [x] `README.md` rewritten (definition of good, principles, non-goals,
      sources consulted, evidence, limitations, run instructions).
- [x] `PROCESS.md` rewritten (real stack/architecture account, the two
      bugs found by testing, the realtime test race and its fix).
- [x] `CLAUDE.md` written (this session's own harness rules).
- [x] `reflections/crit-8.md`, `crit-9.md`, `crit-10.md` written — each
      states plainly this is a retrospective, one-session account, not a
      report from the original weeks.
- [x] `node scripts/check-evidence.ts` passes: reflections found, no
      leftover `TEMPLATE:` comment in `PROCESS.md`, no commit-link citations
      yet to validate (none added so far).
- [x] `pnpm check` re-run clean (11/11) after the documentation changes.

## Completed and verified (continued — Docker build)
- [x] `docker build -t wall-local .` succeeds cleanly with the real
      `Dockerfile` (node:24-slim, pnpm install --prod, no compiler).
- [x] `docker run --rm -d -p 8082:8080 --tmpfs /data -e PORT=8080 wall-local`
      (matching how CI runs it against a throwaway `/data`) started and
      served `/` (200) and `/readme/` (full README) within ~2 seconds.
- [x] `APP_URL=http://localhost:8082 pnpm check` — 11/11 passed against the
      actual Docker image, not just the bare `node src/server.ts` process.
- [x] `docker stats` showed ~48MB resident — comfortably inside the
      256MB/shared-cpu-1x Fly machine size.

## Current task
- Goal: Attempt `flyctl deploy` and verify the live deployment over real HTTP.
- Files being changed: none expected
- Last known state: not started

## Checks run
- Command: `docker build -t wall-local .`
- Result: success
- Command: `APP_URL=http://localhost:8082 pnpm check` (against the Docker container)
- Result: 11/11 passed
- Command: `node scripts/check-evidence.ts`
- Result: all checks passed

## Blockers
- Blocker: none currently
- Safe next action: attempt the Fly deploy

## Exact next task
1. Attempt `flyctl deploy --remote-only --ha=false -a comp4020-final-tejastagra`
   from this repo (token is in `mise.local.toml`, not printed).
2. Verify the live URL and `/readme/` over real HTTP with curl — do not
   trust the deploy command's exit code alone.
3. Inspect `flyctl logs -a comp4020-final-tejastagra` for the six structured
   event types after exercising the app against the live URL.
4. Write `docs/testing/multi-user-test.md` with real results (marking
   anything requiring two live browser profiles as `Not run` until a human
   does that part).

## Resume instructions
Read this file, inspect `git status`, inspect the last commit and continue from the exact next task. Do not repeat completed work.
