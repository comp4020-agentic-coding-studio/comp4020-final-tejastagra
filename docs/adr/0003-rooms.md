# ADR 0003: Rooms, and why the "one shared board" decision changed

## Status

Accepted. Supersedes the "one board, no boards-of-boards" line in the
original README and the architecture note in `docs/adr/0001` that assumed a
single global broadcast.

## Problem

The class's multi-user testing exercise asks for an "isolated room joins"
scenario: two users should be able to act in separate, non-overlapping
scopes, with actions in one never reaching the other. Taskflow had no such
scope — every task and every broadcast was global, by the deliberate
restraint recorded in the README ("no boards-of-boards") and assumed
throughout `docs/adr/0001-concurrent-task-updates.md`.

That restraint was a reasonable choice for a one-crit, one-board app. It's
wrong for this exercise, which specifically needs multiple, isolated boards
to test isolation at all. Rather than bolt on a fake room (one DB, no real
scoping) to tick the box, this reverses the restraint honestly.

## Options considered

1. **Keep one board** and simulate "isolation" by filtering client-side only.
   Rejected: the WebSocket broadcast would still reach every open tab, so a
   client in "room B" would receive room A's events and just hide them —
   that's not isolation, it's a UI illusion, and it would fail the exact
   thing the scenario is testing for.
2. **Full room objects** with creation, membership, and a directory of rooms
   to browse. Rejected as more than this needs: Taskflow still has no
   accounts, and a room directory implies discoverability this app doesn't
   want (anyone with the link should be the whole access model, same spirit
   as the no-accounts decision in ADR 0002).
3. **A room as a URL-addressable scope** (chosen): `?room=<id>` on the page,
   the API, and the WebSocket connection. No creation step — a room exists
   the moment someone links it. Tasks are stored with a `room_id` column;
   `GET /api/tasks` filters by it; broadcasts are filtered to sockets that
   joined with the same room id.

## Decision

Option 3. A room is nothing more than a string carried in the query string
everywhere that matters:
- `public/app.js` reads `?room=` once from `location.search` (default
  `"general"`) and uses it on every `fetch("/api/tasks...")` call and on the
  WebSocket URL.
- `src/server.ts`'s `roomFromUrl` helper applies the same default server-side,
  so a bare link still behaves exactly as the pre-room app did.
- `src/db.ts` adds a `room_id` column (migrated in for the already-deployed
  volume, back-filled to `"general"` — see "Migrating the already-deployed
  database" below) and `TaskStore.all(roomId)` filters by it.
- `src/realtime.ts`'s `broadcast` only sends to WebSocket clients whose
  remembered `roomId` (set once, on connection, in `server.ts`) matches the
  event's room — this is what actually gives rooms broadcast isolation, not
  just filtered reads.

This keeps the "no accounts, small surface" spirit: nobody creates a room,
nobody manages membership, and ownership/identity (ADR 0002) are unchanged
and apply the same way inside every room.

## Migrating the already-deployed database

The live volume's `tasks` table predates `room_id`. Unlike ADR 0002's
ownership migration (which deliberately locks pre-existing rows out, since
ownership is a permission), a room is a view scope, not a permission — so
every pre-existing task is back-filled to `room_id = 'general'`, the same
default a room-less link already resolves to. Nothing already on the board
disappears from view.

## Consequences and trade-offs

- **The README's "no boards-of-boards" line no longer describes this app**
  and has been updated. The restraint it was protecting (keep the surface
  small) still holds in spirit — there's no room list, no room settings,
  nothing to manage — but "one board" is no longer literally true.
- **A room is discoverable only by its link**, exactly like the whole app
  already was ("anyone with the link"): there's no way to enumerate rooms,
  which is a feature here, not a gap.
- **No cross-room anything**: a task can't move rooms, and there's no "see
  all my rooms" view. That's deliberately out of scope for what this
  exercise needed.
- **Ownership and the audit log are per-room only incidentally** — an
  identity (cookie) is still global across rooms, so the same person can
  own tasks in several rooms, and the audit log records which room an action
  happened in via the task id, not a dedicated column. Good enough for this
  exercise; would need revisiting if rooms became a permanent, prominent
  feature rather than a testing aid.
