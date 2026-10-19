# Process overview

## Crit 10: identity, ownership, and the audit log

[`01ce601`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/01ce601)
anonymous per-browser identity (`src/identity.ts`), owner columns on tasks
with a migration for the already-deployed volume (`src/db.ts`), and a
durable audit log (`src/auditlog.ts`) →
[`f6cc26d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/f6cc26d)
every `/api/*` route attributed to the caller, and the ownership check
itself: `PATCH`/`DELETE` on a task you don't own returns 403 before the
database is touched, logged either way →
[`f9b08a2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/f9b08a2)
the UI shows who you are and who owns each task, and disables controls on
tasks that aren't yours (advisory only — the 403 is the real decision) →
[`67382d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/67382d2)
[`docs/adr/0002`](docs/adr/0002-identity-and-ownership.md) and
`spec/ownership.test.ts`, which hits the API with two independent cookie
jars to check the server actually enforces what the ADR says it does.

### What counts as a person, and what each may do

See [`docs/adr/0002-identity-and-ownership.md`](docs/adr/0002-identity-and-ownership.md)
for the full reasoning. In short: a person is one browser's cookie jar — an
`HttpOnly` cookie the server mints on first contact, never read or set by
client JS, so it can't be forged the way a `localStorage` value could be.
Everyone sees the whole shared board (that's Taskflow's whole premise); only
a task's creator may edit or delete it, checked by comparing the request's
identity against the task's stored `owner_id` before any write — not a
disabled button, which the UI also shows as a courtesy but which proves
nothing on its own.

### The audit log

Every create, update, delete and rename goes through `logAction`
(`src/auditlog.ts`), which writes one row to a SQLite table on the same
persistent volume as the tasks (survives a restart or redeploy, unlike
stdout alone) and prints one line to stdout in the same call, so
`mise exec -- flyctl logs -a comp4020-final-tejastagra` is enough to narrate
"who did what" live, with no second tool. A denied attempt is logged exactly
like an allowed one — `[audit] DENIED delete task=... actor=... not the
owner (owned by ...)` — which is what makes "if one of them can change what
should be the other's, that's the finding" checkable from the log rather
than from guessing.

### Migrating the already-deployed database

The crit 9 deploy's `/data/taskflow.db` already had a `tasks` table with no
owner columns, and `CREATE TABLE IF NOT EXISTS` is a no-op against a table
that already exists — the naive version of this change would have crashed
the live app on first write (`table tasks has no column named owner_id`,
caught by actually deploying and curling the live URL before trusting
`pnpm check` against localhost — see "Failures and corrections"). `openDb`
now checks `PRAGMA table_info(tasks)` and runs `ALTER TABLE ... ADD COLUMN`
for whichever owner columns are missing, which is idempotent against both a
brand-new database and the existing one. The two pre-existing tasks on the
live board end up with an empty `owner_id`, which correctly means nobody's
current identity can claim or change them — they predate ownership, so
leaving them locked is more honest than guessing an owner for them.

## Where things are, commit by commit

[`ed4d077`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/ed4d077)
server, persistence, API, realtime broadcast, `/readme/` →
[`c11bdac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/c11bdac)
frontend →
[`d209437`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/d209437)
the week's spec tests (honestly: written against the already-working server
rather than before it, given the cutoff — see "Failures and corrections"
below for the one real red-to-green moment in them) →
[`57dd1b2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/57dd1b2)
the real Dockerfile →
[`06d3a9f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/06d3a9f)
a test cleanup bug found only once the app was actually deployed and the
suite run against it.

## Stack, and why

Plain Node.js — an `http` server, no framework — plus two small libraries:
`ws` for the WebSocket broadcast, and nothing else for persistence, because
Node 24 ships `node:sqlite` (`DatabaseSync`) built in. That choice was made
deliberately against two alternatives:

- **Express + Socket.IO + a conventional SQLite driver** (`better-sqlite3`):
  more familiar, but `better-sqlite3` needs a native build step, which adds a
  compiler toolchain to the Docker image for no benefit at this app's scale,
  and Socket.IO's reconnection/room machinery solves problems (multiple
  rooms, fallback transports) Taskflow doesn't have — one board, one
  WebSocket endpoint.
- **A managed realtime service** (Supabase Realtime, Pusher, etc.): outside
  the course's Fly-only deploy shape, and an unnecessary external dependency
  for a single-machine, single-volume app.

The result is a small dependency tree, a fast Docker build (`node:24-slim`,
`pnpm install --prod`, no compiler), and nothing fighting the 256MB/1-machine
constraint in `fly.toml`.

## Architecture

- `src/db.ts` — SQLite schema and a `TaskStore` with `all`/`get`/`create`/
  `update`/`delete`, each write going through a `version` check.
- `src/realtime.ts` — one function, `broadcast`, that sends a JSON event to
  every open WebSocket client. Kept separate from the HTTP handlers so "what
  gets sent on each kind of change" is in one place.
- `src/markdown.ts` — a small Markdown→HTML renderer, just enough for
  `/readme/` to satisfy `spec/invariants.test.ts` (headings appear, in order,
  as text) without pulling in a markdown dependency for one page.
- `src/server.ts` — wires it together: static files from `public/`, the
  `/api/tasks` JSON endpoints, `/readme/`, and the WebSocket upgrade.
- `public/app.js` — the frontend: fetches `/api/tasks` once on load/reconnect
  for the current snapshot, then applies live WebSocket diffs on top.
  Optimistic UI updates roll back on a `409`.

## Persistence

One SQLite file at `/data/taskflow.db`, the path `fly.toml`'s volume mount
reserves — the only storage that survives a Fly restart or redeploy. Verified
locally by writing a task, killing the server, restarting it, and confirming
the task was still there (and again inside the built Docker image, run the
way CI runs it: `docker run --tmpfs /data`, which simulates a fresh container
rather than persistence — the real volume is what persists across deploys on
Fly).

## Realtime synchronisation

Every mutating endpoint (`POST`/`PATCH`/`DELETE` on `/api/tasks`) broadcasts
the resulting task (or its id, for a delete) to every open WebSocket
connection immediately after the SQLite write commits. The frontend also
re-fetches the full task list whenever its socket (re)connects, which is what
makes "come back tomorrow" and "reconnect after a dropped connection" both
land on the same, correct state rather than relying on having received every
diff in between.

## The concurrency decision

See [`docs/adr/0001-concurrent-task-updates.md`](docs/adr/0001-concurrent-task-updates.md):
optimistic concurrency via a per-task `version`, with a stale write rejected
(409) and surfaced to the user, rather than silently overwritten
(last-write-wins) or fully merged (a CRDT-style approach this app's data
doesn't need).

## How it was tested

- `spec/invariants.test.ts` (supplied): `/` answers 200, `/readme/` publishes
  every README heading in order.
- `spec/tasks.test.ts` (crit 9, now routed through one consistent identity
  cookie — see above): a WebSocket client receives a broadcast for
  create/complete/delete within ~1.2s of another client's request; a fresh
  `GET /api/tasks` reflects what was written; a stale-version `PATCH` is
  rejected with 409 rather than applied.
- `spec/ownership.test.ts` (crit 10, started red): two independent cookie
  jars get distinct identities; both can see a task neither owns; a
  non-owner's `PATCH`/`DELETE` gets 403 and doesn't change anything; the
  owner's own writes still succeed; the audit log records the allowed
  create and the denied cross-owner attempt with the right actor on each.
- Manually: two browser tabs open against the app at once, creating,
  completing, reopening, deleting and filtering tasks in one and watching
  the other update without a reload — this is what vitest can't verify
  (it can't drive two real browsers), so it's recorded here instead.
- `pnpm check` run against `node src/server.ts` directly and, after
  redeploying, against the live Fly URL (`APP_URL=https://comp4020-final-tejastagra.fly.dev
  pnpm check`) — the second run is what caught the migration bug above.

## Failures and corrections along the way (crit 10)

- The first deploy of the ownership change crashed every write against the
  live app with `table tasks has no column named owner_id` — `CREATE TABLE
  IF NOT EXISTS` silently does nothing to a table that already exists, and
  the crit 9 deploy's volume already had `tasks` without the new columns.
  This only surfaced by actually running `pnpm check` against the deployed
  URL, not against a fresh local database, which is exactly the habit
  CLAUDE.md already asks for. Fixed by having `openDb` check
  `PRAGMA table_info(tasks)` and `ALTER TABLE` in whichever owner columns
  are missing, then redeployed and re-ran `pnpm check` against the live URL
  to confirm.

## Failures and corrections along the way (crit 9)

- First version of `src/db.ts` used a TypeScript parameter-property
  constructor (`constructor(private db: DatabaseSync)`); Node's built-in
  type-stripping mode (used to run `.ts` files directly, no build step)
  doesn't support that syntax and threw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`
  at startup. Fixed by writing the field assignment out explicitly.
- The first draft of `spec/tasks.test.ts` attached its WebSocket message
  listener *after* awaiting the HTTP response that triggered the broadcast —
  since the server sends the broadcast as soon as the write commits, the
  message could (and, in testing, reliably did) arrive before the listener
  was attached, so the test timed out despite the app itself working
  correctly (confirmed with a standalone script first). Fixed by buffering
  every message from the moment the socket opens, so a test can check
  messages that already arrived as well as ones still to come.
- `flyctl deploy` printed a WARNING that the app "is not listening on
  0.0.0.0:8080" right after the first deploy — alarming, but the health check
  had run before the app finished starting; curling the live URL seconds
  later returned 200. Took the warning seriously enough to check, rather than
  either panicking or ignoring it.
- The test suite's cleanup tried `fetch` with no method on
  `/api/tasks/:id` expecting a single-task lookup that the API never
  exposed (only list/create/patch/delete exist) — it silently failed, and
  three test-created tasks were left sitting on the *live* board until the
  deployed `pnpm check` run surfaced it. Fixed in
  [`06d3a9f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/06d3a9f)
  by reading the current version from the list endpoint instead, then
  manually deleted the three stale tasks the broken version had left behind.

## Remaining limitations

- Concurrency conflict detection is whole-task, not field-level: two people
  editing *different* fields of the same task at once still collide at the
  version check (see ADR 0001's consequences section).
- Identity is a cookie, not an account: clearing cookies or switching
  browsers makes you a new person with no way back into your old tasks.
  That's the deliberate trade-off in ADR 0002, not an oversight.
- Ownership is all-or-nothing per task (create, edit, delete) — there's no
  shared or transferable ownership, no "assign to someone else." The brief
  asks for *a* checked, documented decision, not the most featureful one.
- The two tasks created before this week's identity work exist on the live
  board with no owner and are now permanently locked (visible, but nobody's
  current identity can edit or delete them) — see "Migrating the
  already-deployed database" above for why that's the correct outcome
  rather than a bug.
