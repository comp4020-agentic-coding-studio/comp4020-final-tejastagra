# First-time tutorial

Rubble has rules a newcomer has never seen: both players move at once, matching columns crash into rubble, each player has one shield and one Earthquake, rounds are timed and the board shrinks over time. The tutorial teaches all of it, and how to play with others, in eleven short steps.

## Rules (to add to docs/rules.md)

- **R47** The tutorial is shown once, automatically, the first time a person starts a game in their browser (Play the computer, Play a friend, Join with a code or a friend's link), before that game begins (changed 31 October 2026; see docs/rules.md).
- **R48** Finishing or skipping the tutorial is saved with the player, so it does not return after a refresh, a new session, a restart or a redeploy.
- **R49** The tutorial can be skipped at any step and replayed at any time from "How to play".
- **R50** Tutorial games never change the leaderboard.

## Steps (rewritten 29 October 2026, Part 7 of the fix list; replaces U41 to U46)

The tutorial is an overlay over a practice board against a scripted computer. It is interactive wherever an action is involved: a step that asks for an action shows Next only once the action is done. A progress line (`tutorial-progress`) says **"Step N of 11"**. **Skip** (`tutorial-skip`) is always there. There is no disc left in the top hole.

- **U136** **When it shows (R47, changed 31 October 2026).** It opens only when a person is about to play **their first game**, over the screen they started from and before the game: on home when they tap Play the computer, Play a friend or join with a code (after the code popup accepts a code), and on a game link (`/g/CODE`) **only if the seat check says a player seat is free** (R100); the page asks first and waits for the answer. It does **not** open: for Quick match; on home or any other page by itself; for a spectator (a link to a game that is full, which goes straight to watching, `/watch`); for a game that has **ended** (the page goes straight to its result); or for a signed-in player whose account has finished a game or has seen it (R48). Whether it has been seen is kept in the browser's local storage (`rubble-tutorial-seen`) and on the account. The last step's main button reads **"Start the match"** (`tutorial-next`) and starts the game the person chose; Skip starts it too. From How to play the last button reads **"Done"** and Skip reads **"Close"**, and no game starts.

1. **U137 The goal.** "Get four of your discs in a row, across, down or diagonally." The practice board shows four red discs in a row glowing. No action: Next shows at once.
2. **U138 Pick a column.** "Tap a column to choose it. Your choice locks in and cannot be changed this round." The player taps a column; the ghost disc locks in.
3. **U139 You both move at once.** "Your opponent chooses at the same time. Neither of you sees the other's choice, and both discs drop together." The player taps a column; the computer chooses another and both drop.
4. **U140 The round timer.** "Each round lasts up to 10 seconds, and the bar under the board shows the time left. If you do not choose in time, you miss the round and drop nothing. If both players miss 3 rounds in a row, the game is abandoned." A practice timer bar drains; the player taps a column before it runs out (it never runs out on its own).
5. **U141 Crashes.** "If you both pick the same column, the discs crash and leave rubble. Rubble blocks lines for both players." The player taps a column and the computer picks the same one: rubble.
6. **U142 Your shield.** "The computer is about to win in the glowing column. Arm your shield, then pick that column. The shield wins one crash, once per game, and is used up even if there is no crash." The player arms the shield and taps the glowing column; their disc lands and blocks the win.
7. **U143 Earthquake.** "Earthquake uses your turn: the bottom row crumbles and everything drops down one. Lines it makes by itself do not win. It works once per game, and only when the bottom row has a piece." The player uses it to break up the computer's line.
8. **U144 The shrinking board.** "After round 12, and again after round 20, the top row closes. A warning shows the round before. Plan ahead: space runs out." The warning shows, the player taps a column, and the top row turns to rock.
9. **U145 Draws.** "If you both complete a line in the same round, or the board fills up, it is a draw." The board shows both players completing a line at once. No action.
10. **U146 Playing with friends.** *Rewritten 31 October 2026.* "Play a friend gives you a link and a 6-letter code to send to anyone, anywhere in the world. The first person to open it plays you. If you send it to more people, the second person to open it, and anyone after them, can watch the game live as a spectator." A small illustration (`tutorial-friends`, drawn with shapes, no words) shows **you** (an avatar with a red disc), **the first friend joining as your opponent** (an avatar with a yellow disc, joined to you by a line) and **the second friend as a spectator** (an avatar with an eye icon, outside the pair). No action. The illustration sits in the practice board's place and takes no more room than the board (Q15).
11. **U147 Leaving and playing again.** "Leaving a game counts as a forfeit, so you lose. After a game you can play the same person again with Play again. On a keyboard: keys 1 to 7 pick a column, S arms your shield, E uses Earthquake." No action. This is the only place the keys are written down (U18).

- **U47** Every caption is short, uses the words in `docs/glossary.md` and is readable on a 320px screen. Captions are announced in an `aria-live` region. The step's title is its name above ("The goal", "Pick a column", and so on).
- **U48** The tutorial works by tap, mouse and keyboard, and under reduced motion every step still makes sense without animation.

## Fitting one screen (added 31 October 2026, Q15 to Q17)

- **U148** *Order replaced by U159 on 31 October 2026.* The tutorial card never scrolls, at 390 x 844, 1366 x 768 and 320 x 568, on every step. The gap between the caption and the practice board is small (8px), the board is sized from the height left over (never below what keeps the columns tappable), and under the board come, with at least 16px between each, the step's action button (Arm shield or Use Earthquake, when the step has one), Next and Skip (on a short or narrow phone, Next and Skip share one row 8px apart, each at least 44px tall). Nothing, including a caption, status line or button, overlaps the board (Q16). If space is short the gaps shrink first, then the board, never a button below 44px tall.

## The tutorial's fixed order (added 31 October 2026, Part K of the second fix list)

- **U159** Top to bottom: the **step counter**, the **title**, the **caption**, the **opponent's status on its own centred line**, **16px**, **the ghost disc lane** (one disc's height, `ghost-lane`), **8px**, the **practice board**, **16px**, the **step's buttons** (Arm shield or Use Earthquake where the step has one, then Next) **16px apart**, then **Skip**. **No text, card, badge or button ever enters the ghost lane**, with a disc showing or not, so nothing moves when a disc appears. The caption is never overlapped by the ghost disc. If space is short the board shrinks, never the lane or the gaps (Q15 still holds at 320 x 568).
