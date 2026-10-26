# 0007. Play on the board, not with buttons

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

The first game screen had seven column buttons and a Drop button. Games such as CrazyGames' Connect 4 let you act on the board itself, which feels far more like playing. Phones have no hover, and a stray tap must not be costly.

## Options

1. **Click or tap a column to choose it, changeable until the round resolves.** Natural and fast. A stray tap can be corrected because rule R4 already lets a choice change. Cost: if the opponent has already chosen, a stray tap resolves the round at once.
2. **Tap to preview, tap again to confirm.** Safer against stray taps. Cost: slower and unlike the games players know.
3. **Keep the buttons.** Clearest. Cost: feels like a form, not a game.

## Decision

Option 1, as set out in `docs/design/board-interaction.md`, with hover adding a ghost disc preview on laptops.

## What it costs

The column and Drop button tests must be rewritten to use the board. Stray taps cannot always be undone, which playtests should watch for.

## Evidence

To be added.
