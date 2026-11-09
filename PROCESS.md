# Process

## Starting point

Rubble was not my first idea. I dropped two others before writing code, so my crit reflections come from the tutorial weeks and say little about this project. The tutorials still taught me to generate detailed logs among other things, which I carried into this app.

## Stack

I worked through the stack options with Claude in a planning chat and recorded each decision as an architecture decision record (ADR).

Claude suggested TypeScript on Node 24 ([ADR 0001](docs/decisions/0001-stack.md)). I had never learned TypeScript, so I could not always follow the code, which made the rules and tests more important. Node runs TypeScript with no build step, so after each change I could reload localhost and check it still worked ([`75f32ad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/75f32ad)).

Results travel over WebSockets ([ADR 0002](docs/decisions/0002-realtime-transport.md)), because a move must reach both screens within a second and both players send moves. Polling would add a delay, and server-sent events only go one way. The cost is that dropped connections need extra work: the server must notice, reconnect the player and restore the board, and a player gets 30 seconds to return before it counts as a forfeit ([R27](docs/rules.md)).

The server holds both choices and decides every round ([ADR 0003](docs/decisions/0003-simultaneous-resolution.md)), so neither player can peek. Guests can play without an account ([ADR 0004](docs/decisions/0004-identity.md)), which meant two ways to identify a player. Games are saved in SQLite on one Fly.io volume ([ADR 0005](docs/decisions/0005-persistence-and-single-machine.md)), so they survive redeploys. The cost is that the game can only run on one server, since saved games live on one disk.

## Building the harness

My first real commit was documentation only ([`baa5b6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/baa5b6d)). [`docs/rules.md`](docs/rules.md) numbers every game rule and ends with the engine's exact function signatures. Each screen has a design file in [`docs/design/`](docs/design/), and every test is linked to a rule in [`spec/CHECKS.md`](spec/CHECKS.md), so a failing test points back to its rule. I always worked in order: rule, failing test, then code. For every harness file I added and what it does, see [HARNESS-SUMMARY.md](HARNESS-SUMMARY.md).

I planned in a separate Claude chat, outside the course's one, which also wrote [`START-HERE.md`](START-HERE.md). It knew my ideas, acted as the source of truth and turned them into detailed instructions for Claude Code, which did the building. This made problems easy to trace. If Claude Code built something unexpected, my docs had usually not explained the feature well enough, so I fixed the docs instead of guessing which agent was wrong.

## Keeping track of changes

Returning after a few hours or a day, I kept losing track of what I had changed and why. So a [`commit-msg`](.githooks/commit-msg) hook rejects any commit without four things: why it was made, which files changed, what the harness gained and the prompt behind it. The [`pre-commit`](.githooks/pre-commit) hook rebuilds [`docs/process-log.md`](docs/process-log.md) from those messages ([`baa5b6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/baa5b6d)). Bigger decisions became [18 ADRs](docs/decisions/), and every mistake went into [`docs/corrections.md`](docs/corrections.md) with the harness change that stops it frrom recurring (66 entries by the end).

I created [`docs/handover.md`](docs/handover.md) ([`0c79197`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/0c79197)), which Claude updated after each session with its commits, test results and anything waiting on me. Long chats cost me tokens, especially after a break, when the cache had expired and Claude re-read everything. With the handover, I could clear the chat and each new session read [`CLAUDE.md`](CLAUDE.md) and the handover to pick up where the last one stopped.

## Getting started with development

Many features depended on each other, and I wanted Claude to build the first version on its own. So I split it into phases in [`START-HERE.md`](START-HERE.md), from the game engine to the multi-user test in [phase 8](START-HERE.md#phase-8-multi-user-test-session-with-fly-logs), and later planned the redesign the same way in [`docs/design/plan.md`](docs/design/plan.md). The first phases ran without intervention from me, with Claude using its judgement and my docs. It worked like a sprint from COMP2120: set scope, let the developers build, review at the end. Small phases also kept each session short enough not to lose its context.

## Guard rails and reviewers

Before Claude can end a turn, a [hook](.claude/hooks/check-before-stop.sh) runs the quick tests, so it cannot finish with broken code. Three [helper agents](.claude/agents/) review its work: the reviewer checks each change against the rules, the phone-tester measures screens in a browser and the design-reviewer checks styles against the design files.

The reviewer caught two security bugs early. Friend games use a 6-letter code, and it found that anyone with the code could take control of a player already in the game ([C4](docs/corrections.md#c4-a-stranger-who-knew-a-game-code-could-take-over-a-seated-players-connection)). After my fix, it found a stranger could still move for a player who had not joined yet ([C5](docs/corrections.md#c5-the-seattoken-check-from-c4-failed-open-for-an-unissued-seat)). Neither would show up in normal play. Mutation testing, which plants small bugs to see if tests notice, showed my tests covered the first player far more than the second. Adding the missing tests raised the catch rate from 90.57% to 97.17% ([`7fdc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/7fdc7e7)).

## When things went wrong

Early on, long sessions burned through tokens, so I moved to Sonnet and added a rule to test only what changed ([`2e94e5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/2e94e5b)). I thought that was enough, but my worst mistake was still ahead.

Near the end, I left a background agent running on a long fix list. It spent over two hours retrying one alignment check, used more than 600,000 tokens and committed none of its 25 changed files ([C44](docs/corrections.md#c44-a-background-agent-ran-the-final-fix-list-with-no-commits-and-no-limit-on-the-suites-it-could-run)). Nothing had told it when to stop. That day I added limits to `CLAUDE.md` ([`7098289`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/7098289)): no background agents, three attempts per failing check, commit each fix straight away and I run the full suites myself.

The look taught me a similar lesson. Some changes took several rounds, each fix creating the next problem ([C49](docs/corrections.md#c49-the-tutorial-card-was-fixed-five-times-because-every-fix-met-one-symptom)), and my checks kept passing because they tested what I had listed, not what a player saw. I rolled back bad rebuilds with `git revert` instead of patching over them ([`bcd7e82`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/bcd7e82); [C54](docs/corrections.md#c54-four-tutorial-rebuilds-sized-the-card-by-its-content-and-tejas-rolled-them-all-back)), then rewrote the checks to test the screen as a player sees it ([C59](docs/corrections.md#c59-q43-checked-the-card-against-my-own-list-of-parts-so-it-could-not-see-the-gaps)).

Some changes were also me changing my mind. I ruled spectating out ([`687101c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/687101c)), added it a day later ([`d19df40`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/d19df40)), then stopped computer games being watched ([`164c270`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-tejastagra/commit/164c270); [ADR 0012](docs/decisions/0012-spectating.md)). The look went from plain to dark arcade to the navy toy ([ADR 0006](docs/decisions/0006-visual-style.md)), because arcade felt too serious for a casual game.

## Where it ended up

In two weeks, working from my direction, Claude made 229 commits, 421 unit checks and 248 browser checks. I have played over 100 games with friends and family and asked them what to change, rather than relying only on Claude or my taste. Next time, I would set limits on agents from day one and write checks that test what a player sees, not just whether the code works.