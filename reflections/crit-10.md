# Crit 10 reflection

Retrospective, same single session as crit-8 and crit-9's reflections —
no original-week class observation to report.

## What C10 asked for and what actually happened

C10 requires two or more users acting on shared state from separate browser
profiles, the server distinguishing users (stable pseudonymous ids),
server-side permission checks, persistent server-side logs inspectable via
`flyctl logs`, and a crit narration from logs with two live profiles.

- **Identity**: an `HttpOnly` cookie minted per browser on first contact
  (`src/identity.ts`). `spec/branches.test.ts`'s "two independent sessions
  get distinct identities" test uses two separate cookie jars (simulating
  two browser profiles) and asserts the `created_by` on objects they create
  differ — this ran and passed.
- **Server-side permission checks**: documented in
  `docs/adr/0002-identity-and-permissions.md`. The Wall's actual permission
  model is deliberately *not* per-object ownership (anyone on a branch may
  edit anything on that branch, matching a shared-wall product), but the
  server does independently validate every write's shape, size, and target
  branch existence regardless of client claims, and rejects + logs invalid
  or unauthorised-branch actions (`validateObjectInput`,
  `spec/branches.test.ts`'s invalid-type and unknown-branch tests).
- **Structured logs**: `src/log.ts` emits one JSON line per event for all
  six required types (`user_join`, `user_leave`, `action_received`,
  `update_broadcast`, `action_rejected`, `state_snapshot_sent`), each
  carrying a timestamp, pseudonymous user id, branch id, and object id
  where relevant — printed to stdout (for `flyctl logs -a
  comp4020-final-tejastagra`) and mirrored into a durable `audit_log` SQLite
  table so history survives a restart, not just the process's lifetime.
  Verified locally by reading the actual stdout lines a running server
  produced during manual curl testing (see `docs/agent-progress.md`), not
  assumed from reading the code.

## What's honestly not yet done

Two real, separate Chrome profiles narrated live from `flyctl logs` against
the *deployed* URL has not happened as of this entry — that requires an
actual Fly deployment to exist first, and is tracked as the exact next
blocking step in `docs/agent-progress.md` and the scenario matrix in
`docs/testing/multi-user-test.md`, marked `Not run` rather than claimed.
