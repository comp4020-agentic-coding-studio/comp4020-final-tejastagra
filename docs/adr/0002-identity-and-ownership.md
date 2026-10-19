# ADR 0002: How Taskflow tells people apart, and what each may change

## Status

Accepted.

## Problem

Crit 10's spec requires the app to be genuinely multi-user: two or more
people, each in their own browser, acting on shared state, with the app
telling them apart — and whatever each of them may see or change has to be
checked on the server, not assumed from the client, and written down here.

Taskflow's README already commits to "no accounts" as a deliberate
restraint (the brief allows it, and a smaller surface is less to break under
the realtime target). That restraint still has to coexist with "the app
tells people apart."

## Options considered

1. **Full accounts** (username/password, or an auth provider). Gives a
   strong, durable identity, but directly contradicts the "no accounts"
   decision already made and documented in the README, for a task list that
   doesn't need the durability a login buys — nobody expects their Taskflow
   identity to survive a different browser or a cleared cookie jar.
2. **Anonymous per-browser identity via a server-set cookie** (chosen). On
   first visit, the server mints a random id, persists it (name, id) in
   SQLite, and sets it as an `HttpOnly` cookie. Every subsequent request
   carries that cookie, so the server can attribute every read and write to
   a specific browser without a login step. The person can set a display
   name, purely cosmetic — the identity the server checks against is the
   cookie's id, never the typed name.
3. **A name typed into a form field, sent with every request, trusted as
   identity.** Simplest to build, but it's client-asserted: nothing stops
   one browser claiming to be "Alex" and acting as them. Fails "checked on
   the server" outright.

## Decision

Option 2. Identity is a random id in an `HttpOnly` cookie, set by the server
on first contact (`ensureIdentity` in `src/identity.ts`) and never read or
set by client JS — so it can't be forged or overwritten by a script running
in the page the way a value in `localStorage` could be. The display name is
a separate, mutable, purely cosmetic field a person can set for themselves;
it appears in the UI and the audit log, but no permission check is ever
based on it.

This directly answers "what counts as a person is your call": here, a
person is a browser (one cookie jar) — which is exactly what the crit
rehearsal tests, since two Chrome profiles share no cookies and are
therefore unambiguously two different people to this app.

## What each person may see and change

- **See:** the whole shared board. Taskflow's whole premise (README) is one
  shared, live list — hiding tasks by owner would turn it into separate
  private lists wearing a shared UI, which is a different app.
- **Change:** only the tasks they created. `PATCH` and `DELETE` on
  `/api/tasks/:id` compare the request's identity cookie against the task's
  stored `owner_id` (`src/server.ts`) and respond `403` on a mismatch,
  before touching the database — not a client-side disabled button (the UI
  does disable the controls too, as a courtesy, but that's advisory; the
  `403` is what actually stops it, and `spec/ownership.test.ts` hits the API
  directly to prove the UI isn't load-bearing).
- Creating a task always records the creator's id and current display name
  as its owner, at creation time (`TaskStore.create` in `src/db.ts`), so
  ownership is fixed once and doesn't silently move if someone renames
  themselves later.

## Consequences and trade-offs

- A cleared cookie, or a different browser, is a different person to this
  app — there's no way back into "your" tasks without the original cookie,
  which is the expected cost of choosing anonymity over accounts, and was
  already implied by README's "no accounts" decision.
- A display name is not a durable identity and two people can pick the same
  one; the audit log and ownership checks use the cookie id underneath, so a
  name collision is cosmetic confusion, never a security issue.
- This is a coarser permission model than most real task trackers (no
  shared ownership, no "assign to"): deliberately so, since the brief asks
  for *a* multi-user decision with a reason, not the most featureful one.
