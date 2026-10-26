// Browser checks (e2e/, Phase 7). They run against the app already running on
// APP_URL (default http://localhost:8080), like `pnpm check`, and never in
// `pnpm check`, so CI does not need a browser.
//
// The two marking viewports are set on the course assessment page, which is
// not in the repo. Until Tejas confirms them, docs/design.md says to use
// 390 x 844 (phone) and 1366 x 768 (laptop), plus 320 px wide, the narrowest
// common phone. Change PHONE and LAPTOP below once confirmed.
import { defineConfig } from "@playwright/test";

export const PHONE = { width: 390, height: 844 };
export const LAPTOP = { width: 1366, height: 768 };
export const NARROW = { width: 320, height: 568 };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
});
