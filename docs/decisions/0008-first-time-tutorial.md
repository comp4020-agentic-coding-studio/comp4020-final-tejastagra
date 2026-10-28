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

## Amendment, 29 October 2026 (fix list Part 7)

The tutorial used to open on the home screen for a new visitor. It now opens the first time a player starts a match, before the match, and then starts the match they chose (R47, U136). It has eleven steps with a progress line (U137 to U147), adding the goal, the round timer, draws, playing with friends and leaving. Opening a friend's game link counts as starting a match (joining with a code by another route), so a new player who arrives by a link learns the rules before their first round too; the game page waits for the tutorial before it joins, so no round starts and nobody waits on a countdown meanwhile (R51: the game does not start until both are present).
- On a game link the tutorial is shown to a player whose tab holds no seat for that game and who is due it, before the page joins. A third visitor who will be made a spectator (R36) is shown it too, because the page cannot know before joining; they are new, and watching is easier with the rules. A reload of a held seat never shows it.
- A visitor arriving by a link from the home screen's "Join with a code" has already seen it there, and the game page does not show it twice (R48 is saved before the link opens).
