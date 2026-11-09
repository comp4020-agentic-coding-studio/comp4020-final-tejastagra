# Rubble: A Connect 4 Adaptation

Rubble is an adaptation of Connect 4 that you can play in any browser. Both players pick a column at the same time and in secret, then both discs drop together, so every move is your best guess at what the other person will do. Play it at [comp4020-final-tejastagra.fly.dev](https://comp4020-final-tejastagra.fly.dev).

## Why I built this

I live about 10,000 km from the friends I grew up with. After school we moved to different parts of the world, and our monthly Zoom gaming sessions became harder to arrange because of the time difference. Now we barely play at all, so I wanted a game that takes only a few minutes, is easy to understand and mixes skill with some chance.

Roberts and Dunbar found that [friendships fade much faster than family ties when contact drops](https://doi.org/10.1016/j.evolhumbehav.2010.08.005), and that doing activities together helps stop this. Hall found that [even one short catch-up a day](https://news.ku.edu/2023/02/01/just-one-quality-conversation-friend-boosts-daily-well-being-0) makes people happier and [playing games together is now a common way](https://arxiv.org/abs/2505.09509) to keep in touch over long distances.

## How to play

You have 10 seconds to choose each round. If you both pick the same column, your discs crash and turn into grey rubble that neither of you can use. Each player also gets two power-ups per game:

- Shield is like insurance: if you both pick the same column, your disc lands and theirs is lost.
- Earthquake uses up your turn: the bottom row crumbles away and every disc drops down one row.

The board also shrinks: the top row closes after rounds 12 and 20, so games end sooner.

## Features

1. **Play with the computer:** It pauses to think like a person would and uses power-ups too.
2. **Play with your friends:** Share a link or code, or use Quick match to play a random person online.
3. **Leaderboard:** The top five players by wins and fewest rounds. Only games against people count.
4. **Spectating:** Watch a random live match, or join a multiplayer game as a spectator.
5. **Saving your progress:** Start as a guest, then create an account to save your progress across devices.

## What I did not build

Rubble was not my first idea. I started with a shared digital mural wall for ANU students, but Claude kept producing generic artwork that never matched what I had in my head. Then I considered a satirical parking space bidding system for ANU, since parking here is so expensive, but it would not have added real value.

In Rubble itself, I left out chat and reactions. They clutter the screen and I never use chat in online games. When I play with friends, we are on a call anyway. I also dropped turn-by-turn play, which most classic games use, to give Rubble its own twist. The power-ups came after I made this call.

## What's tested and what's judged

I wrote detailed notes for every part of the game and had Claude write tests from them, so most rules are enforced: your opponent's choice never reaches you or anyone watching before both discs drop, a choice cannot be changed, every move is saved before anyone sees it so a game survives a restart, and games against the computer never change the leaderboard. The engine's tests catch about 97% of deliberately planted bugs (mutation testing).

I judged the look myself: alignment, colours and layout. I also played it with friends at ANU and with my dad in India to check the delay. Some layout rules, like nothing overlapping, are also checked automatically.