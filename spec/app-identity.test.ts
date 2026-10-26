// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("I: identity (R28 to R32)", () => {
  it.todo("I1 (R28) nicknames outside 2 to 16 allowed characters are rejected");
  it.todo("I2 (R28) a guest cookie is recognised on the next request");
  it.todo("I3 (R29) usernames are unique");
  it.todo("I4 (R29) signing up keeps a guest's past games and wins");
  it.todo("I5 (R31) guests are always shown with their short tag");
  it.todo("I6 (R30) no response ever contains a password or password hash");
});
