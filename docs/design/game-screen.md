# Game screen, waiting card and layout

Added on 27 October 2026 from Tejas's fix list (ADR 0009). It extends `board-interaction.md` and `motion-and-endings.md`.

## Waiting for the second player

- **U54** Until the second player has joined a friend game or Quick match, the game screen shows a compact card centred over the board (`waiting-panel`, at most 480px wide) with "Waiting for your opponent", the game code (`game-code`) at a sensible size (never more than 2.5rem) and two normal-sized buttons, "Copy link" (`copy-link`) and "Share" (`share`). The board is dimmed behind it. There is no timer, no round number and no opponent status while waiting (R51). On a browser with no Web Share, Share falls back to copying the link so the button is always usable.
- **U55** When the second player joins, the card disappears and a short "Get ready" (`get-ready`, U19) starts round 1. In a computer game there is no waiting card: "Get ready" shows at once.

## The round timer

- **U56** The timer is the slim bar of U25 under the board. It restarts when a round begins and is hidden once both players have chosen. It never shows a number the opponent's choice could be read from.

## Names

- **U57** Your panel shows your own nickname and tag (for example "Pip #4F2A"), or your username for an account, never "You". The opponent's panel shows their nickname and tag, or "Computer" in a computer game. Names come from the server in the snapshot and carry no choice information (R22).

## End popup and shield help

- **U58** See U27a for the popup (centred over the board, title fits on one or two lines) and U16 for the shield help.

## Layout

- **U59** The game screen is one centred group: the player panels and the board together are centred on the page, with the round number above the board and centred with it. On a laptop the panels sit to the left of the board; on a phone they sit above it. There is no keyboard hint under the board (U18). The centre of the group is within 16px of the centre of the screen at both viewports.
- **U60** Forms and lists are never wider than 560px and are centred: the account forms, the leaderboard lists, the join-with-code input and the home "Top players" list. The nickname button reads "Save nickname".
