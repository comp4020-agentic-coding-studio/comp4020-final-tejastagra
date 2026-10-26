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

### C2. Reviewing every commit was too slow
- **Date:** 26 October 2026
- **What went wrong:** The harness required the reviewer subagent before every commit touching `src/` or `spec/`. I ran it through a general-purpose agent that read the whole repo each time, so reviews took one to six minutes and stalled the work.
- **How it was caught:** Tejas: "The reviews are taking too long."
- **Harness fix:** `.claude/agents/reviewer.md` now sets `model: haiku` and reads only the staged diff plus the rules the diff touches. CLAUDE.md, START-HERE.md and `.claude/commands/commit.md` now say to run it once per group of related commits, and always before commits touching the no-peek rules (R21, R22) or persistence (R25). It is always called by name, never through a general-purpose agent.
- **Commits:** the commit that added this entry; the slow reviews preceded it (R1 to R12 engine commits).

### C3. The catch-up reviewer review found an R16 gap and a log-injection gap
- **Date:** 26 October 2026
- **What went wrong:** `resolveRound` only validated the choices that were present, so after a game had already ended it still accepted a call with both choices `null`, bumped the round count and recomputed status, instead of refusing to resolve at all (R16). Separately, `formatEvent`'s value quoting escaped backslashes and double quotes but not `\r` or `\n`, so a value containing a newline could split one log line into two and forge a second event; field names were not validated either, so a key containing a space or `=` would also break the `key=value` format in `docs/logging.md`.
- **How it was caught:** the reviewer subagent, asked to review commits `8f9ad48` to `c37e4ac` as a catch-up review (they had not been reviewed when written).
- **Harness fix:** `resolveRound` in `src/engine/index.ts` now throws immediately if `state.status !== "playing"`, before looking at either choice, with a new R16 test in `spec/unit-engine-rules.test.ts` covering the both-null case. `formatValue` and `formatEvent` in `src/server/log.ts` now escape `\r` and `\n` and reject field names that do not match `^[a-z][a-z0-9_]*$`, with two new tests in `spec/unit-logging.test.ts`. A misnamed describe block ("R13 to R7") was also renamed to "R7 and R13".
- **Commits:** `8f9ad48` (engine) and `c37e4ac` (logger) showed the problem; `4367c71` fixed it.

### C4. A stranger who knew a game code could take over a seated player's connection
- **Date:** 26 October 2026
- **What went wrong:** The first WebSocket join handler let any client claim an already-occupied seat ("A" or "B") by naming it, and treated that as the real occupant reconnecting: the existing connection was sent `tab_replaced` and closed, and the newcomer took over the seat. With no identity system yet (R28 and accounts land in Phase 6), the server had no way to tell the real player from a stranger who had only read the game code off a shared link, so this broke R32 (one live connection per player, meant for the same player) and let a third party do what R36 says should get `game_full`.
- **How it was caught:** the reviewer subagent, reviewing the staged join/snapshot WebSocket slice before its commit.
- **Harness fix:** `attachRealtime` in `src/server/realtime.ts` now issues an opaque `seatToken` (a `randomUUID()`) to whichever client first takes a seat, sent back in every snapshot. A later join naming that seat must present the same token to take over the live connection; without it, the join is refused with `game_full` exactly as a genuine third visitor would be. This is a stand-in for real identity, not a replacement for it: once R28 (guest cookies) exists in Phase 6, seat ownership should move to the player's identity instead of a bearer token handed to whoever happens to hold the first connection. New tests in `spec/app-realtime.test.ts` (T6, two cases) and `spec/app-lobby.test.ts` (L5, impostor case) cover the refusal. The same review also caught a crash on non-object JSON messages (for example the literal `null`), a duplicated snapshot on first join and `clients_in_game`/`recipients` log fields counted across all games instead of per game; all three are fixed in `src/server/realtime.ts` with a covering test for the crash.
- **Commits:** found and fixed before `src/server/realtime.ts` was ever committed; `b981ef3` is the commit that added it with the fix already in place.
- **Revisit:** when R28 identity lands in Phase 6, replace `seatTokens` with a check against the joining player's guest or account identity, and remove the bearer-token stand-in.

### C5. The seatToken check from C4 failed open for an unissued seat
- **Date:** 26 October 2026
- **What went wrong:** `handleChoose`'s seat-token check (added in C4) compared the message's `seatToken` to `seatTokens.get(...)` with `!==`. For a seat nobody has joined in this server process, `seatTokens.get(...)` returns `undefined`; a `choose` message with no `seatToken` field is also `undefined`. `undefined !== undefined` is `false`, so the check passed and let a stranger who only knew the game code inject a choice for a seat they had never joined, breaking R21 and R22 (the server itself, not another player, would have been tricked into treating a fabricated choice as real) the moment the genuine player on the other seat chose and the round resolved on the attacker's fabricated column. The same review found an unawaited `game.resolve()` left a window where a second `choose` for the same round could be accepted before the first resolution's save completed (risking R25), a `Boolean(shield)` coercion that silently turned a malformed `shield` value into `true`, and several tests (N1 to N4, T1, T2) that were weaker than their names claimed, including sleep-based timing guesses and substring checks that could have false negatives.
- **How it was caught:** the reviewer subagent, asked to review this as the project's highest-stakes diff so far because it is exactly the code the no-peek promise rests on (ADR 0003).
- **Harness fix:** the seat-token check in `src/server/realtime.ts` now requires both the sent token and the stored token to be strings before comparing them, so two absences can never match; `column` and `shield` are type-checked before use. A `resolving` set now blocks a new `choose` for a game while its previous round's `game.resolve()` call is still in flight, and the resolve's promise is both awaited to completion and has its rejection handled (previously `void`, silently swallowing a failed save). `spec/app-no-peek.test.ts` was rewritten to use a message queue (no arrival-order assumptions), drop timing-based sleeps in favour of awaiting specific messages or racing a short timeout for "I expect nothing to arrive", and compare exact serialised messages between a low and a high choice (N2) rather than only lengths. A new test proves a `choose` for an unjoined seat with no token is ignored, confirmed by reverting the fix locally and watching the test fail before restoring it.
- **Commits:** found and fixed before this slice of `src/server/realtime.ts` was ever committed; see the commit that follows this entry.
