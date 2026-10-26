# Multi-user test plan (with Fly logs)

This follows the protocol from the tutorial whiteboard, "Multi-User Testing with Fly Logs". Results go in `docs/testing/multi-user-test-report.md`.

> Tejas: a few lines on the whiteboard photo were hard to read (step 3, and scenarios f, g and h). Check the wording below against your notes and fix anything I misread.

## Step 1. Make sure the system produces enough logs

The server must log at least these events, in the format in `docs/logging.md`:

- A user connects or joins a room (`connect`, `join`)
- A user disconnects or leaves a room (`disconnect`, `leave`)
- The server receives an action from a user (`action_received`)
- The server broadcasts an update (`broadcast`)
- The server rejects an action (`action_rejected`)
- The server sends the system's state snapshot to one user (`snapshot_sent`)

Example from the tutorial: `event=join user=a7f3e room=12 clients_in_room=2`. Rubble uses `game` and `clients_in_game` instead of `room` and `clients_in_room`.

## Step 2. Deploy the version with logs

Deploy, then open the site once and confirm a `server_start` line appears.

## Step 3. Capture the logs

```
mise exec -- flyctl logs
```

Keep it running in a terminal during the session. To save a copy for the report:

```
mise exec -- flyctl logs --no-tail > docs/testing/logs/<date>-session.log
```

## Step 4. Users join

At least two people on separate devices or separate browser profiles (an incognito window counts). Use one phone and one laptop where possible, to cover both marking viewports.

## Step 5. Scenarios to test

For each scenario: write down the expected behaviour before running it, run it, then record what the screens showed and which log lines prove it.

| ID | Scenario | Expected behaviour in Rubble | Log lines that should appear |
| --- | --- | --- | --- |
| a | Two users join | Player 1 creates a game and sees the code. Player 2 opens the link. Both see the board and round 1 starts. | `connect` x2, `join ... clients_in_game=1` then `clients_in_game=2`, `snapshot_sent` x2 |
| b | One user's action reaches the other | Player 1 chooses. Player 2 sees "Ready" within 1 second but not the column (R21, R22). | `action_received`, `broadcast type=opponent_ready recipients=1` |
| c | Simultaneous action (within the same second) | Both choose the same column at the same moment. Exactly one rubble block appears on both screens, at the same time. | Two `action_received` lines in the same second, one `round_resolved outcome=crash` |
| d | Late user joins | A third visitor opens the link of a full game and sees "game full" with a button to start their own (R36). A player who reconnects late gets a full snapshot. | `action_rejected reason=game_full`, or `snapshot_sent reason=reconnect` |
| e | Leave and return (close the tab) | Player 2 closes the tab and reopens the link within 30 seconds. The game continues where it was (R27). | `disconnect grace_s=30`, `reconnect away_ms=...`, `snapshot_sent reason=reconnect` |
| f | Isolated rooms | Two separate games run at once. Actions in one never appear in the other. | `broadcast` lines only ever go to the right `game` |
| g | Scale to two machines, users on different machines | Run `mise exec -- flyctl scale count 2`. Record whether two players in one game can land on different machines, and what they see. See ADR 0005. Scale back with `mise exec -- flyctl scale count 1` afterwards. | Two different `machine=` values |
| h | Restart the machine mid-game | Run `mise exec -- flyctl machine restart <machine-id>` (find the ID with `mise exec -- flyctl machine list`). Both players reconnect and the game continues from its last round (R26). | `disconnect` x2, `server_start games_loaded=...`, `reconnect`, `snapshot_sent reason=reconnect` |

## Step 6. Write the report

Fill in `docs/testing/multi-user-test-report.md`: the expected behaviour, what was observed and the matching log lines for every scenario. Any failure becomes an entry in `docs/corrections.md` with the fix that landed in the harness.
