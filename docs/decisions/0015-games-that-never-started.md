# 0015. Games that never started are not recorded, and old ones are deleted

- **Status:** Accepted (29 October 2026)
- **Decided by:** Tejas (fix list of 29 October 2026, Part 6, item 12); the details below were chosen from docs/rules.md while he was away

## Context

The account page's history listed friend games that were cancelled before anyone joined, and games abandoned or forfeited before a single round, as "Abandoned, 0 rounds" or "Forfeit won, 0 rounds". They say nothing about how someone plays and fill the last 20 games with noise. Promise 5 says what happens is kept; a game in which nothing happened is not something that happened.

## Options

1. Never save such a game at all. Not possible: a friend game must be saved when it is made so its link works and a restart keeps it (R25, R26), and nobody knows it will never start until it ends.
2. **Leave every game with 0 rounds out of history and stats, and delete the rows of such games once they are over.**
3. Hide them only on the page. The stats endpoint would still count them, and they would come back in any later screen.

## Decision

Option 2 (R98). `historyFor` skips any game whose round count is 0, whatever its result. Migration 21 deletes, once, every saved game with round 0 that is over (an `ended` value, or a `won` or `draw` status, which cannot happen at round 0 but is covered), together with its archived rematches (`<code>#<n>`, also with round 0). Games with round 0 that are still waiting are kept for R26.

## Decisions made while Tejas was away

- **Deleting saved data.** CLAUDE.md asks to stop before deleting saved data; Tejas asked for this migration explicitly in the fix list and said not to stop, so that request is the authorisation. Only rows that can never appear in any history are deleted, and nothing else in them (players, sessions, leaderboard) depends on them: the leaderboard counts only wins (R38), and a game with 0 rounds has no win by a line; a forfeit at round 0 did count as a win under R38, and stops counting. That is the intended effect: a forfeit before any round is not a win anyone earned.
- The leaderboard leaves out forfeits at round 0 too, by the same rule, so the two never disagree.
- An opponent with no known person is shown as "A guest" (R91), never "Another player".

## What it costs

A player who once won by a forfeit before round 1 loses that win from the leaderboard. Deleted rows cannot be restored except from a backup of `/data`.

## Evidence

`spec/unit-accounts.test.ts` (R98 history and stats), `spec/unit-leaderboard.test.ts` (R98 leaderboard), `spec/unit-persistence.test.ts` (migration 21 on an old database).
