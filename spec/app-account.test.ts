// App check: runs with pnpm check against the RUNNING app. Accounts: the admin's password reset, the forced change, changing a
// password, the limit on sign-in attempts and the history and stats endpoint (R30, R86 to R91, ADR 0013).
//
// The reset is a command run on the server's own database (docs/admin.md), so these checks run the same script the admin runs.
// `pnpm check` runs it against the temporary database of the app it started (CHECK_DB_PATH). A run against an app in Docker, as
// in CI, sets CHECK_RESET_COMMAND to the command that runs it inside the container (`docker exec app node
// scripts/admin-reset-password.ts`), which also proves the script is in the image. With neither set these checks fail and say
// so, instead of quietly not running.
import { describe, expect, inject, it } from "vitest";
import { execFileSync } from "node:child_process";

const base = () => inject("baseUrl");
const unique = () => Math.random().toString(36).slice(2, 10);

function browser() {
  let cookie = "";
  const address = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(base() + path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", "fly-client-ip": address, ...(cookie ? { cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, text, json: text.startsWith("{") ? JSON.parse(text) : null };
  };
  return Object.assign(call, { cookie: () => cookie });
}

function reset(username: string): string {
  const custom = process.env.CHECK_RESET_COMMAND?.trim();
  const db = process.env.CHECK_DB_PATH;
  if (!custom && !db) throw new Error("Set CHECK_DB_PATH (the app's database file) or CHECK_RESET_COMMAND (a command that runs the reset script on the app, such as `docker exec app node scripts/admin-reset-password.ts`): see spec/CHECKS.md.");
  const [command, ...args] = custom ? custom.split(/\s+/) : ["node", "scripts/admin-reset-password.ts"];
  const out = execFileSync(command, [...args, username], { env: { ...process.env, ...(db && !custom ? { RUBBLE_DB_PATH: db } : {}) }, encoding: "utf8" });
  const match = out.match(/: (\S{12})\n/);
  if (!match) throw new Error(`the script printed no temporary password: ${out}`);
  return match[1];
}

async function account(password = "first password") {
  const b = browser();
  const username = "acct_" + unique();
  await b("/api/guest", { body: { nickname: "Pip Squeak" } });
  expect((await b("/api/account/signup", { body: { username, password } })).status).toBe(200);
  return { b, username, password };
}

describe("R86 and R87 the admin reset and the forced change", () => {
  it("R86 a reset password signs in once and demands a new password; the old password has stopped working", async () => {
    const { username, password } = await account();
    const temporary = reset(username);
    expect(temporary).toHaveLength(12);
    const device = browser();
    expect((await device("/api/account/signin", { body: { username, password } })).status).toBe(401); // the old password stopped working
    const signin = await device("/api/account/signin", { body: { username, password: temporary } });
    expect(signin.status).toBe(200);
    expect(signin.json.mustChange).toBe(true);
    expect(signin.text).not.toContain(temporary);
  });

  it("R87 until the new password is chosen, everything else is refused with 403, and signing out still works", async () => {
    const { username } = await account();
    const temporary = reset(username);
    const device = browser();
    await device("/api/account/signin", { body: { username, password: temporary } });
    const guest = await device("/api/guest", { body: { nickname: "Sneaky" } });
    expect(guest.status).toBe(403);
    expect(guest.json.error).toBe("Choose a new password first.");
    expect((await device("/api/me/history")).status).toBe(403);
    expect((await device("/api/games", { method: "POST", body: {} })).status).toBe(403);
    expect((await device("/api/signout", { body: {} })).status).toBe(200);
  });

  it("R87 choosing a new password clears the mark, and the temporary password stops working at once", async () => {
    const { username } = await account();
    const temporary = reset(username);
    const device = browser();
    await device("/api/account/signin", { body: { username, password: temporary } });
    expect((await device("/api/me")).json.mustChange).toBe(true); // a reload can show the popup again
    expect((await device("/api/account/password", { body: { next: "short" } })).status).toBe(400); // under 8 characters
    const set = await device("/api/account/password", { body: { next: "a brand new one" } }); // no current password: the sign-in proved it
    expect(set.status).toBe(200);
    expect(set.json.mustChange).toBeUndefined();
    expect((await device("/api/me")).json.mustChange).toBeUndefined();
    expect((await device("/api/me")).json.player.displayName).toBe(username);
    expect((await device("/api/me/history")).status).toBe(200); // nothing is refused any more
    const again = browser();
    expect((await again("/api/account/signin", { body: { username, password: temporary } })).status).toBe(401); // used up
    expect((await again("/api/account/signin", { body: { username, password: "a brand new one" } })).status).toBe(200);
  });

  it("R86 a reset ends the account's other sessions, so a stolen cookie does not survive it", async () => {
    const { b, username } = await account();
    expect((await b("/api/me")).json.player.displayName).toBe(username);
    reset(username);
    expect((await b("/api/me")).json.player).toBeNull();
  });

  it("R30 and R86 no response from any account call contains a password, a temporary password or a hash", async () => {
    const { b, username, password } = await account("my secret pw " + unique());
    const temporary = reset(username);
    const device = browser();
    const seen = [
      await device("/api/account/signin", { body: { username, password: temporary } }),
      await device("/api/me"),
      await device("/api/account/password", { body: { next: "another secret " + unique() } }),
      await device("/api/me/history"),
      await b("/api/account/signin", { body: { username, password } }),
    ];
    for (const r of seen) {
      for (const secret of [password, temporary]) expect(r.text).not.toContain(secret);
      expect(r.text).not.toMatch(/\$2[aby]\$/);
      expect(r.text.toLowerCase()).not.toContain("hash");
    }
  });
});

describe("R87 changing a password from the account page", () => {
  it("R87 the current password must be right, the new one at least 8 characters, and the old one stops working", async () => {
    const { b, username, password } = await account();
    expect((await b("/api/account/password", { body: { current: "wrong password", next: "a brand new one" } })).status).toBe(401);
    expect((await b("/api/account/password", { body: { current: password, next: "short" } })).status).toBe(400);
    expect((await b("/api/account/password", { body: { current: password, next: "x".repeat(80) } })).status).toBe(400); // past bcrypt's 72 bytes
    expect((await b("/api/account/password", { body: { current: password, next: "a brand new one" } })).status).toBe(200);
    const device = browser();
    expect((await device("/api/account/signin", { body: { username, password } })).status).toBe(401);
    expect((await device("/api/account/signin", { body: { username, password: "a brand new one" } })).status).toBe(200);
  });

  it("R87 an ordinary session cannot skip the current password: only a session that signed in with a temporary one may", async () => {
    const { b } = await account();
    expect((await b("/api/account/password", { body: { next: "a brand new one" } })).status).toBe(401);
  });

  it("R87 a guest has no password to change, and a cross-site form cannot change one", async () => {
    const guest = browser();
    await guest("/api/guest", { body: { nickname: "Just a guest" } });
    expect((await guest("/api/account/password", { body: { current: "x", next: "a brand new one" } })).status).toBe(401);
    const { b } = await account();
    const res = await fetch(base() + "/api/account/password", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: b.cookie(), "fly-client-ip": "10.9.9.9" }, body: "current=a&next=b" });
    expect(res.status).toBe(400);
  });

  it("R87 changing a password ends the account's other sessions but not the one that changed it", async () => {
    const { b, username, password } = await account();
    const other = browser();
    await other("/api/account/signin", { body: { username, password } });
    expect((await b("/api/account/password", { body: { current: password, next: "a brand new one" } })).status).toBe(200);
    expect((await b("/api/me")).json.player.displayName).toBe(username);
    expect((await other("/api/me")).json.player).toBeNull();
  });
});

describe("R88 the limit on sign-in attempts", () => {
  it("R88 five failures for a username block it for everyone, with the words given, even with the right password", async () => {
    const { username, password } = await account();
    for (let i = 0; i < 5; i++) {
      const device = browser(); // a fresh address each time: the limit is per username, not per address
      expect((await device("/api/account/signin", { body: { username, password: "wrong " + i + unique() } })).status).toBe(401);
    }
    const blocked = await browser()("/api/account/signin", { body: { username, password } });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error).toBe("Too many attempts. Try again in a few minutes.");
    expect(blocked.text).not.toContain(password);
  });

  it("R88 a username that does not exist is counted and answered the same way, so usernames cannot be probed", async () => {
    const ghost = "ghost_" + unique();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await browser()("/api/account/signin", { body: { username: ghost, password: "whatever " + i } })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("R88 one username being blocked does not block another, and a good sign-in before the limit clears the count", async () => {
    const a = await account();
    const b = await account();
    for (let i = 0; i < 4; i++) await browser()("/api/account/signin", { body: { username: a.username, password: "wrong " + i } });
    expect((await browser()("/api/account/signin", { body: { username: a.username, password: a.password } })).status).toBe(200);
    for (let i = 0; i < 4; i++) await browser()("/api/account/signin", { body: { username: a.username, password: "wrong again " + i } });
    expect((await browser()("/api/account/signin", { body: { username: a.username, password: a.password } })).status).toBe(200); // not blocked: the count restarted
    for (let i = 0; i < 5; i++) await browser()("/api/account/signin", { body: { username: b.username, password: "wrong " + i } });
    expect((await browser()("/api/account/signin", { body: { username: a.username, password: a.password } })).status).toBe(200);
  });
});

describe("R89 signing in moves the device's guest history into the account", () => {
  it("R89 after signing in, the guest's games belong to the account and the guest is gone", async () => {
    const { username, password } = await account();
    const device = browser();
    const guest = await device("/api/guest", { body: { nickname: "Wanderer" } });
    expect(guest.json.player.kind).toBe("guest");
    const code = (await device("/api/games", { method: "POST", body: {} })).json.code as string;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const signin = await device("/api/account/signin", { body: { username, password } });
    expect(signin.status).toBe(200);
    const me = await device("/api/me");
    expect(me.json.player.displayName).toBe(username);
    expect((await device("/api/me/history")).status).toBe(200);
  });
});

describe("R90 and R91 the history and stats endpoint", () => {
  it("R91 a new player has no games and no win rate, and the answer has exactly the documented shape", async () => {
    const { b } = await account();
    const res = await b("/api/me/history");
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(["history", "stats"]);
    expect(res.json.history).toEqual([]);
    expect(res.json.stats.people).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
    expect(res.json.stats.computer).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
    expect(res.text).not.toMatch(/seatToken/);
  });

  it("R91 someone with no session gets nothing, and the history is rate limited", async () => {
    expect((await browser()("/api/me/history")).status).toBe(401);
    const b = (await account()).b;
    const codes: number[] = [];
    for (let i = 0; i < 130; i++) codes.push((await b("/api/me/history")).status);
    expect(codes).toContain(429);
  });
});

describe("R87 and R89 over a real game connection", () => {
  const wsUrl = () => base().replace(/^http/, "ws") + "/ws";
  function connect(cookie: string) {
    const socket = new WebSocket(wsUrl(), { headers: { cookie, "fly-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } } as never);
    const queued: any[] = [];
    const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
    socket.addEventListener("message", (event) => {
      const m = JSON.parse(event.data as string);
      const at = waiting.findIndex((w) => w.type === m.type);
      if (at >= 0) waiting.splice(at, 1)[0].resolve(m);
      else queued.push(m);
    });
    const opened = new Promise<void>((r) => socket.addEventListener("open", () => r(), { once: true }));
    const closed = new Promise<void>((r) => socket.addEventListener("close", () => r(), { once: true }));
    const next = (type: string) => {
      const at = queued.findIndex((m) => m.type === type);
      if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
      return new Promise<any>((resolve) => waiting.push({ type, resolve }));
    };
    return { socket, opened, closed, next, send: (b: object) => socket.send(JSON.stringify(b)) };
  }

  async function twoInAGame(first: ReturnType<typeof browser>, second: ReturnType<typeof browser>) {
    const code = (await first("/api/games", { method: "POST", body: {} })).json.code as string;
    const a = connect(first.cookie());
    await a.opened;
    a.send({ type: "join", code });
    const snapA = await a.next("snapshot");
    const b = connect(second.cookie());
    await b.opened;
    b.send({ type: "join", code });
    const snapB = await b.next("snapshot");
    // Round 1 opens after the start countdown (R97), so a choice below is a choice in a game being played.
    await a.next("started");
    await b.next("started");
    return { code, a, b, snapA, snapB };
  }

  it("R89 a guest in a live game signs in to an account and goes on playing on the same connection and the same seat", async () => {
    const guest = browser();
    await guest("/api/guest", { body: { nickname: "Wanderer" } });
    const other = browser();
    await other("/api/guest", { body: { nickname: "Opponent" } });
    const { code, a, b, snapA } = await twoInAGame(guest, other);
    expect(snapA.you).toBe("A");
    await a.next("opponent_joined"); // the first player is told the second arrived
    const { username, password } = await account(); // an account made elsewhere
    expect((await guest("/api/account/signin", { body: { username, password } })).status).toBe(200); // the guest signs in on the same device
    // The guest's open connection still has its seat and its choice is taken: the opponent is told "ready".
    a.send({ type: "choose", code, player: "A", seatToken: snapA.seatToken, column: 3, shield: false });
    expect((await b.next("opponent_ready")).type).toBe("opponent_ready");
    expect(a.socket.readyState).toBe(WebSocket.OPEN);
    a.socket.close();
    b.socket.close();
  });

  it("R87 after a reset, a thief's open connection cannot choose, and is closed", async () => {
    const victim = await account();
    const other = browser();
    await other("/api/guest", { body: { nickname: "Opponent" } });
    const { code, a, b, snapA } = await twoInAGame(victim.b, other);
    reset(victim.username);
    a.send({ type: "choose", code, player: "A", seatToken: snapA.seatToken, column: 3, shield: false });
    await a.closed;
    // The opponent was never told anything was chosen.
    const tellTale = await Promise.race([b.next("opponent_ready").then(() => "told"), new Promise<string>((r) => setTimeout(() => r("silent"), 400))]);
    expect(tellTale).toBe("silent");
    b.socket.close();
  });

  it("R87 a session that must still choose a new password does nothing over a game connection either", async () => {
    const victim = await account();
    const temporary = reset(victim.username);
    const thief = browser();
    await thief("/api/account/signin", { body: { username: victim.username, password: temporary } });
    expect((await thief("/api/me")).json.mustChange).toBe(true);
    const other = browser();
    await other("/api/guest", { body: { nickname: "Opponent" } });
    // The thief cannot even make a game (403), so use a game the other player made and hold its seat token by joining.
    const code = (await other("/api/games", { method: "POST", body: {} })).json.code as string;
    const o = connect(other.cookie());
    await o.opened;
    o.send({ type: "join", code });
    const snapO = await o.next("snapshot");
    const t = connect(thief.cookie());
    await t.opened;
    t.send({ type: "join", code, player: "B" });
    const snapT = await Promise.race([t.next("snapshot"), t.next("spectating"), t.next("game_full")]);
    if (snapT.type === "snapshot") {
      t.send({ type: "choose", code, player: "B", seatToken: snapT.seatToken, column: 1, shield: false });
      await t.closed; // a must-change session does nothing over the game connection
    }
    o.send({ type: "choose", code, player: "A", seatToken: snapO.seatToken, column: 2, shield: false });
    o.socket.close();
    t.socket.close();
  });

  it("R87 the device that changes its password goes on playing, and the account's other device is cut off", async () => {
    const mine = await account();
    const otherDevice = browser();
    await otherDevice("/api/account/signin", { body: { username: mine.username, password: mine.password } });
    const opponent = browser();
    await opponent("/api/guest", { body: { nickname: "Opponent" } });
    const { code, a, b, snapA } = await twoInAGame(mine.b, opponent);
    await a.next("opponent_joined"); // the first player is told the second arrived
    expect((await mine.b("/api/account/password", { body: { current: mine.password, next: "a brand new one" } })).status).toBe(200);
    a.send({ type: "choose", code, player: "A", seatToken: snapA.seatToken, column: 3, shield: false });
    expect((await b.next("opponent_ready")).type).toBe("opponent_ready"); // this device's connection goes on
    a.socket.close();
    b.socket.close();
  });
});
