# Playing on the board

The game screen has no column buttons and no Drop button. Players act on the board itself.

## Choosing a column

- **U10** Each whole column, from the top of the board to the bottom, is one hit area with `data-testid="column-<n>"`.
- **U11** On a laptop, hovering a column brightens it and shows a faint ghost disc in the player's colour just above it. Moving across columns moves the ghost.
- **U12** Clicking or tapping a column chooses it. The ghost disc stays above the chosen column and pulses gently, and the player panel shows "Chosen". This sends the choice to the server.
- **U13** Clicking or tapping another column changes the choice, as rule R4 allows, until the round resolves. There is no separate confirm step.
- **U14** A full column cannot be chosen: hovering it shows nothing and tapping it gives a short shake and the message "That column is full".
- **U15** Each column hit area is at least 44px wide at 320px screen width.

## The shield

- **U16** The shield is a badge on the player's own panel, shaped like a shield, with `data-testid="shield-badge"`. Tapping it arms the shield for this round: it glows and the label reads "Shield armed". Tapping again disarms it. Once spent, it shows as cracked and greyed out.
- **U17** The opponent's panel shows whether their shield is still available, never whether it is armed this round (rule R22).

## Keyboard and access

- **U18** Keys 1 to 7 choose a column, S arms or disarms the shield, and every choice is announced in an `aria-live` region. Hover only ever adds a preview: everything works by tap and keyboard alone.

## Test hooks

Keep `column-0` to `column-6`. Remove `drop` and `shield-toggle`. Add `ghost-disc`, `shield-badge`, `chosen-label`, `end-popup`, `end-title`, `play-again`, `go-home`, `tutorial`, `tutorial-next`, `tutorial-skip` and `how-to-play`. Keep every home screen hook (`play-computer`, `play-friend`, `quick-match`, `code-input`, `nickname-input`, `leaderboard-wins`, `leaderboard-rounds`).
