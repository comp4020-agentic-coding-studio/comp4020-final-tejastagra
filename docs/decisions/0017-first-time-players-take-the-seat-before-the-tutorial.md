# 0017. A first-time player takes the seat before the tutorial, and the game waits for them

- **Status:** Accepted (2 November 2026)
- **Decided by:** Tejas (fix list of 2 November 2026, Fix 3)

## Context

A first-time player opening a friend's link used to do the tutorial before the page joined the game (R47, ADR 0008). While they read, nobody held the seat, so a second person opening the link could take it and the first-time player would arrive to find themselves a spectator. Quick match skipped the tutorial entirely so nobody was paired with a learner. Promise 1 (the game rewards reading your opponent) needs both players ready, and promise 2 (both see the same result at the same moment) needs the start to be the same moment for both.

## Options

1. **Keep the tutorial before the join.** The host sees the share link card the whole time and a stranger can take the seat. Rejected by Tejas.
2. **Join first, with a hold while the player learns.** The seat is theirs at once, the host is told, and the game starts when they finish. Cost: the server holds a seat for a person who may be slow.
3. **Make a learner play the first rounds while the tutorial runs.** Rejected: rounds are timed and a learner would miss them (R19).

## Decision

Option 2 (R102). The page joins with `learning: true` and the server holds the countdown until `learning_done`. The host sees a learning card with Cancel game, spectators see the same words, and a learner who is gone for more than 30 seconds loses the seat as if they had never come (the same grace as R27). For Quick match the tutorial simply comes before the queue (R47, U171), because there is no seat to hold before pairing.

## What it costs

The hold has no time limit while the learner stays connected, because Tejas asked for none; the host can always Cancel game, and a closed tab frees the seat after 30 seconds. A person could join and sit in the tutorial without finishing it, which costs the host a Cancel and nothing else. The hold is in memory only and the learner's seat is saved when they finish, so a restart during the tutorial frees the seat. Revisit if playtests show hosts waiting a long time.

## Evidence

`spec/unit-learning-hold.test.ts`, `spec/app-learning-hold.test.ts`, `e2e/learning.spec.ts`, and correction C56.
