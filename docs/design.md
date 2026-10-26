# Design standards

The aim is a lively, dark arcade game site that works fully on a phone (ADR 0006, which replaced "clean and simple"). The standards below can each be checked. The "Look and feel" section says how it should look.

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

- Player discs differ by **shape as well as colour**: your discs carry a small ring, the opponent's carry a small cross. Rubble blocks are grey with a hatched pattern. The colours are in "Look and feel".
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

Decided in ADR 0006. Every colour, radius, shadow and font below is a CSS variable in `public/theme.css`, and no colour or font may be defined anywhere else (CLAUDE.md, enforced by a test). The values here are the starting point and the file is the truth: change a value there, not in a screen.

**Ground and type**

- Background: deep navy (`#0F1535`) with a subtle, static starfield. Text is white.
- Title: "RUBBLE" in Fredoka, extra bold and rounded, self-hosted in `public/`, with a gradient fill and a dark outline. Fredoka is used for the title, buttons and headings. Body text and long copy use the system font, so a failed font load never breaks reading.

**Buttons**

- Chunky and glossy, with a 14 px radius, a darker bottom edge that flattens when pressed, an icon on the left and a bold label.
- The main action is green (`#22C55E`). Other actions are orange (`#F97316`).
- Labels on green and orange are dark navy, because white on those colours is only 2.28:1 and 2.8:1 against the 4.5:1 minimum (ADR 0006).
- Icons are drawn from shapes (inline SVG), never from emoji, so they look the same everywhere and carry a text label as well.

**Board**

- The hero of the game screen. A thick blue frame (`#2563EB`, edge `#1D4ED8`) with holes that have glowing rims.
- On a phone it fills the full width of the screen. On a laptop it is at least 60% of the screen height, with the players' panel beside it.

**Discs**

- Yours: coral (`#FF4D6D`) with a ring marker. The opponent's: sunshine yellow (`#FFC93C`) with a cross marker. Rubble: slate grey (`#64748B`) with a hatch pattern. The shapes stay, so colour is never the only difference.
- The most recent discs glow.

**Players**

- A panel for each player showing their colour, nickname, shield status and a simple generated avatar (drawn from the player's id, so it is stable and needs no upload), joined by a purple (`#7C3AED`) "VS" ribbon.
- Above the board on a phone, beside it on a laptop.

**The reveal**

- When both players have chosen, a quick "3, 2, 1, DROP" countdown, then both discs drop together with a bounce.
- A crash shakes the column and the rubble thuds in. A shield glows when used. A win highlights the four discs and bursts confetti.
- Both screens show the same thing at the same moment (promise 2): the countdown and animation start when the server's result arrives, never before, so they can never show a result early (promise 3) or delay it past the one second budget. The whole sequence is cosmetic, so the result line states the outcome in words as well, and the drop itself finishes within 400 ms of the countdown ending.
- If the countdown would push the result later than one second after it arrives, it is shortened, not the result delayed.
- Every animation respects `prefers-reduced-motion`: under it, discs appear in place, there is no countdown, shake or confetti, and a win is shown by the highlight alone.

**Leaderboard**

- Rows have an avatar, nickname and tag, styled like the player panels.

**Kept from the standards above**

44 px tap targets, 4.5:1 text contrast (checked by axe-core), no sideways scroll at 320 px, and shape as well as colour.

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
