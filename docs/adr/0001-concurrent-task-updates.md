# ADR 0001: How Taskflow handles two people changing the same task at once

## Status

Accepted.

## Problem

Taskflow is a shared board: several people can have it open at once, and the
crit 9 spec requires a decision about what happens when two of them act on the
same task within the same second — the realtime sync makes that collision
routine rather than rare, since changes are expected to arrive live, not after
a stale page is reloaded.

## Options considered

1. **Plain last-write-wins.** Whichever update reaches the server last simply
   overwrites the row. Simplest to implement; the cost is that a user's
   change can vanish with no indication anything happened — they complete a
   task, someone else reopens it a moment later, and the completer never
   finds out their click was undone.
2. **Optimistic concurrency with conflict detection** (chosen). Every task
   carries a `version` integer. A client must send the version it last saw
   with any update; the server only applies the write if that still matches
   the current row, bumping `version` on success. A stale write gets a `409`
   back with the task's current state, and the client shows "this task
   changed elsewhere — your update wasn't applied" instead of silently
   losing the edit.
3. **Full merge / CRDT-style resolution.** Track field-level history and
   reconcile concurrent edits automatically (e.g. last-write-wins per field,
   or a CRDT counter for completion toggles). More robust for rich,
   structured documents edited concurrently, but it's solving a problem
   Taskflow doesn't have: tasks are small, single-owner-at-a-time records
   (a title, a description, a boolean), not collaboratively-edited text.

## Decision

Option 2: optimistic concurrency with conflict *detection*, not merging.

## Reasons

Taskflow's own definition of "good" (README.md) is that nothing a person does
gets silently discarded and the interface stays honest about what happened.
Plain last-write-wins fails that outright. Full conflict resolution solves a
harder problem than this app has — there's nothing to merge in a boolean
completion flag or a short title, and building CRDT machinery for it would be
effort spent on a failure mode (a genuine merge conflict) that essentially
never occurs here, at the cost of effort not spent on the realtime UX, the
reconnect path, and the test coverage that actually matter for a small
tracker.

## Consequences and trade-offs

- A real conflict (two people editing the same task within the same ~second)
  is *rejected*, not merged: the second writer has to look again and re-apply
  their change deliberately. For a small, mostly single-focus task list this
  is the right failure mode — it's rare, and being explicit about it beats
  guessing which edit should "win."
- This does not prevent a *lost update* when two people change *different*
  fields of the same task in the same request shape Taskflow uses (each PATCH
  reads the whole current state and writes the fields it changed, keyed to one
  version) — only one PATCH can hold the current version, and this app does
  not attempt field-level merging between concurrent requests.
- It adds one required field (`version`) to every client request and one
  extra state (409) the UI has to handle, which is a small but real increase
  in surface area over plain last-write-wins.
