# 0003. Resolving simultaneous choices fairly

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

The game only works if neither player can learn the other's choice before the round resolves (promise 3, rules R21 and R22), and both see the result together (R23).

## Options

1. **Sealed choices held by the server.** Each player sends their choice to the server, which tells the opponent only "Ready". When both are in or the timer ends, the server resolves and sends the result to both. Cost: players must trust the server, which is fine because we run it.
2. **Commit and reveal.** Each browser sends a hash of its choice first, then reveals it. Players need not trust the server. Cost: much more complex, and a player who refuses to reveal needs extra rules.
3. **Turn-taking with hidden display.** Simpler, but it is no longer a simultaneous game.

## Decision

Option 1. The server is the referee.

## What it costs

The no-peek promise rests entirely on the server code, so it needs the strongest tests in the project (N1 to N4 and C7 in `spec/CHECKS.md`).

## Evidence

To be added: no-peek checks N1 to N4, computer check C7 and multi-user scenario c (simultaneous action).
