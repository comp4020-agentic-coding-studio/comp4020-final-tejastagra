# Logging

The server writes one line per event, as `key=value` pairs, so `mise exec -- flyctl logs` can be read and searched during multi-user tests. This follows the tutorial's multi-user testing protocol.

## Format

```
event=join user=a7f3e game=K7QX2M clients_in_game=2 machine=148e443b
```

- Always include `event`, `machine` (from the `FLY_MACHINE_ID` environment variable, or `local`) and, where there is one, `user` (first 5 characters of the player ID) and `game` (game code).
- Values with spaces are quoted: `reason="column full"`.
- Fly adds the timestamp, so do not add another.

## Events

The first six are the events the tutorial requires. The rest are specific to Rubble.

| Event | When | Extra fields |
| --- | --- | --- |
| `connect` | A browser opens a connection | `ua=phone\|desktop` |
| `join` | A player joins a game | `clients_in_game` `role=A\|B` |
| `leave` | A player leaves a game on purpose | `clients_in_game` |
| `disconnect` | A connection drops | `clients_in_game` `grace_s=30` |
| `action_received` | The server receives a choice or other action | `type` `round` |
| `broadcast` | The server sends an update to players | `type` `recipients` |
| `action_rejected` | The server refuses an action | `type` `reason` |
| `snapshot_sent` | The server sends one player the full game state | `round` `reason=join\|reconnect\|resync` |
| `round_resolved` | A round resolves | `round` `outcome` `ms_open` `ms_to_broadcast` |
| `game_over` | A game ends | `result=won\|draw\|forfeit\|abandoned` `rounds` `vs=human\|computer` |
| `reconnect` | A player returns within the grace period | `away_ms` |
| `forfeit` | A player did not return in time | |
| `quick_wait` | A player enters quick match | `queue_len` |
| `quick_paired` | Two players are paired | `wait_ms` |
| `computer_offered` | Quick match waited 20 seconds | |
| `tab_replaced` | A second tab took over a connection (R32) | |
| `server_start` | The server starts | `games_loaded` `db_path` |
| `persist_error` | A database write fails | `error` |

## Never log

Passwords, password hashes, cookies, session tokens or full player IDs.

`action_received` may log the column and shield flag, because server logs are only visible to Tejas. They must never be sent to the browser (R22).
