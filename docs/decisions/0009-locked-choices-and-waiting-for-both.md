# 0009. Locked choices, a 10 second round and no round until both players are present

- **Status:** Accepted
- **Decided by:** Tejas (fix list of 27 October 2026); the details below were chosen from docs/rules.md and docs/design/

## Context

Playtesting the first navy toy build showed four problems. A friend game started its timer when the first player joined, so a player waiting alone for a friend missed rounds and could be abandoned. A choice could be changed until the round resolved, which made the simultaneous guess weaker (a player could switch after a hint such as the opponent's Ready). The 15 second round felt slow. The 3, 2, 1 countdown added delay to every round.

## Decisions

1. **R51: a game starts only when both players are present.** No timer, no missed rounds and no abandonment while one seat is empty. Abandonment counts only rounds where both players were connected.
2. **R4 replaced: a choice is final.** The server rejects a second choice with `already_chosen`. This strengthens promise 1 (reading your opponent). The cost is that a stray tap cannot be undone, so the ghost disc locks in with a short lift as clear feedback (U12, U13).
3. **R18 and D2: the round timer is 10 seconds.** The round still resolves the moment both players have chosen.
4. **U19: no countdown in any round.** Both discs drop as soon as the round resolves, which also helps promise 2. A short "Get ready" appears once when a game first starts.
5. **R52: the computer waits a random 1 to 3 seconds before choosing**, drawn from its own random numbers, so its Ready status carries meaning without ever depending on the human's choice (R40).

## Decisions made while Tejas was away

- `already_chosen` is not an engine reason (R3 stays as it is): the server checks it before calling `validateChoice`, so the engine contract is unchanged.
- A restored game (after a restart) starts its timer only when both players are connected again.
- A computer game starts its timer when the human joins.

## Evidence

Server tests named for R4, R18, R51 and R52 in `spec/`.
