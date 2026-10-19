# ADR 0005: seed artwork on the main branch

Status: accepted

## Context

The final project brief is explicit: "The canvas must be white or
warm-white and open-ended. Users' creations supply the colour and visual
density," and separately, under non-goals, implies no pre-made mural
background — the canvas should start empty. The user directing this build
asked for the opposite, after being told plainly that it conflicts: the
canvas should open with a pre-made seed artwork that visitors then build
over, which persists and is inherited by forks like any other content.

This ADR records that as a deliberate, acknowledged reversal of the
brief's original principle — the same treatment given to the FigJam visual
identity request (see README.md's "A note on the visual direction") — not
a quiet redesign presented as if it were always the plan.

## Decision

A small, hand-authored set of canvas objects (`src/seed.ts`'s
`SEED_STROKES` plus one welcoming sticky note) is inserted into the `main`
branch once, checked by a sentinel object id
(`seed-artwork-v1`) before every insertion so a server restart never
duplicates it. Called once from `src/server.ts` at startup
(`ensureSeedArtwork(store)`), after `openDb`/`Store` are constructed and
before the HTTP server starts accepting requests.

## Options considered

- **A one-off migration script**, run manually once against the deployed
  database. Rejected: easy to forget to run after a fresh deploy or a
  volume reset, and leaves no record in the running code of what the
  canvas is supposed to start with.
- **Insert unconditionally on every startup.** Rejected outright: would
  duplicate the seed artwork on every restart, and is exactly the kind of
  bug this app's own `CLAUDE.md` warns against — not running the thing to
  find out.
- **Idempotent insertion on every startup, gated by a sentinel check**
  (the chosen approach): self-healing (a fresh/reset database always ends
  up seeded, no separate step to remember) and safe to run every time the
  server starts, including after every future redeploy, without risking
  duplication or touching real content.

## Why this doesn't touch real content

The sentinel check (`store.getObject("main", SEED_SENTINEL_ID)`) is
read-only and happens before any write; if the seed objects already exist
(by their fixed, well-known ids), nothing is inserted. A real object a
student has added since has an independently-generated UUID and is never
read, matched, or touched by this check. Verified directly: created a real
object, restarted the server twice, confirmed the object count only ever
grew by the real addition, never by a re-inserted seed.

## Consequences

- Every fork of `main` (and every fork of a fork, and so on) inherits the
  seed artwork automatically, for free, through the existing fork
  mechanism (ADR 0003's eager snapshot-copy) — no separate "seed a new
  fork" logic was needed.
- This is a one-time, fixed piece of art. There's no mechanism to update
  or replace the seed artwork other than editing `src/seed.ts` and bumping
  the sentinel id (e.g. to `seed-artwork-v2`), which would insert a
  *second* seed artwork alongside the first rather than replacing it —
  acceptable for this app's scale and not attempted as a "seed version
  migration" system, which would be over-engineering for a single
  hand-authored piece.
- Directly contradicts the brief's original "open-ended, no pre-made
  mural" principle, as intended and documented, not accidentally.
