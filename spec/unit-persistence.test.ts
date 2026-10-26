// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("S: what happens is kept (promise 5)", () => {
  it.todo("S1 (R25) the game service writes a round result to the database before calling broadcast");
  it.todo("S2 (R26) a game service started on an existing database restores every game in progress at its last saved round");
  it.todo("S3 (R26) on restore, the open round's timer restarts at 15 seconds");
});
