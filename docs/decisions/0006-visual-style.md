# 0006. A dark arcade look

- **Status:** Accepted (26 October 2026). Tejas chose the direction. The exact look is approved separately, at `/style-preview`, before any real screen is restyled.
- **Decided by:** Tejas

## Context

`docs/design.md` began with "a clean, simple and modern game site". That kept the first screens fast to build, but a plain page undersells a game whose point is a simultaneous reveal. The app will be shown in a showcase room, where a lively screen holds attention and makes the moment both players' discs land at once feel like an event. This touches promise 4 (everything works on a phone) most, because a richer look must not cost tap size, contrast, scroll or speed on a phone, and promise 2 (both players see the same result at the same moment), because the reveal animation must not delay or differ between screens.

Tejas looked at CrazyGames' Connect 4, papergames.io and Poki for the feel to aim at.

## Options

1. **Keep it clean and simple.** Cheapest, safest on phones and already built and checked. Cost: it looks like a prototype next to the sites above, and the reveal has nothing to dramatise.
2. **Dark arcade, like CrazyGames.** A deep navy background with a starfield, a chunky glossy blue board, bright discs that glow and loud buttons. It makes bright pieces stand out and suits a dimmed showcase room. Cost: more CSS, more animation to keep smooth on a phone, and bright-on-dark colour pairs that need checking for contrast.
3. **Bright playground, like Poki.** A light, saturated, cartoon look. Friendly and readable in daylight. Cost: it needs more illustration to feel finished, and glowing pieces read less well on a light ground.

## Decision

Option 2, the dark arcade look, specified in the "Look and feel" section of `docs/design.md`. Every colour, radius, shadow and font is a CSS variable in `public/theme.css`, so the look can change in one file, and nothing outside that file may define a colour (a rule in `CLAUDE.md`, backed by a test).

The existing standards stay: 44 px tap targets, 4.5:1 text contrast, no sideways scroll at 320 px and shape as well as colour.

One consequence of keeping contrast: white text on the specified green (#22C55E) is 2.28:1 and on the orange (#F97316) 2.8:1, so button labels are dark navy (7.82:1 and 6.35:1). White is used only on the navy ground and the purple ribbon (5.7:1).

## What it costs

- **Phone performance.** Gradients, shadows and animation cost more than flat colour. Mitigations: the starfield is a static background, with no blur or `backdrop-filter`, animation changes only `transform` and `opacity`, and the drop animation stays within 400 ms so the result is visible well inside the one second promise. Under `prefers-reduced-motion` nothing animates.
- **Accessibility.** More colour pairs to check. An automated contrast check (axe-core) runs in the browser checks, and shape (a ring or a cross) still tells the players apart as well as colour. The countdown is decoration: the result line still states what happened in words.
- **A web font.** Fredoka (SIL Open Font Licence, so free to self-host) at one weight, about 16 KB as woff2, kept in `public/`, loaded with `font-display: swap`, and falling back to the system rounded font. It is one extra request on first load and it adds a `public/` folder to the Docker image.
- **More to keep consistent.** Each screen is restyled separately, so screenshot comparisons guard against drift.

Revisit this if the dark look fails the contrast check on any screen, if a mid-range phone cannot hold the animation smoothly, or if playtests show the effects distract from reading the board.

## Evidence

To be added.
