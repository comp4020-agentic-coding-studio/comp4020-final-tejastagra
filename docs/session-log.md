# Session log

One line per action, newest last. For a quick scan of what happened and
in what order — not a substitute for `PROCESS.md`/`docs/agent-progress.md`.

- Read prompt.md, audited repo (starter template + unpushed old-backup dir), chose Node+ws+sqlite stack
- Wrote src/db.ts, identity.ts, log.ts, markdown.ts, realtime.ts, server.ts — core server
- Wrote public/index.html/app.js/styles.css — v1 canvas (fixed viewport, draw+text only)
- Fixed: TS parameter-property constructor rejected by Node's stripper
- Fixed: global objects.id PK broke forking (switched to composite (branch_id, id))
- Fixed: realtime test race (buffered WS messages instead of listening fresh)
- Wrote spec/branches.test.ts, spec/realtime.test.ts — 11/11 passing
- Wrote 3 ADRs, README.md, PROCESS.md, CLAUDE.md, 3 crit reflections
- Docker build + run verified locally, 11/11 against container
- Deployed to Fly (comp4020-final-tejastagra.fly.dev), replaced old pre-pivot deploy
- Verified live: curl checks, pnpm check 11/11 against live URL, flyctl logs show all 6 event types
- Wrote docs/testing/multi-user-test.md from live-deployment scenario runs
- User asked for FigJam visual overhaul + sticky/music/embed/image object types
- Planned the overhaul (EnterPlanMode), approved
- Wrote src/links.ts (music/embed allow-lists), src/uploads.ts (image upload, magic-byte check)
- Extended src/server.ts: new types, per-type validation, upload route, GET /uploads/:branch/:file
- Wrote spec/objects.test.ts — 24/24 passing
- Rewrote public/app.js + styles.css + index.html: infinite pan/zoom camera, SVG strokes, FigJam toolbar, card renderers for sticky/music/embed/image
- Verified frontend with a Playwright driver (installed under /tmp/pw-driver, not committed): empty canvas, sticky, stroke, zoom, music embed, iframe embed, image upload+reload all work, 0 console errors
- Launched 2 subagents in parallel: security review + visual/design review
- Security agent found CRITICAL: PATCH bypassed per-type validation (embed allow-list defeatable post-creation) — reproduced with curl, fixed, added regression tests
- While fixing that, found + fixed a second bug: oversized-body rejection poisoned keep-alive connections (real hang, not test flakiness)
- Design agent found: sticky-overlap bug (click near existing note silently merged text into it instead of creating new note) — reproduced, fixed (creation tools now always create regardless of what's under cursor)
- Applied design agent's minor fixes: palette ring styling, stroke colour picker wired to palette
- Re-ran both subagents to verify fixes — both confirmed clean
- pnpm check: 27/27 passing, stable across repeated runs
- Committed docs (FigJam honesty note in README, ADR 0004) and all bug fixes
- Started: this short-form log (per user request mid-session)
