# Game screen, waiting card and layout

Added on 27 October 2026 from Tejas's fix list (ADR 0009). It extends `board-interaction.md` and `motion-and-endings.md`.

## Waiting for the second player

- **U54** Until the second player has joined a friend game or Quick match, the game screen shows a compact card centred over the board (`waiting-panel`, at most 480px wide) with "Waiting for your opponent", the game code (`game-code`) at a sensible size (never more than 2.5rem) and two normal-sized buttons, "Copy link" (`copy-link`) and "Share" (`share`). The board is dimmed behind it. There is no timer, no round number and no opponent status while waiting (R51). On a browser with no Web Share, Share falls back to copying the link so the button is always usable.
- **U55** When the second player joins, the card disappears and the start countdown (U133) runs; round 1 starts when it ends. In a computer game there is no waiting card: the countdown runs at once.

## The round timer

- **U56** The timer is the slim bar of U25 under the board. It restarts when a round begins and is hidden once both players have chosen. It never shows a number the opponent's choice could be read from.

## Names

- **U57** Your panel shows your own nickname and tag (for example "Pip #4F2A"), or your username for an account, never "You". The opponent's panel shows their nickname and tag, or "Computer" in a computer game. Names come from the server in the snapshot and carry no choice information (R22).

## End popup and shield help

- **U58** See U27a for the popup (centred over the board, title fits on one or two lines) and U16 for the shield help.

## Layout

- **U59** *Replaced by U132 on 29 October 2026.* The game screen was one centred group: the player panels and the board together are centred on the page, with the round number above the board and centred with it. On a laptop the panels sit to the left of the board; on a phone they sit above it. There is no keyboard hint under the board (U18). The centre of the group is within 16px of the centre of the screen at both viewports.
- **U60** Forms and lists are never wider than 560px and are centred: the account forms, the leaderboard lists, the join-with-code input and the home "Top players" list. The nickname button reads "Save nickname".

## Power-ups (added 28 October 2026, Part 4)

These replace the inline badges and the help text that opened over the board (U16, U61, U63, whose wording still applies to the labels and the popups).

- **U102** Your power-ups are **one card of two full-width rows** (`powerups`) under the player panels on a phone and under your panel on a laptop, each row at least 44px tall and separated by a thin line inside the card, so the two rows are one box (Q4). Each row is: the power-up's **icon** (a shape: a shield, a cracked row), a **one-line label** and an **info button** (`shield-info`, `earthquake-info`, at least 44 by 44px) at the right edge. The row itself is the power-up button (`shield-badge`, `earthquake-badge`), as wide as the card less the info button. A label never wraps (Q2): at 320px the words are the shortest that say it.
- **U103** The labels (`shield-label`, `earthquake-label`) are: **"Arm shield"**, **"Shield armed"** and **"Shield used"**; **"Use Earthquake"**, **"Earthquake armed"** and **"Earthquake used"**. An armed row glows yellow and a used row is greyed (`--disabled`), as before (U16, U61). When nothing can be shaken (R55) the Earthquake row is **greyed and disabled** and reads **"Nothing to shake yet"**. After the game is over both rows are disabled and keep their last words.
- **U104** The info buttons open a popup (`popups.md`), never text in the page (Q1). `shield-help` has the heading "Shield" and the words of U16; `earthquake-help` has the heading "Earthquake" and the words of U63, and **when nothing can be shaken it begins with "Available once the bottom row has a piece."** Each has a Close button.
- **U105** The opponent's panel shows the same two power-ups as **small icons each with a text label**: "Shield available" or "Shield used" (`opponent-shield`) and "Earthquake available" or "Earthquake used" (`opponent-earthquake`), a used one greyed and struck through so it differs by shape (U17, U64). Availability only, never whether one is armed (R22). The labels may wrap onto a second line inside the panel but never overflow it.

## Who you are playing, and leaving (added 28 October 2026, Part 4)

- **U106** *Placement replaced by U132 (the heading is now the header bar's middle line).* Above the board (in the status row's place of honour, directly under the round line) every game screen has a heading **"Playing with <opponent nickname and tag>"** (`opponent-heading`), or **"Playing the computer"** in a game against the computer. It is one line, cut with an ellipsis if the widest name is longer than the screen, and the name is whole in the opponent's panel. On the waiting screen it is not shown: the waiting card says it, and only the board and the card are on the screen (U108). It carries no choice information (R22).
- **U107** *Changed 29 October 2026 (U132): there is no separate Leave game button; the header bar's Home does this.* While a game is being played, the header bar's Home (`header-home`) opens the leave popup (`leave-dialog`, `popups.md`): **"Leave this game? It counts as a forfeit."** with **Leave** (`leave-confirm`, red) and **Stay** (`dialog-cancel`, blue). **Stay** and Escape close the popup and change nothing. **Leave** tells the server (`{ type: "leave_game" }`, R81), then goes Home. At 320 x 568 it may sit below the first screen, because the board and timer keep it (docs/design.md, U59); it is reached by scrolling. In a game that has ended, or that has not started because nobody joined, Leave game is not shown: Home is in the end popup, and Cancel game is on the waiting card (U108).
- **U108** The waiting card of a friend game (`waiting-panel`) is **centred on the screen with the board centred behind it**, and has a **"Cancel game"** button (`cancel-game`) under Copy link and Share, which tells the server (`{ type: "leave_game" }` before anyone has joined ends the game as abandoned, R81) and goes Home, with no confirmation, because nothing is lost.

## Colours and the start countdown (added 29 October 2026, Part 2, ADR 0014)

- **U133** **The start countdown** (`get-ready`, R97) is a card centred over the board (`--panel`, `--outline`, `--shadow`, at most 300px wide) shown for the 3 seconds before round 1. From top to bottom: "Get ready" (small, `--text-muted`), **"You are Red"** or **"You are Yellow"** (`you-are`, the display font, about 1.8rem, one line), the player's disc **shown large** (`you-are-disc`, at least 64px, the real disc with its ring or cross marker, so the colour is told by shape as well), and the seconds left, **3, 2, 1** (`countdown-number`, `aria-live="polite"`). The board is locked while it shows (no ghost disc, no column responds) and the timer bar is hidden. It counts from the `ms` the server sent, so both screens finish together. It pops in with `transform` and `opacity`; under reduced motion it simply appears, and the numbers still change each second.
- **U134** **Colours are the same on every screen** (Q14, R94). Every disc, the ghost disc, each player's panel accent and mini disc, and the spectator's panels take the colour of their seat from the server's `colours`, never from "you" or "opponent". The board marks each cell with its seat for checks (`data-piece="A"`, `"B"` or `"R"`, the same on every screen) and with its colour (`data-colour="red"` or `"yellow"`). Your own panel says your colour in words, as visually hidden text after your name ("Red" or "Yellow"), so a screen reader is told too.

## The game screen layout (added 29 October 2026, Part 3; replaces U59, the placement in U102, U105, U106 and U107, and U108's layout)

- **U132** The game screen is **one centred column at every width**, so the board is always on the page's centre (Q13). From top to bottom:
  1. **The header bar** (`topbar`, Q12) as wide as the board: **Home** on the left (`header-home`), the middle line (`topbar-title`, which is `opponent-heading`: "Playing with <opponent nickname and tag>" or "Playing the computer", one line, cut with an ellipsis) and the round on the right (`topbar-right`: "Round 3", where the number is `round-number`, inside `round-line`). While a game is being played, Home opens the leave popup (U107: "Leave this game? It counts as a forfeit." with Leave and Stay). While waiting for the second player, the middle line is empty and Home cancels the game (U108). After the game has ended, Home goes Home at once and withdraws a rematch offer (R83). There is no separate Leave game button.
  2. **A status line** under the bar, only when there is something to say: the ceiling warning (U68) and the watcher count (U84), centred. It takes no room when both are hidden.
  3. **The versus bar** (`players`), centred above the board and as wide as it: **your card** on the left (`panel-you`), a small **VS** badge in the middle, **the opponent's card** on the right (`panel-opponent`). Each card has the avatar, the name and a mini disc in that player's colour and marker (U134), and the card's top edge is that colour. Under the opponent's name: their Ready status (`opponent-status`) and their power-ups as small labelled icons (`opponent-shield`, `opponent-earthquake`, with the words "Shield", "Earthquake" and a struck-through icon when used; the full "Shield available" or "Shield used" is the accessible text). Under your name: "Chosen" once you have chosen (`chosen-label`).
  4. **The board**, centred.
  5. **The timer bar** directly under the board, as wide as it (U25).
  6. **Your power-ups** as **one row of two compact buttons** centred under the timer (`powerups`): the shield button (`shield-badge`, labels of U103) with its info button (`shield-info`) and the Earthquake button (`earthquake-badge`) with its info button (`earthquake-info`). Each button and each info button is at least 44 by 44px, and every label is one line (Q2). On a phone (below 600px wide) the labels shorten to **"Shield"** and **"Quake"** in the visible text, and the button's grey, yellow or struck look shows its state (the state is still in the accessible name: "Shield, armed", "Earthquake, used") so the row fits.
  7. The result line (`result-line`) and the message line (`game-message`) under that.
  On a laptop the column is as wide as the board, whose height is set so that the header, the versus bar, the board, the timer and the power-up row all fit 1366 x 768. On a phone the board is the screen's width. Nothing sits beside the board.
- **U135** The friend waiting screen uses the same layout: the header bar (Home cancels the game) and the board centred, dimmed, with the waiting card (`waiting-panel`) centred over the board. The versus bar, the timer and the power-up row are hidden while waiting.
