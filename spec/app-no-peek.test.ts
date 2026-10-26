// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("N: nobody can see the other player's choice early (promise 3)", () => {
  it.todo("N1 (R22) after A chooses, no message sent to B before the round resolves contains A's column or shield flag");
  it.todo("N2 (R21) B receives only opponent_ready, and the message is the same size whatever column A chose");
  it.todo("N3 (R22) an invalid choice by A produces no message to B at all");
  it.todo("N4 (R24) a snapshot sent to B mid-round never includes A's pending choice");
});
