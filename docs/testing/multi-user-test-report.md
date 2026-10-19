# Multi-user testing with Fly logs

Class exercise (week of 2026-10-19): drive the deployed Taskflow app with
independent "users" and confirm, from the live server's own behaviour and
`flyctl logs`, that the multi-user guarantees documented in
[`docs/adr/0001`](../adr/0001-concurrent-task-updates.md),
[`docs/adr/0002`](../adr/0002-identity-and-ownership.md) and
[`docs/adr/0003`](../adr/0003-rooms.md) actually hold. Every result below is
from the real deployed app at `https://comp4020-final-tejastagra.fly.dev`,
not a local run — `APP_URL=https://comp4020-final-tejastagra.fly.dev pnpm
check` was green both before and after this exercise.

"Users" are independent cookie-jar HTTP/WebSocket clients, the same pattern
already used in `spec/ownership.test.ts`, `spec/tasks.test.ts` and the new
`spec/rooms.test.ts` — which is exactly what two separate browser tabs are
to this server (ADR 0002).

## What changed to make this testable

- `src/server.ts` / `src/realtime.ts` / `public/app.js`: rooms
  (`?room=<id>`), per [`ADR 0003`](../adr/0003-rooms.md) — needed for
  scenario (f), isolated rooms, which didn't previously exist.
- `src/server.ts` / `src/realtime.ts`: connection lifecycle logging —
  `[conn] joined`/`[conn] left` on every WebSocket connect/close, and
  `[snapshot] sent ...` on every `GET /api/tasks` — so `flyctl logs` narrates
  who joined, left, and was sent what, on top of the existing
  `[audit]`/create/update/delete logging from crit 10.

## Scenario results

### (a) Two users join

Two independent identities (`alice`, `bob`) hit `/api/me` and open
WebSockets in the same room. Confirmed distinct cookie-derived ids:

```
alice identity: 008bab6e-ff01-4862-98d2-6a55d0c7f196
bob identity:   a2293910-96ed-40c2-848a-fcf877f70fb7
distinct: true
```

Expected (ADR 0002): a person is one cookie jar; two jars are unambiguously
two people. **Pass.**

### (b) One user's action propagates to the other

Alice creates a task; Bob's open WebSocket receives the `created` broadcast
within ~800ms (well under the 1s realtime target).

```
alice created task 232f286f... bob received broadcast: true
```

Log line: `[broadcast] created room=scenario-... to=2 clients`. **Pass.**

### (c) Simultaneous action, same client/session

Two readings of this scenario were run:

1. **Two different people act on the same task at once.** Alice (owner)
   completes it; Bob (not the owner) tries to edit it concurrently. Bob's
   write is rejected regardless of timing, because ownership (ADR 0002) is
   checked before the concurrency version even matters:
   ```
   alice patch status: 200   bob patch status: 403
   bob patch body: {"error":"only the task's owner may change it"}
   ```
   Log: `[audit] DENIED update ... not the owner`. **Pass** — server-side
   permission, not a client race.

2. **The same owner issues two concurrent writes to the same task**
   (the real test of ADR 0001's optimistic concurrency): both requests carry
   the version they last saw; exactly one wins.
   ```
   race write A status: 200   race write B status: 409
   ```
   The loser is told (`409 conflict`, with the current state), not silently
   overwritten — exactly the decision ADR 0001 documents. **Pass.**

### (d) Late user joins

A third identity ("carol") joins after tasks already exist and fetches
`GET /api/tasks` cold — no WebSocket history, no replay:

```
carol (late joiner) sees 2 tasks in room, includes alice's task: true
```

Log: `[snapshot] sent room=... count=2 to actor=...`. Confirms the snapshot
endpoint, not a WebSocket replay, is what a late joiner relies on. **Pass.**

### (e) Leave & return

Alice's socket is closed, then a fresh socket is opened and `GET
/api/tasks` is re-fetched (mirroring what `public/app.js`'s `connect()`
does on reconnect — see its comment on resyncing after a dropped
connection):

```
alice reconnected, resync fetch sees 2 tasks
```

Server log shows the leave: `[conn] left room=... clients=N`. **Pass** — no
reload needed, state recovered on reconnect as designed.

### (f) Isolated room joins

A separate room (`scenario-B-...`) is joined by a fourth client while Alice
creates a task in the original room:

```
dave (room B) received room A's broadcast (should be false): false
room B's task list contains room A's task (should be false): false
```

Confirmed at both layers: the WebSocket broadcast never reaches a
differently-roomed socket (`src/realtime.ts`'s `broadcast` filters by
`roomId`), and the REST list is filtered by room too
(`TaskStore.all(roomId)` in `src/db.ts`). Also covered mechanically in
`spec/rooms.test.ts`. **Pass.**

### (g) Scale machines until two users land on different machines

`mise exec -- flyctl scale count 2 -a comp4020-final-tejastagra` was run
against the live app. This is the one scenario that **does not pass** —
and the failure is architectural, not incidental, exactly as
`docs/adr/0001` and the Dockerfile/fly.toml commentary predicted (one
SQLite file on one Fly volume, deliberately not a shared or clustered
store).

What happened:
- Fly's own scale plan said it outright: `+1 machines ... +1 volumes` — a
  second machine does **not** get the same volume; it gets a brand new,
  empty one (`vol_vden9677epl6nm34` next to the original
  `vol_4912m529y1ymo5or`).
- With two machines up, 20 task-creation requests against the same `?room=`
  were split across both (confirmed from `flyctl logs`: broadcasts tagged
  `app[683d511f229998]` and `app[2870307cd07328]` both fired for the same
  room), and **the two machines disagreed about how many tasks existed in
  that room** — one `GET /api/tasks` saw 9, another saw 11, for the exact
  same room, because each machine was reading its own separate SQLite file:
  ```
  created 20 tasks total
  client A's own GET sees 9 tasks in the room
  client B's GET (fresh cookie jar, same HTTP client pool) sees 11 tasks in the room
  ```
- This is genuine data loss risk, not a cosmetic glitch: depending on which
  machine Fly's proxy routes a given request to, a user can see a task
  disappear, double up, or fail a concurrency check against a version
  number the machine they're talking to never saw.

**Verdict: fails, as expected by the app's documented architecture.**
Taskflow is deliberately single-writer (ADR 0001 chose optimistic
concurrency against *one* SQLite file, explicitly ruling out a clustered
store as unnecessary for this scope) — `fly scale count 2` is simply outside
that contract, and Fly does not stop you from doing it anyway. The app was
scaled back to 1 machine and the extra (empty) volume deleted immediately
after this test; see "Recovery" below for what that took.

### (h) Restart machine mid-session

A task was created, a WebSocket opened in its room, then
`mise exec -- flyctl machine restart <machine-id> -a comp4020-final-tejastagra`
was run while the socket was open:

```
t+28s socket readyState=1  (still open)
t+30s socket readyState=3 events=["closed@...T03:36:09.735Z"]   (closed by the restart)
...
after window: task still present: true
```

Fly logs show a graceful shutdown and reboot:
```
INFO Sending signal SIGINT to main child process
INFO Main child exited with signal (SIGINT)
INFO Starting clean up. Umounting /dev/vdc from /data
reboot: Restarting system
... (firecracker reboot, remount /data) ...
Taskflow listening on 0.0.0.0:8080
[snapshot] sent room=scenario-h-... count=1 to actor=...
```

The WebSocket dropped (expected — the process restarted) and the client's
own reconnect-and-resync logic (same as scenario (e)) picked the state back
up afterward, with the task intact on the persistent volume. **Pass** —
this is the scenario the single-volume architecture *is* built for (one
machine, restartable, durable `/data`), as opposed to (g), which isn't.

## Recovery from the scenario (g) scale-down

Scaling back down with `flyctl scale count 1` destroyed the **original**
machine (the one attached to the real data volume) and kept the one
attached to the new, empty volume — which briefly left the live app serving
zero tasks, discovered immediately by checking `GET /api/tasks` against the
deployed URL (not by trusting the scale command's exit code — the same
"test the exact artifact, don't trust a tool's success message" habit
`CLAUDE.md` already asks for). Fixed by:

1. `flyctl machine clone <machine> --attach-volume <original-volume-id>:/data`
   to bring up a fresh machine attached to the original volume.
2. `flyctl machine destroy` on the machine still attached to the empty
   volume.
3. `flyctl volumes destroy` on the now-unattached empty volume, to leave
   exactly the one machine and one volume the app started with.

Confirmed afterward: `GET /api/tasks` on the live app again showed the
original three pre-existing tasks, and a full `pnpm check` run against
`https://comp4020-final-tejastagra.fly.dev` was green (17/17).

## Summary

| Scenario | Result |
|---|---|
| (a) two users join | Pass |
| (b) action propagates | Pass |
| (c) simultaneous action | Pass (ownership blocks one path; optimistic concurrency arbitrates the other) |
| (d) late join | Pass |
| (e) leave & return | Pass |
| (f) isolated rooms | Pass |
| (g) scale to 2 machines | **Fails** — documented architectural limit, not a bug to fix |
| (h) restart mid-session | Pass |

Taskflow's realtime and concurrency guarantees hold for everything the
documented architecture promises (one machine, one volume, rooms as a view
scope). Scenario (g) is the one place the exercise found a genuine limit:
this app cannot safely run on more than one machine without a shared data
store, which was already an explicit, written-down trade-off
(`docs/adr/0001`) rather than something this exercise discovered by
accident — but seeing the actual divergent task counts live is stronger
evidence for that trade-off than the ADR's reasoning alone.
