# Motion and endings

Every animation uses only `transform` and `opacity` so it stays smooth on phones. Durations live in `public/theme.css`.

## The reveal (the game's signature moment)

- **U19** When both players have chosen, a large "3, 2, 1, DROP!" countdown pops over the board, each number scaling in and fading out, lasting 900ms in total (three numbers of 240ms and DROP at 180ms, read from `public/theme.css`).
- **U20** Both discs then fall from above the board at the same moment, with gravity and a small bounce on landing.
- **U21** A crash: the two discs meet at the top of the column, burst, the column shakes, a rubble block thuds into place with a small puff of dust and the whole screen gives a tiny shake.
- **U22** A shield win: the winning disc flashes a glowing ring and the losing disc shatters.
- **U23** The countdown and drop are presentation only. The server still sends the result within the 1-second promise (R23), and both screens show the same result.

## Live feedback

- **U24** When the opponent becomes ready, their panel pulses once and their status changes to "Ready!".
- **U25** The round timer is a circular ring that drains. It turns yellow at 10 seconds and red, pulsing, in the last 5 seconds, and always shows the number of seconds as text as well.
- **U26** Screens slide or fade in rather than appearing instantly. Tiles and panels pop in one after another on the home screen.

## Endings

- **U27** When a game ends, the board dims and a large `--panel` popup with the `--outline` and `--shadow` bounces in with `data-testid="end-popup"`.
- **U28** Win: "YOU WIN!" in huge display letters in the title style (U5), with red, yellow and blue confetti discs bursting across the screen for about 2 seconds and the four winning discs glowing on the board behind. Lose: "SO CLOSE!" with a gentler animation and the opponent's winning line highlighted. Draw: "IT'S A DRAW!" in yellow with a red shadow. Forfeit and abandoned games get their own short titles.
- **U29** The popup shows the number of rounds played and two funky buttons: "Play again" (`play-again`) and "Home" (`go-home`).

## Recorded exceptions

- **U19 under reduced motion:** the countdown is skipped (U30) and the result is shown as soon as the server sends it. The countdown is presentation only, so skipping it changes nothing the player learns.
- **U9 and U30, the button shadow:** the rest of the motion uses only `transform` and `opacity`, but a button's hard shadow grows on hover and flattens when pressed, so `.btn` and `.round` also transition `box-shadow`, for 0.08 seconds. It is a very small, short change on one element at a time, it is the toy-like press the style depends on, and it stops under reduced motion. This is the only exception.

## Reduced motion

- **U30** Under `prefers-reduced-motion`, nothing moves: the countdown is skipped, discs appear in place, there is no shake or confetti, and the popup simply appears. Every piece of information still shows.
