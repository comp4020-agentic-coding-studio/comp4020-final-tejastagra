// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("T: both players see the same result at the same moment (promise 2)", () => {
  it.todo("T1 (R23) both clients receive a round's result within 1 second of the second choice");
  it.todo("T2 (R23) both clients receive identical results for the same round");
  it.todo("T3 (R21) the opponent's ready status reaches the other client within 1 second");
  it.todo("T4 (R24) a client that reconnects receives a full snapshot matching the other client's board");
  it.todo("T5 (R27) a client that disconnects and returns within 30 seconds continues the same game");
  it.todo("T6 (R32) a second connection for the same player replaces the first and the first is told");
});
