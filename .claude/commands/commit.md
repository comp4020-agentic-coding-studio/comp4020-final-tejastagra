Prepare a commit for the current change.

1. Run the reviewer subagent if `src/` or `spec/` changed. Fix anything it reports first.
2. Run `pnpm check:fast`.
3. Write the message in the format in CLAUDE.md: a subject of at most 72 characters, then `Why:`, `What:`, `Harness:` and `Prompt:` lines. Write `Why` and `What` for a stranger rebuilding the project from the log.
4. Show Tejas the message and the list of files, then commit.
5. Report the short hash.
