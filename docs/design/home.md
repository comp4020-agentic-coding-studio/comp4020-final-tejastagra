# Home screen

The home screen is a stacked button menu with a round icon row underneath, dressed in the navy toy style (`look-and-feel.md`). The layout is our own: the order of the buttons, the player card, the demo board and the podium are Rubble's, not copied from any other site. A first-time visitor, including a marker, should understand what Rubble is and start playing within seconds, on a phone or a laptop.

## The menu

- **U31** At the top, the cracked yellow "RUBBLE" title (U5) with the tagline "Four in a row, but you both move at once." (The name of the toy is never used.) The bubbles (U3) rise behind everything.
- **U32** The player card, a small `--panel` pill under the title: the player's avatar, nickname and tag, and a pencil icon to change the nickname. A first-time visitor gets a generated nickname (for example "Brave Wombat") so they can play straight away.
- **U33** A stack of large, full-width buttons with icons, in this order:
  - "Play the computer" (`--red`, computer icon), the main action.
  - "Play a friend" (`--blue`, link icon).
  - "Quick match" (`--blue`, bolt icon).
  - "Join with a code" (`--yellow`, key icon, `--ink` label). Tapping it opens a code input with a Join button inside the same space.

  Icons are drawn from shapes (inline SVG), never emoji, and every button also has its text label.
- **U34** Under the stack, a row of round icon buttons, each with a label underneath: "Leaderboard" (podium icon, opens `/leaderboard`), "How to play" (question mark, replays the tutorial), "Account" (person icon, opens `/account`) and "About" (book icon, opens `/readme/`).
- **U35** Under the icon row, a compact "Top players" strip: the top three by most wins, each with avatar, nickname and wins, on `--panel` rows, keeping the `leaderboard-wins` hook.

## The demo board

- **U36** A small live demo board, in the navy toy style, loops the reveal: both players choose, the countdown runs, discs drop and one round ends in a crash and rubble. It shows the twist without words. Under reduced motion it shows a still image of a crash.

## Responsive

- **U37** On a phone, everything stacks in one column: title, player card, button stack, icon row, top players, then the demo board.
- **U38** On a laptop, the demo board sits large on the left and the title, player card, button stack and icon row sit on the right, using the full width rather than a narrow column.
- **U39** The menu pieces pop in one after another when the screen opens (U26), and respect reduced motion.
- **U40** Everything meets the standards in `docs/design.md`, and every existing home test hook keeps working (`play-computer`, `play-friend`, `quick-match`, `code-input`, `nickname-input`, `leaderboard-wins`, `leaderboard-rounds` on `/leaderboard`, plus `how-to-play`).
