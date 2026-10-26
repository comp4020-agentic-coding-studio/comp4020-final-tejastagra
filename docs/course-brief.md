# COMP4020 Final Project brief (copy for the agent)

Copied from the course website by Tejas so the agent can check work against it. The website is the authority: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/

## The brief

Make a multi-user, real-time website that's good.

Three requirements are fixed, with these meanings, and together they make the app full-stack:

- **Multi-user:** two or more people, each in their own browser, act on shared state, and the app tells them apart. What counts as a person is your call: an account, a pseudonym, or any anonymous visitor.
- **Real-time:** a change one person makes appears in every other open session showing it within about a second, with no reload or other action by the viewer. How it gets there is also your call: WebSockets, server-sent events or even "polling fast enough"; you just need to explain why you built it the way you did.
- **Persists:** what someone does in your app is still there when they, or anyone else, come back, across sessions, restarts and redeploys.

Choosing what is worth building, the good part of the brief, is the student's job. Small is fine. The spec doesn't mention accounts, profiles, feeds, rooms or scores: those are other apps' answers to questions you now have to answer yourself. Design for co-presence: the app should be more interesting because other people are using it at the same time. The capstone showcase, a room full of people using it at once, is the situation to design for.

## Your definition of good is part of the harness

- **README.md is the argument.** What "good" means for this app, what you read or looked at while deciding, and what you chose not to build. The deployed app publishes it in full at /readme/.
- **CLAUDE.md (and any files it references) are the rules.** The standards the agent's work must meet, derived from the argument.
- **spec/ is the checks.** The parts of good that can be tested.

The strongest READMEs say which claims are enforced, which are judged, and how the judged ones were judged. Cite your reading in the README and discuss your position in PROCESS.md.

## The repo you start with

There is no starter app: the stack is yours to choose, and PROCESS.md explains the choice. What's fixed is set out in the comments in fly.toml, the Dockerfile and spec/README.md: one small machine, one volume for anything that persists, and two shipped checks, that the app answers at / and that /readme/ has your README's headings in the HTML the server sends. Every other check is yours to write. Once the repo is public, CI checks and deploys every push to main.

## What you submit

- The deployed application (a *.fly.dev URL).
- The source repository, where markers read the code and the checks.
- Evidence of process: PROCESS.md, CLAUDE.md (and anything it references), the three crit reflections and the commit history behind them.
- README.md is marked: 400 to 600 words on what good means here, with sources, published in full at /readme/.
- PROCESS.md is rewritten at each of the weeks 9 to 11 crits, not appended to, and runs to 900 to 1100 words. It explains why this stack and agent workflow were chosen and the trade-offs weighed. ADRs work well for this and do not count towards the word count.
- Corrections belong in the harness: when the agent gets something wrong, the strongest accounts show the fix landing in CLAUDE.md or spec/ (or a bad attempt thrown away), not just a retry until it passes.
- Students draft README.md and PROCESS.md themselves. An agent can help find sources, check citations or spot a gap.

## How it's marked

| Criterion | Weight |
| --- | --- |
| Legibility of process | 50% |
| Deployed full-stack application | 25% |
| Response to the brief | 25% |

Markers arrive with only the URL and start at /readme/. They test:

- **Multi-user:** two people in separate Chrome profiles (an incognito window counts), so they share no cookies or storage.
- **Real-time:** both sessions on screen at once, one at each marking viewport.
- **Persists:** the marker comes back the next day. The machine stops when nobody is using it, so by then it has restarted, and what both people did has to still be there.

The top band asks the app to hold up under use it wasn't designed for, such as two people acting at once or a slow connection. There's no feature checklist, and features that aren't part of the definition of good don't earn extra marks. The median answer, features with no reason to exist, or a README promising a kind of good that the rules and checks never mention all mark down. Stack and workflow choices with no reasons given, or trade-offs that leave no trace in the commits, count as process asserted rather than shown.

## Key dates

- Due: noon, Monday 9 November 2026.
- Capstone showcase: Wednesday 11 November 2026, 12 to 2pm, Birch Innovation Space (time and venue to be confirmed).

## The spec

- Deployed and live at its *.fly.dev URL by the deadline, working at both marking viewports.
- Multi-user: two or more people, each in their own browser, act on shared state, and the app tells them apart.
- Real-time: a change one person makes appears in every other open session within about a second, with no reload or other action by the viewer.
- Persists: what someone does is still there when they, or anyone else, come back, across sessions, restarts and redeploys.
- Good, by a definition you make and defend: README.md says what good means here, and the deployed app publishes it in full at /readme/.
- Your own checks in spec/, protecting the promises your app makes that the build cannot; `pnpm check` and `pnpm check:evidence` pass.
- Evidence of process in the repo: PROCESS.md, CLAUDE.md and a commit history that grew with the work; PROCESS.md makes the case for the stack and agent workflow chosen.
