import { describe, expect, it } from "vitest";
import {
  checkPassword,
  hashPassword,
  hashToken,
  newSessionToken,
  passwordProblem,
  publicPlayer,
  readCookie,
  sessionCookie,
  shortTag,
  validNickname,
  validUsername,
} from "../src/server/identity.ts";

describe("I1 (R28) nicknames", () => {
  it("I1 (R28) accepts 2 to 16 letters, numbers, spaces, hyphens and underscores", () => {
    for (const ok of ["Al", "Tejas", "a b_c-d", "1234567890123456"]) expect(validNickname(ok)).toBe(true);
  });
  it("I1 (R28) rejects other lengths and characters", () => {
    for (const bad of ["", "A", "12345678901234567", "no!", "tab\t", "é", "<b>", "  ", 5, null, undefined]) {
      expect(validNickname(bad)).toBe(false);
    }
  });
});

describe("R29 and R30 accounts", () => {
  it("R29 a password needs at least 8 characters and fits bcrypt's 72 bytes", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("x".repeat(73))).not.toBeNull();
    expect(passwordProblem(undefined)).not.toBeNull();
  });
  it("R29 usernames are 3 to 20 letters, numbers, hyphens and underscores", () => {
    expect(validUsername("tejas_1")).toBe(true);
    for (const bad of ["ab", "has space", "x".repeat(21), "a@b"]) expect(validUsername(bad)).toBe(false);
  });
  it("I6 (R30) a stored password is a salted bcrypt hash, never the password, and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toContain("correct horse");
    expect(a).toMatch(/^\$2[aby]\$/);
    expect(a).not.toBe(b); // salted
    expect(await checkPassword("correct horse", a)).toBe(true);
    expect(await checkPassword("wrong horse!", a)).toBe(false);
    expect(await checkPassword("anything", null)).toBe(false); // unknown username
  });
});

describe("R28 and R31 sessions and tags", () => {
  it("R28 session tokens are unpredictable and stored only as a hash", () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(hashToken(a)).not.toContain(a);
    expect(hashToken(a)).toHaveLength(64);
  });
  it("R28 the cookie is httpOnly and long-lived, Secure when asked", () => {
    expect(sessionCookie("t", false)).toMatch(/HttpOnly/);
    expect(sessionCookie("t", false)).toMatch(/Max-Age=\d{7,}/);
    expect(sessionCookie("t", false)).not.toMatch(/Secure/);
    expect(sessionCookie("t", true)).toMatch(/Secure/);
    expect(readCookie("a=1; rubble_session=tok; b=2", "rubble_session")).toBe("tok");
    expect(readCookie(undefined, "rubble_session")).toBeNull();
  });
  it("I5 (R31) a guest is shown with a short tag from their id, an account by username", () => {
    const id = "a7f3c1d2-0000-4000-8000-000000000000";
    expect(shortTag(id)).toBe("a7f3");
    expect(publicPlayer({ id, nickname: "Tejas", username: null })).toEqual({ displayName: "Tejas #a7f3", nickname: "Tejas", kind: "guest" });
    expect(publicPlayer({ id, nickname: "Tejas", username: "tj" })).toEqual({ displayName: "tj", nickname: "Tejas", kind: "account" });
  });
});
