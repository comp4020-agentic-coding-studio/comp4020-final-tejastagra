# First-time tutorial

Rubble has three rules a newcomer has never seen: both players move at once, matching columns crash into rubble, and each player has one shield. The tutorial teaches all three in under a minute.

## Rules (to add to docs/rules.md)

- **R47** A player who has never finished the tutorial sees it automatically before their first game.
- **R48** Finishing or skipping the tutorial is saved with the player, so it does not return after a refresh, a new session, a restart or a redeploy.
- **R49** The tutorial can be skipped at any step and replayed at any time from "How to play".
- **R50** Tutorial games never change the leaderboard.

## Steps

The tutorial is an overlay over a real practice board against a scripted computer, with a short caption and a "Next" button (`tutorial-next`) and a "Skip" link (`tutorial-skip`) on every step.

- **U41** Step 1, "Pick a column": the player is asked to tap or click any column. The ghost disc appears. Caption: "Tap a column to choose it. You can change your mind until the round ends."
- **U42** Step 2, "You both move at once": the computer chooses a different column, the countdown runs and both discs drop together. Caption: "Your opponent chooses at the same time. Neither of you sees the other's choice until both discs drop."
- **U43** Step 3, "Crash!": the computer is scripted to choose the same column as the player. The discs crash and leave rubble. Caption: "If you both pick the same column, the discs crash and leave rubble that belongs to nobody. Rubble blocks lines."
- **U44** Step 4, "Your shield": the shield badge glows and the player is asked to tap it, then pick the same column the computer is shown to be aiming for. The player's disc lands and the computer's shatters. Caption: "Your shield wins one crash, once per game. Arm it before you drop. Using it spends it, even if there is no crash."
- **U45** Step 5, "Four in a row wins": a short animation of four discs lining up and glowing. Caption: "Get four of your discs in a row, across, down or diagonally. If you both do it in the same round, it is a draw."
- **U46** The final step offers "Play the computer" and "Back home".

## Standards

- **U47** Every caption is short, uses the words in `docs/glossary.md` and is readable on a 320px screen. Captions are announced in an `aria-live` region.
- **U48** The tutorial works by tap, mouse and keyboard, and under reduced motion every step still makes sense without animation.
