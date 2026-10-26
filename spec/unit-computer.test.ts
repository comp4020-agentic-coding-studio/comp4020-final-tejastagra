// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, it } from "vitest";

describe("C: computer player (R40 to R46)", () => {
  it.todo("C1 (R41) never chooses a full column over 10000 random positions");
  it.todo("C2 (R42) always chooses an immediately winning column");
  it.todo("C3 (R43) blocks the human's immediately winning column at least 70% of the time over 1000 seeded positions");
  it.todo("C4 (R46) the same seed gives the same choices");
  it.todo("C5 (R46) a simple scripted strategy beats it in at least 20% of 500 seeded games");
  it.todo("C6 (R45) never uses a shield it has already spent");
  it.todo("C7 (R40) chooseMove takes only public state, so it cannot receive the human's choice");
});
