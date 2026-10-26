# 0008. A first-time tutorial

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

Rubble adds three rules to Connect 4 that no newcomer knows: simultaneous moves, crashes that leave rubble, and a one-use shield. Markers arrive with only the URL. A newcomer who does not understand the shield or crashes will not see what makes the game good.

## Options

1. **An interactive tutorial over a practice board, shown once and replayable.** Teaches by doing in under a minute. Cost: a scripted computer and five steps to build and test.
2. **A static "How to play" page.** Cheap. Cost: people skip reading, and rules like the shield are easier to feel than to read.
3. **Tips during the first real game.** No extra screen. Cost: the crash and shield may never happen in that game, so they are never explained.

## Decision

Option 1, as set out in `docs/design/tutorial.md`, with the tips from the original design standards kept as a backup during the first real game.

## What it costs

A small amount of server state (whether the tutorial has been seen) and the scripted practice board. It must never affect the leaderboard (R50).

## Evidence

To be added: tutorial checks and playtest notes on whether newcomers understand the shield.
