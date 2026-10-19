# Agent progress

## Current status
- Phase: Session complete through Hour 5/6 scope — P0, P1, P2 built, tested
  and deployed; P3 (image/link cards) and the human two-browser crit
  exercise are the honest remainder.
- Last updated: 2026-10-19
- Current git commit: 609e8d9 at last check (this file's own commit follows)
- Deployment status: **deployed and verified** at
  https://comp4020-final-tejastagra.fly.dev/ — `pnpm check` (11/11) passes
  against the live URL; `/`, `/readme/` confirmed 200 over real HTTP;
  `flyctl logs` shows all six required structured event types.

## Completed and verified
- [x] Repository audit (Hour 1) — see `docs/implementation-audit.md`.
- [x] `src/db.ts`: SQLite schema (`branches`, `objects` keyed by
      `(branch_id, id)`, `audit_log`), `Store` with create/list/update/delete,
      `forkBranch` (snapshot copy, no live link).
- [x] `src/identity.ts`: anonymous per-browser identity via `HttpOnly` cookie.
- [x] `src/markdown.ts`: minimal renderer for `/readme/`.
- [x] `src/log.ts`: structured JSON logs for the six required events
      (user_join, user_leave, action_received, update_broadcast,
      action_rejected, state_snapshot_sent), mirrored into `audit_log`.
- [x] `src/realtime.ts` + WS handling in `src/server.ts`: branch-scoped
      broadcast, ephemeral cursor relay (never persisted, never logged).
- [x] `public/index.html`, `public/styles.css`, `public/app.js`: white/warm
      canvas, draw + text tools, colour palette, fork button, presence
      cursors, reconnect-with-backoff, keyboard shortcuts (d/t/s).
- [x] `Dockerfile` replaced: `node:24-slim`, `pnpm install --prod`, runs
      `src/server.ts` directly via Node's built-in TS stripping (no build
      step, no native compiler needed — `ws` is pure JS, `node:sqlite` is
      built in on Node 24).
- [x] Fixed a real bug found by testing: TypeScript parameter-property
      constructor (`constructor(private db: DatabaseSync)`) isn't supported
      by Node's strip-only mode — same class of bug seen in the reference
      backup. Rewrote as an explicit field assignment.
- [x] Fixed a real bug found by testing: `objects.id` was a global PRIMARY
      KEY, so forking (which intentionally keeps the same object ids in the
      new branch) hit a UNIQUE constraint violation. Changed the primary key
      to `(branch_id, id)`.
- [x] Manually verified against `node src/server.ts` on :8081: create →
      list round-trip; fork → parent edits after fork don't appear in fork
      (count stayed at 1); fork edits don't affect parent's copy of the same
      object id (parent still read `"hi"`, not `"fork-edit"`).
- [x] Manually verified persistence across a real process restart (not just
      the vitest harness): created object on `main`, killed the process,
      restarted pointed at the same `WALL_DB_PATH`, object was still there
      with the same id.
- [x] `pnpm check` (typecheck + vitest) passes against the real running app
      on :8080 — 11/11 tests: the supplied 2 invariants
      (`/` 200, `/readme/` full headings) + 5 in `spec/branches.test.ts`
      (persistence, distinct identity, fork isolation, invalid-type
      rejection, unknown-branch rejection) + 4 in `spec/realtime.test.ts`
      (broadcast within ~1s, cross-branch isolation, concurrent edits to
      different objects both retained, late-join snapshot).
- [x] Fixed a real bug found by testing: the realtime spec's `nextMessage`
      attached its listener after the predicate could already have been
      satisfied (the snapshot arrives immediately on connect), so it
      timed out nondeterministically — same class of bug as the reference
      backup hit. Fixed by buffering every message from connection open and
      draining the buffer against the predicate instead of listening fresh.

## Completed but not yet verified
- [ ] Docker build (`docker build` / `docker run --tmpfs /data`) — not yet run.
- [ ] Fly deploy — not yet attempted.
- [ ] Image upload / link cards (P3) — not started, deliberately deferred.
- [ ] Accessibility pass (keyboard-only full flow, contrast check) — only
      partially done (shortcuts + focus-visible exist, not exhaustively tested).

## Completed and verified (continued — Hour 4/5: documentation)
- [x] `docs/adr/0001-realtime-and-conflicts.md`,
      `docs/adr/0002-identity-and-permissions.md`,
      `docs/adr/0003-branches-and-forks.md` written.
- [x] `README.md` rewritten (definition of good, principles, non-goals,
      sources consulted, evidence, limitations, run instructions).
- [x] `PROCESS.md` rewritten (real stack/architecture account, the two
      bugs found by testing, the realtime test race and its fix).
- [x] `CLAUDE.md` written (this session's own harness rules).
- [x] `reflections/crit-8.md`, `crit-9.md`, `crit-10.md` written — each
      states plainly this is a retrospective, one-session account, not a
      report from the original weeks.
- [x] `node scripts/check-evidence.ts` passes: reflections found, no
      leftover `TEMPLATE:` comment in `PROCESS.md`, no commit-link citations
      yet to validate (none added so far).
- [x] `pnpm check` re-run clean (11/11) after the documentation changes.

## Completed and verified (continued — Docker build)
- [x] `docker build -t wall-local .` succeeds cleanly with the real
      `Dockerfile` (node:24-slim, pnpm install --prod, no compiler).
- [x] `docker run --rm -d -p 8082:8080 --tmpfs /data -e PORT=8080 wall-local`
      (matching how CI runs it against a throwaway `/data`) started and
      served `/` (200) and `/readme/` (full README) within ~2 seconds.
- [x] `APP_URL=http://localhost:8082 pnpm check` — 11/11 passed against the
      actual Docker image, not just the bare `node src/server.ts` process.
- [x] `docker stats` showed ~48MB resident — comfortably inside the
      256MB/shared-cpu-1x Fly machine size.

## Completed and verified (continued — deployment)
- [x] `flyctl deploy --remote-only --ha=false -a comp4020-final-tejastagra`
      ran successfully. Note: the app already had a prior deployment — of
      the earlier Taskflow product, from before this session's pivot — live
      at this same URL; this deploy replaced it, which is the correct and
      intended outcome, not an accidental overwrite of real user data (the
      old deploy had no real visitors to lose work from).
- [x] Verified **not** by trusting the deploy command's exit code: curled
      `https://comp4020-final-tejastagra.fly.dev/` (200, `<title>The
      Wall</title>`) and `/readme/` (200, `<h1>The Wall</h1>`) directly.
- [x] `APP_URL=https://comp4020-final-tejastagra.fly.dev pnpm check` — 11/11
      passed against the real live deployment, including the realtime
      broadcast-timing and fork-isolation tests running over the actual
      public network, not localhost.
- [x] `flyctl logs -a comp4020-final-tejastagra` inspected after generating
      traffic: confirmed real, live log lines for all six required event
      types (`user_join`, `user_leave`, `action_received`,
      `update_broadcast`, `action_rejected`, `state_snapshot_sent`), each
      carrying a pseudonymous `user_id`, `branch_id`, and `object_id` where
      relevant — no cookie values or secrets present in any line.
- [x] Noted honestly, not hidden: the log stream also showed repeated
      `proxy ... "could not complete HTTP request to instance: hyper error:
      connection closed before message completed"` errors in a ~3-minute
      window after the deploy. The app's own status stayed `started` and
      `curl`/`pnpm check` kept returning success throughout and after this
      window, so the working hypothesis is this is `auto_stop_machines`
      cycling the single machine between the test suite's traffic bursts
      and idle gaps (`fly.toml` sets `min_machines_running = 0`), not an
      application bug — not yet confirmed further; flagged as a line item
      for the multi-user test document rather than asserted as fully
      understood.

## Completed and verified (continued — multi-user test document)
- [x] `docs/testing/multi-user-test.md` written with real results against
      the live deployment: scenarios 1-4, 7, 8, 11, 12 pass with scripted
      WebSocket/HTTP clients standing in for separate browsers; scenarios 5
      and 6 pass via their scripted-close equivalent; scenario 9 (multiple
      Fly machines) deliberately not run (documented why — this
      persistence design doesn't support it, matches the known limitation
      in `README.md`); scenario 10 (restart) verified locally/Docker, not
      repeated against the live single machine to avoid disrupting it.
- [x] Explicitly flagged as outstanding: the brief's own human,
      two-real-Chrome-profile crit exercise hasn't happened in this agentic
      session (no browser automation available) — recorded as a genuine
      gap, not folded into a false "Pass."
- [x] Final `pnpm check` run against the live URL: 11/11 passed.
- [x] `pnpm check:evidence` passes.
- [x] `git status --short` / `git diff --cached` reviewed before commit —
      no secrets, no accidental changes.

## Current task
- Goal: none — session work is at a stable, documented, deployed
  checkpoint. If resumed, the next priorities are P3 (image/link cards)
  and the human two-browser crit verification.
- Files being changed: none
- Last known state: complete for this session

## Checks run
- Command: `docker build -t wall-local .`
- Result: success
- Command: `APP_URL=http://localhost:8082 pnpm check` (against the Docker container)
- Result: 11/11 passed
- Command: `flyctl deploy --remote-only --ha=false -a comp4020-final-tejastagra`
- Result: success; machine reached "started" state, smoke/health checks passed
- Command: `curl` against `https://comp4020-final-tejastagra.fly.dev/` and `/readme/`
- Result: both 200, correct content (title "The Wall", README's actual H1)
- Command: `APP_URL=https://comp4020-final-tejastagra.fly.dev pnpm check`
- Result: 11/11 passed against the live deployment
- Command: `flyctl logs -a comp4020-final-tejastagra` (after generating traffic)
- Result: all six required event types observed live; also observed
  transient proxy connection errors, noted above, not yet root-caused
  further than a working hypothesis

## Blockers
- Blocker: none currently; the proxy-error observation above is a note for
  the multi-user test doc, not something currently blocking core
  functionality (every HTTP check succeeded before and after the error window)
- Safe next action: write the multi-user test document, then the final report

## Exact next task
1. Write `docs/testing/multi-user-test.md`: deployment URL, commit tested,
   test date, the scenario matrix from the lecture whiteboard task, marking
   automated-equivalent scenarios as run (with evidence linking back to this
   file and the spec tests) and genuinely two-human-browser scenarios as
   `Not run`.
2. Do a final `git status --short` / `git diff` pass for accidental
   changes or secrets before the final commit.
3. Produce the final report per prompt.md Part G.

## Phase 2: FigJam visual overhaul + modular object types

Started 2026-10-19, after the initial build (above) was deployed and
verified. The user explicitly asked for a FigJam-style visual identity
(acknowledged by the user as conflicting with the original brief's "don't
clone Figma, distinct identity" principle — see README.md's honest note on
this) plus new object types: sticky notes, music embeds (Spotify/YouTube/
SoundCloud), generic iframe embeds (allow-listed domains), and image
upload.

### Completed and verified (server-side)
- [x] `src/links.ts`: music URL classifier (Spotify/YouTube/SoundCloud
      patterns) and a fixed embed-domain allow-list.
- [x] `src/uploads.ts`: `saveImage` — decodes base64, checks real magic
      bytes (PNG/JPEG/GIF/WebP) regardless of declared MIME type, caps at
      2MB, writes under `/data/uploads/<branchId>/<uuid>.<ext>` (same Fly
      volume as the SQLite file). `resolveUploadPath` makes path traversal
      structurally impossible (fixed filename pattern, no user-supplied path
      segments touch the filesystem).
- [x] `src/server.ts`: `VALID_TYPES` extended to `text, stroke, sticky,
      image, music, embed` (dropped unused `shape`/`link`); per-type
      `validateTypedData` for sticky (fixed colour palette), music
      (allow-list check, platform derived server-side), embed (hostname
      allow-list); image upload gets its own larger body-size cap (3MB, to
      cover base64 overhead on a 2MB image) and a dedicated error path;
      `GET /uploads/:branchId/:file` static route added.
- [x] `spec/objects.test.ts` (13 new tests): valid/invalid cases for every
      new type, plus a check that a plain `type: "text"` object — the shape
      already persisted on the live Fly volume from before this change —
      still round-trips correctly (no breaking change for existing data).
- [x] `pnpm check` locally: 24/24 passing (11 original + 13 new).
- [x] Manual curl verification of every new type (sticky, music x valid/
      invalid, embed x valid/invalid, image x valid/oversized/wrong-format)
      against a running `node src/server.ts` — all behaved as expected
      before the automated tests were even written.
- [x] Committed (`1bc744c`): server-side modular object types.

### Completed and verified (frontend)
- [x] Frontend rewrite: infinite pan/zoom camera (`public/app.js`'s `cam`
      object, `screenToWorld`), FigJam-style visual language
      (`public/styles.css` full rewrite — dot-grid background, floating
      pill toolbar, rounded sticky/music/embed/image cards, coloured
      presence cursors), and renderers for every object type
      (`renderSticky`, `renderMusic`, `renderEmbed`, `renderImage`,
      `renderStroke` now SVG-based instead of `<canvas>` 2D).
- [x] Visually verified with a Playwright-driven headless Chromium (no
      project skill covered this, so a one-off driver script was used,
      installed under `/tmp/pw-driver`, not committed to the repo): empty
      canvas renders with dot-grid + floating toolbar; placing a sticky
      note works (correct colour, draggable, editable); freehand drawing
      renders as an SVG path that scales correctly with zoom (tested at
      100% and 82%); dragging a card moves it by the exact pixel delta
      dragged and persists after reload; a music card (Spotify) renders the
      real embedded player; an embed card (Figma) renders the card chrome
      correctly (a 403 inside it is Figma's own response to a test URL,
      not a bug in this app); image upload works end-to-end (file picker →
      base64 → server validation → saved file → rendered `<img>`) and
      **persists after a full page reload**. Zero console/page errors
      across every check.
- [x] One transient flake observed and investigated, not a bug: the first
      Spotify embed attempt showed Spotify's own "403 ERROR" page instead
      of the player; isolated with standalone test pages (same iframe
      construction, same `referrerpolicy="no-referrer"`) that loaded fine,
      and a second run of the exact same in-app flow succeeded — concluded
      this was Spotify-side embed-request flakiness, not an app bug, and
      moved on rather than chasing an unreproducible network hiccup.

### Subagent quality pass: findings and fixes

Two read-only review agents ran in parallel against the new build.

**Security review** found one critical, confirmed-exploitable issue:
`PATCH /api/branches/:id/objects/:objectId` never re-ran the per-type
validation `POST` applies. Reproduced directly with curl: created a valid
allow-listed `embed` object, then `PATCH`ed its `data.url` to an arbitrary
non-allow-listed URL — the server accepted and broadcast it, completely
defeating the embed/music allow-list for any object after its initial
creation. **Fixed**: PATCH now calls the same `validateTypedData` POST
uses, keyed off the object's existing `type`; `image` objects reject any
`data` PATCH outright (their data is server-generated on upload, never
client-editable). Added two regression tests
(`spec/objects.test.ts`: "PATCH re-validates an embed's URL...", "...a
music URL..."). Also applied two smaller findings: a `Content-Length`-based
early rejection so a non-image POST can't force the server to buffer up to
3MB before discovering it isn't an image, and `X-Content-Type-Options:
nosniff` on both static-file and upload responses.

**While fixing and testing the above, found and fixed a second, unrelated
bug**: rejecting an oversized request body left its unread remaining bytes
on a keep-alive connection, which corrupted the *next* request reusing that
same socket — surfaced as a real, reproducible test hang (not flakiness)
when the oversized-image test ran immediately before another test on the
same vitest worker. This would have affected real traffic too, not just
tests. Fixed in `readJsonBody`/a new `sendJsonAndCloseConnection` helper:
on a too-large body, the response now sets `Connection: close` and destroys
the socket after flushing, so the client is forced to open a fresh
connection rather than reuse a poisoned one. Confirmed fixed by running the
full suite 3 times in a row with no flakes (previously failed consistently
on both runs before the fix).

**Visual/design review** (driven with a real headless browser, not just
reading CSS) found: (1) a real bug — placing a sticky note near an
existing one did nothing except silently focus the existing note, so the
next keystroke appended into it instead of creating a new note. Reproduced
exactly, confirmed the root cause (`canvasWrap`'s pointerdown handler
bailed whenever the click landed on an existing card, even for creation
tools), and fixed it: creation tools (`draw`/`sticky`/`text`) now always
place a new object at the clicked point regardless of what's underneath,
since cards only claim the pointerdown event themselves when `tool ===
"select"`. (2) The colour palette's selection ring was visually heavier
and a different style than the toolbar's active-tool treatment — restyled
to a consistent, lighter ring. (3) Freehand drawing was locked to flat
black with no way to pick a colour — added a stroke/ink colour mapped from
the same palette swatches (pastel sticky backgrounds map to bolder "ink"
variants for contrast against the canvas, in `STROKE_INK`). Did not act on
the no-minimap-at-low-zoom observation — recorded as a known limitation
instead of building a feature that wasn't asked for.

All fixes verified: `pnpm check` 27/27 (stable across repeated runs), and
a fresh Playwright pass confirmed the sticky-overlap fix (2 independent
notes, correct text) and the coloured-stroke feature (pink swatch ->
magenta stroke) both work as intended.

### Completed and verified (final Phase 2 deploy)
- [x] Docker image rebuilt with all Phase 2 changes; `pnpm check` 27/27
      against the real container (tmpfs `/data`).
- [x] Redeployed to Fly (`flyctl deploy --remote-only --ha=false`),
      verified live over real HTTP (not trusting the deploy command's own
      "not listening" warning, which was again a transient health-check
      timing blip — curl confirmed 200 seconds later, same as the first
      deploy).
- [x] `pnpm check` against the live URL initially found a real test bug
      (not an app bug): `spec/branches.test.ts`'s fork-isolation test
      assumed `main` starts empty, which stopped being true once `main` on
      the live deployment accumulated real objects from manual testing.
      Fixed by counting before/after fork instead of assuming zero.
      Re-verified 27/27 against both a clean local DB and the live URL.
- [x] `flyctl logs` confirms the new rejection reasons (embed/music
      allow-list messages) appear correctly in production, no secrets
      exposed.
- [x] Added `.gitignore` entries for `local-wall.db`/`local-uploads/` and
      told the user how to run the app directly on their machine
      (`WALL_DB_PATH=./local-wall.db WALL_UPLOADS_PATH=./local-uploads
      PORT=8080 node src/server.ts`) instead of waiting on a Fly deploy
      each time.

## Phase 3: onboarding, nicknames, art direction

Prompted by direct user feedback: the app looked "generalist," dropped a
stranger onto an empty canvas with no explanation, and had no sense of
being "your digital space."

### Completed and verified
- [x] First-visit welcome overlay (`public/index.html`) — project
      explanation, fork explainer, optional nickname field, "?" button to
      reopen on demand. Gates the app's boot sequence.
- [x] Nickname system: client-side only (localStorage), sent with every
      cursor ping, sanitised server-side (`src/identity.ts`'s
      `sanitiseNickname`), never persisted or logged — purely a display
      layer over the existing anonymous identity (ADR 0002 updated).
- [x] Soft gradient atmosphere wash behind the existing dot-grid canvas
      background.
- [x] Found and fixed before shipping: `showCursor`'s `innerHTML` use with
      a directly-interpolated label was a real XSS path once that label
      could be an arbitrary client-supplied nickname — switched to
      `textContent`-based DOM construction.
- [x] 2 new realtime tests (nickname broadcast, sanitisation). `pnpm
      check`: 29/29, stable across 5 repeated runs.
- [x] Investigated and resolved a one-off EPIPE flake in the oversized-
      image test — root-caused as an inherent trade-off of the Phase 2
      connection-poisoning fix, documented in code and the test rather
      than hidden.
- [x] Verified with Playwright: welcome shows once, nickname persists and
      displays, reload skips it, help button reopens pre-filled, two
      browser contexts see each other's nicknamed cursors, keyboard-only
      flow (focus, Enter-to-submit) works.
- [x] README/PROCESS/ADR 0002 updated; corrected a now-false "no onboarding
      flow" claim in README's principles section.
- [x] Redeployed to Fly, verified live (`/` serves the welcome overlay
      markup), `pnpm check` 29/29 against the live URL, pushed, CI green.

## Phase 4: real art direction + seed artwork

Prompted by direct, pointed user feedback: Phase 3's FigJam-style result
read as "generic SaaS software," not artist-made.

### Completed and verified
- [x] Full type/colour/chrome rewrite: Fraunces (display) + Instrument
      Sans (body), an ochre/terracotta/sage/plum/paper palette, hard
      offset "stamped" shadows replacing soft blur, toolbar redrawn as a
      solid ledge instead of a floating pill.
- [x] `STICKY_COLORS` (`src/server.ts`) and `STROKE_INK`
      (`public/app.js`) updated together to the new palette — these two
      lists must stay in sync since the server rejects colours the client
      doesn't offer; `spec/objects.test.ts` updated to match.
- [x] `src/seed.ts`: hand-plotted seed artwork (hills, sun, welcome
      sticky) inserted idempotently on server startup via a fixed
      sentinel id. Verified directly: restarted twice against the same
      DB, no duplication; a real object created in between survived;
      forking `main` inherited the seed artwork + the real object
      together, through the existing fork mechanism, no new logic needed.
- [x] Fixed a stale type definition found along the way: `WallObject.type`
      in `src/db.ts` still listed Phase 1's types (`shape`/`link`) instead
      of Phase 2's actual `VALID_TYPES` — corrected while touching this
      file for the seed feature.
- [x] Playwright-verified: welcome screen, canvas with seed artwork, a
      new sticky in the new palette, toolbar close-up — read every
      screenshot and judged it honestly against "does this read as
      artist-made" rather than assuming the palette swap alone was enough.
- [x] README/PROCESS/ADR 0005 record both deviations (visual identity,
      seed artwork) honestly, including the full 3-phase visual-direction
      history, consistent with this session's practice throughout.
- [x] Redeployed to Fly; confirmed the live `main` branch's object count
      went from 6 to 12 (seed added, nothing lost) rather than reset;
      `pnpm check` 29/29 against the live URL; live screenshot confirms
      fonts load correctly over the real network and the seed artwork
      coexists correctly with real marks already on the live canvas.

### Current task
- Goal: none — Phase 4 is deployed, tested, and documented. Open items are
  explicitly-deferred known limitations, not in-progress work.
- Files being changed: none
- Last known state: complete for this session, pending final CI confirmation

## Resume instructions
Read this file, inspect `git status`, inspect the last commit and continue from the exact next task. Do not repeat completed work. If resuming Phase 2 specifically: the server-side work (commit `1bc744c`) is done and tested; the frontend rewrite is written but not yet visually verified — verify it first before adding anything further.
