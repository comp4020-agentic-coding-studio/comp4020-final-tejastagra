# 0018. The tutorial is full screen on a phone

- **Status:** Accepted (2 November 2026)
- **Decided by:** Tejas (fix list of 2 November 2026)

## Context

The tutorial was a centred card whose height was the sum of its parts (ADR 0016, U172): 746.5px on a 390 x 844 phone. A real iPhone in Safari shows only about 660 to 750px of its 844px screen once the address bar and toolbar are counted, so the card was taller than the visible screen. Skip tutorial sat behind the toolbar and, because the overlay does not scroll, it could not be reached. Promise 4 (everything works on a phone) was broken, and my browser checks never saw it because they ran at the full 844px height, which no Safari user has.

## Options

1. **Keep the card and let it scroll.** The page cannot scroll while the tutorial is open, and a card that scrolls hides Skip tutorial and Next, the two controls that must always be reachable. Rejected.
2. **Keep the card and shrink its parts to the visible height.** The card edge and the outer margin still cost height, and the card's own 5px border and shadow are wasted on a screen this small.
3. **Make the tutorial full screen on a phone.** It fills the visible screen (`100svh`) with the card's background colour, with no edge, margin or backdrop, respects the safe areas, and scales the board down once, when it opens, if the height is still short.

## Decision

Option 3 (U176). When the screen is too short for the stack, the gaps close first, then Next and Skip share a row with the smaller text, and only then does the board shrink, never below its seven 44px columns (Tejas chose this over shrinking the board below 44px, because docs/design.md and CLAUDE.md forbid it). Below 600px wide the tutorial is full screen; at 600px and wider the centred card is unchanged. The layout inside is the same as U172, so the instruction area, the board, the slot and the buttons keep their gaps. The board's size is worked out once when the tutorial opens (and again only on a resize or rotation), so it is identical on every step.

## What it costs

The phone tutorial no longer looks like a popup over a dimmed page, so Q27 (one backdrop behind every popup) and Q18 (popup padding) no longer apply to it on a phone; they still apply on a laptop. On a very short screen the board can be smaller than the laptop's. `100svh` is the small viewport height: when Safari's toolbars hide, the tutorial stays at the small height rather than growing, which is the safe choice. The board is sized by a small script on open, which is the first place the tutorial's layout depends on a measurement.

## Evidence

Q48 in `e2e/layout.spec.ts` (390 x 844, 390 x 664 and 375 x 667, all 11 steps), the existing 320 x 568 checks (Q15, Q16, Q25) which still pass, and correction C60. Q48 fails at 664px without the fitting, and Q27 now exempts the phone tutorial (it has no backdrop or edge) while keeping the laptop one.
