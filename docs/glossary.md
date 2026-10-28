# Glossary

Use these words, and only these words, in code, tests, logs and the interface.

| Word | Meaning | Do not call it |
| --- | --- | --- |
| **Rubble** | The name of the game | |
| **Board** | 7 columns by 6 rows | grid, field |
| **Column** | One of the 7 places a disc can be dropped, numbered 1 to 7 on screen and 0 to 6 in code | slot, lane |
| **Disc** | A piece belonging to a player | counter, token, chip |
| **Rubble block** | The grey piece left by a crash; belongs to nobody | block, wall, debris |
| **Round** | One simultaneous choice by both players and its result | turn, move |
| **Choice** | A player's column plus whether they use their shield, or Earthquake instead of a column, hidden until the round resolves | move, pick |
| **Crash** | Both players choose the same column without exactly one shield | collision, clash |
| **Shield** | Each player's single use per game that wins a crash | boost |
| **Earthquake** | Each player's single use per game that replaces their disc: the bottom row crumbles away and everything above drops down one row | quake, shake, tremor |
| **Power-up** | The shield or the Earthquake; at most one per round | boost, bonus |
| **Ceiling** | The top of the open area. It drops after rounds 12 and 20, closing the top row | roof, lid |
| **Rock** | The solid piece that fills a closed row. It belongs to nobody and is different from rubble | stone, wall block |
| **Open area** | The rows still in play | playing area, grid |
| **Spectator** | Someone watching a game without playing in it. Never a player, never has a seat | viewer, observer, guest (a guest is a kind of player) |
| **Link game** | A game made with Play a friend, played through its link or 6-character code. The creator is player 1, the first other person is player 2 and everyone after watches | friend game (in code and docs only), private game |
| **Red** and **Yellow** | The two players' colours in a game. Red discs have a ring marker and yellow discs a cross marker. The server decides who is which (R93) | your colour, their colour, player colour |
| **Countdown** | The 3 seconds before round 1, which tell each player their colour (R97) | get ready (only the countdown's own words) |
| **Missed round** | A player made no choice before the timer ran out | skip, pass |
| **Resolve** | The server turning both choices into the next board | |
| **Game code** | The 6-character code that joins a shared game | room code, PIN |
| **Quick match** | The random lobby that pairs you with whoever is waiting | random lobby, matchmaking |
| **Guest** | A player with a nickname and no password | anonymous user |
| **Account** | A player who signed up with a username and password | profile |
| **Computer** | The built-in opponent | AI, bot, CPU |
| **Forfeit** | A game ended because a player left and did not return | abandon (see below) |
| **Abandoned** | A game ended because both players missed 3 rounds in a row | |
| **Rematch** | A new game with the same people on the same link, started when both tap Play again | play again as a new link, replay |
| **Leave game** | Ending a game on purpose, which counts as a forfeit | quit, resign |

Player A and Player B are code-only names (the two seats). On screen, a player is "You" or the opponent's nickname, and their colour is Red or Yellow (R93).
