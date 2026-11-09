# Harness files

This file lists every harness file in the project, grouped by what it does. I added all of them myself; none came with the course's starting repo (commit `97e3654`). The course supplied a `CLAUDE.md`, which I rewrote in full, so it is listed too.

The files work together in one loop. The rules and design files say what the game must do and how it must look. Each check in `spec/` and `e2e/` is named after the rule it protects. Every change is recorded with its reasons, and the Claude Code set-up stops Claude from finishing a turn until the checks pass.

## Rules and standards

| File | What it does |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | The standing rules Claude must follow on every change. |
| [`START-HERE.md`](START-HERE.md) | First instructions for Claude, written in the planning chat. |
| [`docs/course-brief.md`](docs/course-brief.md) | A copy of the course brief for checking work against. |
| [`docs/rules.md`](docs/rules.md) | The numbered game rules every test and line of code follows. |
| [`docs/glossary.md`](docs/glossary.md) | The words players see, so every screen says things the same way. |
| [`docs/design.md`](docs/design.md) | Phone, tap target and contrast standards every screen must meet. |
| [`docs/logging.md`](docs/logging.md) | Which server events are logged and in what format. |
| [`docs/admin.md`](docs/admin.md) | Jobs only the person running the app does, like password resets. |
| [`docs/decisions/`](docs/decisions/) | 18 decision records, each explaining a big choice and its cost. |

## Design

| File | What it does |
| --- | --- |
| [`docs/design/README.md`](docs/design/README.md) | Index of the design files and what each one covers. |
| [`docs/design/look-and-feel.md`](docs/design/look-and-feel.md) | The navy toy style: colours, outlines, shadows and contrast ratios. |
| [`public/theme.css`](public/theme.css) | The only place colours, fonts, sizes and shadows may be set. |
| [`docs/design/home.md`](docs/design/home.md) | How the home screen is laid out. |
| [`docs/design/game-screen.md`](docs/design/game-screen.md) | The game screen, the waiting card and their spacing. |
| [`docs/design/board-interaction.md`](docs/design/board-interaction.md) | How players choose a column by tapping the board. |
| [`docs/design/motion-and-endings.md`](docs/design/motion-and-endings.md) | The reveal animation and the end of game popup. |
| [`docs/design/earthquake.md`](docs/design/earthquake.md) | How the Earthquake power-up looks and behaves. |
| [`docs/design/shrinking-board.md`](docs/design/shrinking-board.md) | How the dropping ceiling is shown to players. |
| [`docs/design/tutorial.md`](docs/design/tutorial.md) | The first-time tutorial's steps, sizes and layout. |
| [`docs/design/quick-match.md`](docs/design/quick-match.md) | The Quick match waiting screen. |
| [`docs/design/rematch.md`](docs/design/rematch.md) | What Play again does after a game ends. |
| [`docs/design/spectating.md`](docs/design/spectating.md) | The screen spectators see. |
| [`docs/design/leaderboard.md`](docs/design/leaderboard.md) | The leaderboard page. |
| [`docs/design/account.md`](docs/design/account.md) | The account page, its record and its popups. |
| [`docs/design/popups.md`](docs/design/popups.md) | The one shared popup that every dialog uses. |
| [`docs/design/qa-checklist.md`](docs/design/qa-checklist.md) | Layout rules every screen must pass before it counts as done. |
| [`docs/design/plan.md`](docs/design/plan.md) | The build order for the new look, home screen and tutorial. |

## Checks

| File | What it does |
| --- | --- |
| [`spec/CHECKS.md`](spec/CHECKS.md) | Lists every check, the rule it protects and where it runs. |
| [`spec/`](spec/) (35 test files) | Unit and server checks for the rules, named by rule ID. |
| [`e2e/`](e2e/) (15 spec files) | Browser checks for every screen at phone and laptop sizes. |
| [`e2e/README.md`](e2e/README.md) | How the browser checks run and which screen sizes they use. |
| [`playwright.config.ts`](playwright.config.ts) | Settings for the browser checks. |
| [`vitest.unit.config.ts`](vitest.unit.config.ts) | Runs the fast checks that need no running app. |
| [`stryker.config.json`](stryker.config.json) | Plants small bugs in the engine to test the tests. |
| [`docs/testing/mutation-scores.md`](docs/testing/mutation-scores.md) | Each mutation test score and the tests added after it. |
| [`docs/testing/multi-user-test-plan.md`](docs/testing/multi-user-test-plan.md) | Steps for testing with several players and the Fly logs. |
| [`docs/testing/multi-user-test-report.md`](docs/testing/multi-user-test-report.md) | Results of the multi-user test session. |

## The record of changes

| File | What it does |
| --- | --- |
| [`docs/corrections.md`](docs/corrections.md) | Each mistake, how it was caught and the harness fix. |
| [`docs/handover.md`](docs/handover.md) | Notes for the next session: where things stand and open problems. |
| [`docs/process-log.md`](docs/process-log.md) | Built automatically from commit messages, never edited by hand. |
| [`.githooks/commit-msg`](.githooks/commit-msg) | Rejects commit messages without Why, What, Harness and Prompt lines. |
| [`.githooks/pre-commit`](.githooks/pre-commit) | Scans for API keys and rebuilds the process log before each commit. |
| [`scripts/check-commit-msg.mjs`](scripts/check-commit-msg.mjs) | The commit message checker the hook runs. |
| [`scripts/process-log.mjs`](scripts/process-log.mjs) | Rebuilds the process log from commit messages. |
| [`docs/writing/`](docs/writing/) | Question outlines for the README and PROCESS.md, for me to write. |

## Claude Code set-up

| File | What it does |
| --- | --- |
| [`.claude/settings.json`](.claude/settings.json) | Connects the Stop hook to Claude Code. |
| [`.claude/hooks/check-before-stop.sh`](.claude/hooks/check-before-stop.sh) | Runs the fast checks before Claude can finish a turn. |
| [`.claude/agents/`](.claude/agents/) | Three reviewers: the reviewer (rules), the phone-tester (phone layout) and the design-reviewer (styles). |
| [`.claude/commands/`](.claude/commands/) | Six slash commands: `/commit`, `/correction`, `/adr`, `/multi-user-test`, `/style-preview` and `/visual-qa`. |

## Scripts

| File | What it does |
| --- | --- |
| [`scripts/check.sh`](scripts/check.sh) and [`scripts/e2e.sh`](scripts/e2e.sh) | Run the checks against a throwaway app, never the dev database. |
| [`scripts/visual-qa.sh`](scripts/visual-qa.sh) and [`scripts/visual-qa.ts`](scripts/visual-qa.ts) | Take screenshots of every screen for visual checking. |
| [`scripts/admin-reset-password.ts`](scripts/admin-reset-password.ts) | Gives a player a temporary password, run on the server. |