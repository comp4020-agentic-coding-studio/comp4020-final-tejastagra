# Process overview

## Where this started

This repo sat at the course starter template — one commit, nothing else —
until this session. The project previously had a different direction and 20
commits of work on a different product (a shared task-list app, "Taskflow")
in a sibling backup directory, but that work never reached this repo's
`origin` and the product itself changed to **The Wall**, a collaborative
creative canvas. This account covers the actual build of The Wall, done in
one extended agentic session against the final project brief, completing
crits 8, 9 and 10 retrospectively rather than across their original weeks.
`reflections/crit-8.md` states that plainly.

## Stack, and why

Plain Node.js (`node:http`, no framework), the `ws` package for WebSocket
broadcast, and Node 24's built-in `node:sqlite` (`DatabaseSync`) for
persistence — no ORM, no separately-installed SQLite driver. The frontend is
hand-written HTML/CSS/vanilla JS using the `<canvas>` element, with no build
step. Full reasoning in `docs/implementation-audit.md`'s "chosen
implementation path" section; in short, this keeps the Docker image small
and compiler-free (no native build step for persistence), fits comfortably
inside the course's 256MB/shared-cpu-1x/one-volume constraint, and a
hand-written canvas interface was the more direct way to satisfy the
brief's "no generic SaaS template, don't clone Figma" instruction than
reaching for a component library would have been.

## Architecture

- `src/db.ts` — SQLite schema (`branches`, `objects` keyed by
  `(branch_id, id)`, `audit_log`) and a `Store` class: create/list/get/
  update/delete on objects, `forkBranch` (eager snapshot copy).
- `src/identity.ts` — mints and reads an `HttpOnly` per-browser cookie.
- `src/realtime.ts` — tracks connected WebSocket clients per branch and
  broadcasts to them.
- `src/log.ts` — structured JSON log lines (to stdout, for `flyctl logs`)
  mirrored into the `audit_log` table, for the six required event types.
- `src/markdown.ts` — small Markdown→HTML renderer, just enough to satisfy
  `spec/invariants.test.ts`'s heading-order check at `/readme/`.
- `src/server.ts` — wires it together: static files, the `/api/branches/*`
  JSON API, `/readme/`, and the WebSocket upgrade handler.
- `public/app.js` — fetches the branch snapshot once on load, then applies
  live WebSocket diffs; sends throttled cursor positions; renders strokes to
  a `<canvas>` and text objects as positioned `contenteditable` divs.

## Important architecture decisions

See `docs/adr/0001-realtime-and-conflicts.md` (WebSocket transport,
server-accepted last-write-wins on same-object edits),
`docs/adr/0002-identity-and-permissions.md` (anonymous cookie identity,
no per-object ownership — anyone on a branch may edit anything on it, by
product design, not oversight), and
`docs/adr/0003-branches-and-forks.md` (eager snapshot-copy fork, objects
keyed by `(branch_id, id)` so a forked object keeps its original id in the
new branch).

## How the agent was directed and corrected

This was an agentic session working from `prompt.md`'s six-hour plan,
checkpointing progress in `docs/agent-progress.md` after each task (see its
git history for the actual sequence). The main correction along the way was
self-directed through testing rather than external feedback: every claim in
this document and in `docs/agent-progress.md` was checked by actually
running the app and its test suite before being written down, per the
"honest evidence" principle in the brief and the rule this repo's own
`CLAUDE.md` states.

## Tests and logs used to investigate failures

- `pnpm check` run repeatedly against `node src/server.ts` on a real port
  (not assumed to pass) — see `docs/agent-progress.md`'s Hours 2-3 entry for
  the exact command and 11/11 result.
- Manual `curl` sequences against a running server to check fork isolation
  and restart-persistence directly, independent of the vitest harness
  (same entry).
- Server stdout (`console.log` JSON lines from `src/log.ts`) read directly
  during local testing to confirm `action_received`/`update_broadcast`
  events fired with the right branch and object ids.

## Significant changes of approach (failures and corrections)

- **TypeScript parameter-property constructor rejected by Node's type
  stripping.** `class Store { constructor(private db: DatabaseSync) {} }`
  threw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on first run — Node's built-in
  strip-only mode (used to run `.ts` files directly with no build step)
  doesn't support parameter properties. Caught immediately by actually
  starting the server rather than trusting `tsc --noEmit`, which doesn't
  catch this (it's valid TypeScript; the restriction is Node's runtime
  stripper, not the type checker). Fixed by writing the field assignment
  out explicitly in `src/db.ts`.
- **`objects.id` as a global primary key broke forking.** The first schema
  had `id TEXT PRIMARY KEY` on `objects`. Forking is designed to copy each
  object into the new branch under its *original* id (so a mark's identity
  traces back through forks), which meant every fork of a non-empty branch
  immediately hit `UNIQUE constraint failed: objects.id`. Found by
  `curl`-ing the fork endpoint directly rather than assuming the first
  passing unit test covered it. Fixed by moving to a composite primary key,
  `(branch_id, id)`.
- **A flaky realtime test, caused by a real race, not a flaky assertion.**
  The first version of `spec/realtime.test.ts`'s `nextMessage` helper
  attached a `message` listener and waited for a line matching a predicate —
  but the server sends the `snapshot` message as soon as the WebSocket
  connects, which can (and did, in testing) arrive before the listener was
  attached, since Node's `EventEmitter` doesn't buffer messages for
  listeners that aren't there yet. The test then timed out even though the
  server's behaviour was correct (confirmed with a standalone script
  first — see `docs/agent-progress.md`). Fixed by buffering every message
  from the moment the socket opens and draining that buffer against the
  predicate, rather than only listening for what arrives after the check
  starts.

## Current limitations and next steps

See README.md's "Known limitations and current status" section for the
product-facing list (no image/link cards yet, last-write-wins conflict
policy, no per-object ownership). Technically, the next steps in priority
order are: Docker build verification, Fly deploy and live-URL verification,
the lecture multi-user test document, and the three crit reflections — see
`docs/agent-progress.md` for exactly where this session is in that list.

## Multi-user testing with Fly logs

See `docs/testing/multi-user-test.md` for the scenario matrix and results,
and `reflections/crit-10.md` for the identity/permissions/logging account.
