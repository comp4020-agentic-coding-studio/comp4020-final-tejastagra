# 0014. Player colours decided by the server, and a 3 second countdown at the start

- **Status:** Accepted (29 October 2026)
- **Decided by:** Tejas (fix list of 29 October 2026, Part 2); the details below were chosen from docs/rules.md and docs/design/ while he was away

## Context

Until now each screen drew its own player's discs red with a ring and the opponent's yellow with a cross. The two players therefore saw different colours for the same disc, and a spectator saw a third mapping (seat A red). Two players talking about the game ("your red one") could not agree, and nothing on screen told a player which colour they were. Games also started with a short "Get ready" that did not block a choice, so round 1's timer was already running while a player was still finding the board. This affects promise 2 (both players see the same result) and promise 4 (it must be clear on a phone what is yours).

## Options

1. Keep colours relative to the viewer. Simple, but two people and a spectator never agree on a colour.
2. Fix the colours by seat (seat A always red). Everyone agrees, but the creator of a link game would always be red, and the first player to arrive in quick match always red.
3. **Let the server decide at random when a game is made, and save it with the game.** Everyone agrees, nobody is always red, and a rematch can swap them.

For the start: keep the short greeting (choices can be made at once), or **hold round 1 for a fixed countdown that also says "You are Red"**.

## Decision

- **Option 3 (R93 to R96).** The server draws the colours when a game is made: one seat is red with the ring marker and the other yellow with the cross marker. It is saved with the game (migrations 19 and 20, a `colours` column) and sent in every snapshot and spectator message, so both players and every spectator draw the same seat in the same colour and marker (Q14). A computer game draws at random too. A rematch swaps the colours (R96). A colour is public, not a choice, so it may be sent at any time (R22).
- **A 3 second countdown (R97)** replaces the short "Get ready". It starts the moment both players are present (R51), says "You are Red" or "You are Yellow" with that disc and marker shown large, and round 1 and its timer start only when it ends. The server owns it: it sends `{ type: "countdown", ms }` when it starts, refuses a choice during it with the rejection reason `not_started`, and starts round 1's timer when it ends and sends `{ type: "started" }`, so both screens end the countdown together on the server's word rather than their own clocks. Under reduced motion the same words show without animation and it still lasts 3 seconds.

## Decisions made while Tejas was away

- **Colours are drawn when the game is created**, not when the second player arrives, so a waiting creator and a late spectator already have them, and a restart keeps them. A game saved before this change gets seat A red and seat B yellow from migration 20 (that matches what spectators were shown), and a game with no colours in memory is treated the same way.
- **The countdown is real time in the running app, including under `pnpm check` and `pnpm test:e2e`.** The 3 seconds is a constant, `START_COUNTDOWN_MS`; the app checks and browser checks wait for the server's `started`. Unit checks of the realtime server may set `countdownMs` in `RealtimeOptions` exactly as they set the round timer: the countdown's own checks use a short one, and checks of other rules set it to 0, which means no countdown at all, so they test what they were written for.
- **It runs once per game**: at the start, after a rematch starts (the rematch is a new game, R85), and again if the server restarts before round 1 has resolved (a restored game at round 0 counts down when both are back). A game restored after round 1 does not count down; its open round restarts at 10 seconds as R26 says.
- **A choice during the countdown is refused** with `not_started`, which says nothing about the opponent (R22). The screen does not send one: the board is locked until the countdown ends.
- **The computer starts thinking when the countdown ends**, so it never chooses before the human can.
- **The countdown is not a round**: no round can be missed and nothing counts towards abandonment during it (R19, R51).
- **The colour words are "Red" and "Yellow"** (glossary), never "you" or "opponent" colours.

## What it costs

Every game starts 3 seconds later, and every check that plays a game waits 3 seconds more (the browser checks by about two minutes in all). If playtests find 3 seconds too long, change R97 first.

## Evidence

`spec/unit-player-colours.test.ts` (R93 to R96), `spec/unit-realtime-countdown.test.ts` (R97), `spec/unit-persistence.test.ts` (migrations 19 and 20), `e2e/player-colours.spec.ts` (Q14 and the "You are" message).
