# Motion and endings

Every animation uses only `transform` and `opacity` so it stays smooth on phones. Durations live in `public/theme.css`.

## The reveal (the game's signature moment)

- **U19** There is no countdown in any round (ADR 0009). Both discs drop the moment the server's result arrives, so both screens show the same result well within the one-second promise (R23, U23). Only before round 1 is there a **3 second countdown** (U133, R97, ADR 0014), which replaced the short "Get ready" on 29 October 2026. History: the pack first had a 900ms countdown, which was cut to 390ms on 27 October 2026 for promise 2, and removed the same day because it slowed every round.
- **U20** Both discs then fall from above the board at the same moment, with gravity and a small bounce on landing.
- **U21** A crash: the two discs meet at the top of the column, burst, the column shakes, a rubble block thuds into place with a small puff of dust and the whole screen gives a tiny shake.
- **U22** A shield win: the winning disc flashes a glowing ring and the losing disc shatters.
- **U23** The drop is presentation only, and the whole sequence lands within one second of the result arriving. The server still sends the result within the 1-second promise (R23), and both screens show the same result.

- **U23a** An earthquake round is drawn as shake, crumble, slide and then the drop, still within one second (U65). Under reduced motion the board simply updates.

- **U23b** A ceiling drop is drawn as crack, crumble and rock, starting as the discs land, and the longest round (an earthquake and a ceiling drop) still takes under a second (U70). Under reduced motion the closed row simply changes to rock.

## Live feedback

- **U24** When the opponent becomes ready, their panel pulses once and their status changes to "Ready!".
- **U25** The round timer is a slim bar under the board (`timer`) that drains over the 10 second round (R18). It is the `--blue` toy colour at first, turns orange at 5 seconds left and red at 3. It is hidden while a game is waiting for its second player and once both players have chosen, and it has an accessible label giving the seconds left. It moves with `transform` only.
- **U26** Screens slide or fade in rather than appearing instantly. Tiles and panels pop in one after another on the home screen.

## Endings

- **U27** When a game ends, the board dims and a large `--panel` popup with the `--outline` and `--shadow` bounces in with `data-testid="end-popup"`.
- **U28** Win: "YOU WIN!" in huge display letters in the title style (U5), with red, yellow and blue confetti discs bursting across the screen for about 2 seconds and the four winning discs glowing on the board behind. Lose: "SO CLOSE!" with a gentler animation and the opponent's winning line highlighted. Draw: "IT'S A DRAW!" in yellow with a red shadow. Forfeit and abandoned games get their own short titles.
- **U27a** The popup is centred over the board, on a phone and on a laptop (changed on 27 October 2026; it used to sit below or beside the board). It is compact (at most 300px wide), its buttons sit side by side and its title fits inside it on one or two lines at every width (`overflow-wrap: anywhere` as a last resort), so "GAME ABANDONED" never overflows. To keep the winning line seen, the popup waits `--ms-popup-delay` after the last disc lands while the four winning discs glow, and the dim behind it is `--scrim-light`, light enough that the board shows through.
- **U29** The popup shows the number of rounds played and two funky buttons: "Play again" (`play-again`) and "Home" (`go-home`). **Each label is on one line (Q2) at every width**, down to 320px: the two buttons share the card's width, the arrow icon is dropped at 320px if the words need the room, and the card's `popup-actions` row is never narrower than the two words (changed 28 October 2026). Rematches change what "Play again" does and says (`rematch.md`).

## Recorded exceptions

- **U19 under reduced motion:** discs appear in place as soon as the server sends the result, and the start countdown (U133) shows its words and numbers without any animation, for the same 3 seconds.
- **U9 and U30, the button shadow:** the rest of the motion uses only `transform` and `opacity`, but a button's hard shadow grows on hover and flattens when pressed, so `.btn` and `.round` also transition `box-shadow`, for 0.08 seconds. It is a very small, short change on one element at a time, it is the toy-like press the style depends on, and it stops under reduced motion. This is the only exception.

## Reduced motion

- **U30** Under `prefers-reduced-motion`, nothing moves: discs appear in place, there is no shake or confetti, and the popup simply appears. Every piece of information still shows.
