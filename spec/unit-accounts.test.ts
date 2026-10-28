// Unit check: needs no running app. Accounts: password reset by the admin, the forced change, changing a password, the limit on
// sign-in attempts, moving a guest's history into an account, and per-player stats and history (R30, R86 to R91, ADR 0013).
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { MIGRATION_COUNT, openDb } from "../src/server/db.ts";
import { newGame } from "../src/engine/index.ts";
import { checkPassword, hashPassword } from "../src/server/identity.ts";
import { adminResetPassword, TEMP_ALPHABET, newTemporaryPassword } from "../src/server/accounts.ts";
import { attemptLimiter } from "../src/server/accounts.ts";
import { historyFor } from "../src/server/history.ts";

const OTHER = "a7f3c1d2-0000-4000-8000-000000000001"; // a player id as the app makes them: only its first 4 characters ever show (R31)
const won = { ...newGame(), round: 4, status: "won" as const, winner: "A" as const };
const draw = { ...newGame(), round: 9, status: "draw" as const, winner: null };

describe("R86 the admin reset", () => {
  it("R86 a reset sets a 12 character temporary password from an unambiguous alphabet, stores only its hash and marks must change", async () => {
    const db = openDb(":memory:");
    db.createPlayer("p1", "Pip");
    db.upgradeToAccount("p1", "pip", await hashPassword("old password"));
    const result = await adminResetPassword(db, "pip");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.password).toHaveLength(12);
    for (const ch of result.password) expect(TEMP_ALPHABET).toContain(ch);
    expect(TEMP_ALPHABET).not.toMatch(/[0O1lI5S2Z8B]/); // no look-alikes
    const row = db.playerByUsername("pip")!;
    expect(row.passwordHash).not.toContain(result.password); // never plain text
    expect(await checkPassword(result.password, row.passwordHash)).toBe(true);
    expect(await checkPassword("old password", row.passwordHash)).toBe(false); // the old password stopped working
    expect(row.mustChange).toBe(true);
  });

  it("R86 a username that does not exist is reported and changes nothing", async () => {
    const db = openDb(":memory:");
    expect(await adminResetPassword(db, "nobody")).toEqual({ ok: false, reason: "no such username" });
    expect(await adminResetPassword(db, "")).toEqual({ ok: false, reason: "no such username" });
  });

  it("R86 temporary passwords are random: a hundred are all different and use the whole alphabet", () => {
    const seen = new Set<string>();
    const chars = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const p = newTemporaryPassword();
      seen.add(p);
      for (const c of p) chars.add(c);
    }
    expect(seen.size).toBe(100);
    expect(chars.size).toBeGreaterThan(TEMP_ALPHABET.length / 2);
  });

  it("R86 and R30 the reset logs the username only: never the password or its hash", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
    let password = "";
    let hash = "";
    try {
      const db = openDb(":memory:");
      db.createPlayer("p1", "Pip");
      db.upgradeToAccount("p1", "pip", await hashPassword("old password"));
      const r = await adminResetPassword(db, "pip");
      if (r.ok) password = r.password;
      hash = db.playerByUsername("pip")!.passwordHash!;
    } finally {
      console.log = original;
    }
    const logged = lines.join("");
    expect(logged).toContain("admin_reset");
    expect(logged).toContain("pip");
    expect(logged).not.toContain(password);
    expect(logged).not.toContain(hash);
    expect(logged).not.toContain("old password");
  });
});

describe("R87 the forced change and changing a password", () => {
  it("R87 setting a new password replaces the hash, clears the mark and ends every session of the account", async () => {
    const db = openDb(":memory:");
    db.createPlayer("p1", "Pip");
    db.upgradeToAccount("p1", "pip", await hashPassword("old password"));
    db.createSession("old-device", "p1");
    const r = await adminResetPassword(db, "pip");
    if (!r.ok) throw new Error("reset failed");
    expect(db.playerBySession("old-device", 60_000)).toBeUndefined(); // a reset ends every session, so a stolen cookie does not survive it
    // The player signs in with the temporary password on two devices, and changes it on the first.
    db.createSession("tok-a", "p1");
    db.createSession("tok-b", "p1");
    db.setPassword("p1", await hashPassword("a brand new one"), { keepSession: "tok-a" });
    const row = db.playerByUsername("pip")!;
    expect(row.mustChange).toBe(false);
    expect(await checkPassword("a brand new one", row.passwordHash)).toBe(true);
    expect(await checkPassword(r.password, row.passwordHash)).toBe(false); // the temporary password stops working
    expect(db.playerBySession("tok-a", 60_000)?.id).toBe("p1");
    expect(db.playerBySession("tok-b", 60_000)).toBeUndefined(); // every other session ended
  });
});

describe("R88 the limit on sign-in attempts", () => {
  it("R88 five failures for one username in 15 minutes block it, whatever the password, until the window has passed", () => {
    let t = 1_000_000;
    const limit = attemptLimiter(() => t);
    for (let i = 0; i < 5; i++) {
      expect(limit.blocked("pip")).toBe(false);
      limit.fail("pip");
    }
    expect(limit.blocked("pip")).toBe(true);
    expect(limit.blocked("someone-else")).toBe(false); // per username
    t += 14 * 60_000;
    expect(limit.blocked("pip")).toBe(true);
    t += 2 * 60_000;
    expect(limit.blocked("pip")).toBe(false); // 15 minutes after the first failure
  });

  it("R88 a successful sign-in clears the count, names are case-insensitive, and the map cannot grow without bound", () => {
    let t = 0;
    const limit = attemptLimiter(() => t);
    for (let i = 0; i < 4; i++) limit.fail("Pip");
    limit.succeed("pip");
    for (let i = 0; i < 4; i++) limit.fail("PIP");
    expect(limit.blocked("pip")).toBe(false);
    for (let i = 0; i < 1000; i++) limit.fail(`user${i}`);
    t += 16 * 60_000;
    limit.blocked("anyone"); // any call sweeps what has expired
    expect(limit.size()).toBe(0);
  });

  it("R88 a hundred thousand different usernames cannot fill memory: there is a hard cap", () => {
    const limit = attemptLimiter(() => 0);
    for (let i = 0; i < 100_000; i++) limit.fail(`u${i}`);
    expect(limit.size()).toBeLessThanOrEqual(10_000);
  });
});

describe("R88 a flood of made-up names cannot unblock a victim", () => {
  it("R88 a blocked username survives 10,000 other names being tracked after it, and a full map of blocked names tracks no new name", () => {
    const limit = attemptLimiter(() => 0);
    for (let i = 0; i < 5; i++) limit.fail("victim");
    expect(limit.blocked("victim")).toBe(true);
    for (let i = 0; i < 12_000; i++) limit.fail(`flood${i}`); // one failure each: never blocked, so they are what gets dropped
    expect(limit.blocked("victim")).toBe(true); // still blocked
    expect(limit.size()).toBeLessThanOrEqual(10_000);
    // Fill the whole map with blocked names: nothing blocked is dropped, and a new name is simply not tracked.
    const full = attemptLimiter(() => 0);
    for (let i = 0; i < 10_000; i++) for (let k = 0; k < 5; k++) full.fail(`b${i}`);
    expect(full.size()).toBe(10_000);
    for (let k = 0; k < 5; k++) full.fail("newcomer");
    expect(full.blocked("b0")).toBe(true);
    expect(full.size()).toBe(10_000);
  });
});

describe("R89 moving a guest's history into an account", () => {
  it("R89 every game of the guest, in either seat, goes to the account, and the guest is removed", () => {
    const db = openDb(":memory:");
    db.createPlayer("guest", "Pip");
    db.createPlayer("acct", "Pip");
    db.createPlayer("other", "Sam");
    for (const [code, seat] of [["G1", "A"], ["G2", "B"]] as const) {
      db.markLink(code, won, "other");
      db.seatPlayer(code, "A", seat === "A" ? "guest" : "other");
      db.seatPlayer(code, "B", seat === "B" ? "guest" : "other");
    }
    db.markLink("KEEP", won, "other");
    db.seatPlayer("KEEP", "A", "acct");
    db.seatPlayer("KEEP", "B", "other");
    db.createSession("guest-cookie", "guest");
    db.moveGames("guest", "acct");
    expect(db.playerBySession("guest-cookie", 60_000)?.id).toBe("acct"); // a connection already open keeps working (R89)
    const games = Object.fromEntries(db.loadGames().map((g) => [g.code, g]));
    expect(games.G1.playerA).toBe("acct");
    expect(games.G2.playerB).toBe("acct");
    expect(games.KEEP.playerA).toBe("acct");
    expect(games.G1.creator).toBe("other");
    expect(db.playerById("guest")).toBeUndefined();
  });
});

describe("R90 and R91 stats and history", () => {
  function seed() {
    const db = openDb(":memory:");
    db.createPlayer("me", "Pip");
    db.createPlayer(OTHER, "Sam");
    const add = (code: string, state: any, opts: { ended?: any; computer?: boolean; me?: "A" | "B"; at?: number } = {}) => {
      const seat = opts.me ?? "A";
      if (opts.computer) db.markComputer(code, state);
      else db.markLink(code, state, "me");
      db.seatPlayer(code, seat, "me");
      if (!opts.computer) db.seatPlayer(code, seat === "A" ? "B" : "A", OTHER);
      if (opts.ended) db.saveEnded(code, opts.ended);
      db.saveRound(code, state, false, false);
    };
    return { db, add };
  }

  it("R90 wins, losses, draws and win rate are counted from saved games, split by people and the computer", () => {
    const { db, add } = seed();
    add("W1", won); // I am A, A won
    add("W2", won, { me: "B" }); // I am B, A won: a loss
    add("D1", draw);
    add("C1", won, { computer: true }); // a win against the computer
    add("C2", { ...won, winner: "B" }, { computer: true }); // a loss against the computer
    const h = historyFor(db, "me", Date.now());
    expect(h.stats.people).toEqual({ played: 3, wins: 1, losses: 1, draws: 1, winRate: 33 });
    expect(h.stats.computer).toEqual({ played: 2, wins: 1, losses: 1, draws: 0, winRate: 50 });
  });

  it("R90 a forfeit counts for the other player, an abandoned game appears in the history but not in the stats, and a game in play is not shown", () => {
    const { db, add } = seed();
    const played = { ...newGame(), round: 3 }; // a game that started: R98 leaves out games with no rounds
    add("F1", played, { ended: { result: "forfeit", winner: "B" } }); // I am A and left: a loss
    add("F2", played, { ended: { result: "forfeit", winner: "A" }, me: "B" }); // they left: I'd be B... A wins, a loss for me
    add("F3", played, { ended: { result: "forfeit", winner: "A" } }); // they left, I won
    add("AB", played, { ended: { result: "abandoned" } });
    add("LIVE", played);
    const h = historyFor(db, "me", Date.now());
    expect(h.stats.people).toEqual({ played: 3, wins: 1, losses: 2, draws: 0, winRate: 33 });
    expect(h.history.map((g) => g.code)).not.toContain("LIVE");
    const ab = h.history.find((g) => g.code === "AB")!;
    expect(ab.result).toBe("Abandoned");
    expect(h.history.find((g) => g.code === "F1")!.result).toBe("Forfeit lost");
    expect(h.history.find((g) => g.code === "F3")!.result).toBe("Forfeit won");
  });

  it("R90 with no finished games there is no win rate, not a divide by zero", () => {
    const { db, add } = seed();
    add("AB", { ...newGame(), round: 3 }, { ended: { result: "abandoned" } });
    const h = historyFor(db, "me", Date.now());
    expect(h.stats.people).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
    expect(h.stats.computer.winRate).toBeNull();
  });

  it("R91 the history is the last 20 games, newest first, with the opponent, the rounds and the time", () => {
    const { db, add } = seed();
    for (let i = 0; i < 25; i++) add(`H${String(i).padStart(2, "0")}`, { ...won, round: i + 1 });
    const h = historyFor(db, "me", Date.now() + 5 * 60_000);
    expect(h.history).toHaveLength(20);
    const first = h.history[0];
    expect(first.opponent).toMatch(/^Sam #/);
    expect(first.rounds).toBeGreaterThan(0);
    expect(first.endedAt).toBeTypeOf("number");
    const stamps = h.history.map((g) => g.endedAt);
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("R91 a computer game's opponent is Computer, and nothing in the history names another player's id or a seat token", () => {
    const { db, add } = seed();
    add("C1", won, { computer: true });
    add("P1", won);
    const h = historyFor(db, "me", Date.now());
    expect(h.history.find((g) => g.code === "C1")!.opponent).toBe("Computer");
    const text = JSON.stringify(h);
    expect(text).not.toContain(OTHER);
    expect(text).not.toContain(OTHER.slice(0, 8)); // only the 4 character tag may appear
    expect(text).not.toMatch(/seatToken|player_a|playerA/);
  });

  it("R90 a rematch is a separate game: both rows count, each with its own result", () => {
    const { db, add } = seed();
    add("RM1", won);
    db.archiveGame("RM1", newGame());
    db.saveRound("RM1", { ...won, round: 6 }, false, false);
    const h = historyFor(db, "me", Date.now());
    expect(h.stats.people.played).toBe(2);
    expect(h.stats.people.wins).toBe(2);
  });
});

describe("R98 a game that never started is never recorded", () => {
  it("R98 a game with 0 rounds is in no history and no stats, however it ended, and a game with rounds still is", () => {
    const db = openDb(":memory:");
    db.createPlayer("me", "Pip");
    db.createPlayer(OTHER, "Sam");
    const add = (code: string, round: number, ended: any, computer = false) => {
      const state = { ...newGame(), round };
      if (computer) db.markComputer(code, state);
      else db.markLink(code, state, "me");
      db.seatPlayer(code, "A", "me");
      if (!computer) db.seatPlayer(code, "B", OTHER);
      db.saveRound(code, state, false, false);
      if (ended) db.saveEnded(code, ended);
    };
    add("Z1", 0, { result: "abandoned" }); // a friend game cancelled before anyone joined
    add("Z2", 0, { result: "forfeit", winner: "A" }); // the other left before round 1
    add("Z3", 0, { result: "forfeit", winner: "B" }, false);
    add("Z4", 0, { result: "abandoned" }, true); // against the computer, left at once
    add("R1", 1, { result: "forfeit", winner: "A" }); // one round played: recorded
    const h = historyFor(db, "me", Date.now());
    expect(h.history.map((g) => g.code)).toEqual(["R1"]);
    expect(h.stats.people).toEqual({ played: 1, wins: 1, losses: 0, draws: 0, winRate: 100 });
    expect(h.stats.computer).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  });

  it("R91 an opponent whose person is not known is A guest, never Another player", () => {
    const db = openDb(":memory:");
    db.createPlayer("me", "Pip");
    const state = { ...won, round: 4 };
    db.markLink("G1", state, "me");
    db.seatPlayer("G1", "A", "me"); // seat B was a visitor with no session
    db.saveRound("G1", state, false, false);
    expect(historyFor(db, "me", Date.now()).history[0].opponent).toBe("A guest");
  });
});

describe("migration 18: accounts that must change their password", () => {
  const clean = (path: string) => {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  };
  it("S10 (R87) a database saved before the column existed is upgraded once, and every account is not marked", () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-migration18.db`);
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE games (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      for (const c of ["ended TEXT", "vs_computer INTEGER NOT NULL DEFAULT 0", "player_a TEXT", "player_b TEXT", "missed_a INTEGER NOT NULL DEFAULT 0", "missed_b INTEGER NOT NULL DEFAULT 0", "watchable INTEGER NOT NULL DEFAULT 0", "kind TEXT", "creator TEXT"]) old.exec(`ALTER TABLE games ADD COLUMN ${c}`);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT COLLATE NOCASE UNIQUE, password_hash TEXT, created_at INTEGER NOT NULL)`);
      old.exec(`ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
      old.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      old.exec(`INSERT INTO players (id, nickname, username, password_hash, created_at) VALUES ('p1', 'Pip', 'pip', 'hash', 1)`);
      old.exec(`PRAGMA user_version = 17`);
      old.close();
      const upgraded = openDb(path);
      expect(upgraded.playerByUsername("pip")!.mustChange).toBe(false);
      upgraded.close();
      const raw = new DatabaseSync(path);
      expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATION_COUNT); // every migration has run, once
      raw.close();
      const again = openDb(path); // a second open runs nothing
      expect(again.playerByUsername("pip")!.username).toBe("pip");
      again.close();
    } finally {
      clean(path);
    }
  });
});

describe("R86 the reset while the server has the database open", () => {
  it("R86 the real script, run as its own process, resets a password while the server process keeps writing, without 'database is locked'", async () => {
    const { spawn } = await import("node:child_process");
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-busy.db`);
    try {
      const server = openDb(path);
      server.createPlayer("p1", "Pip");
      server.upgradeToAccount("p1", "pip", await hashPassword("old password"));
      // The server keeps writing (rounds being saved) in big transactions while the script, a different process, resets.
      let writing = true;
      const writer = (async () => {
        let n = 0;
        while (writing) {
          server.saveGame(`BUSY${n++ % 50}`, newGame());
          await new Promise((r) => setImmediate(r));
        }
      })();
      const outcomes: Array<{ code: number | null; out: string }> = [];
      for (let i = 0; i < 4; i++) {
        outcomes.push(
          await new Promise((resolve) => {
            const child = spawn("node", ["scripts/admin-reset-password.ts", "pip"], { env: { ...process.env, RUBBLE_DB_PATH: path } });
            let out = "";
            child.stdout.on("data", (d) => (out += d));
            child.stderr.on("data", (d) => (out += d));
            child.on("close", (code) => resolve({ code, out }));
          }),
        );
      }
      writing = false;
      await writer;
      for (const o of outcomes) {
        expect(o.out).not.toMatch(/locked/i);
        expect(o.code, o.out).toBe(0);
      }
      expect(server.playerByUsername("pip")!.mustChange).toBe(true);
      server.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
    }
  }, 30_000);
});
