# 0016. The tutorial card, its areas and its board are fixed sizes, not sized by content

- **Status:** Accepted (2 November 2026)
- **Decided by:** Tejas (fix list of 2 November 2026, Fix 1)

## Context

The tutorial card was sized by what was in it: a caption of one to six lines, a hint line, a status line, a timer bar, a warning banner and a power-up button each added or removed height, and the board was sized from whatever height was left. Every fix to one step or screen size moved something on another. Four rebuilds (U161, U162, U165, U166) tried flowing layouts, reserved places and a grid, and Tejas rolled them all back on 2 November. The common cause is that the layout was a function of the content. Promise 4 (everything works on a phone) needs the tutorial to look the same on every step at the phone marking viewport.

## Options

1. **A flowing card that reserves places for each optional thing.** What U161 to U166 did. Every new optional item needs another reservation, and a reservation that is missed shifts the card.
2. **One fixed-size card with three fixed areas and a fixed board.** The card, the top area (counter, title, instructions), the middle area (board) and the bottom area (Next, Skip tutorial) have sizes set once per viewport. A step can change what is inside an area, never an area's size.
3. **Shrink the text until the longest step fits.** Rejected: Tejas said no instruction may be changed, shortened or shrunk.

## Decision

Option 2 (U167). At the two marking viewports (phone 390 x 844, laptop 1366 x 768) the card is `min(560px, 100vw - 32px)` wide and `min(720px, 100vh - 32px)` tall, centred, on all 11 steps. Top and bottom padding are equal and left and right padding are equal, and the two pairs may differ. The top area is as tall as the longest of the 11 instructions, measured at each viewport and written down in `docs/design/tutorial.md`. The board is centred in the middle area and its size is set once per viewport. The ghost lane, the timer bar, the warning banner and the power-up button have reserved space inside the middle area. All text under the board is removed. Next is always enabled, and Skip tutorial ends the tutorial straight away and starts the chosen match.

Next being always available replaces the earlier rule that Next waited for a step's action (U41 to U46, the steps' introduction in `docs/design/tutorial.md`).

## What it costs

On a screen smaller than the marking viewports the card shrinks to the screen and the board with it, and the 44px column minimum from `docs/design.md` can no longer always hold. The marking viewports are the design target; 320 x 568 is checked only for no sideways scrolling and for tap targets, and where the two rules cannot both hold that is recorded in `docs/handover.md`. A player can press Next without doing the step's action, so the lesson is no longer forced; the instructions still say what to do. Revisit if playtests show newcomers skipping the shield or Earthquake steps and then misusing them.

## Evidence

The browser checks named Q41 in `e2e/layout.spec.ts`, and correction C54.

## Amendment, 2 November 2026 (second fix list, Fix 1)

The first build used a fixed card height of `min(720px, 100vh - 32px)` with the board centred in the spare room, which left large empty gaps (about 60px above and below the board on a phone). The card is still one fixed size per viewport, but its height is now the sum of its parts: padding, the instruction area, 16px, the ghost lane, 8px, the board, 12px, one reserved slot, 24px, Next, 12px, Skip tutorial and equal bottom padding (docs/design/tutorial.md U172). Each part is its own block in normal flow, so there is no spare room for a gap to appear and nothing can overlap. What it costs: a change to any part (a longer instruction, a taller button) changes the card height, which is the intent, and the table in U172 must be updated with it.

