# Crit 8 reflection

Crit 8 didn't happen on its original week — there's no tutorial attendance
or tutor feedback to report from that time, and I won't invent any. This
repo sat as the untouched course starter (one commit) with no app code until
this single extended agentic session, which builds The Wall from scratch
and completes C8, C9 and C10's technical requirements retrospectively,
documented honestly as such rather than implied to have happened on time.

## What C8 asked for and what this session actually did

C8's target was a first deployed version that lets a stranger perform the
core interaction and find their trace when they return. In this session:

- The core interaction (draw a stroke or add text on a white/warm canvas)
  exists and is backed by `node:sqlite` on the volume path `fly.toml`
  reserves, not server memory — see `src/db.ts` and `src/server.ts`.
- Persistence was verified directly: created an object, killed the running
  `node src/server.ts` process, restarted it against the same database
  file, and confirmed the object was still there with the same id (see
  `docs/agent-progress.md`'s Hours 2-3 entry for the exact commands).
- `/readme/` serves the live `README.md` (checked by the supplied
  `spec/invariants.test.ts`, which asserts every README heading appears in
  order in the served HTML).
- Deployment to the repo's `*.fly.dev` URL is recorded honestly in
  `docs/agent-progress.md` and `PROCESS.md` as attempted-or-not — I'm not
  writing "deployed" here ahead of that actually being confirmed over HTTP.

## What this changes

Falling behind doesn't just cost time to build — it tends to cost exactly
the habits (actually running the app, checking the deployed version instead
of trusting what the code looks like, asking whether something genuinely
works rather than appears to) that this session's own `CLAUDE.md` asks for,
because those are the first things that feel skippable under pressure. Two
real bugs in this session (a TypeScript syntax Node's stripper rejects, and
a primary-key collision on fork) were only found because the app was
actually run and curled rather than just read. That's the standard I want
this account to hold to for C9 and C10 as well, not a one-off.
