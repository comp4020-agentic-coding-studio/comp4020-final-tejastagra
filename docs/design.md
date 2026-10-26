# Design standards

The aim is a lively, original navy toy game site that works fully on a phone (ADR 0006, which replaced "clean and simple"). The standards below can each be checked. `docs/design/` says how it should look.

## Viewports

- The two **marking viewports** are defined on the course assessment page. Read them and put them in the Playwright config. Until they are confirmed, test at **390 x 844** (phone) and **1366 x 768** (laptop).
- Also test at **320 px wide**, the narrowest common phone.
- Build every screen at phone width first, then widen.

## Layout

- One column of content, centred, at most 480 px wide on large screens. The exception is the game screen on a laptop, where the board is sized by height (see "Look and feel").
- The whole board, the timer, both shields and the choose button must be visible on the phone viewport without scrolling.
- Nothing scrolls sideways at any viewport.
- Respect safe areas on notched phones (`env(safe-area-inset-*)`).

## Touch and input

- Every tap target is at least 44 x 44 CSS px.
- Tapping a column selects it. A separate **Drop** button confirms the choice, so a stray tap is not final. The choice can be changed until the round resolves (R4).
- The shield is a toggle next to the Drop button and shows clearly whether it is on.
- An error or confirmation appears where the player is looking: inside the first screen height of the form that caused it, never below other forms or buttons. Use the interface's own messages, not the browser's validation bubbles.
- Nothing depends on hover. Everything works by tap, mouse and keyboard (keys 1 to 7 select a column, Enter drops, S toggles the shield).

## Telling things apart

- Player discs differ by **shape as well as colour**: your discs carry a small ring, the opponent's carry a small cross. Rubble blocks are grey with a hatched pattern. The colours are in `docs/design/look-and-feel.md`.
- Text contrast is at least 4.5:1 (WCAG AA).
- Colour is never the only way information is shown (WCAG 1.4.1).

## What the game screen always shows

- Round number and the round timer.
- Whether the opponent has chosen yet (R21), shown as "Ready" or "Choosing".
- Whether each player still has their shield.
- Your current choice, before you drop.
- After each round, a one-line explanation of what happened, for example "You both chose column 4. Crash: rubble landed."
- The first time a crash, shield win or missed round happens in someone's first game, a short explanation of the rule.

## Motion

- The drop animation takes at most 400 ms, so the result is visible well within the 1 second promise.
- Under `prefers-reduced-motion`, discs appear in place with no animation.

## Look and feel

The navy toy style (ADR 0006) is specified in `docs/design/`, which wins for look, motion and interaction. This file wins for the standards on this page. Start at `docs/design/README.md`.

In short: a deep navy gradient ground with slowly rising disc-shaped bubbles; flat red, blue and yellow buttons with dark outlines and hard offset shadows; navy panels; a cracked yellow "RUBBLE" title; a blue toy board with red ring discs, yellow cross discs and grey hatched rubble. Every colour, radius, shadow, font and duration is a variable in `public/theme.css`, and nothing else may define a colour or a font.

The reveal starts when the server's result arrives and never before, so a countdown or animation can never show a choice or a result early (promise 3, R22) or delay a result past one second (promise 2). Under `prefers-reduced-motion` nothing moves.

## Screens

| Screen | Path | Must contain |
| --- | --- | --- |
| Home | `/` | Nickname or sign in, Play the computer, Play a friend, Quick match, Enter a game code, leaderboard preview, link to `/readme/` |
| Game | `/g/<code>` | Board, timer, opponent status, shields, Drop, result line, Share link and code while waiting |
| Waiting | `/g/<code>` before the opponent arrives | The code in large text, Copy link, Share (Web Share API on phones) |
| Quick match | `/play/quick` | Waiting state, after 20 seconds an offer to play the computer |
| Leaderboard | `/leaderboard` | Most wins and fewest rounds to win, as two lists |
| Sign up and sign in | `/account` | Username, password, clear errors |
| Readme | `/readme/` | The full README.md, readable on a phone |

## Test hooks

Use these `data-testid` values so tests do not depend on layout:

`column-0` to `column-6`, `drop`, `shield-toggle`, `round-number`, `timer`, `opponent-status`, `my-shield`, `opponent-shield`, `result-line`, `game-code`, `copy-link`, `nickname-input`, `play-computer`, `play-friend`, `quick-match`, `code-input`, `leaderboard-wins`, `leaderboard-rounds`, `cell-<column>-<row>` (with `data-piece="A" | "B" | "R" | ""`).

## Words

Use `docs/glossary.md`. UK English. No em dashes and no Oxford commas in any interface text.
