# Implementation audit — Hour 1

Date: 2026-10-19

## Repository state found

- `git log`: one commit (`97e3654`, the course starter template). Working
  tree clean except for the untracked `prompt.md` this session was given.
- A sibling directory, `comp4020-final-tejastagra.old-backup-2026-10-19/`,
  holds 20 unpushed commits of a *different* product ("Taskflow", a shared
  task list, not a canvas) built for crits 8–10. It was apparently reset
  back to the starter at some point and backed up rather than deleted.
  Treated as **reference only** below — its identity/audit-log/Fly-migration
  patterns are proven and reusable, but its product and schema are not The
  Wall's, so nothing is copied wholesale.
- `origin` for the working repo is
  `https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra.git`,
  in sync with the single starter commit.

## Starter template contents (do not break)

- `fly.toml` — fixed shape: `syd` region, one `shared-cpu-1x`/256MB machine,
  one volume at `/data`, app listens on `0.0.0.0:$PORT`. No `app` line (name
  comes from the repo on deploy). Must not be edited beyond env/process needs.
- `Dockerfile` — placeholder `busybox httpd` serving a static page and
  README.md baked in at `/readme/`. Must be replaced with a real image that
  still serves HTTP on `$PORT` and `/readme/` serving the live `README.md`.
- `spec/README.md`, `spec/invariants.test.ts`, `spec/global-setup.ts` —
  fixed contract: `/` returns 200, `/readme/` serves `README.md`'s headings
  in order, checked against a **running** app at `APP_URL` (default
  `localhost:8080`). Not to be deleted or weakened.
- `scripts/check-evidence.ts` — checks `CLAUDE.md` exists, a
  `reflections/{crit-8,crit-9,crit-10}.md` exists, `PROCESS.md` has no
  leftover `TEMPLATE:` comment, and every cited commit SHA in `PROCESS.md`
  resolves in this repo.
- `package.json` scripts: `typecheck`, `test` (vitest), `check` (both),
  `check:evidence`. Node 24.21.0 / pnpm 11.9.0 pinned via `mise.toml`.
  `pnpm install` succeeds cleanly (85 packages, lockfile verified).
- `CLAUDE.md` — intentionally empty; this session is responsible for
  deciding and writing its own harness rules (done below).
- `README.md` / `PROCESS.md` — template placeholders, must be fully
  replaced (the `check:evidence` script enforces PROCESS.md's rewrite).

## Environment

- Node v24.21.0, pnpm 11.19.0 (`engines.pnpm >=11` satisfied), flyctl
  v0.4.77 all present via mise.
- `FLY_API_TOKEN` is present as a key in `mise.local.toml` (gitignored);
  value not inspected or printed. Deploy access to be attempted in Hour 5
  only, from this repo, one deploy at a time.
- No existing app code, no `src/`, `public/`, or `docs/` beyond the starter.

## Gap list vs. the brief (Part A–B of prompt.md)

| Requirement | Status |
|---|---|
| White/warm-white open canvas, text/drawing objects | Missing — build from scratch |
| Persistence across refresh/visit | Missing |
| Two-session realtime (<~1s) | Missing |
| Pseudonymous identity + structured server logs | Missing |
| Server-side permissions, branch isolation | Missing |
| Fork = independent snapshot | Missing |
| Image/link cards | Missing (P3, deferred until P0–P2 solid) |
| README "definition of good" + `/readme/` | Template only |
| PROCESS.md real account | Template only |
| `reflections/crit-{8,9,10}.md` | Missing |
| `docs/testing/multi-user-test.md` | Missing |
| ADRs (realtime/concurrency, identity/permissions, persistence) | Missing |
| Deployed `*.fly.dev` | Not yet deployed (placeholder Dockerfile only) |

Since this is a from-scratch build completing C8/C9/C10 retrospectively in
one session rather than across three real weeks, the reflections will state
that plainly rather than imply the crits happened on their original dates —
required by prompt.md Part B.

## Chosen implementation path

Reasoning, to avoid re-litigating later:

- **Stack:** plain Node.js (`node:http`, no framework) + `ws` for
  WebSocket realtime + Node 24's built-in `node:sqlite` (`DatabaseSync`) for
  persistence. No native build step, small Docker image, fits comfortably
  in 256MB/shared-cpu-1x. This mirrors a choice that worked under the same
  constraints in the reference backup, for the same reasons (no compiler
  toolchain needed in the image, no framework machinery this app's scope
  doesn't need).
- **Frontend:** a single hand-built page using the HTML5 `<canvas>` element
  for drawing/objects plus vanilla JS/CSS for the UI chrome — no React/Vue
  build step, keeping the Dockerfile simple and matching the brief's
  "distinct art direction, not a generic SaaS template" instruction more
  directly than a component-library default would.
- **Realtime:** `ws` WebSocket connections scoped by branch (room) id, same
  general shape as the reference backup's realtime.ts, adapted for canvas
  objects (text/stroke/shape) instead of tasks, plus presence/cursor
  messages kept ephemeral and separate from persisted objects.
- **Identity:** anonymous per-browser identity via an `HttpOnly` cookie
  minted on first contact (same pattern as the reference backup's
  `identity.ts`) — no accounts, satisfies "privacy by default."
- **Branches/forks:** a `branches` table (`id`, `parent_id`, `forked_at`)
  and an `objects` table scoped by `branch_id`; forking copies rows into a
  new branch id, no live link back to the parent.
- **Logging:** structured JSON lines to stdout (captured by `flyctl logs`)
  for `user_join`, `user_leave`, `action_received`, `update_broadcast`,
  `action_rejected`, `state_snapshot_sent`, each with timestamp,
  pseudonymous user id, branch id, and object/action id where relevant.

This stays inside the starter's fixed contract (`/`, `/readme/`, one
machine, one volume) and should be buildable incrementally within the
six-hour plan.
