# PROCESS.md outline (for Tejas to write)

Length: 900 to 1100 words. Rewrite it (do not append) at each of the week 9 to 11 crits so it always describes the project as it stands. Cite commits as markdown links whose text is the short hash, for example ``[`a1b2c3d`](https://github.com/<owner>/<repo>/commit/<hash>)``, or a range such as ``[`a1b2c3d...e4f5a6b`](link)``. `pnpm check:evidence` checks every cited commit exists. The links in `docs/process-log.md` are already in this format. Replace the template comment containing `TEMPLATE:` with your own account, or `pnpm check:evidence` fails. Link ADRs rather than restating them; ADRs do not count towards the word limit.

## Suggested sections

1. **From brief to harness.** How the brief became the five promises in CLAUDE.md, and how each promise became rules in `docs/rules.md` and checks in `spec/`. Cite the commits.
2. **Why this stack and workflow.** Summarise ADRs 0001 to 0005 and the trade-offs. Explain the agent workflow: rules first, tests first, reviewer subagent, Stop hook, commit format.
3. **Corrections that landed in the harness.** Two or three of the strongest entries from `docs/corrections.md`, each with the commit that showed the problem and the commit that fixed it.
4. **Evidence that the checks are strong.** Mutation scores over time from `docs/testing/mutation-scores.md`. The multi-user test report and what it changed.
5. **Judged claims.** How promise 1 was judged, from `docs/playtests.md`.
6. **What I would do differently.**

## Data to pull before each rewrite

- `pnpm log:process` for a fresh `docs/process-log.md`.
- Latest mutation score.
- Count of entries in `docs/corrections.md`.
- Count of checks in `spec/CHECKS.md` by status.
