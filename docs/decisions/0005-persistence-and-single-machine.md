# 0005. Persistence and running on one machine

- **Status:** Proposed
- **Decided by:** Tejas

## Context

Promise 5 needs games, names and the leaderboard to survive restarts and redeploys. The marker returns the next day, after the machine has stopped and restarted. The course gives one machine and one volume, and deploys use `--ha=false` to keep it that way. The machine stops when nobody is using it (`auto_stop_machines = "stop"`) and starts on the next request.

## Options

1. **SQLite on the Fly volume, in WAL mode, with every change saved before it is broadcast (R25).** Simple and fast. Cost: a Fly volume attaches to one machine, so the app cannot run on two machines sharing data.
2. **An external hosted database.** Works across machines. Cost: outside the course setup and adds network delay to every round.

## Decision

Proposed: option 1, with the database file at `/data/rubble.db`, the only path that survives restarts and redeploys (`fly.toml`). Live game connections are held in memory on the single machine; the database is the record. CI runs the app with an empty `/data`, so every check must create its own data.

## What it costs

If Fly runs a second machine (tutorial scenario g, `fly scale count 2`), two players may land on different machines and not see each other, and the second machine has no volume. The multi-user test documents what actually happens. Options if it matters: route each game to its machine with Fly's `fly-replay` header, or keep the app to one machine and say so in the README.

## Evidence

To be added: persistence checks S1 to S3 and manual checks X1 and X2 (multi-user scenarios g and h).
