# Home screen

The home screen is a stacked button menu with a round icon row underneath, dressed in the navy toy style (`look-and-feel.md`). The layout is our own: the order of the buttons, the player card, the demo board and the podium are Rubble's, not copied from any other site. A first-time visitor, including a marker, should understand what Rubble is and start playing within seconds, on a phone or a laptop.

## The menu

- **U31** At the top, the cracked yellow "RUBBLE" title (U5) with the tagline "Four in a row, with a twist." (The name of the toy is never used.) The bubbles (U3) rise behind everything.
- **U32** The player card, a small `--panel` pill under the title: the player's avatar, nickname and tag, and a pencil icon that opens the **nickname popup** (`nickname-dialog`, `popups.md`): one field prefilled with the current nickname (Q7), **Save** and **Cancel**, and an error from the server under the field. Saving closes the popup and the new name on the player card is the confirmation: **there is no "Nickname saved." message** (changed 31 October 2026), so nothing on the screen moves (Q1). A first-time visitor gets a generated nickname (for example "Brave Wombat") so they can play straight away.
- **U33** A stack of large, full-width buttons with icons, in this order, with **no subtext** (changed 29 October 2026: the line under each button was removed; the labels say what each does):
  - "Play the computer" (`--red`, computer icon), the main action.
  - "Play a friend" (`--blue`, link icon).
  - "Quick match" (`--blue`, bolt icon).
  - "Join with a code" (`--yellow`, key icon, `--ink` label). Tapping it opens the **code popup** (U33b): nothing on the screen moves.

  Icons are drawn from shapes (inline SVG), never emoji, and every button also has its text label. Stacked buttons are 16px apart (Q4).
- **U33b** "Join with a code" opens a popup (`code-dialog`, `popups.md`): the heading "Join with a code", the code field (`code-input`, entry is not case sensitive), and **Join** and **Cancel**. A code that is not 6 letters or numbers shows "A game code is 6 letters or numbers, for example K7QM2X." inside the popup under the field. The home layout never moves when it opens or closes (Q1).
- **U34** Under the stack, a row of round icon buttons, each with a label underneath: "Leaderboard" (podium icon, opens `/leaderboard`), "How to play" (question mark, replays the tutorial), "Account" (person icon, opens `/account`) and "About" (book icon, opens `/readme/`).
- **U35a** The round icon row is centred under the buttons, with **at least 8px between each circle and its label** and no two labels touching at 320px wide (changed 31 October 2026). There is no "Nickname saved." message anywhere.
- **U35** *Removed 31 October 2026.* There is **no Top players section on the home screen** on any viewport. The full leaderboard is on the Leaderboard page, reached from the round Leaderboard button.

## The demo board

- **U36** On a laptop, a small live demo board, in the navy toy style, loops the reveal: both players choose, discs drop and one round ends in a crash and rubble. It shows the twist without words. Under reduced motion it shows a still image of a crash.

## Responsive

- **U37** On a phone, everything stacks in one column: title, tagline, player card, button stack, icon row (changed 31 October 2026: **the demo board is not shown on a phone**). The player card and the four menu buttons are **exactly the same width**, and the **gap between the player card and the first button is the same as the gap between the buttons** (Q17). The four buttons are one height; **the player card is taller than a button** (changed 31 October 2026): at least 16px of padding above and below its content and a slightly larger avatar, so the avatar, name and "Guest" or "Account" line have room, and there is no subtext under any button on any viewport.
- **U38** On a laptop the screen is split into two halves that share the width evenly, with generous space between them, both vertically centred, and nothing stretches across the full width:
  - **Left half:** the "RUBBLE" title, the tagline and, beneath them, the looping demo board (U36).
  - **Right half:** the player card (U32), the menu buttons (U33, at most `--stack-width`, 420px, wide) and then the round icon row (U34).
  - On a laptop the gap between the player card and "Play the computer" is the same as the gap between the menu buttons (Q17).
  - With Top players gone (U35), the right half (player card, buttons and icon row) is **vertically centred beside the left half**: the centre of the right-hand column is within 24px of the centre of the left-hand column.
- **U39** The menu pieces pop in one after another when the screen opens (U26), and respect reduced motion.
- **U40** Everything meets the standards in `docs/design.md`, and every existing home test hook keeps working (`play-computer`, `play-friend`, `quick-match`, `join-toggle`, `rename`, `code-dialog`, `nickname-dialog`, `code-input`, `nickname-input`, `leaderboard-wins`, `leaderboard-rounds` on `/leaderboard`, plus `how-to-play`).
