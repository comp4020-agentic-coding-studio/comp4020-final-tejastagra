// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
import { describe, expect, inject, it } from "vitest";

const base = () => inject("baseUrl");

// A tiny cookie jar, so each "browser" in a test is its own guest.
function browser() {
  let cookie = "";
  // Each simulated browser is its own client address, as separate players would be,
  // so the per-address limits (guests, sign-in) do not pool every test together.
  const address = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(base() + path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", "fly-client-ip": address, ...(cookie ? { cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, text, json: text.startsWith("{") ? JSON.parse(text) : null, setCookie: set };
  };
}

const unique = () => Math.random().toString(36).slice(2, 10);

describe("I: identity (R28 to R32)", () => {
  it("I1 (R28) nicknames outside 2 to 16 allowed characters are rejected", async () => {
    const b = browser();
    for (const nickname of ["", "A", "x".repeat(17), "bad<name>", "emoji😀", 42]) {
      expect((await b("/api/guest", { body: { nickname } })).status).toBe(400);
    }
    expect((await b("/api/guest", { body: { nickname: "Okay name_1" } })).status).toBe(200);
  });

  it("I2 (R28) a guest cookie is recognised on the next request, and is httpOnly", async () => {
    const b = browser();
    const made = await b("/api/guest", { body: { nickname: "Cookie" } });
    expect(made.setCookie).toMatch(/HttpOnly/);
    const me = await b("/api/me");
    expect(me.json.player.displayName).toBe(made.json.player.displayName);
    // A different browser is a different guest (ADR 0004).
    expect((await browser()("/api/me")).json.player).toBeNull();
  });

  it("I3 (R29) usernames are unique, ignoring case", async () => {
    const name = "user_" + unique();
    const a = browser();
    await a("/api/guest", { body: { nickname: "First" } });
    expect((await a("/api/account/signup", { body: { username: name, password: "password123" } })).status).toBe(200);
    const b = browser();
    await b("/api/guest", { body: { nickname: "Second" } });
    const clash = await b("/api/account/signup", { body: { username: name.toUpperCase(), password: "password123" } });
    expect(clash.status).toBe(409);
  });

  it("I3 (R29) a short password is refused, and sign in works only with the right password", async () => {
    const name = "user_" + unique();
    const a = browser();
    await a("/api/guest", { body: { nickname: "Pass" } });
    expect((await a("/api/account/signup", { body: { username: name, password: "short" } })).status).toBe(400);
    expect((await a("/api/account/signup", { body: { username: name, password: "long enough pw" } })).status).toBe(200);
    const other = browser();
    expect((await other("/api/account/signin", { body: { username: name, password: "wrong password" } })).status).toBe(401);
    expect((await other("/api/account/signin", { body: { username: "nobody_" + unique(), password: "wrong password" } })).status).toBe(401);
    const ok = await other("/api/account/signin", { body: { username: name, password: "long enough pw" } });
    expect(ok.status).toBe(200);
    expect((await other("/api/me")).json.player.displayName).toBe(name);
  });

  it("I4 (R29) signing up keeps the same player, so a guest's history stays theirs", async () => {
    const name = "user_" + unique();
    const a = browser();
    const guest = await a("/api/guest", { body: { nickname: "Keeper" } });
    const tag = guest.json.player.displayName.split("#")[1];
    expect(tag).toMatch(/^[0-9a-f]{4}$/);
    await a("/api/account/signup", { body: { username: name, password: "password123" } });
    // Same session, now an account: the player was upgraded in place, not replaced.
    expect((await a("/api/me")).json.player).toEqual({ displayName: name, kind: "account" });
  });

  it("I5 (R31) guests are always shown with their short tag, and two guests with one nickname differ", async () => {
    // Tags are 4 hex digits, so two guests can rarely share one; the point is that
    // the tag comes from the id, so across several guests they are not all equal.
    const names: string[] = [];
    for (let i = 0; i < 6; i++) names.push((await browser()("/api/guest", { body: { nickname: "Same" } })).json.player.displayName);
    for (const n of names) expect(n).toMatch(/^Same #[0-9a-f]{4}$/);
    expect(new Set(names).size).toBeGreaterThan(1);
  });

  it("I6 (R30) no response ever contains a password or password hash", async () => {
    const name = "user_" + unique();
    const password = "my secret pw " + unique();
    const b = browser();
    const seen = [
      await b("/api/guest", { body: { nickname: "Secret" } }),
      await b("/api/account/signup", { body: { username: name, password } }),
      await b("/api/me"),
      await b("/api/account/signin", { body: { username: name, password } }),
      await b("/api/account/signin", { body: { username: name, password: "wrong wrong" } }),
    ];
    expect(seen.map((r) => r.status)).toEqual([200, 200, 200, 200, 401]);
    for (const r of seen) {
      expect(r.text).not.toContain(password);
      expect(r.text).not.toMatch(/\$2[aby]\$/);
      expect(r.text.toLowerCase()).not.toContain("hash");
      expect(r.text.toLowerCase()).not.toContain("password_hash");
    }
  });

  it("R28 a cross-site form cannot sign anyone in or out: JSON content type is required", async () => {
    const form = (path: string, body: string) =>
      fetch(base() + path, {
        method: "POST",
        headers: { "content-type": "text/plain", "fly-client-ip": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
        body,
      });
    expect((await form("/api/account/signin", '{"username":"a","password":"b"}')).status).toBe(400);
    expect((await form("/api/guest", '{"nickname":"Forged"}')).status).toBe(400);
    expect((await form("/api/signout", "{}")).status).toBe(415);
  });

  it("R28 creating guests is rate limited per address", async () => {
    // Uses its own forged client address so it cannot exhaust the limit other tests share.
    let refused = 0;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(base() + "/api/guest", {
        method: "POST",
        headers: { "content-type": "application/json", "fly-client-ip": "198.51.100.77" },
        body: JSON.stringify({ nickname: "Flood" }),
      });
      if (res.status === 429) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });

  it("R28 signing out ends the session", async () => {
    const b = browser();
    await b("/api/guest", { body: { nickname: "Leaving" } });
    await b("/api/signout", { method: "POST" });
    expect((await b("/api/me")).json.player).toBeNull();
  });
});
