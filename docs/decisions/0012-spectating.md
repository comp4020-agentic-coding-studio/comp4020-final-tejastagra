# 0012. Spectating: anyone can watch a live game

- **Status:** Accepted, amended on 28 October 2026 (see "Amendment": computer games and the exhibition game are removed, and link games are watchable through their link). Supersedes D3 in `docs/rules.md` ("no spectating"), which is now marked superseded there.
- **Decided by:** Tejas (requests of 27 and 28 October 2026); the details below were chosen from docs/rules.md and docs/design/

## Amendment of 28 October 2026

**This section replaces the parts of the decision below that it contradicts, which are kept as history.** The first version followed an older instruction. Tejas's decisions are:

- **A game against the computer can never be watched, by anyone.** There is nothing to watch: one person playing a program. The **exhibition game of two computers is removed entirely**, with its exception to R25 (the only place a round was not saved before it was sent).
- **Link games (Play a friend) are watchable, but only through their link or code.** The person who creates the game is player 1. The first person to open the link or enter the code is player 2. **Everyone after that is a spectator**, up to 50. If two people arrive at the same moment, the first request the server handles takes the seat and the other becomes a spectator. A spectator can never take a player's seat, **including during the 30 second reconnection window**. A link game never appears in Watch live, is never counted, and a code that is not a live game, or that is a quick match game, is answered like a code that does not exist.
- **Watch live shows random quick match games only.** If none is live it says "No live games right now" and offers Quick match and Home. The live count counts quick match games only.
- **R36 is replaced:** it no longer says a third visitor sees "game full". A third visitor to a link game watches it.

What this costs, and what follows from it:

- **A quick match game is watchable by anyone through Watch live, and also by its code,** which nobody is shown. That is the same exposure as before, and the players see the count.
- **A link game's code is now a way to watch as well as to play,** so whoever is given the link can see the game. The share screen says so in words ("Send this link. The first person to open it plays you, and anyone after that watches."), and a visitor who becomes a spectator is told why ("This game already has two players, so you're watching."). A friend game that wants to stay private should not have its link posted publicly.
- **Seats belong to people, not to the order connections arrive in after the first two.** Seat A is reserved for the creator and seat B for the first person to arrive. The server remembers who they are (the player id from the session cookie, saved with the game) so a restart does not hand a seat to a spectator, and a seat whose holder has dropped stays theirs until the 30 second grace period ends (R27).
- **Load:** link games add spectators to the same caps as before (50 a game, 300 on the machine). The exhibition game's timer and memory are gone, which makes the machine's worst case smaller than before.
- **Players of a link game see "N watching" like players of a quick match game** (U84), and a friend game that has spectators is no longer "private" in the sense of R71's first version.

## Context

D3 said there is no spectating, and a third visitor to a game sees "game full" (R36). The course brief asks the opposite of that for the showcase: "Design for co-presence: the app should be more interesting because other people are using it at the same time. The capstone showcase, a room full of people using it at once, is the situation to design for." A two-player game with no audience is exactly the case where a room full of people cannot take part: everyone who is not in a pair is left looking at a home screen. Spectating lets everyone in the room take part, and it makes the app more interesting when other people are using it, which is what the brief asks for.

It also touches promises 2 and 3. A spectator must see the same result at the same moment as the players (promise 2), and nobody, a spectator included, may see a choice early (promise 3, R21, R22).

## Options

1. **Keep D3: no spectating.** Simplest, and no new load. It leaves the showcase room with nothing to do between games.
2. **Spectate any game with a link.** A friend game's code would then be a way in for anyone who learns it. Friend games are private by design (R34): the code is how you choose who plays.
3. **Spectate only public games, picked for you.** Quick match games and games against the computer can be watched. A friend game never can. The spectator presses one button and is placed in a random live game.

## Decision

Option 3, under these rules (R70 to R80 in `docs/rules.md`, U76 to U84 in `docs/design/spectating.md`, logging in `docs/logging.md`):

- Anyone can choose "Watch a live game" and is placed in a random live game. Only quick match games and games against the computer can be watched. A friend game is never watchable and never listed.
- A spectator receives exactly what the players see after each round resolves, and nothing before. No message to a spectator ever contains a pending column, shield, Earthquake or other choice. This extends R21, R22 and R24.
- A spectator cannot act. The server rejects any choice or other game action from a spectator with the reason `spectator`.
- Players and spectators both see how many people are watching.
- When a watched game ends, the spectator sees the result, then after 5 seconds is moved to another random live game.
- At most 50 spectators per game. A full game is skipped when choosing a random game.
- If no watchable game is live, the spectator watches an exhibition game between two computers, started on demand. It never affects the leaderboard, and it stops when nobody is watching.
- Spectators never affect the leaderboard, round timers or abandonment.

## Decisions made while Tejas was away

- **A spectator is not a seat.** Spectators are kept apart from the two seats in the server: they never get a seat token, never count for "both players present" (R51), never reset an idle count (R19), never delay or trigger a forfeit (R27) and never change a round timer. A game with spectators and no players still follows exactly the rules it followed before.
- **The spectator's messages are built from public state only.** A snapshot for a spectator has the board, the round, which shields and Earthquakes are spent, both players' public names, the watcher count and the game's kind, and never `opponentReady` or anything about a pending choice. There is no `opponent_ready` message for spectators at all: it would tell them who has chosen before the round resolves, which is information the players are given about the other player but a spectator has no reason to get. This is also why there is nothing for the timing of a message to leak.
- **Which games are watchable is stored.** Quick match and computer games are marked `watchable` when they are made, and the mark is saved with the game (a numbered migration, 14), so a restart does not turn a watchable game into a private one or the other way round. Friend games are never marked.
- **A game is "live" when it is watchable, still playing and both seats are present** (for a computer game, the human is present). A game that is still waiting for its second player, or that has ended, is not live and is not offered.
- **The random choice is by the server.** The browser asks the server for a game and is told one; it never learns which games exist beyond the count. The count of live games shown on the home screen is a number only.
- **The 5 second move on is done by the server's message and the browser's timer.** The server sends the result like to anyone; the spectator's browser waits 5 seconds, then asks for another game. The server does not push a spectator out of a game, so a spectator who is slow or offline is not surprised by a move. The server treats the next request as a new join.
- **The exhibition game is a computer game with a computer in both seats.** It uses the existing computer player with separate seeds, is never marked watchable in the database or counted in the home count (it exists only while someone watches it), has no seat for a person, is never written to the leaderboard (R37) and is stopped and forgotten when the last spectator leaves. A new exhibition game starts the next time one is needed.
- **Logging.** `spectate_join`, `spectate_leave` and `spectate_move` events are logged with the game code and the number of spectators, and never a choice.

## What it costs

- **Load on one 256 MB machine.** Each spectator is one WebSocket and a small record, and each round sends each spectator one snapshot of about 1 KB. With 50 spectators in each of a handful of live games that is a few hundred sockets and a few hundred kilobytes per round across the whole machine, which a 256 MB Node process holds easily (a socket is on the order of tens of kilobytes). The limits that keep it that way are the 50 per game cap, a cap of **300 spectators on the whole machine** (a new spectator past it is told the room is full and offered the home screen), a rate limit on joining and on the live count (keyed on `Fly-Client-IP`, like every other endpoint, CLAUDE.md), and the exhibition game only existing while someone watches. Nothing a spectator does is kept in the database.
- **Every broadcast sends more.** The same snapshot is built once per round and sent to each socket, so the work per round grows with the audience. A game with 50 spectators sends 52 messages where it sent 2. The result still goes out after it is saved (R25) and to the players first, so an audience cannot delay the players' result, and a spectator's slow connection cannot hold up a player's (a send does not wait).
- **A bigger public surface.** `/api/live` and the spectator join are new endpoints that need rate limits and expiry, and anything a spectator can learn is public by definition. The no-peek tests have to cover them.
- **The leaderboard is unchanged by design.** Spectators and exhibition games never touch it.
- **Spectating shows other people's games to strangers**, including their names (nickname and tag, or username). They are already shown on the leaderboard, so this adds no new kind of exposure, but a player in a quick match game is now watched without asking. The home screen and the game screen both say so ("2 watching").
- **If playtests show it is used rarely, or the load is a problem,** lower the caps (they are named constants), or make a game opt in.

## Evidence

Server tests for no pending choice reaching a spectator, spectators being unable to act, friend games never being chosen, a mid-game snapshot matching the board, the watcher count, the 5 second move on, the 50 and 300 caps and the exhibition game; a real-time test that a spectator's result arrives within a second of the players'; browser checks at both viewports, in `docs/testing` and `spec/CHECKS.md`.
