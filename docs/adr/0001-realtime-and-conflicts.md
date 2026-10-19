# ADR 0001: realtime transport and same-object conflict policy

Status: accepted

## Context

The Wall needs changes made in one session to show up in every other open
session on the same branch within about a second, without a reload. It also
needs a documented, deterministic answer for what happens when two people
edit the same object at close to the same time — the brief explicitly asks
for a stated policy rather than an accidental one.

## Options considered

**Transport**: Server-Sent Events, polling, or a WebSocket. Polling can't
reliably land under a second without hammering the server; SSE is one-way,
and cursor/stroke updates need to flow client → server too, which would
still need a second channel. A single WebSocket per client carries both
durable-object mutations' resulting broadcasts and ephemeral presence on one
connection.

**Conflict policy on the same object**: three real options —
last-write-wins (whichever write reaches the server last simply overwrites),
optimistic concurrency with a version check (reject a write based on stale
data with a 409, make the client retry), or a CRDT/merge approach.

## Decision

- **Transport**: `ws` WebSocket, one connection per client, scoped to a
  branch via a `?branch=` query parameter on the upgrade request. All
  durable mutations happen over plain HTTP `POST`/`PATCH`/`DELETE` on
  `/api/branches/:id/objects[/:objectId]`; the corresponding broadcast is
  sent over WebSocket to every other client on that branch immediately
  after the SQLite write commits. The same socket also carries ephemeral
  `cursor` messages, which are relayed, never persisted, and never logged
  (see `src/realtime.ts`, `src/server.ts`).
- **Conflict policy**: **server-accepted last-write-wins**. A `PATCH` on an
  object always succeeds and overwrites the stored `x`/`y`/`data`, bumping
  `version`, regardless of what the client last saw. There is no
  stale-write rejection.

## Reasons

- This app's real content — freehand strokes and short text notes — rarely
  has two people editing the exact same object at the exact same instant,
  and when it does, the cost of silently keeping the most recent change is
  low (it's a canvas, not a form with financial consequences). A 409/retry
  flow or a CRDT would add real complexity for a case this product doesn't
  need to handle more carefully.
- WebSocket over SSE+polling keeps one connection, one reconnect/backoff
  path, and one place (`clientsOnBranch`) that decides who sees what.

## Consequences

- Two overlapping edits to the *same* object can lose one person's
  intermediate state — whichever `PATCH` the server processes last wins
  outright, with no warning to the person whose edit was overwritten. This
  is the documented, deliberate trade-off, not an oversight.
- Edits to *different* objects never collide — each row is independent, so
  this is purely a same-object concern (verified in
  `spec/realtime.test.ts`'s "concurrent edits to different objects" case).
- A reconnecting client re-fetches the full object list over HTTP rather
  than relying on having received every WebSocket diff while disconnected,
  so reconnect and "come back tomorrow" land on the same code path (both go
  through `GET /api/branches/:id/objects`, verified by the "late join"
  realtime test and the persistence test).
