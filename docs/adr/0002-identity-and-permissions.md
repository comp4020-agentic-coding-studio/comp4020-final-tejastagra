# ADR 0002: identity and permissions

Status: accepted

## Context

The brief requires the server to distinguish users without requiring
accounts, student numbers or real names (privacy by default), to log who
did what, and to enforce server-side permission checks rather than relying
on the client's word.

## Options considered

- **No identity at all** — simplest, but fails the explicit requirement
  that the server distinguish users and log actions per-user, and makes
  "two users, distinct identities" unverifiable.
- **Account system (sign-up, login)** — gives a stable, strong identity but
  directly conflicts with "privacy by default" and "no implication of
  official endorsement"; out of scope for a campus graffiti-wall analogue.
- **Anonymous per-browser identity via an `HttpOnly` cookie**, minted by
  the server on first contact.
- **Client-supplied identity** (e.g. a `localStorage` value sent in a
  header) — rejected: trivially forgeable, so it can't ground a real
  permission check or a trustworthy log.

## Decision

A person is one browser's cookie jar: the server mints a random id
(`src/identity.ts`, `randomUUID()`) on first contact and sets it as an
`HttpOnly`, `SameSite=Lax` cookie, never read or written by client-side JS.
Every HTTP request and WebSocket upgrade resolves this cookie to a
`created_by`/`user_id` used in persistence and logging. A short 8-character
prefix (`shortLabel`) is shown in the UI and on presence cursors so people
can tell each other apart without exposing the full id.

### What each identity may do

The Wall has **no per-object ownership restriction** — anyone on a branch
can create, move, edit or delete any object on that branch. This is a
deliberate product decision, not a gap: a shared graffiti wall's whole
premise is that marks are public once made, the way they would be on a
physical wall. What *is* permission-checked server-side:

- An object write (`POST`/`PATCH`/`DELETE`) is only accepted for a branch
  that exists (`store.getBranch`) — writes to an unknown or mistyped branch
  id are rejected with 404 and logged as `action_rejected`.
- Input shape and size are validated server-side regardless of what the
  client claims (`validateObjectInput`): object `type` must be one of a
  fixed set, `x`/`y` must be finite numbers, and `data` is capped at
  200 KB — independent of whatever the client-side tool palette sends.
- Presence and cursor messages are scoped to the sender's own branch
  connection; a client cannot direct a cursor message at another branch.

## Reasons

An `HttpOnly` cookie can't be forged the way a `localStorage` value or a
request header the client fully controls can — the server is the only
party that ever sets it. Treating "anyone on a branch can edit anything" as
the permission model (rather than per-object ownership) matches the
product's actual values (no engagement competition, no gatekeeping of
creative marks) while still giving every write a traceable, non-forgeable
actor for the audit log.

## Consequences

- Clearing cookies or switching browsers makes someone a new, unconnected
  identity with no way back to their previous contributions — an accepted
  trade-off of "no accounts."
- Because there's no ownership check, a bad actor on a branch can delete
  someone else's mark; the mitigation is branch-level, not object-level —
  forking lets a group route around an uncooperative shared branch, and
  every delete is attributed and logged, which is the accountability
  mechanism this product uses in place of locks.
- Every one of the six required log events carries this pseudonymous id,
  never a cookie value itself (the cookie's raw contents never appear in
  `console.log` or the `audit_log` table — see `src/log.ts`).
