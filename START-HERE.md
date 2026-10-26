# Start here (instructions for Claude Code)

This harness is for Tejas Tagra's COMP4020 final project: **Rubble, a simultaneous Connect 4 game with rubble and shields**. Tejas designed it with Claude in a separate chat, against the course brief in `docs/course-brief.md`, and it has been fitted to this repo's actual files. Read this file and `CLAUDE.md` in full, then work through the phases in order.

## What is already in place

The harness has been merged with the course template, so there is nothing to merge or reconcile:

- `CLAUDE.md` is the harness rules (the template's version was an empty placeholder).
- `.githooks/pre-commit` keeps the course's API key scan and then rebuilds `docs/process-log.md`. `.githooks/commit-msg` enforces the commit format. `pnpm install` already points git at `.githooks/` through the `prepare` script.
- `package.json` keeps every course script and adds `check:fast`, `test:e2e`, `test:mutation` and `log:process`.
- `tsconfig.json` now also covers `src/` and `e2e/`, and sets `erasableSyntaxOnly` so Node 24 can run the TypeScript directly.
- `.gitignore` now tracks the harness parts of `.claude/` (agents, commands, hooks and `settings.json`) so markers can read them. `.claude/settings.local.json` stays ignored.
- `spec/` has the course's shipped checks plus stubs for ours. `spec/CHECKS.md` explains how checks run.

## How the course checks work

- `pnpm check` runs `pnpm typecheck`, then every `spec/**/*.test.ts` against the **running** app at `APP_URL` (default `http://localhost:8080`), found by `spec/global-setup.ts`. Start the app first. In CI (once the repo is public) it runs against the Docker image with an empty `/data`, and a failure blocks the deploy.
- `pnpm check:fast` runs `pnpm typecheck` and only `spec/unit-*.test.ts`, with no app needed. The Stop hook uses it.
- `pnpm check:evidence` needs `CLAUDE.md`, at least one of `reflections/crit-8.md`, `crit-9.md` or `crit-10.md`, a PROCESS.md without its `TEMPLATE:` comment and every commit cited in PROCESS.md to exist. It will fail until Tejas writes PROCESS.md and a reflection. That is expected. Never remove the comment or write a reflection yourself.

## Phase 0: install

1. Run `pnpm install` (this also sets `core.hooksPath` to `.githooks`). Confirm with `git config core.hooksPath`.
2. Install dev dependencies with exact versions: `pnpm add -D -E fast-check @playwright/test @stryker-mutator/core @stryker-mutator/vitest-runner`.
3. Test the commit-msg hook: a commit with a bad message must be rejected.
4. Start the placeholder app (for example `docker build -t app . && docker run --rm -p 8080:8080 -e PORT=8080 app`), run `pnpm check` and confirm the course checks pass. Run `pnpm check:fast` and confirm it passes.
5. Commit everything with the subject `Add project harness`, in the format in `CLAUDE.md`.

## Phase 1: decisions

Go through each ADR in `docs/decisions/` and the **Open decisions** in `docs/rules.md`, and set each one's status. One commit per decision. Leave the reasons section of ADR 0001 for Tejas.

## Phase 2: game engine, tests first

1. Write the engine tests yourself from `docs/rules.md`, one rule at a time, in `spec/unit-engine-rules.test.ts` and `spec/unit-engine-properties.test.ts` (property tests with fast-check covering P1 to P7 in `spec/CHECKS.md`). Commit as you go.
2. Build `src/engine/index.ts` exactly to the **Engine contract** in `docs/rules.md` until the tests pass. **Never change a test to fit the code.** If a test seems wrong, change `docs/rules.md` first, then the test, then the code, and log it in `docs/corrections.md`.
3. Run `pnpm test:mutation` and record the score in `docs/testing/mutation-scores.md`. Add tests until it is at least 85%, then record the new score.
4. Tejas has reference engine tests outside the repo at `../rubble-reference-tests/`. Once the engine is finished, compare your tests with them and add any case you missed, in its own commit. Never copy those files into the repo.

## Phase 3: server, real time, persistence and logging

Follow ADRs 0001, 0002, 0003 and 0005, rules R20 to R27 and `docs/logging.md`. Replace the placeholder `Dockerfile` with the real app, keeping HTTP on `0.0.0.0:$PORT`, 256 MB of memory and the database on `/data`. Render README.md as HTML on the server at `/readme/`, so `spec/invariants.test.ts` finds every heading with no script running. Turn the stubs in `spec/app-no-peek.test.ts`, `spec/app-realtime.test.ts`, `spec/unit-persistence.test.ts` and `spec/unit-logging.test.ts` into real tests as each piece lands. The `placeholder/` folder can be deleted once the real app serves `/` and `/readme/`.

## Phase 4: phone-first interface

Follow `docs/design.md`. Build at phone width first. Run the phone-tester subagent after every screen.

## Phase 5: computer player

Rules R40 to R46. Turn the stubs in `spec/unit-computer.test.ts` into real tests.

## Phase 6: identity, modes and leaderboard

Rules R28 to R39 and ADR 0004. Turn the stubs in `spec/app-lobby.test.ts`, `spec/app-identity.test.ts` and `spec/app-leaderboard.test.ts` into real tests.

## Phase 7: browser checks

Write the Playwright checks E1, E4, E5 and E6 in `e2e/`, as `e2e/README.md` describes.

## Phase 8: multi-user test session with Fly logs

Run `/multi-user-test`. It follows the tutorial protocol in `docs/testing/multi-user-test-plan.md`, covers manual checks X1 to X3 and fills in `docs/testing/multi-user-test-report.md`. It needs real people, so stop and wait for Tejas. Deploys use `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-tejastagra`, run by Tejas.

## Throughout

- Every commit uses the format in `CLAUDE.md`. The hooks reject anything else.
- Every mistake that Tejas or a check catches goes in `docs/corrections.md`, with the rule or test that now prevents it.
- Run the reviewer subagent once per group of related commits that touch `src/` or `spec/`, and always before a commit that touches the no-peek rules (R21, R22) or persistence (R25).
