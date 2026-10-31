# Rules

This is the single source of truth for how Rubble behaves. Code and tests follow it. To change behaviour, change this file first.

Every rule has an ID. Tests name the rule they protect (for example `R7 shield wins a crash`), and `spec/CHECKS.md` maps each rule to its checks.

## The game in one paragraph

Rubble is Connect 4 played at the same time. In each round both players secretly choose a column, and may also choose to use their one shield. When both have chosen, or the timer runs out, both discs drop together. If both chose the same column the discs crash and leave a grey rubble block that belongs to nobody, unless exactly one player used their shield, in which case that player's disc lands and the other is lost. Four of your own discs in a row wins. Each player also has one Earthquake per game: instead of a disc, they make the bottom row crumble and everything above drop one row (ADR 0010).

## Board and choices

- **R1** The board has 7 columns and 6 rows at the start, and it loses rows as rounds pass (R61, ADR 0011). It never loses columns. Discs and rubble blocks stack from the bottom of a column.
- **R2** A new game has an empty board with all 7 columns and 6 rows open (the open area, R64), round 0, both shields and both Earthquakes available, status `playing` and no winner.
- **R3** A choice is either a column (0 to 6) with a shield flag, or an Earthquake (R54). A column choice is rejected if the game is over, the column is not a whole number from 0 to 6, the column is full or the shield flag is set when that player's shield is already used. Rejections are checked in that order and give the reasons `game_over`, `bad_column`, `column_full` and `no_shield`. An Earthquake choice is checked as in R53 and R55. A column's fullness is checked on the board as it is before the round, even if an earthquake in the same round would free a space.
- **R4** A choice is final for its round. Once a player has chosen a column, with or without the shield, the server accepts no second choice from that player for the same round and answers it with the rejection reason `already_chosen`. This replaces the earlier rule that let a choice change until the round resolved (ADR 0009). `already_chosen` is a server-side rejection, not one of the engine's R3 reasons, and it says nothing about the opponent (R22).

## Resolving a round

- **R5** If the players chose different columns, both discs land.
- **R6** If they chose the same column and neither used a shield, the discs crash and exactly one rubble block lands in that column.
- **R7** If they chose the same column and exactly one used a shield, that player's disc lands, the other disc is lost and no rubble lands.
- **R8** Using a shield spends it, whether or not there was a crash.
- **R9** If they chose the same column and both used shields, both shields are spent and the discs crash as in R6.
- **R10** If only one player made a choice, only that disc lands (or only that earthquake happens). If neither did, the board does not change.
- **R11** Every resolved round adds 1 to the round count, including rounds where nothing lands.
- **R12** Pieces already on the board never move or change, except that an earthquake (R56) removes the bottom row and shifts every piece above down one row in its own column, and a ceiling drop (R61) removes every piece in the row it closes.

## Winning

- **R13** A player wins only when a disc they dropped this round is part of a line of four of their discs, horizontally, vertically or diagonally. Rubble blocks and the opponent's discs break a line. Lines formed only by pieces moving in an earthquake never win, but a disc dropped later can complete them (ADR 0010). A disc that lands because of a shield win counts as dropped.
- **R14** If a disc dropped by each player this round completes a line for that player, the game is a draw.
- **R15** If the open area is full (R66) and nobody has a line, the game is a draw.
- **R16** Once a game is won or drawn, no further choices are accepted.
- **R17** "Rounds to win" is the round count at the moment of the win. Earthquake rounds count like any other round.

## Timing

- **R18** Each round has a 10 second timer that starts when the round begins (D2, ADR 0009). The round resolves as soon as both players have chosen, or when the timer ends.
- **R19** If both players miss 3 rounds in a row (counting only rounds in which both players were connected, R51), the game is **abandoned**: no winner, and it never affects the leaderboard. The engine's `Status` stays `'playing' | 'won' | 'draw'`: the engine never produces an "abandoned" state itself, because nothing it sees (a round of null choices) distinguishes an abandoned game from an ordinary quiet one. The server tracks how a game ended (a line, a draw, a forfeit or abandonment) as server-side state alongside the engine's `GameState`, and the leaderboard reads that server-side record, not the engine's `status` field. Implementation notes: in a game against the computer the computer always chooses, so there it is the human missing 3 rounds in a row that abandons the game, otherwise an unattended game would play on for ever. The count of idle rounds is kept in memory, so a restart gives a game a fresh count (players get more time, never less). If saving the abandonment fails, the game stays live and tries again after its next round.
- **R51** A game starts only when both players are present. In a friend game or Quick match, no round timer runs and no round can be missed until the second player has joined; waiting alone never starts a round, misses one or abandons the game. A computer game starts when the human joins. If a game is restored after a restart, its timer starts when both players are connected again. Abandonment (R19) counts only rounds in which both players were connected at the moment the round resolved (ADR 0009).

## Power-ups: Earthquake

- **R53** Each player has one Earthquake per game, as well as the shield. A player may use at most one power-up per round, so the shield and Earthquake cannot be combined. An Earthquake choice is rejected with `no_earthquake` if that player's Earthquake is already used, and with `one_power_up` if it also names a column or a shield.
- **R54** Using Earthquake replaces the player's disc for that round: they choose "Earthquake" instead of a column. The choice is final (R4) and hidden until the round resolves, exactly like a column choice (R21, R22).
- **R55** Earthquake cannot be chosen when the bottom row is empty. `validateChoice` rejects it with the reason `nothing_to_shake`. Rejections are checked in this order: `game_over`, `one_power_up`, `no_earthquake`, `nothing_to_shake`.
- **R56** Resolution order: the earthquake happens first. Every piece in the bottom row, discs and rubble alike, is removed, and every piece above drops down exactly one row in its own column, keeping its order. Then the other player's disc, if any, drops onto the new board.
- **R57** If both players choose Earthquake in the same round, the board shakes once (one row removed), both Earthquakes are spent and no discs drop.
- **R58** Earthquake is not a crash, so the shield has no effect on it. A shield flag next to an Earthquake is rejected (R53), and the other player's shield is spent only if they used it on their own column.
- **R59** Earthquake never affects the leaderboard rules (R37 to R39). "Rounds to win" still counts rounds (R17).
- **R60** The computer may use Earthquake when removing the bottom row breaks more of the human's potential lines than its own. It still never sees the human's choice (R40).

## The shrinking board

The schedule depends on the round count alone (R11), so the engine needs no clock. "After round n" means once the n-th round has resolved. The numbers are named constants in the engine, first guesses that playtests may tune (ADR 0011); to change one, change this file first. The first version also closed the outer columns (the walls); playtesting found that too complicated and it was removed (ADR 0011, "Playtest finding"). R62 and R63 are retired and their numbers are not reused.

- **R61** The ceiling drops after round 12 and every 8 rounds after that (rounds 12, 20, 28 and so on), and never goes below 4 rows. When it drops, the top row of the open area closes and any piece in it crumbles away. Starting from 6 rows, it therefore drops after round 12 (to 5 rows) and after round 20 (to 4 rows), and round 28 changes nothing. Constants: `CEILING_FIRST_ROUND = 12`, `CEILING_EVERY = 8`, `MIN_ROWS = 4`.
- **R62** *Retired.* The walls no longer collapse: all 7 columns stay open for the whole game.
- **R63** *Retired.* There is only a ceiling, so nothing happens in a set order.
- **R64** The **open area** is the rows below the current number of rows, in all 7 columns. A column is full when its pieces reach the current number of rows. Fullness is checked on the board as it is before the round, so a ceiling drop after a round never changes what that round accepted.
- **R69** A game's rows are set to the schedule's number for its round count each time a round resolves. A game saved before the shrinking board has the full 6 rows whatever its round count, so it takes the rows for its round count at its next resolved round, and every piece above the new ceiling crumbles away at once. `ceilingDue` is true for exactly what the next round will close.
- **R65** A ceiling drop happens after the round's discs have dropped and the round's result has been decided (R13 to R15). A ceiling drop can never create a win: under R13 a win needs a disc dropped this round, and lines broken by a drop are simply broken. A game that ended in this round does not drop, so the winning line stays on the board. A drop never affects the leaderboard rules (R37 to R39), and rounds to win still counts rounds (R17).
- **R66** If the open area is full (every column holds as many pieces as there are rows) and nobody has won, the game is a draw (R15). This is checked after the round's discs have dropped and again after a ceiling drop, because a drop can leave the remaining area full.
- **R67** An Earthquake on a shrunken board removes the bottom row and shifts every column down one (R56). The earthquake happens first, then the discs drop, then any ceiling drop applies to the board as it then stands.
- **R68** The computer chooses only columns that are not full, and it knows the schedule, like a human who can see the warning (docs/design/shrinking-board.md U68): when it has no winning or blocking move it avoids dropping a disc into a square that is about to close. It still never sees the human's choice (R40).

## Server, real time and persistence

- **R20** The server holds the only true copy of every game. The browser only sends choices and displays what the server sends.
- **R21** While a round is open, each player is told only whether the opponent has chosen yet, never what they chose. A spectator is told neither (R72).
- **R22** No message to a player may contain the opponent's column or shield flag for the current round until it resolves, and no message to a spectator (R72) may contain either player's column, shield flag or Earthquake choice for the current round until it resolves. This includes error messages, logs sent to the browser and timing differences in message size.
- **R23** A round's result is sent to both players at the same time and should appear on both screens within 1 second. Spectators get the same result and it should appear on their screens within 1 second as well (R79).
- **R24** When a player connects or reconnects to a game, they receive a full snapshot of the game, without the opponent's pending choice. A spectator's snapshot is described in R73.
- **R25** Every change to a game is saved to the database before it is broadcast.
- **R26** After a restart or redeploy, every game in progress continues from its last saved round. The timer for the open round restarts at 10 seconds, once both players are back (R51).
- **R27** If a player disconnects, the game waits 30 seconds for them. If they return, play continues. If not, the game ends as a **forfeit** and the other player wins. As with R19's abandonment, "forfeit" is not a value the engine's `Status` ever takes: the engine only knows `'playing' | 'won' | 'draw'`. A forfeit is server-side state (who forfeited, who wins) recorded next to the engine's `GameState`, not a new engine outcome, so a forfeited game's `GameState.status` stays `'playing'` even though the server has ended the game and the leaderboard now has a result to show.
- **R81** A player can leave a game on purpose, with `{ type: "leave_game", code, player, seatToken }`. If the game is being played (both seats taken, not over) the game ends at once as a **forfeit** (R27) with the other player as the winner: it is saved first (R25), then the other player is told with `game_over` and spectators with `ended`, exactly as for a forfeit by timeout, and it counts for the leaderboard in the same way (R38). If the game has not started because nobody else has joined, or it is a game against the computer, it ends as **abandoned** (R19: no winner, never on the leaderboard) and nobody is told; nothing is deleted. A message from anything but the seat's own token is ignored (R32). A game that is already over is left as it is. The leaver is not told anything: their screen goes Home.
- **R93** **The server decides each player's colour.** When a game is made, the server decides at random which seat is **red** (the **ring** marker) and which is **yellow** (the **cross** marker), and saves it with the game, so a restart or redeploy keeps it (promise 5). A colour belongs to a seat for the whole game. In a game against the computer the colour is decided at random too (ADR 0014).
- **R94** **Every screen shows each player in their own colour and marker**: both players' screens and every spectator's screen draw the same seat's discs, panel and ghost disc in the same colour with the same marker (docs/design/qa-checklist.md Q14). The colours are sent in every snapshot as `colours: { A: "red" | "yellow", B: "red" | "yellow" }` and in every `spectating` message. A colour is public, not a choice, so it may be sent at any time (R22).
- **R95** A game saved before colours existed is given seat A red and seat B yellow (migrations 19 and 20: the column, then the default for old rows).
- **R96** **A rematch swaps the colours** (R84): the seat that was red is yellow in the new game, and the other way round. Rematches are otherwise new games (R85). Players learn the new colours from the fresh snapshot; spectators are sent them in the `rematch_started` message, `{ type: "rematch_started", colours }` (R85), since their next message is a `round` that carries no colours.
- **R97** **Every game starts with a 3 second countdown** (replacing the short "Get ready" of U19 and U55). It starts as soon as both players are present (R51): when the second player joins, when the human joins a computer game, when a rematch starts (R85), and when both are back in a restored game that has not resolved round 1. The server sends each player `{ type: "countdown", ms: 3000 }`, and their screen says **"You are Red"** or **"You are Yellow"** with that disc and its marker shown large, and counts down. **Round 1 and its timer start only when the countdown ends**, and the server then sends each player `{ type: "started" }`; the computer starts thinking then too. A player who connects during the countdown is sent the snapshot and then `{ type: "countdown", ms }` with the time left; every snapshot says `started: true` once round 1 has opened (or the game is past it), so a reload knows whether to show the countdown. If a player leaves during the countdown and is not back when it ends, round 1 does not open, and the countdown runs again when both are present (R51). A choice sent during the countdown is refused with the reason `not_started`, which says nothing about the opponent (R22). The countdown is not a round: nothing can be missed or counted towards abandonment during it (R19). Under reduced motion it shows the same words without animation and still lasts 3 seconds. Spectators are not sent it.
- **R82** **Play again** after a game has ended starts a new game with the same people, called a **rematch**. Against the computer it starts a new computer game at once. Against a person it starts only when **both** players have asked: the first to ask is shown "Waiting for <opponent>" and the other is shown "<opponent> wants a rematch". A rematch is asked for with `{ type: "rematch", code, player, seatToken }` and offered to the other player with `{ type: "rematch_offer", from: "opponent" }`; both are sent only about a game that is over (R25: it was saved), and a request about a game that is still being played is ignored.
- **R83** A rematch offer **expires after 30 seconds**, and it is withdrawn at once if either player leaves (taps Home, `leave_game`, or closes the page and does not return within the 30 seconds of R27). The player who is still there is told `{ type: "rematch_ended", reason: "left" }` or `{ type: "rematch_ended", reason: "expired" }` and sees "<opponent> left" with Home. A player who is away from a finished game for the 30 seconds of R27 is treated the same way: the one still there is told `rematch_ended` with reason `left` (never a `game_over`, because the game already ended). A player who asks twice changes nothing. Nobody is ever started into a rematch they did not ask for.
- **R84** A rematch keeps the **same link, the same code and the same two players in the same seats**, and any spectators stay (R36): the link game's creator is still player 1, and a quick match game's spectators keep watching the new game. The server archives the finished game under the code `<code>#<n>` (n counts from 1) and the new game takes `<code>`, so the finished game keeps its own saved record. **Each rematch is a separate game** for the leaderboard (R38), match history and stats (R90, R91): it is recorded in its own row, with its own rounds and result, and the first game's result is never changed by it. The new game starts like any new game (R51): round 1 when both are present, a fresh shield, Earthquake and ceiling. The archive is saved before the new game is created, and both before anyone is told (R25).
- **R85** After a rematch starts, every player is sent a `{ type: "rematch_started" }` and every spectator a `{ type: "rematch_started", colours }` (the new game's colours, R96), followed by the usual fresh snapshot (or `spectating` message), so screens clear their old board and result. A game against the computer starts a new computer game under the same code (R37 still holds: it never changes the leaderboard).
- **R90** **Match history and stats are kept for each player** and shown on the account page (R91). A game is in a player's history when they sat in a seat (R28). A player's stats are counted from the saved games, so they survive sessions, restarts and redeploys (promise 5): games played, wins, losses, draws and win rate, each split into **against people** and **against the computer**. A game counts as *finished* when it ended by a line, a draw or a forfeit (R27); an **abandoned** game (R19) appears in the history as abandoned and is **not** counted in games played, wins, losses, draws or win rate. A forfeit counts as a win for the other player and a loss for the one who left, as for the leaderboard (R38). **Win rate is wins divided by finished games**, shown as a whole percentage, and "No games yet" when there are none. Rematches (R84) are separate games. Games against the computer count in the stats but never on the leaderboard (R37).
- **R98** **A game that never started is never recorded** (29 October 2026): a game with **0 rounds played**, for example a friend game cancelled before anyone joined, or abandoned or forfeited before round 1 resolved, is **never** shown in any player's history and **never** counted in their stats (R90). It still exists in the database while it is waiting or being played (R25, R26), because players must be able to join it. Migration 21 deletes the rows of such games that are already over (ended, abandoned or forfeited with 0 rounds), and their rematch archives; a game with 0 rounds that is still waiting is kept, so a restart can still resume it (R26). Tejas asked for this deletion in the fix list of 29 October 2026 (ADR 0015).
- **R91** The account page shows the history below the card: the last **20 games, newest first**, each with the opponent (their nickname and tag or their username, exactly as they appear elsewhere (R31), or "Computer"; a seat whose person is not known, such as a visitor with no session, is "A guest"), the result (Won, Lost, Draw, Forfeit won, Forfeit lost or Abandoned), the number of rounds and how long ago it ended. A game still being played is not shown. The stats and history are read with `GET /api/me/history`, for the signed-in or guest player only, never for anyone else, and contain no seat token, no other player's id and nothing about a choice (R22).

## Identity

- **R28** A visitor becomes a **guest** by choosing a nickname of 2 to 16 letters, numbers, spaces, hyphens or underscores. No password is needed. The browser keeps a long-lived, httpOnly cookie so the guest is still themselves next time. Implementation note: a first-time visitor who has not chosen a nickname is given a generated one, such as "Brave Wombat" (docs/design/home.md U32), so they can play at once and change it whenever they like.
- **R29** A guest may sign up for an **account** with a unique username and a password of at least 8 characters. Signing up keeps their past games and wins. **Signing in** to an existing account from a device that has a guest history moves that guest's games, wins and history into the account, so nothing the guest did is lost (R89).
- **R30** Passwords are stored only as a slow, salted hash (argon2id or bcrypt). **A password is at least 8 characters** (R29) and never appears in plain text in the database, a response or a log; neither does its hash, nor a session cookie or token.
- **R31** Guests' nicknames need not be unique. Wherever a guest is shown, a short tag from their ID is shown too (for example `Tejas #a7f3`). The tag is the first 4 hex digits of the guest's id and is the only part of it ever shown, including on the leaderboard.
- **R86** **A forgotten password is reset by the admin** (ADR 0013). The sign-in popup has a "Forgot your password?" link that opens a popup saying "Email game@tejastagra.com with your username and we'll reset it for you." The app sends no email and stores none. The admin runs `scripts/admin-reset-password.ts <username>` on the server, which sets a random **temporary password of 12 characters** from an alphabet without look-alike characters, stores only its hash, marks the account **must change password**, prints the temporary password **once** to the admin's terminal, and logs `admin_reset` with the username only. A username that does not exist is reported to the admin and changes nothing.
- **R87** An account marked must change password can sign in with the temporary password, and the server answers with `{ player, mustChange: true }`. While the mark stands, every request that is not the password change or sign-out is refused for that session with `403` and the words "Choose a new password first.", and the page shows a popup that cannot be closed until the password is changed. Changing it replaces the hash, clears the mark and ends every other session of that account, so **the temporary password stops working the moment it has been used to set a new one**. Ending a session also **ends that session's open game connections at their next action**: before a choice, a rematch request or a leave is acted on, the server checks the connection's session still exists, and closes the connection if it does not (a reset is run by the admin in another process, so there is no event to react to, and this check is what reaches a connection that is already open). A stolen cookie with an open socket therefore cannot keep playing after a reset or a password change, and the device that changed the password goes on, because its own session stands. The seat itself stays the account's, and the real owner takes it back with their seat token or by signing in, and the old password stopped working when the reset happened. The forced change is made with `{ next }` alone: the session already proved the temporary password at sign-in, so the page never holds it, and a reload can show the popup again (`GET /api/me` says `mustChange: true`). A signed-in player can also change their password from the account page with `{ current, next }`: the current password must be right, the new one must be at least 8 characters, and it is refused otherwise with a message that does not say which part was wrong beyond "That password is not right." for the current one.
- **R88** **Sign-in attempts are limited:** after **5 failed sign-ins for one username in 15 minutes** the server answers `429` with "Too many attempts. Try again in a few minutes." for that username, whatever the password, until the 15 minutes since the first of those failures have passed. The count is per username (so one address cannot lock out everyone, and one username cannot be guessed at from many addresses), is kept in memory with an expiry, and does not grow without bound. A successful sign-in clears the count. A username that does not exist is counted the same way and answered the same way, so usernames cannot be probed (R30). **A blocked username is never forgotten early:** the server tracks at most 10,000 usernames, and when it is full it drops one that is not blocked, never a blocked one, so flooding it with made-up names cannot unblock a victim; if every tracked name is blocked, a new name is not tracked at all.
- **R89** Signing in to an account moves the guest history of the device into it: if the browser has a guest session when it signs in, every game of that guest player (as either seat) is given to the account, and the guest player is then removed. Games already recorded for the account are unaffected. A seat the guest holds in a **live** game goes to the account at the same moment, in the server's memory as well as the database (so the same person keeps playing without a break); the guest's old connection keeps working with its seat token. The leaderboard and the match history then show the account's name for those games (R90, R91).
- **R32** One player has one live connection per game. Opening the same game in a second tab moves the connection there, and the first tab says so.

## Playing modes

- **R33** **Play the computer** starts a game immediately. It never waits for anyone.
- **R34** **Play a friend** creates a game with a 6-character game code from the letters `ABCDEFGHJKMNPQRSTUVWXYZ23456789` and a link `/g/<code>`. The person who creates the game is player 1, and the first other person to open the link or enter the code is player 2 (R36). The game starts when player 2 has joined. The share screen says: "Send this link. The first person to open it plays you, and anyone after that watches." Implementation note: the server limits how many games one address may create (30 per minute), so the endpoint cannot be used to fill memory and disk; the first round's timer starts when the first player joins.
- **R35** **Quick match** pairs a waiting player with the next player to arrive. Two players are never paired into more than one game, even if they arrive at the same moment. If nobody arrives within 20 seconds, the player is offered the computer and may keep waiting.
- **R36** *Replaced on 28 October 2026 (ADR 0012).* A game has two players and any number of spectators up to 50 (R77). In a link game the **creator is player 1** (seat A), the **first other person to open the link or enter the code is player 2** (seat B) and **everyone after that is a spectator**: a visitor to a link game with both seats taken sees "This game already has two players, so you're watching." and watches. If two people arrive at the same moment for the last seat, the first request the server handles takes the seat and the other becomes a spectator. A spectator can never take a player's seat, **including during the 30 second reconnection window** (R27): a seat whose player has dropped stays theirs, and is given back only to them. A seat is held by a person, kept with the game (the player id from the session cookie, or the seat token for a visitor with no session), so a restart does not give it to a spectator. In a quick match game both seats are taken by the pair (R35) and everyone else watches only through Watch live (R70) or the game's code. A visitor who opens the link of a link game that has already ended is shown its result, and no seat (an ended game can no longer be joined). Only a visitor who asks for no seat is made a spectator: someone who names a seat they cannot prove is theirs (no token, and not the person it belongs to) is refused with "game full" and told nothing about the game (R32), because the page never names a seat for a new arrival. A game against the computer has one seat and no spectators (R71).

## Spectating

A **spectator** is a person watching a live game without playing in it (ADR 0012, which supersedes D3). A spectator is not a seat: it has no seat token, and it never counts as a player.

- **R70** Anyone can choose "Watch live" and is placed in a random **quick match** game that is live. A game is **live** when it is a quick match game, still being played and both players are present. A game that is waiting for its second player, or that has ended, is not live and is not offered. If no quick match game is live, the spectator sees "No live games right now" and is offered Quick match and Home (nothing is made up for them to watch). A link game can also be watched, but only through its link or code (R36), never through Watch live.
- **R71** **A game against the computer can never be watched, by anyone.** Quick match games can be watched through Watch live and by their code. Link games (R34) can be watched only through their link or code, and are never listed in Watch live or counted. A code that does not exist, a game that is not live and a game against the computer are all answered exactly alike ("unknown"), so a computer game's existence is never revealed. The kind of a game is decided when it is made and is saved with it, so a restart does not change it.
- **R72** A spectator receives exactly what the players see after each round resolves, and nothing before. No message to a spectator ever contains a pending column, shield, Earthquake or other choice, nor whether either player has chosen yet (this extends R21 and R22). A spectator is never sent `opponent_ready`.
- **R73** A spectator who joins mid-game receives a full snapshot of the game, without any pending choice, and the board in it is the board the players have (this extends R24).
- **R74** A spectator cannot act. The server rejects any choice or other game action from a spectator with the reason `spectator`, and tells nobody else.
- **R75** Players and spectators both see how many people are watching. The count is a number only, never who is watching. It changes as spectators join and leave.
- **R76** When a watched game ends, the spectator sees the result, then after 5 seconds is moved to another random live game (R70). The browser does the waiting and then asks the server for a game, so the server never pushes a spectator out of a game. The game the spectator just watched is not chosen again while another live game exists.
- **R77** At most 50 spectators can watch one game, and at most 300 can watch on the whole machine (one 256 MB machine, ADR 0012). A game that is full is skipped when choosing a random game, and a link game that is full tells a new arrival "This game is full of spectators." A spectator who would exceed the machine limit is told the room is full. Watching and the live count are rate limited per client address (`Fly-Client-IP`).
- **R78** *Removed on 28 October 2026 (ADR 0012).* There is no exhibition game: Watch live shows real quick match games only, and says so when there are none (R70). The exception to R25 that the exhibition game needed is gone, so **every round is saved before it is sent, with no exception** (R25).
- **R79** Spectators never affect the leaderboard, round timers, abandonment (R19), presence (R51) or forfeits (R27). A game with spectators and a game without them behave identically for its players, and the players' result is sent first.
- **R80** The home screen shows how many quick match games are live. It is a number only, and counts only live quick match games: never link games and never games against the computer. Under Quick match a count of people playing now is shown the same way (U91).

**Spectator messages** (the WebSocket at `/ws`, as for players):

- A spectator joins with `{ type: "spectate", code? }`. With no `code` the server picks a random live quick match game (R70, R76) or answers `none_live` (R70); with a `code` it joins that game only if it is a quick match game or a link game and is not full. A visitor who opens a link game's page with both seats taken is made a spectator of it by the server (R36) and is told `{ type: "spectating", ... , because: "two_players" }`. It is answered with `{ type: "spectating", code, kind: "quick" | "link", state, watching, names }`, where `state` is the public game state (R73), `watching` is the number of spectators (R75) and `names` is both players' public display names. It never contains `you`, a seat token, `opponentReady` or anything about a pending choice.
- Each resolved round is sent to every spectator as `{ type: "round", state, watching }` after it is saved (R25), and the players' result is sent first (R79). A change in the number watching is sent to players and spectators as `{ type: "watching", watching }`.
- When a game ends by a line or a draw the spectator is sent the final `round` message. When it ends by a forfeit (R27) or by abandonment (R19), which are server-side state and not an engine status, the spectator is sent `{ type: "ended", result: "forfeit", winner: "A" | "B" }` or `{ type: "ended", result: "abandoned" }`, after it is saved (R25). In every case the browser then moves on after 5 seconds (R76) by sending `{ type: "spectate" }` again.
- Anything a spectator sends other than `spectate` and `leave` is answered with `{ type: "rejected", reason: "spectator" }` to that spectator only (R74). A connection that holds a seat in a game is a player and not a spectator: a `spectate` from it is answered `{ type: "rejected", reason: "spectator" }` and changes nothing, so a player can never lose their seat's ability to play (R70).
- A client address (`Fly-Client-IP`, however many connections it opens and however it alternates `spectate` and `leave`) may ask to watch at most 10 times in 10 seconds (a game ending moves a spectator on only every 5 seconds, so this is generous); past that its `spectate` messages are ignored, so one spectator cannot make the server send a stream of count changes to players and other spectators (R77). A spectator that does not read its messages is closed once more than 256 KB are waiting to be sent to it, checked after every send to spectators (a round and the end of a game), so one slow connection cannot hold memory (R77).
- If the game cannot be watched, is full (R77) or does not exist, the answer is `{ type: "not_watchable", reason: "full" | "room_full" | "unknown" }`, and a computer game, a game that is not live and a code that does not exist are all answered `unknown` so a computer game's existence is not revealed (R71). Asking for a random game when none is live is answered `{ type: "none_live" }`.
- `GET /api/live` answers `{ live: number }` (R80), rate limited per client address.

## Tutorial

- **R47** *Changed 31 October 2026.* The tutorial opens **automatically the first time a person starts a game in their browser**, on a phone or a laptop, **but only** when they choose Play the computer, Play a friend (creating a code), Join with a code or open a friend's link to play. It **never opens just from opening the site, the home screen, any other page, Quick match's page or opening a link as a spectator**. Whether it has been seen is stored in that browser (local storage, so each new browser shows it once), as well as with the player (R48). It is shown **before the game begins**; when it is finished or skipped, the game the person chose starts. It stays replayable from How to play (R49), which never starts a game.
- **R48** Finishing or skipping the tutorial is saved with the player, so it does not return after a refresh, a new session, a restart or a redeploy.
- **R49** The tutorial can be skipped at any step and replayed at any time from "How to play".
- **R50** Tutorial games never change the leaderboard.

## Leaderboard

- **R37** Games against the computer never change the leaderboard.
- **R38** **Most wins** counts wins against another person, including forfeits, except a forfeit in a game where no round was played (R98).
- **R39** **Fewest rounds to win** counts only wins by four in a row against another person who made a choice in every round of that game, so a friend cannot hand you a fast win by sitting still.
- **R92** `GET /api/leaderboard` answers the two lists as before and also says who is asking: `{ wins, rounds, you }`, where `you` is `null` for a visitor with no player, and otherwise `{ name, wins, bestRounds }` for the asking player alone: their public name (R31), their number of wins (0 if none) and their fewest rounds to win (`null` if none). It is worked out from the session cookie and carries nothing about any other player beyond what the lists already show, and no id. The browser highlights the asking player's row in either list by comparing names, and shows "Your best:" under each list from `you`; a name is public and may be shared by two guests only if their tags differ (R31), so the comparison is by the whole name and tag.
- **R99** *Added 31 October 2026.* The leaderboard page shows **at most 10 players** per list. The **podium holds exactly the top 3** (or fewer when there are fewer players) and the **list below it starts at place 4** and ends at place 10 (design U131b). The page asks for 10; the endpoint's optional `limit` stays for checks.

## Computer player

- **R40** The computer chooses using only what a human opponent could see: the board, the round, both shields' status and whether the human has chosen yet. It never sees the human's choice.
- **R41** The computer never chooses a full column.
- **R42** If the computer has a column that wins immediately, it chooses it.
- **R43** If the human has a column that wins immediately, the computer chooses it to force a crash at least 70% of the time.
- **R44** Otherwise it prefers central columns, with some randomness so it cannot be predicted perfectly.
- **R45** It uses its shield when it has an immediate winning column that the human also needs, or else at a random point after round 6.
- **R46** It is beatable: a simple scripted strategy must beat it in at least 20% of 500 seeded games. Its randomness is seeded so tests are repeatable.
- **R52** The computer "thinks": it waits a random time between 1 and 3 seconds before it chooses, so its Ready status means something. The wait is drawn from the computer's own random numbers and never depends on what the human chose (R40).

## Engine contract

The engine lives in `src/engine/index.ts`. It is pure: no input or output, no clock, no randomness and it never changes its inputs.

```ts
export const COLUMNS = 7;
export const ROWS = 6;                     // the starting number of rows

// The shrinking schedule (R61). Tunable by playtests; change docs/rules.md first.
export const CEILING_FIRST_ROUND = 12;
export const CEILING_EVERY = 8;
export const MIN_ROWS = 4;

export type Player = 'A' | 'B';
export type Cell = Player | 'R';           // 'R' is a rubble block
export type Board = Cell[][];              // board[c] is column c, index 0 is the bottom
export type Choice =
  | { column: number; shield: boolean }    // a disc, with or without the shield (R3)
  | { earthquake: true };                  // Earthquake instead of a disc (R53 to R57)
export type Status = 'playing' | 'won' | 'draw';

export interface GameState {
  board: Board;
  round: number;                           // rounds resolved so far
  shieldsLeft: Record<Player, boolean>;
  earthquakesLeft: Record<Player, boolean>; // R53
  rows: number;                            // R61: the current number of rows (all 7 columns are always open)
  status: Status;
  winner: Player | null;
}

export type RoundOutcome =
  | 'both_landed'   // R5
  | 'crash'         // R6 and R9
  | 'shield_win'    // R7
  | 'one_landed'    // R10, one player chose a column
  | 'earthquake'    // R56 and R57, at least one earthquake; the other player's disc may also have landed
  | 'none';         // R10, nobody chose

export interface RoundResult {
  state: GameState;
  outcome: RoundOutcome;
  shieldWinner: Player | null;
  shaken: boolean;                         // R56: the bottom row was removed this round
  ceilingDropped: boolean;                 // R61: the ceiling dropped after this round
}

// The number of rows after a number of resolved rounds. Pure: a function of the round count.
export function rowsAt(round: number): number;
// Whether the ceiling will drop after the next round resolves, given the state the game is in now. The
// browser uses it only to show the warning (U68) and the computer to avoid squares about to close (R68).
export function ceilingDue(state: GameState): boolean;

export function newGame(): GameState;
export function validateChoice(
  state: GameState, player: Player, choice: Choice,
): { ok: true } | { ok: false; reason: 'game_over' | 'bad_column' | 'column_full' | 'no_shield'
             | 'one_power_up' | 'no_earthquake' | 'nothing_to_shake' };
export function resolveRound(
  state: GameState, choices: { A: Choice | null; B: Choice | null },
): RoundResult;  // throws if either choice fails validateChoice
```

## Open decisions (Tejas to confirm)

- **D1** Accepted (default, pending Tejas's review): yes, a draw is the right result when both players complete a line in the same round (R14).
- **D2** Accepted: 10 seconds is the round timer (R18), set by Tejas on 27 October 2026 (it was 15). Playtests should settle this.
- **D3** Superseded by ADR 0012 (27 October 2026, amended 28 October 2026): spectating is in scope (R70 to R80). A third visitor to a link game now watches it (R36); a game against the computer can never be watched (R71).
- **D4** Accepted (default, pending Tejas's review): yes, forfeits count towards most wins (R38).
- **D5** Accepted (default, pending Tejas's review): guests appear on the leaderboard with their short tag, the same as accounts.
