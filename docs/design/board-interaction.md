# Playing on the board

The game screen has no column buttons and no Drop button. Players act on the board itself.

## Choosing a column

- **U10** Each column is one hit area with `data-testid="column-<n>"`. Its highlight covers exactly one column of holes, from the top of the board face to the bottom hole, and never the frame or the feet. Its left and right edges match that column's holes within 2px. The hit area itself is at least 44px wide (U15).
- **U11** On a laptop, hovering a column brightens it and shows a faint ghost disc in the player's colour centred just above it, outside the board. Moving across columns moves the ghost.
- **U12** Clicking or tapping a column chooses it, and the choice is final (R4, ADR 0009). The ghost disc lifts a little and locks into place, centred above the chosen column and outside the board, and the player panel shows "Chosen". This sends the choice to the server, with the shield flag as it is at that moment.
- **U13** After choosing, every column and the shield badge are locked until the round resolves; tapping again does nothing except say "Your choice is locked in.". If the server still gets a second choice it answers `already_chosen` and the first choice stands. There is no separate confirm step, so a stray tap cannot be undone: the lift and lock of the ghost disc makes the choice obvious.
- **U14** A full column cannot be chosen: hovering it shows nothing and tapping it gives a short shake and the message "That column is full". A closed column is the same (U72).
- **U15** Each column hit area is at least 44px wide at 320px screen width.

## The shield

- **U16** The shield is a power-up and looks like one: a badge inside the player's own panel with a large shield-shaped icon, `data-testid="shield-badge"`. While available it reads "Tap to arm shield". Tapping it arms the shield for this round: it glows and reads "Shield armed". Tapping again disarms it, until the player chooses a column (U13). Once spent it is greyed out and reads "Shield used". Beside it is a small info button (`shield-info`, at least 44 by 44px) that opens a short explanation (`shield-help`): "Your shield wins one crash per game. If you and your opponent pick the same column, your disc lands and theirs is lost. Use it when you both need the same column, for example to block their winning move or to take yours."
- **U17** The opponent's panel shows whether their shield is still available, never whether it is armed this round (rule R22).

## Earthquake

- The Earthquake badge sits beside the shield. See `earthquake.md` (U61 to U64).

## Keyboard and access

- **U18** Keys 1 to 7 choose a column, S arms or disarms the shield, E uses the Earthquake (U62), and every choice is announced in an `aria-live` region. Hover only ever adds a preview: everything works by tap and keyboard alone.

## Test hooks

Keep `column-0` to `column-6`. Remove `drop` and `shield-toggle`. Add `shield-info`, `shield-help`, `get-ready`, `ghost-disc`, `shield-badge`, `chosen-label`, `end-popup`, `end-title`, `play-again`, `go-home`, `tutorial`, `tutorial-next`, `tutorial-skip` and `how-to-play`. Keep every home screen hook (`play-computer`, `play-friend`, `quick-match`, `code-input`, `nickname-input`, `leaderboard-wins`, `leaderboard-rounds`).
