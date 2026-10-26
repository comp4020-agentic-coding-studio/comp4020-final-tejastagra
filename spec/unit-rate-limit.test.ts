import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/server/rate-limit.ts";

describe("R34 limit on creating games per address", () => {
  it("R34 allows up to the limit, then refuses, per address", () => {
    const allow = createRateLimiter(3, 1000, () => 0);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
  });

  it("R34 allows again once the window has passed", () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});
