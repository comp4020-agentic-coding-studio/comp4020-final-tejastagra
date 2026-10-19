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

## Current task
- Goal: Write the three ADRs (realtime/concurrency, identity/permissions,
  persistence/deployment), then README.md and PROCESS.md, then attempt the
  Docker build and Fly deploy.
- Files being changed: `docs/adr/*.md`, `README.md`, `PROCESS.md`
- Last known state: not started

## Checks run
- Command: `pnpm check` (against `node src/server.ts` on :8080)
- Result: 11/11 passed

## Blockers
- Blocker: none currently
- Safe next action: proceed to documentation, then Docker/Fly verification

## Exact next task
1. Write `docs/adr/0001-realtime-and-conflicts.md`,
   `docs/adr/0002-identity-and-permissions.md`,
   `docs/adr/0003-branches-and-forks.md`.
2. Replace `README.md` and `PROCESS.md` template content with the real
   account (check `pnpm check:evidence` passes).
3. Build and run the Docker image locally (`docker build`, then
   `docker run --tmpfs /data` matching how CI runs it) and re-run
   `pnpm check` against it.
4. Commit this hour's work once the Docker build is verified.
5. Attempt `flyctl deploy --remote-only --ha=false -a comp4020-final-tejastagra`
   and verify the live URL and `/readme/` over real HTTP.

## Resume instructions
Read this file, inspect `git status`, inspect the last commit and continue from the exact next task. Do not repeat completed work.
