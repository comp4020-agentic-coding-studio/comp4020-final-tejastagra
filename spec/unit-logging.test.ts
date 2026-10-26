// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
import { describe, expect, it } from "vitest";
import { formatEvent } from "../src/server/log.ts";

describe("G: logging (docs/logging.md)", () => {
  it("G1 the logger formats every event as key=value with event and machine fields", () => {
    const line = formatEvent("join", { user: "a7f3e", game: "K7QX2M", clients_in_game: 2, role: "A" }, "148e443b");
    expect(line).toBe("event=join machine=148e443b user=a7f3e game=K7QX2M clients_in_game=2 role=A");
  });

  it("G1 machine falls back to local", () => {
    expect(formatEvent("server_start", {}, undefined)).toBe("event=server_start machine=local");
  });

  it("G2 values with spaces are quoted", () => {
    const line = formatEvent("action_rejected", { type: "choose", reason: "column full" }, "local");
    expect(line).toBe('event=action_rejected machine=local type=choose reason="column full"');
  });

  it("G2 embedded quotes are escaped", () => {
    expect(formatEvent("persist_error", { error: 'say "hi"' }, "local")).toBe(
      'event=persist_error machine=local error="say \\"hi\\""',
    );
  });

  it("G3 the logger refuses fields named password, hash, cookie or token", () => {
    for (const name of ["password", "hash", "cookie", "token", "Password_Hash", "session_token"]) {
      expect(() => formatEvent("connect", { [name]: "x" }, "local")).toThrow(/forbidden/);
    }
  });
});
