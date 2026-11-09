# Crit 9 reflection

Like crit 8, this is a retrospective account written in the same single
agentic session that built The Wall, not a report from the original week —
there's no class/tutor observation to add on top of what's actually in the
repo and its tests.

## What C9 asked for and what actually happened

C9 requires a change in one session to reach all other open sessions on the
same branch within about a second without reload, a documented decision for
what happens when several users act at once, and automated or repeatable
tests for propagation and concurrency.

- **Realtime propagation**: implemented over a branch-scoped WebSocket
  (`src/realtime.ts`). `spec/realtime.test.ts`'s first test measures the
  actual wall-clock time between posting a new object over HTTP and a
  second WebSocket client receiving the corresponding broadcast, and
  asserts it's under 1.5 seconds — this ran and passed locally, not just
  reasoned about (`pnpm check`, 11/11 passing as of this session; see
  `docs/agent-progress.md`).
- **Concurrency decision**: documented in
  `docs/adr/0001-realtime-and-conflicts.md` — server-accepted last-write-
  wins on edits to the *same* object, with the reasoning for why a
  version-check/409 flow or a CRDT wasn't chosen. Concurrent edits to
  *different* objects are independently retained (both tested in
  `spec/realtime.test.ts`'s "concurrent edits to different objects" case).
- **Reconnect/late-join**: a client that connects after objects already
  exist receives a full `snapshot` message on connect
  (`spec/realtime.test.ts`'s "late-joining session" test), and the frontend
  re-fetches the object list over HTTP on every (re)connect rather than
  trusting it received every diff while offline.

## A real failure along the way

The first version of the realtime spec's helper function attached its
`message` listener *after* the moment the snapshot could already have
arrived — Node's `EventEmitter` doesn't buffer events for listeners that
show up late, so the test timed out nondeterministically despite the server
behaving correctly (confirmed by writing a small standalone script that
printed every message a socket received, independent of the test
framework). Fixed by buffering every message from the moment the socket
opens and matching the predicate against the whole buffer, not just future
arrivals. Recorded in full in `PROCESS.md`'s "significant changes of
approach" section.

## What remains

Live cursors are implemented and branch-scoped but not covered by an
automated test (`spec/realtime.test.ts` checks durable-object broadcast,
not presence messages specifically) — that's an honest gap, not a passed
check. Two real, separate browser profiles have not yet been tested against
this against a live deployment as of this entry; that's tracked as
outstanding in `docs/agent-progress.md` and `docs/testing/multi-user-test.md`.
