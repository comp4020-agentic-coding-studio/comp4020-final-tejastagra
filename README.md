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
- **Low-friction participation.** No sign-up, no onboarding flow — open the
  page, pick a tool, make a mark.
- **Presence.** Real connected users' cursors are visible, scoped to the
  branch they're actually on. Never simulated or faked.
- **Persistence.** A mark survives a refresh, a new visit days later, and a
  server restart — it's stored in SQLite on Fly's persistent volume, not in
  server memory.
- **Fork independence.** A fork is a snapshot at the moment it's taken.
  Nothing flows back to the parent, forward to children of the fork, or
  sideways to siblings, ever.
- **Visual craft.** A white/warm-white open canvas, a compact and
  contextual tool palette, no generic dashboard chrome.

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
- Figma's and Google Jamboard's live-cursor and direct-manipulation patterns
  were used as a reference point for *what to avoid cloning* (see
  `docs/implementation-audit.md`'s stack-choice reasoning and ADR 0001) —
  consulted for contrast, not copied.

No external design-system or UI-kit was used; the interface in
`public/styles.css` is hand-written.

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

## Known limitations and current status

- No image upload or link/music cards yet — deferred as P3 per the
  project's own prioritisation (see `docs/implementation-audit.md`). The
  object schema (`type` field in `src/db.ts`) already allows for `image`
  and `link` types to be added without a schema migration.
- Same-object conflicts use last-write-wins, not a merge — see ADR 0001 for
  why, and what that means in practice.
- No per-object ownership or moderation — anyone on a branch can edit or
  delete any mark on that branch; see ADR 0002 for the reasoning.
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
