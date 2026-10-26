// Unit checks only: no running app needed, no global setup.
// Used by pnpm check:fast (and the Claude Code Stop hook) and by Stryker mutation testing.
// pnpm check still runs these too, through the course's own Vitest config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["spec/unit-*.test.ts"],
  },
});
