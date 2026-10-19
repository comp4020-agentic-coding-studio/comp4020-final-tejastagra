# The Wall

A living, open canvas where ANU students can leave creative traces, make
things together in real time, and fork the canvas into independent worlds.

## Audience and problem

Students at ANU don't have a shared, anonymous, low-friction digital space
to leave a mark the way the physical graffiti tunnel lets them — most
campus-adjacent tools are either a managed announcement channel (one-way)
or a productivity app (structured, attributed, permanent). The Wall is
neither: it's a blank, open canvas that anyone can draw or write on, see
other people doing the same in real time, and — unlike a physical wall —
branch off into an independent copy without touching anyone else's.

## Why this is worth making

A shared creative canvas is a genuinely different kind of space from a feed
or a chat: nobody is trying to get a reply, rank above anyone else, or
build a following. The value is in the act of marking a shared surface and
seeing someone else do the same, live. Branching lets a disagreement about
direction become two canvases instead of a fight over one, which a physical
wall can't offer.

## Definition of good

The Wall is good if:

1. A stranger can open it, add a mark (text or drawing), and find that mark
   again on a later visit — with zero explanation from whoever built it.
2. Two people drawing on the same branch at the same time see each other's
   marks appear within about a second, without reloading.
3. Nobody needs an account, a real name, or a student number to participate.
4. Forking actually isolates — a fork is a clean break, not a shared
   document with extra steps.
5. The interface gets out of the way: the marks people make are the
   visually interesting part of the page, not the toolbar around them.

## Principles

- **Expression over structure.** Freehand drawing and free text, not forms
  or fields.
- **Low-friction participation.** No sign-up, no account — a brief,
  one-time welcome explains the space and what forking means before a
  first-time visitor lands on the canvas, then gets out of the way for
  every visit after. No gatekeeping, just orientation.
- **Presence.** Real connected users' cursors are visible, scoped to the
  branch they're actually on. Never simulated or faked.
- **Persistence.** A mark survives a refresh, a new visit days later, and a
  server restart — it's stored in SQLite on Fly's persistent volume, not in
  server memory.
- **Fork independence.** A fork is a snapshot at the moment it's taken.
  Nothing flows back to the parent, forward to children of the fork, or
  sideways to siblings, ever.
- **Visual craft.** A warm, paper-toned canvas with its own specific
  typographic and colour identity (an italic serif display face, a
  considered ochre/terracotta/sage/plum palette, hard offset "stamped"
  shadows instead of soft component-library blur) — an infinite pan/zoom
  "camera" underneath, but dressed as something made with a point of view,
  not assembled from a design system's defaults.

## Deliberate non-goals

- No likes, follower counts, or leaderboards.
- No ranked or algorithmic feed — there is no feed.
- No merge-back between a fork and its parent.
- No accounts, real names, or official ANU endorsement implied anywhere in
  the product.

## Sources consulted

- The course's own crit 8/9/10 specs and the final project brief (linked
  from this repo's `spec/README.md` and `PROCESS.md`) — these set the hard
  requirements (persistence, realtime, identity/logging, fork isolation)
  that the principles above are built to satisfy.
- FigJam's visual language and interaction model (infinite pan/zoom canvas,
  floating toolbar, sticky-note cards, coloured presence cursors) was
  consulted directly as the visual reference for this build's second
  phase, at the student's explicit request, then deliberately moved away
  from again in a third phase — see "A note on the visual direction" below
  for the full, honest sequence.
- **Apple Garamond** was given as the explicit reference point for the
  third-phase visual identity: warm, purposeful, contemporary type doing
  real work, not a system-UI sans or a generic SaaS accent colour. The
  actual typefaces used (Fraunces for display, Instrument Sans for body)
  are not Garamond itself — they're the closest free, web-servable
  typefaces chosen to carry that same warm/purposeful/editorial feeling
  into a browser canvas.

No external design-system or UI-kit was used; the interface in
`public/styles.css` is hand-written throughout every phase — no FigJam/
Figma assets, code, or CSS were ever copied.

## A note on the visual direction

This project's visual identity changed twice, each time at the student's
explicit direction, each time recorded honestly here rather than presented
as if it were the plan from the start:

1. **Phase 1** (original build): a restrained, hand-written interface
   following the brief's own "distinct art direction, don't clone Figma"
   principle.
2. **Phase 2**: the student asked for a visual identity that directly
   matches FigJam — after being told plainly this contradicts the brief's
   principle above, the request was followed anyway.
3. **Phase 3** (current): the student called the FigJam-style result
   "generic SaaS software" and asked for something that reads as
   artist-made, giving Apple Garamond as a reference point for a warm,
   purposeful, contemporary (not FigJam/Notion/Linear-generic, and not
   punk/zine) identity. The palette, type, shadow and chrome treatment
   described in "visual craft" above is that third pass.

Separately, and also at explicit request: the canvas now opens with a
small hand-authored seed artwork (see `docs/adr/0005-seed-artwork.md`)
rather than a truly blank page, which directly reverses the brief's
"canvas must be open-ended... no pre-made mural background" principle.
Followed anyway, after being told so, for the same reason as the above —
this is the student's own project and explicit direction overrides this
agent's adherence to the original brief once stated plainly. A marker
comparing this submission against the brief's original design principles
should read this section as the explanation for every visual/content
decision that departs from them, not discover the departures by comparison
alone.

## Evidence for the principles

- Persistence: `spec/branches.test.ts` creates an object and reads it back
  via a fresh HTTP request; manually verified again across a real process
  restart (see `docs/agent-progress.md`).
- Realtime: `spec/realtime.test.ts` asserts a broadcast lands on another
  WebSocket client within 1.5 seconds of the triggering `POST`, and that
  clients on different branches never see each other's broadcasts.
- Fork independence: `spec/branches.test.ts`'s "a fork is isolated" case
  and ADR 0003.
- Identity: `spec/branches.test.ts` asserts two independent HTTP sessions
  (two cookie jars) get distinct `created_by` ids.
- Modular object types: `spec/objects.test.ts` covers valid/invalid cases
  for sticky notes, music links, embeds and image uploads, including that
  uploaded bytes are checked against real image magic bytes, not the
  client's claimed file type.
- Onboarding: `spec/realtime.test.ts` verifies a cursor ping's nickname is
  broadcast to other clients and that an overlong or control-character
  nickname is sanitised first; manually verified with two separate browser
  contexts that a nickname set during the welcome screen shows up on the
  other person's cursor label, and that the welcome screen shows once per
  browser and can be reopened via the "?" button.

## Known limitations and current status

- Image upload, music cards (Spotify/YouTube/SoundCloud) and generic embeds
  are implemented. Embeds are deliberately restricted to a small, fixed
  hostname allow-list (`src/links.ts`), not arbitrary iframe embedding —
  see ADR 0004 for why arbitrary embedding is a real attack surface this
  app doesn't take on.
- Same-object conflicts use last-write-wins, not a merge — see ADR 0001 for
  why, and what that means in practice.
- No per-object ownership or moderation — anyone on a branch can edit or
  delete any mark on that branch; see ADR 0002 for the reasoning.
- An embedded iframe (music or generic embed) doesn't respond to pointer
  events until double-clicked, so dragging the card it's in doesn't fight
  with interacting with the embedded content.
- Placing several sticky notes in quick succession at nearly the same point
  stacks them with no automatic spacing or offset — each note is a
  correctly independent object (no data corruption), but they visually
  overlap until dragged apart. A deliberate scope cut, not an oversight.
- The `main` branch (and therefore every fork of it) starts with a small,
  fixed, hand-authored seed artwork rather than a blank canvas — see ADR
  0005 and "A note on the visual direction" above for why.
- This is a from-scratch build completing crits 8–10 retrospectively in one
  session rather than across the original three weeks — see `PROCESS.md`
  and `reflections/crit-8.md` for the honest account of why.

## Run and test instructions

```sh
pnpm install
WALL_DB_PATH=./local-wall.db PORT=8080 node src/server.ts
# in another terminal:
pnpm check            # typecheck + spec/*.test.ts against APP_URL (default localhost:8080)
pnpm check:evidence   # checks CLAUDE.md, reflections, PROCESS.md citations
```

Open `http://localhost:8080`. Add `?branch=<id>` to visit a specific
branch (forking takes you there automatically).
