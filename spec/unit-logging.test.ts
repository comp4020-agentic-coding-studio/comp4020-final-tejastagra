// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("G: logging (docs/logging.md)", () => {
  it.todo("G1 the logger formats every event in docs/logging.md as key=value with event and machine fields");
  it.todo("G2 values with spaces are quoted");
  it.todo("G3 the logger refuses fields named password, hash, cookie or token");
});
