# 0006. Visual style: the navy toy

- **Status:** Accepted (27 October 2026) as the direction. The exact look is approved separately, at `/style-preview`, before any real screen is restyled.
- **Decided by:** Tejas

## Context

The first version followed "clean and simple" in the original design standards. In use it looked plain, more like a form than a game. Rubble will be shown in a room full of people at the showcase, and its signature moment, both discs dropping at once, deserves to feel exciting.

Tejas looked at CrazyGames' Connect 4, papergames.io and Poki on 27 October 2026. This touches promise 4 (everything works on a phone) most, because a richer look must not cost tap size, contrast, scroll or speed, and promise 2 (both players see the same result at the same moment), because animation must not delay or differ between screens.

The direction changed twice on the same day, so the history is recorded here:

1. First a dark arcade look close to CrazyGames' Connect 4: navy with a starfield, glossy gradient buttons in green and orange.
2. Then a proposal for the classic Connect 4 toy look: a white dotted background, red and yellow discs, with a CrazyGames-style menu.
3. Tejas rejected both as written. He kept the navy background with slowly moving bubbles because he liked it, and asked for everything else to be original, so Rubble is not a copy of CrazyGames' Connect 4.

## Options

1. **Keep it clean and simple.** Cheapest and safest on phones. Cost: it does not feel like a game, and the reveal has nothing to dramatise.
2. **Dark arcade, as on CrazyGames.** Navy, starfield, glossy buttons. Cost: it is close to another site's look, and glossy gradients cost more to draw on a phone.
3. **The Connect 4 toy look.** White dotted ground, familiar to newcomers. Cost: it borrows a branded toy's look and layout, and Tejas did not want to lose the navy and bubbles he liked.
4. **The navy toy (chosen).** A navy gradient ground with rising disc-shaped bubbles, flat red, blue and yellow pieces with dark outlines and hard offset shadows, a cracked yellow "RUBBLE" title with falling chips, and a blue toy board with red ring discs, yellow cross discs and grey hatched rubble. A stacked button menu over a round icon row, ordered for Rubble.
5. **Bright playground, as on Poki.** Aqua and white tiles. Cost: it reads as a games portal, not one game.

## Decision

Option 4, specified in `docs/design/look-and-feel.md` and `docs/design/home.md`, with motion and endings in `docs/design/motion-and-endings.md`.

Why this one: the navy and the bubbles are kept because Tejas liked them. Everything else was changed so the style is not a copy of CrazyGames' Connect 4: no starfield, no glossy gradient buttons, no green and orange buttons, no copied menu art. The bubbles are shaped like game discs, with the ring and cross markers, so the background belongs to this game. Rubble never uses the Connect 4 or Hasbro names, logo, box art or disc characters.

Every colour, radius, outline, shadow, font and duration is a CSS variable in `public/theme.css`, so the look can change in one file, and nothing outside that file may define a colour or a font (a rule in `CLAUDE.md`, backed by a test).

The standards stay: 44px tap targets, 4.5:1 text contrast, no sideways scroll at 320px, and shape as well as colour. The contrast ratios of every text and background pair are recorded in `docs/design/look-and-feel.md` and recomputed by a test. Button labels are white on red (5.30) and blue (5.93), and dark on yellow (12.55). White on yellow (1.56) is never used.

## What it costs

- **Phone performance.** Rising bubbles are one fixed layer of about 7 elements on a phone (12 on a laptop) animating only `transform` and `opacity`, with no blur. The phone-tester measures frame times under a 4x CPU slowdown. Under `prefers-reduced-motion` the bubbles, chips, countdown, shake and confetti all stay still.
- **Accessibility.** More colour pairs to check; an automated axe-core check runs in the browser checks. One known limit: a red or blue button fill is 2.46 to 3.33:1 against the navy ground (it is a gradient), below the 3:1 guideline for a component's edge at the darker end, and the dark outline is nearly invisible on navy. The button is still identified by its label (above 5:1), icon, size and hard shadow. If Tejas wants the edge itself to pass, a light inner edge is added to buttons in `theme.css`. This is recorded in `look-and-feel.md` so nobody has to rediscover it.
- **A web font.** Fredoka (SIL Open Font Licence), one weight, about 16 KB as woff2, in `public/`, with `font-display: swap` and a rounded system fallback.
- **More to keep consistent.** Each screen is restyled separately, with screenshot comparisons to guard against drift.

Revisit this if a screen fails the contrast check, if a mid-range phone cannot hold the bubbles smoothly, or if playtests show the effects distract from reading the board.

## Evidence

To be added: the `/style-preview` approval commit and the design checks.
