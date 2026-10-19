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

### Current task
- Goal: Commit the frontend overhaul, then run the two read-only review
  subagents from the plan (visual/design, security) before the final
  Docker/Fly redeploy.
- Files being changed: none expected from this step
- Last known state: not started

## Resume instructions
Read this file, inspect `git status`, inspect the last commit and continue from the exact next task. Do not repeat completed work. If resuming Phase 2 specifically: the server-side work (commit `1bc744c`) is done and tested; the frontend rewrite is written but not yet visually verified — verify it first before adding anything further.
