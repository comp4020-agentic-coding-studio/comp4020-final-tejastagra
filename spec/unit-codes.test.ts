import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_PATTERN, generateCode } from "../src/server/codes.ts";

describe("L2 (R34) game codes", () => {
  it("L2 (R34) are 6 characters from the allowed letters only", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode(() => false);
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
      expect(CODE_PATTERN.test(code)).toBe(true);
    }
  });

  it("L2 (R34) the alphabet has no look-alike characters", () => {
    expect(CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    for (const ch of "ILO01") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("L2 (R34) a code already in use is never returned", () => {
    const taken = new Set<string>();
    let calls = 0;
    const code = generateCode((c) => {
      calls++;
      if (calls < 5) {
        taken.add(c);
        return true;
      }
      return taken.has(c);
    });
    expect(taken.has(code)).toBe(false);
    expect(calls).toBeGreaterThanOrEqual(5);
  });

  it("L2 (R34) the pattern rejects wrong lengths and forbidden letters", () => {
    expect(CODE_PATTERN.test("ABC23")).toBe(false);
    expect(CODE_PATTERN.test("ABC2345")).toBe(false);
    expect(CODE_PATTERN.test("ABCDE0")).toBe(false);
    expect(CODE_PATTERN.test("abcdef")).toBe(false);
  });
});
