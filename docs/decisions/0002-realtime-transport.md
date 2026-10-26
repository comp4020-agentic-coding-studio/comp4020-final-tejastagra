# 0002. How updates reach players in real time

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

Promise 2 needs a round's result on both screens within one second, with no action by the viewer (R23). The opponent's "Ready" status must also appear live (R21).

## Options

1. **WebSockets.** One open two-way connection per player. Lowest delay, and choices and results travel on the same channel. Cost: we must handle reconnection ourselves (R24, R27).
2. **Server-sent events plus normal requests for choices.** Simpler to proxy and reconnects automatically. Cost: two channels to keep in step.
3. **Fast polling.** Simplest. Cost: wasted requests on phones and a worse delay for the same server load.

## Decision

WebSockets, with a full snapshot on every connect and reconnect (R24) so a dropped connection never leaves a stale board.

## What it costs

Reconnection, heartbeat and tab-replacement logic (R32) is ours to write and test.

## Evidence

To be added: the `round_resolved` log field `ms_to_broadcast` and the real-time checks T1 to T3.
