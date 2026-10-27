# Design pack

This folder is the source of truth for how Rubble looks, moves and teaches itself. It extends `docs/design.md`, which keeps the standards every screen must meet (viewports, tap targets, contrast, no sideways scroll, shapes as well as colours). Where a file here and `docs/design.md` disagree, this folder wins for look, motion and interaction, and `docs/design.md` wins for the standards.

| File | Covers |
| --- | --- |
| `look-and-feel.md` | Colours, type, surfaces, buttons and the theme file (U1 to U9) |
| `board-interaction.md` | Playing on the board itself: hover, tap, keyboard, the shield badge (U10 to U18) |
| `motion-and-endings.md` | Animations, the reveal, and the win, lose and draw popups (U19 to U30) |
| `home.md` | The redesigned home screen, laid out like a game menu (U31 to U40) |
| `tutorial.md` | The first-time tutorial, including what the shield does (U41 to U48, rules R47 to R50) |
| `earthquake.md` | The Earthquake badge, the shake and crumble, its result line and tutorial step (U61 to U67) |
| `shrinking-board.md` | The warning, the ceiling dropping to rock, the result line and the tutorial step (U68 to U74) |
| `game-screen.md` | The waiting card, timer bar, names and layout (U54 to U60) |
| `plan.md` | The order of work, the commits and where to stop for Tejas |

Every item has an ID. Checks name the ID they protect, and `spec/CHECKS.md` lists them.

The decisions behind this pack are ADRs 0006 (visual style), 0007 (play on the board) and 0008 (first-time tutorial).

The style is the **navy toy**, chosen by Tejas on 27 October 2026 after looking at CrazyGames' Connect 4, papergames.io and Poki:

- **Kept because he liked it:** the deep navy background with slowly rising bubbles. The bubbles are shaped like game discs, so the background belongs to this game.
- **Made original on purpose:** flat red, blue and yellow buttons with dark outlines and hard shadows (no glossy gradients), navy panels like toy pieces, a cracked yellow "RUBBLE" title with falling chips, and the blue toy board with red ring discs, yellow cross discs and grey hatched rubble. The menu is a stack of buttons over a round icon row, laid out and ordered for Rubble.
- Rubble never uses the Connect 4 or Hasbro names, logo, box art or disc characters, and does not copy any other site's art or layout.
