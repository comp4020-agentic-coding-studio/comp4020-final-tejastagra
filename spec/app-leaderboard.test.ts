// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("B: leaderboard (R37 to R39)", () => {
  it.todo("B1 (R37) a win against the computer changes neither list");
  it.todo("B2 (R38) a win against a person adds one to most wins");
  it.todo("B3 (R39) a win where the opponent missed a round does not count for fewest rounds");
  it.todo("B4 (R19) an abandoned game changes neither list");
  it.todo("B5 (R17) fewest rounds records the round count at the win");
});
