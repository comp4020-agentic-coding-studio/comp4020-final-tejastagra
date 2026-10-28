# First-time tutorial

Rubble has four rules a newcomer has never seen: both players move at once, matching columns crash into rubble, each player has one shield and one Earthquake, and the board shrinks over time. The tutorial teaches all five in about a minute.

## Rules (to add to docs/rules.md)

- **R47** A player who has never finished the tutorial sees it automatically before their first game.
- **R48** Finishing or skipping the tutorial is saved with the player, so it does not return after a refresh, a new session, a restart or a redeploy.
- **R49** The tutorial can be skipped at any step and replayed at any time from "How to play".
- **R50** Tutorial games never change the leaderboard.

## Steps

The tutorial is an overlay over a practice board against a scripted computer. It is interactive, not a slideshow: each step waits for the player to act. A short caption, a "Skip" link (`tutorial-skip`) that is always available, and a "Next" button (`tutorial-next`) that appears only once the step's action is done. There is no disc left in the top hole.

- **U41** Step 1, "Pick a column": the player must tap a column. The ghost disc lifts and locks in, and the choice is final (U12). Caption: "Tap a column to choose it. Once you choose, your choice is locked in."
- **U42** Step 2, "You both move at once": the computer chooses another column and both discs drop together, with no countdown (U19). Caption: "Your opponent chooses at the same time. Neither of you sees the other's choice until both discs drop."
- **U43** Step 3, "Crash!": the computer is scripted to pick the same column as the player (the player taps a column and the computer takes it). The discs crash and leave rubble. Caption: "If you both pick the same column, the discs crash and leave rubble that belongs to nobody. Rubble blocks lines."
- **U44** Step 4, "Power-ups: your shield": the board is set up so the computer is about to win in one column. The shield badge shows on the player's panel and the player is asked to tap it, then to tap that same column. Their disc lands and blocks the win, and the computer's disc is lost. Caption: "Your shield wins one crash per game. Use it when you both need the same column."
- **U44a** Step 5, "Power-ups: Earthquake" (U67): the player uses Earthquake to break up a line the computer is building. Caption: "Earthquake uses your turn: the bottom row crumbles away and everything drops down one. Use it to break up a line."
- **U44b** Step 6, "The board shrinks" (U74): a warning shows, the player taps a column and the top row turns to rock. Caption: "The board shrinks as rounds pass: after round 12 the ceiling drops, and it drops again after round 20. Pieces in a closed row crumble away."
- **U45** Step 7, "Four in a row wins": four of the player's discs line up and glow, with confetti. Caption: "Get four of your discs in a row, across, down or diagonally. If you both do it in the same round, it is a draw."
- **U46** Step 8 offers "Play the computer" or "Back home". Its caption is "You know the rules. On a keyboard, keys 1 to 7 choose a column, S arms your shield and E uses Earthquake." This is the only place the keys are written down (U18); the game screen has no hint line.

- **U47** Every caption is short, uses the words in `docs/glossary.md` and is readable on a 320px screen. Captions are announced in an `aria-live` region.
- **U48** The tutorial works by tap, mouse and keyboard, and under reduced motion every step still makes sense without animation.
