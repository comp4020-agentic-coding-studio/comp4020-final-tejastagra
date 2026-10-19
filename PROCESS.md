# Process overview

## Where this started

This repo sat at the course starter template — one commit, nothing else —
until this session. The project previously had a different direction and 20
commits of work on a different product (a shared task-list app, "Taskflow")
in a sibling backup directory, but that work never reached this repo's
`origin` and the product itself changed to **The Wall**, a collaborative
creative canvas. This account covers the actual build of The Wall, done in
one extended agentic session against the final project brief, completing
crits 8, 9 and 10 retrospectively rather than across their original weeks.
`reflections/crit-8.md` states that plainly.

## Stack, and why

Plain Node.js (`node:http`, no framework), the `ws` package for WebSocket
broadcast, and Node 24's built-in `node:sqlite` (`DatabaseSync`) for
persistence — no ORM, no separately-installed SQLite driver. The frontend is
hand-written HTML/CSS/vanilla JS, with no build step. Full reasoning in
`docs/implementation-audit.md`'s "chosen implementation path" section; in
short, this keeps the Docker image small and compiler-free (no native build
step for persistence), and fits comfortably inside the course's
256MB/shared-cpu-1x/one-volume constraint.

Phase 1 of the build (crits 8-10) used this reasoning to also justify a
hand-written, non-FigJam visual style, in line with the brief's "no generic
SaaS template, don't clone Figma" instruction. Phase 2 (below) changed that
visual direction at the student's explicit request — the stack choice
itself (no framework, no build step) didn't change, only what's drawn with
it.

## Phase 2: FigJam-style visual overhaul and modular object types

After the Phase 1 build was deployed and verified (commit `260c78f`), the
student asked for two changes: match FigJam's visual language directly
(acknowledged as contradicting the brief's own design principle — see
README.md's "A note on the visual direction"), and add real modular object
types beyond freehand strokes and plain text — sticky notes, music embeds
(Spotify/YouTube/SoundCloud), generic iframe embeds, and image upload.

**Canvas model change.** The frontend moved from a fixed-viewport
`<canvas>` element (strokes drawn as 2D bitmap paint, text as absolutely-
positioned `contenteditable` divs) to an infinite pan/zoom "camera": a
`cam = {x, y, scale}` object drives one CSS transform on a `#camera` div
that wraps both an SVG layer (strokes, now vector `<path>` elements instead
of canvas pixels) and a card layer (every other object type). This was the
natural way to get pan/zoom "for free" across every object type at once,
and as a side effect made strokes individually selectable/addressable the
same way every other object already was — previously a stroke was baked
into a shared bitmap with no way to reference it after the fact except by
its stored data.

**New object types, server-validated.** `src/links.ts` classifies music
URLs against Spotify/YouTube/SoundCloud patterns and checks generic embed
URLs against a fixed hostname allow-list; `src/uploads.ts` decodes,
magic-byte-validates (never trusting the client's declared MIME type), and
size-caps image uploads before writing them to the same Fly volume the
SQLite file lives on. Full reasoning: `docs/adr/0004-embeds-and-uploads.md`.

**Verification.** `spec/objects.test.ts` adds 13 tests (valid/invalid cases
per type, plus a check that objects already shaped under the old `type:
"text"` schema still round-trip — no breaking change for data already on
the live Fly volume). Since no project skill covered driving this app with
a real browser, a one-off Playwright script (not committed to the repo,
built under `/tmp/pw-driver`) actually opened the rewritten canvas in
headless Chromium and exercised every new interaction: placing a sticky,
drawing a stroke, zooming, dragging a card (verified it moves by the exact
pixel delta dragged and the new position survives a page reload), adding a
Spotify music card (the real embedded player rendered), adding a Figma
embed card (the card chrome rendered correctly; a 403 inside it was
Figma's own response to a nonexistent test file path, not an app bug), and
uploading an image (persisted correctly after a full page reload). Zero
console errors across every check.

## Architecture

- `src/db.ts` — SQLite schema (`branches`, `objects` keyed by
  `(branch_id, id)`, `audit_log`) and a `Store` class: create/list/get/
  update/delete on objects, `forkBranch` (eager snapshot copy).
- `src/identity.ts` — mints and reads an `HttpOnly` per-browser cookie.
- `src/realtime.ts` — tracks connected WebSocket clients per branch and
  broadcasts to them.
- `src/log.ts` — structured JSON log lines (to stdout, for `flyctl logs`)
  mirrored into the `audit_log` table, for the six required event types.
- `src/markdown.ts` — small Markdown→HTML renderer, just enough to satisfy
  `spec/invariants.test.ts`'s heading-order check at `/readme/`.
- `src/server.ts` — wires it together: static files, the `/api/branches/*`
  JSON API, `/readme/`, and the WebSocket upgrade handler.
- `public/app.js` — fetches the branch snapshot once on load, then applies
  live WebSocket diffs; sends throttled cursor positions; renders strokes to
  a `<canvas>` and text objects as positioned `contenteditable` divs.

## Important architecture decisions

See `docs/adr/0001-realtime-and-conflicts.md` (WebSocket transport,
server-accepted last-write-wins on same-object edits),
`docs/adr/0002-identity-and-permissions.md` (anonymous cookie identity,
no per-object ownership — anyone on a branch may edit anything on it, by
product design, not oversight),
`docs/adr/0003-branches-and-forks.md` (eager snapshot-copy fork, objects
keyed by `(branch_id, id)` so a forked object keeps its original id in the
new branch), and `docs/adr/0004-embeds-and-uploads.md` (image storage on
the Fly volume rather than in the database, magic-byte upload validation,
a fixed allow-list for embeds rather than arbitrary iframe embedding, and
the iframe sandbox attributes chosen).

## How the agent was directed and corrected

This was an agentic session working from `prompt.md`'s six-hour plan,
checkpointing progress in `docs/agent-progress.md` after each task (see its
git history for the actual sequence). The main correction along the way was
self-directed through testing rather than external feedback: every claim in
this document and in `docs/agent-progress.md` was checked by actually
running the app and its test suite before being written down, per the
"honest evidence" principle in the brief and the rule this repo's own
`CLAUDE.md` states.

## Tests and logs used to investigate failures

- `pnpm check` run repeatedly against `node src/server.ts` on a real port
  (not assumed to pass) — see `docs/agent-progress.md`'s Hours 2-3 entry for
  the exact command and 11/11 result.
- Manual `curl` sequences against a running server to check fork isolation
  and restart-persistence directly, independent of the vitest harness
  (same entry).
- Server stdout (`console.log` JSON lines from `src/log.ts`) read directly
  during local testing to confirm `action_received`/`update_broadcast`
  events fired with the right branch and object ids.

## Significant changes of approach (failures and corrections)

- **TypeScript parameter-property constructor rejected by Node's type
  stripping.** `class Store { constructor(private db: DatabaseSync) {} }`
  threw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on first run — Node's built-in
  strip-only mode (used to run `.ts` files directly with no build step)
  doesn't support parameter properties. Caught immediately by actually
  starting the server rather than trusting `tsc --noEmit`, which doesn't
  catch this (it's valid TypeScript; the restriction is Node's runtime
  stripper, not the type checker). Fixed by writing the field assignment
  out explicitly in `src/db.ts`.
- **`objects.id` as a global primary key broke forking.** The first schema
  had `id TEXT PRIMARY KEY` on `objects`. Forking is designed to copy each
  object into the new branch under its *original* id (so a mark's identity
  traces back through forks), which meant every fork of a non-empty branch
  immediately hit `UNIQUE constraint failed: objects.id`. Found by
  `curl`-ing the fork endpoint directly rather than assuming the first
  passing unit test covered it. Fixed by moving to a composite primary key,
  `(branch_id, id)`.
- **A flaky realtime test, caused by a real race, not a flaky assertion.**
  The first version of `spec/realtime.test.ts`'s `nextMessage` helper
  attached a `message` listener and waited for a line matching a predicate —
  but the server sends the `snapshot` message as soon as the WebSocket
  connects, which can (and did, in testing) arrive before the listener was
  attached, since Node's `EventEmitter` doesn't buffer messages for
  listeners that aren't there yet. The test then timed out even though the
  server's behaviour was correct (confirmed with a standalone script
  first — see `docs/agent-progress.md`). Fixed by buffering every message
  from the moment the socket opens and draining that buffer against the
  predicate, rather than only listening for what arrives after the check
  starts.

## Phase 3: onboarding, nicknames and art-direction pass

After Phase 2 shipped (deployed and verified), the user pointed out a real
gap that Phase 2's own tests couldn't catch: a stranger lands on an empty
canvas with no explanation of what the project is or what forking means,
and the canvas background itself read as a flat utility screen rather than
"this is your digital space" — a direct miss against the brief's "a
stranger can use the core interaction without the developer operating the
UI" requirement.

Added a first-visit welcome overlay (`public/index.html`'s
`#welcome-overlay`) explaining the project and fork in the same honest
language already written for README.md, an optional nickname field, and a
persistent "?" button to reopen it. The welcome gates the app's boot
sequence (`public/app.js`'s `boot()`) so nobody interacts with a canvas
they haven't been oriented to. A soft gradient wash was added behind the
existing dot grid (`public/styles.css`) so the canvas itself reads as a
place rather than a blank tool.

Nicknames are deliberately a display-only layer on top of the existing
anonymous identity, not a second identity system — see ADR 0002's new
section on this. Stored in `localStorage`, sent fresh with every ephemeral
cursor ping, sanitised server-side (`src/identity.ts`'s
`sanitiseNickname`), never persisted as part of any durable object or
logged in place of the real pseudonymous id.

One real security issue was caught and fixed while building this: the
existing cursor-label rendering (`public/app.js`'s `showCursor`) used
`innerHTML` with the label interpolated directly into the string — safe
when the label was always a server-generated hex string, but a genuine
stored/reflected-XSS path the moment that label could be an arbitrary
client-supplied nickname. Fixed before it ever shipped by switching to
`textContent`-based DOM construction, consistent with how every other
user-supplied string in this app is rendered.

Verified with a Playwright-driven headless Chromium (same pattern as
Phase 2): welcome screen shows on first visit, nickname saves and shows as
"you: <nickname>", a page reload skips straight to the canvas, the "?"
button reopens the welcome with the nickname pre-filled, two separate
browser contexts with different nicknames see each other's cursor labels
correctly, and keyboard-only interaction (initial focus on the nickname
field, Enter to submit) works. `pnpm check`: 29/29, stable across 5
repeated runs (one single flake was investigated, not dismissed — see
below).

One test flake investigated rather than hand-waved: `spec/objects.test.ts`'s
oversized-image test occasionally saw the client's own `fetch` throw an
`EPIPE` instead of receiving the expected `400` response. This is an
inherent trade-off of the connection-poisoning fix from Phase 2 (closing
the connection as soon as an oversized body is detected, rather than
draining the rest of a multi-MB payload just to discard it) — depending on
exact timing, a client still mid-upload can see either outcome. Documented
in both `src/server.ts` and the test itself, and the test now accepts
either a `400` or the specific network errors this trade-off can produce,
rather than treating the non-deterministic case as a bug to paper over.

## Phase 4: a real visual identity, and a seeded canvas

The FigJam-style pass (Phase 2) and the onboarding pass (Phase 3) both
shipped something the student directly called out as "generic SaaS
software" — Inter-adjacent system fonts, a stock SaaS-purple accent,
soft-blurred drop shadows on uniform rounded-rect cards, a floating pill
toolbar with glyph-only icon buttons. All individually reasonable choices,
collectively indistinguishable from any Linear/Notion/Figma-adjacent
product's default component library. Not a matter of taste — a genuine
miss against "should feel like an artist made it."

Given a concrete reference point (Apple Garamond: warm, purposeful,
contemporary, explicitly not modern-SaaS and not punk/zine), this phase
replaced the type system (Fraunces, a warm optical-sized serif, for
display type; Instrument Sans for body/UI text — both loaded via a single
Google Fonts link, no new build tooling), the colour palette (ochre/
terracotta/sage/plum/paper — a specific considered set, not the previous
pastel Post-it palette or purple accent), and the chrome treatment (hard
offset "stamped" shadows instead of soft blur; the toolbar redrawn as a
solid ledge rather than a floating glass pill; the welcome screen as a
large italic-serif title card). `STICKY_COLORS` in `src/server.ts` and the
matching client-side swatches/`STROKE_INK` map in `public/app.js` were
updated together — these two lists must stay in sync, since the server
rejects any colour the client doesn't also offer.

The student also asked, separately, for the canvas to open with a
pre-made seed artwork that visitors build over — a direct, acknowledged
reversal of the brief's "open-ended, no pre-made mural" principle (see
`docs/adr/0005-seed-artwork.md` and README.md's note on this). Implemented
as a small hand-plotted line illustration (hills, a sun, a welcoming
sticky note — real coordinates chosen by hand, not generated) inserted
idempotently on server startup, checked by a fixed sentinel object id so a
restart never duplicates it and a student's real contribution is never
touched. Verified directly: created a real object, restarted the server
twice, confirmed the object count only grew by the real addition; forked
`main` and confirmed the fork inherited both the seed artwork and the real
object, for free, through the existing fork mechanism (ADR 0003) — no
separate seeding logic was needed for forks.

Verified visually with the same Playwright-driven approach as prior
phases: screenshotted the welcome screen, the canvas with the seed artwork
visible, a newly-placed sticky in the new palette, and the redesigned
toolbar — read each one and judged it honestly against "does this read as
artist-made" before considering the pass done, rather than assuming a
palette swap alone would satisfy the complaint.

## Current limitations and next steps

See README.md's "Known limitations and current status" section for the
product-facing list (last-write-wins conflict policy, no per-object
ownership, embeds restricted to a fixed allow-list). See
`docs/agent-progress.md`'s Phase 2 section for exactly where this part of
the build stands and the exact next task.

## Multi-user testing with Fly logs

See `docs/testing/multi-user-test.md` for the scenario matrix and results,
and `reflections/crit-10.md` for the identity/permissions/logging account.
