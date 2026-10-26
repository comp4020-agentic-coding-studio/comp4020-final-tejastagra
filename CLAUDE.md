# CLAUDE.md

You are building **Rubble**, a simultaneous Connect 4 game, for Tejas Tagra's COMP4020 final project. This file holds the rules every change must follow. It is derived from the argument in `README.md`. If the two ever disagree, stop and tell Tejas.

Read these before working on the matching area:

| Area | File |
| --- | --- |
| Game rules and engine contract | `docs/rules.md` |
| Interface and phone standards | `docs/design.md` |
| Words to use | `docs/glossary.md` |
| Logging | `docs/logging.md` |
| Decisions already made | `docs/decisions/` |
| Every check, the rule it protects and how checks run | `spec/CHECKS.md` |
| The course brief | `docs/course-brief.md` |
| Past mistakes and their fixes | `docs/corrections.md` |

## What good means here (the promises)

1. **The game rewards reading your opponent, not just the board.** Both players choose at once, so guessing matters as much as the board.
2. **Both players always see the same result at the same moment.** A round's result reaches both screens within one second.
3. **Nobody can see the other player's choice early.** Not through the screen, the network or timing tricks.
4. **Everything works on a phone.** Every feature, every screen, at the phone marking viewport.
5. **What happens is kept.** Games, names and the leaderboard survive sessions, restarts and redeploys.

Promises 2 to 5 are enforced by checks in `spec/`. Promise 1 is judged, through playtests in `docs/playtests.md`.

## Order of truth

`docs/rules.md` comes first, then `spec/`, then the code. To change behaviour, change `rules.md` first, then the test, then the code, in that order, and say so in the commit.

## Never

- Never let the browser decide a result. The server owns all game state. The browser sends a choice and shows what the server sends back.
- Never send a player's column or shield choice to the other player, in any message, before the round resolves (rule R22).
- Never change the board anywhere except the engine's `resolveRound`.
- Never broadcast a result before it is saved to the database (rule R25).
- Never let a game against the computer change the leaderboard (rule R37).
- Never store a password in plain text, and never log passwords, cookies or tokens.
- Never define a colour or a font outside `public/theme.css`. Every colour, radius, shadow and font is a CSS variable there (ADR 0006, `docs/design.md` "Look and feel"); screens and components only use the variables. A test fails if a colour code appears anywhere else.
- Never put an API key or token in a tracked file, including `.claude/settings.json`. Keys live in environment variables or `mise.local.toml`, which is gitignored.
- Never weaken, skip or delete a test to make it pass. If a test is wrong, stop and ask Tejas.
- Never delete or weaken the course's shipped checks, `spec/invariants.test.ts` and `spec/global-setup.ts`. Other course files (`Dockerfile`, `fly.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/`, `.githooks/`) may change when the work needs it, but read their comments first, keep what they say is fixed (one shared-cpu-1x machine with 256 MB, one volume at `/data`, HTTP on `0.0.0.0:$PORT`, the API key scan in `.githooks/pre-commit`) and give the reason in the commit's `Why:` line.
- Never write or edit the reflections in `reflections/` (`crit-8.md`, `crit-9.md`, `crit-10.md`). Tejas writes them.
- Never remove the `TEMPLATE:` comment from PROCESS.md. `pnpm check:evidence` fails until Tejas replaces it with his own account, and that failure is expected.
- Never add a feature that is not in `docs/rules.md`. Propose it to Tejas instead.
- Never add a dependency without a line in the commit's `Why:` explaining it.
- Never edit `docs/process-log.md` by hand.

## Every page must

- Work at the phone viewport first, with no sideways scrolling at 320 px wide.
- Have tap targets of at least 44 by 44 CSS pixels.
- Tell players apart by shape as well as colour.
- Use the words in `docs/glossary.md`, in UK English.
- Follow everything else in `docs/design.md`.

## Every change must

- Keep `pnpm check` passing before it is pushed. `pnpm check` needs the app running locally; start it first. Keep `pnpm check:fast` passing at every commit.
- `pnpm check:evidence` may fail only because PROCESS.md still has its template comment or no reflection exists yet. Any other failure must be fixed.
- Add or update a test when it changes behaviour, with the rule ID in the test name. Name test files `spec/app-<name>.test.ts` (checks against the running app, using `inject("baseUrl")`) or `spec/unit-<name>.test.ts` (no app needed). Browser checks go in `e2e/` and never in `spec/`. See `spec/CHECKS.md`.
- Be one logical change per commit.
- Pass the reviewer subagent (`.claude/agents/reviewer.md`, always by name) once per group of related commits that touch `src/` or `spec/` (for example once after all the R13 to R17 commits, or once per screen), and always before a commit that touches the no-peek rules (R21, R22) or persistence (R25). If the reviewer is not available, tell Tejas.
- Give every endpoint that creates server state (a game, a ticket, a row) a rate limit, and an expiry on anything it keeps in memory, so a public URL cannot fill the 256 MB machine or the volume. Key limits on the client address Fly passes in `Fly-Client-IP`, not the proxy's socket address.
- Every endpoint that reads a request body must require `application/json`, so a cross-site form cannot call it, and must have a size limit.
- Make every check repeatable: `pnpm check` must pass twice in a row against the same running app. A check that creates anything sends its own `Fly-Client-IP` so it never shares a rate limit with other checks, and never relies on being in a top-10 list or on a state a previous run left behind.
- Every database schema change (a new column, table or index in `src/server/db.ts`) must come with a numbered migration, applied through `PRAGMA user_version` so it runs exactly once against an existing database, and a test that opens a database built with the old schema and checks it is upgraded correctly. A deploy must never crash because the database on `/data` was created before the change.

## Commit messages

Every commit must use this format. The `commit-msg` hook rejects anything else.

```
<short summary, 72 characters at most>

Why: the reason for this change, in one or two sentences.
What: what changed, naming the main files.
Harness: which rule, test, ADR or CLAUDE.md line was added or changed, or "none".
Prompt: a one-line summary of what Tejas asked for, or "none (manual change by Tejas)".
```

The `pre-commit` hook rebuilds `docs/process-log.md` from these messages and stages it, so the process log grows with every commit. Its commit links use the form `pnpm check:evidence` verifies, ``[`abc1234`](https://github.com/<owner>/<repo>/commit/<hash>)``, so they can be copied into PROCESS.md as they are. The goal is that anyone can rebuild the project's history step by step from the log alone, so write `Why:` and `What:` as if for a stranger.

## When you get something wrong

1. Fix the cause in the harness, not just the code: a new line in this file, a new rule in `docs/rules.md` or a new test in `spec/`.
2. Add an entry to `docs/corrections.md` (or run `/correction`).
3. Name the harness change in the commit's `Harness:` line.

Retrying until a test passes, with no harness change, does not count as a fix.

## Writing

- Tejas writes the prose of `README.md`, `PROCESS.md` and the reflections himself. You may outline, check citations, check word counts and point out gaps. Do not draft the argument.
- All docs and interface text: UK English, no em dashes and no Oxford commas.

## Stop and ask Tejas when

- A decision record is still `Proposed`.
- A rule in `docs/rules.md` is unclear or seems wrong.
- A change would alter anything the course comments say is fixed (machine size, the /data volume, the port, the shipped checks).
- A change would delete or migrate saved data.
- You want to add anything not already in `docs/rules.md`.
