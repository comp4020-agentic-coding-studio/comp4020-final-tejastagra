# Multi-user test: The Wall

**Deployment URL:** https://comp4020-final-tejastagra.fly.dev/
**Build/commit tested:** `609e8d9` (deployed via `flyctl deploy --remote-only
--ha=false -a comp4020-final-tejastagra`)
**Test date:** 2026-10-19
**Browser/profile setup:** Most scenarios below were driven by scripted
`ws`/`fetch` clients against the live deployed URL from this session (each
acting as an independent HTTP/WebSocket client, equivalent to a separate
browser's cookie jar and connection — but not an actual human-operated
Chrome profile). Scenarios that specifically require a human operating two
real browser profiles are marked `Not run` below, honestly, rather than
claimed.
**Log command:** `mise exec -- flyctl logs -a comp4020-final-tejastagra`

## Scenario matrix

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Two users join the same branch | **Pass** | Two WebSocket clients opened against a freshly-forked branch; both received their own `snapshot` message and both show as connected. |
| 2 | One user's action appears for the other within ~1s | **Pass** | Scripted test: client B connected and drained its snapshot, then client A `POST`ed a new object; client B's `object_created` broadcast arrived in **72ms**. |
| 3 | Simultaneous edits to different objects; conflicts on the same object | **Pass** | Two different objects `PATCH`ed concurrently (via two parallel curl processes) — both edits retained independently. Same object `PATCH`ed twice in sequence — the second write's value (`"second-writer"`) is what's stored, confirming the documented server-accepted last-write-wins policy (ADR 0001). |
| 4 | A late user joins and receives a state snapshot | **Pass** | An object was created on a branch before any WebSocket connected; a client that connected afterward received a `snapshot` message containing that object. |
| 5 | A user leaves and returns | **Pass** (partial — scripted, not human) | Closing a scripted WebSocket connection produced a `user_leave` log line (see `flyctl logs` excerpt below); reconnecting is the same code path as "late join" above (re-fetches the branch's object list), which is separately verified. A human closing and reopening an actual browser tab was not separately driven. |
| 6 | Closing a tab clears stale presence | **Pass** (scripted equivalent) | Closing a scripted client's WebSocket produced `user_leave` and the server broadcasts a `presence_left` message to remaining clients on that branch (see `src/server.ts`'s `ws.on("close", ...)` handler); not separately re-verified with a live human tab close. |
| 7 | Users on separate branches don't receive each other's updates/presence | **Pass** | Two independently forked branches, each with a connected WebSocket client; an object created on branch A never arrived at branch B's client within a 1.5s window. Also covered by `spec/realtime.test.ts`'s "does not broadcast across branches" test. |
| 8 | An invalid or unauthorised action is rejected and logged | **Pass** | `POST` with `type: "bogus"` returned `400` with a clear validation message, and `action_rejected` with that reason was logged server-side (confirmed in `flyctl logs`). A request against a nonexistent branch id also returned `404` and logged `action_rejected`/`"unknown branch"`. |
| 9 | Multiple Fly machines | **Not run** | This app runs one `shared-cpu-1x` machine per `fly.toml` (the course's fixed shape) with a single SQLite file on the mounted volume — there is no multi-machine replication story for this persistence design, and scaling to a second machine would give it an empty, disconnected volume rather than shared state (same risk documented in the reference backup's own crit-10 notes). Deliberately not attempted, to avoid leaving the live app in a split-brain state for no test value. |
| 10 | A controlled restart preserves content and clients recover | **Pass** (verified locally, not against the live app) | Verified directly against a local `node src/server.ts` process and the Docker image: created an object, killed the process, restarted it pointed at the same database path, confirmed the object was still present with the same id (see `docs/agent-progress.md`, Hours 2-3 and Docker-build entries). Not independently repeated against the live Fly machine, to avoid restarting a service currently serving the test suite above. |
| 11 | Parent and fork remain isolated | **Pass** | Against the live deployment: forked a branch with one seeded object, added a new object to the parent after forking (fork's object count stayed at 1), then edited the fork's copy of the inherited object and confirmed the parent's copy of the same object id was unchanged. |
| 12 | A later visit can recover a persistent trace | **Pass** | An object created via one request was found again via a completely separate, later `GET` request against the same branch — the general shape of "come back and find your mark," verified against the live deployed URL. |

## What's genuinely outstanding

Scenarios 5, 6, 9 and 10 have an automated or single-machine equivalent
verified above, but the brief's own crit 10 requirement — "at the crit, two
users can use the deployed URL in separate Chrome profiles while the
student narrates from logs without operating the app" — needs an actual
human opening two real browser windows against the live URL. That hasn't
happened as part of this agentic session (there is no browser automation
available in this environment), and is recorded here as the honest gap it
is, not folded into the "Pass" rows above. The scripted clients used for
scenarios 1–4, 7, 8, 11 and 12 exercise the same server-side code paths a
real browser would (same HTTP API, same WebSocket protocol, same cookie-
based identity), so they're meaningful evidence that the mechanism works —
but they are not a substitute for the specific human, two-Chrome-profile
crit exercise the brief asks for.

## Sample log output (six required event types, all observed live)

```
{"ts":"...","event":"user_join","user_id":"...","branch_id":"...","outcome":"ok"}
{"ts":"...","event":"user_leave","user_id":"...","branch_id":"...","outcome":"ok"}
{"ts":"...","event":"action_received","user_id":"...","branch_id":"...","object_id":"...","action":"create","outcome":"ok","request_id":"..."}
{"ts":"...","event":"update_broadcast","user_id":"...","branch_id":"...","object_id":"...","action":"create -> 2 client(s)","outcome":"ok","request_id":"..."}
{"ts":"...","event":"action_rejected","user_id":"...","branch_id":"does-not-exist","outcome":"rejected","reason":"unknown branch","request_id":"..."}
{"ts":"...","event":"state_snapshot_sent","user_id":"...","branch_id":"...","outcome":"ok","request_id":"..."}
```

No cookie values, session tokens, or raw high-frequency cursor positions
appear in any log line (see `docs/adr/0002-identity-and-permissions.md`).

## An honest observation, not yet fully explained

During this testing session, `flyctl logs` also showed repeated
`proxy ... "could not complete HTTP request to instance: hyper error:
connection closed before message completed"` lines in the few minutes right
after the deploy. Every direct HTTP check (`curl`, `pnpm check`) against
the live URL succeeded both before and after this window, so the working
hypothesis is that this is Fly's `auto_stop_machines`/`min_machines_running
= 0` behaviour (set in `fly.toml`) cycling the single machine between the
test suite's traffic bursts and the idle gaps between them, not an
application-level bug. This hasn't been root-caused further than that
hypothesis and is recorded here rather than silently dropped.
