# Checks register

Every check in `spec/` and `e2e/`, the rule it protects and its status. Keep this in step with the tests. README.md's "enforced and judged" table is built from this file.

Status: **todo** (stub only), **written**, **passing**.

## How checks run in this repo

- **Course checks.** `spec/invariants.test.ts` and `spec/global-setup.ts` ship with the course. Never delete or weaken them. `spec/README.md` explains them.
- **`pnpm check`** runs `pnpm typecheck`, then every `spec/**/*.test.ts` through `vitest.config.ts`, against the **running** app at `APP_URL` (default `http://localhost:8080`). In CI it runs against the Docker image with an empty `/data`, and a failure blocks the deploy.
- **`spec/app-*.test.ts`** are app checks. They talk to the running app with real HTTP and WebSocket clients, using `inject("baseUrl")`.
- **`spec/unit-*.test.ts`** are unit checks. They need no running app. They also run alone with `pnpm check:fast`, which uses `vitest.unit.config.ts` (no global setup, so no app needed), and are what mutation testing uses.
- **`e2e/*.spec.ts`** are Playwright browser checks for phone layout. They run only with `pnpm test:e2e`, never in `pnpm check`, because CI may have no browser.
- **Manual checks** cannot be automated here, because a test cannot restart the server it is testing. They run in the multi-user test session (`docs/testing/multi-user-test-plan.md`).

## Course

| ID | Claim | Status |
| --- | --- | --- |
| K1 | The app answers at `/` | shipped by course |
| K2 | `/readme/` contains every heading of README.md, in order | shipped by course |

## Engine (`spec/unit-engine-rules.test.ts`, `spec/unit-engine-properties.test.ts`)

Written in Phase 2 from `docs/rules.md`, one rule at a time.

| ID | Claim | Rule | Status |
| --- | --- | --- | --- |
| R-tests | One or more tests per engine rule, named by rule ID | R1 to R17 | passing |
| P1 | Each round adds exactly 2, 1 or 0 pieces, as the choices dictate | R5 to R10 | passing |
| P2 | No column holds more than 6 pieces | R1 | passing |
| P3 | A shield is spent exactly when used and never comes back | R8, R9 | passing |
| P4 | The round count goes up by exactly 1 | R11 | passing |
| P5 | A game is won exactly when it has a winner | R13 to R16 | passing |
| P6 | Nothing is accepted after the game ends | R16 | passing |
| P7 | Pieces never move or change | R12 | passing |
| M1 | Mutation score of the engine is at least 85% | all engine rules | passing (97.17%) |

## No peeking (`spec/app-no-peek.test.ts`)

N1 to N4. See the file.

## Real time (`spec/app-realtime.test.ts`)

T1 to T6. See the file.

## Modes, identity and leaderboard (`spec/app-lobby.test.ts`, `spec/app-identity.test.ts`, `spec/app-leaderboard.test.ts`)

L1 to L5, I1 to I6, B1 to B5. See the files.

## Computer, persistence and logging (`spec/unit-computer.test.ts`, `spec/unit-persistence.test.ts`, `spec/unit-logging.test.ts`)

C1 to C7, S1 to S3, G1 to G3. See the files.

## Phone layout (`e2e/`, Playwright, `pnpm test:e2e`)

| ID | Claim | Status |
| --- | --- | --- |
| E1 | Two browser contexts with no shared cookies play a full game through a friend link, one at each marking viewport | passing (`e2e/e1-full-game.spec.ts`) |
| E4 | Every screen in `docs/design.md` has no sideways scroll at 320 px, 390 px and laptop width | passing (`e2e/e4-no-sideways-scroll.spec.ts`) |
| E5 | Every tap target is at least 44 x 44 px at the phone viewport | passing (`e2e/e5-tap-targets.spec.ts`) |
| E6 | Every feature (computer, friend link, code entry, quick match, sign up, leaderboard, /readme/) completes at the phone viewport | passing (`e2e/e6-features.spec.ts`) |

## Design and tutorial (docs/design/)

| IDs | Claim | Where | Status |
| --- | --- | --- | --- |
| U1 to U9, U30, U49, U50 | One theme file; no colour, font, outline, radius or duration outside it; contrast; reduced motion; no preview or developer text; `/style-preview` only in development | `spec/unit-theme.test.ts`, `spec/app-screens.test.ts` | passing |
| R47 to R50 | The tutorial is shown once, saved with the player, replayable, and never touches the leaderboard | `spec/app-tutorial.test.ts` | passing |
| U10 to U18 | Play on the board by tap, hover and keyboard; the shield badge | `e2e/design.spec.ts` | passing |
| U19 to U30 | Reveal within one second, end popups, reduced motion | `e2e/design.spec.ts` | passing |
| U31 to U40 | Home menu content and the phone and laptop layouts | `e2e/design.spec.ts` | passing |
| U41 to U48 | Tutorial steps, skip and replay | `e2e/design.spec.ts` | passing |
| Screenshots | Approved look at both viewports | `e2e/design.spec.ts` | passing |
| Judged | It feels like a cheerful navy toy game and is clearly its own; a newcomer understands crashes and the shield after the tutorial; the reveal is exciting | `/style-preview` approval by Tejas (given 27 October 2026), then playtests in `docs/playtests.md` | judged |

## Manual (multi-user test session)

| ID | Claim | Rule | Scenario |
| --- | --- | --- | --- |
| X1 | After a machine restart mid-game, both players reconnect and continue from the last round | R26 | h |
| X2 | Behaviour with two machines is recorded | ADR 0005 | g |
| X3 | Closing a tab and returning on a real phone resumes the game | R27 | e |

## Judged, not tested

| Claim | How it is judged |
| --- | --- |
| The game rewards reading your opponent (promise 1) | Playtests in `docs/playtests.md` |
| A newcomer understands crashes and shields within one game | Playtests |
| The design feels clean and modern | Playtests and crit feedback |
