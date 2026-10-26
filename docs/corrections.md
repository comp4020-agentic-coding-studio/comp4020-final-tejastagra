# Corrections

Every time the agent gets something wrong, and a check, a playtest or Tejas catches it, add an entry here. The fix must land in the harness (`CLAUDE.md`, `docs/rules.md`, `docs/design.md` or `spec/`), not only in the code. PROCESS.md cites these entries.

## Format

```
### C<number>. <short title>
- **Date:**
- **What went wrong:**
- **How it was caught:** test name, playtest, review or Tejas
- **Harness fix:** the rule, test or CLAUDE.md line added or changed
- **Commits:** the commit that showed the problem and the commit that fixed it
```

## Entries

### C1. Harness assumed the wrong test setup
- **Date:** 26 October 2026
- **What went wrong:** The first version of the harness was drafted with Claude in chat before the course's `spec/` folder had been seen. It named tests `*.spec.ts`, which `pnpm check` does not run, assumed tests could run without the app, put browser checks in `spec/` and expected `pnpm check:evidence` to pass before PROCESS.md was written.
- **How it was caught:** Tejas shared the course repo before installing.
- **Harness fix:** The harness was rebuilt against the actual repo files. Test files renamed to `spec/app-*.test.ts` (against the running app) and `spec/unit-*.test.ts` (no app), `vitest.unit.config.ts` added for `check:fast` and mutation testing, browser checks moved to `e2e/`, restart checks made manual, the course hooks, scripts and config merged rather than worked around and the process log now writes commit links in the form `check:evidence` verifies.
- **Commits:** none; fixed before the first commit.
