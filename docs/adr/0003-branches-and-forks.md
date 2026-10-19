# ADR 0003: branches and forks

Status: accepted

## Context

The brief requires a fork to be a consistent snapshot of a parent's content,
recording parent id and fork timestamp; parent edits after the fork must
not appear in it; fork edits must not affect the parent or siblings; no
merge-back; presence and cursors must not cross branch boundaries.

## Options considered

- **Single global canvas, no branching** — simplest, but fails the fork
  requirement outright.
- **Copy-on-write / lazy fork** (only record a diff against the parent,
  materialise on demand) — more storage-efficient at scale, but adds real
  complexity (diff resolution, parent-chain walks) this app's single-SQLite-
  file, single-machine deployment doesn't need, and risks the "no
  propagation from parent" guarantee being an accident of the resolution
  order rather than a guaranteed one.
- **Eager snapshot fork**: on fork, copy every row of the parent branch's
  current objects into a new, independent branch row-for-row.

## Decision

A `branches` table holds `id`, `parent_id`, `forked_at`. `objects` rows
carry a `branch_id` and are keyed by `(branch_id, id)` rather than `id`
alone — forking intentionally keeps each object's original id in the new
branch (so "this mark's history traces back to one creation") while scoping
every read, write, broadcast and presence connection to its branch id
(`Store.listObjects`, `Store.getObject`, `clientsOnBranch` in
`src/realtime.ts`). `POST /api/branches/:id/fork` creates a new branch id
and performs `Store.forkBranch`, an eager, synchronous copy of every object
row at that instant, timestamped `forked_at = Date.now()`. After that call
returns, there is no code path that reads from or writes to the parent as a
side effect of anything happening in the fork, or vice versa — they are
two independent sets of rows sharing only a `parent_id` pointer for
provenance.

## Reasons

Eager snapshot-copy is the simplest design that can be verified directly:
"is the fork isolated" becomes "do these two sets of database rows ever
cross-reference each other after the copy", which is checkable by reading
`src/db.ts` and by the tests below, rather than reasoning about whether a
lazy-diff resolution order could leak a parent edit into a fork under some
timing.

## Consequences

- Storage grows with each fork (every object is duplicated), which is
  acceptable at this app's expected scale (a course project, not a
  production social platform) and matches the brief's explicit "no
  merge-back, no automatic propagation" requirement more directly than a
  diff-based design would.
- WebSocket clients are scoped to one branch per connection
  (`?branch=` on the upgrade URL); a client would need to open a second
  connection to watch two branches, which the UI doesn't currently do —
  switching branches means reloading the page with a new `?branch=`
  parameter (see `public/app.js`).
- Verified in `spec/branches.test.ts` ("a fork is isolated..."): a parent
  object created after a fork does not appear when the fork's objects are
  listed; editing the fork's copy of an inherited object leaves the
  parent's copy of the same object id unchanged. Verified manually (see
  `docs/agent-progress.md`, Hours 2-3 entry) against a running server with
  curl, independent of the automated test.
