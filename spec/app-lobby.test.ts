// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("L: playing modes (R33 to R36)", () => {
  it.todo("L1 (R33) play the computer starts a game with no waiting");
  it.todo("L2 (R34) game codes use only the allowed letters and are 6 characters long");
  it.todo("L3 (R34) opening /g/<code> or entering the code joins the same game");
  it.todo("L4 (R35) 20 clients arriving at once in quick match are paired into exactly 10 games, each client once");
  it.todo("L5 (R36) a third client joining a full game is refused with game_full");
});
