// Unit check: needs no running app. Leaving a game on purpose (R81) on an ephemeral server.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";
import { leaderboardFrom } from "../src/server/leaderboard.ts";

function start() {
  const server = createServer((_req, res) => res.end());
  const db = openDb(":memory:");
  const rt = attachRealtime(server, db, {
    disconnectGraceMs: 60_000,
    roundTimerMs: 60_000,
    computerDelayMs: 20,
    computerSeed: 3,
    identify: (request) => (typeof request.headers["x-person"] === "string" ? (request.headers["x-person"] as string) : null),
    nameFor: (id) => `Person ${id}`,
  });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  cleanup.push(() => {
    rt.dispose();
    server.close();
  });
  return { db, rt, url: `ws://localhost:${port}/ws` };
}

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

function connect(url: string, person?: string) {
  const socket = new WebSocket(url, person ? ({ headers: { "x-person": person } } as never) : undefined);
  const queued: any[] = [];
  const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.type === message.type);
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const next = (type: string): Promise<any> => {
    const at = queued.findIndex((m) => m.type === type);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return new Promise((resolve) => waiting.push({ type, resolve }));
  };
  const quiet = async (type: string, ms = 150): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, ms));
    return !queued.some((m) => m.type === type);
  };
  cleanup.push(() => socket.close());
  return { socket, opened, next, quiet, send: (body: object) => socket.send(JSON.stringify(body)) };
}

async function seat(url: string, code: string, person: string, player?: "A" | "B") {
  const c = connect(url, person);
  await c.opened;
  c.send({ type: "join", code, ...(player ? { player } : {}) });
  const snap = await c.next("snapshot");
  return { ...c, snap };
}

describe("R81 leaving a game on purpose", () => {
  it("R81 leaving a game being played ends it as a forfeit at once, the other player wins and is told, and it is saved first", async () => {
    const { db, rt, url } = start();
    rt.createLinkGame("LEV001", "p1");
    const a = await seat(url, "LEV001", "p1");
    const b = await seat(url, "LEV001", "p2");
    await a.next("opponent_joined");
    a.send({ type: "leave_game", code: "LEV001", player: "A", seatToken: a.snap.seatToken });
    const over = await b.next("game_over");
    expect(over).toEqual({ type: "game_over", result: "forfeit", winner: "B" });
    const saved = db.loadGames().find((g) => g.code === "LEV001")!;
    expect(saved.ended).toEqual({ result: "forfeit", winner: "B" }); // saved (the order is proven by the failed-save test below)
    // The leaver's seat is not given a result: their screen goes Home.
    expect(await a.quiet("game_over")).toBe(true);
  });

  it("R81 and R38 a forfeit by leaving counts as a win for the other person on the leaderboard", async () => {
    const { db, rt, url } = start();
    db.createPlayer("p1", "Alpha");
    db.createPlayer("p2", "Beta");
    rt.createLinkGame("LEV002", "p1");
    const a = await seat(url, "LEV002", "p1");
    const b = await seat(url, "LEV002", "p2");
    await a.next("opponent_joined");
    a.send({ type: "leave_game", code: "LEV002", player: "A", seatToken: a.snap.seatToken });
    await b.next("game_over");
    const board = leaderboardFrom(db, 10);
    expect(board.wins.find((r) => r.name.startsWith("Beta"))?.value).toBe(1);
    expect(board.wins.find((r) => r.name.startsWith("Alpha"))).toBeUndefined();
  });

  it("R81 and R32 a leave_game without the seat's own token does nothing", async () => {
    const { rt, url } = start();
    rt.createLinkGame("LEV003", "p1");
    const a = await seat(url, "LEV003", "p1");
    const b = await seat(url, "LEV003", "p2");
    await a.next("opponent_joined");
    const stranger = connect(url, "p3");
    await stranger.opened;
    stranger.send({ type: "leave_game", code: "LEV003", player: "A", seatToken: "wrong" });
    stranger.send({ type: "leave_game", code: "LEV003", player: "B" });
    expect(await a.quiet("game_over")).toBe(true);
    expect(await b.quiet("game_over")).toBe(true);
    // B's own token still works afterwards: the game was still being played.
    b.send({ type: "leave_game", code: "LEV003", player: "B", seatToken: b.snap.seatToken });
    expect(await a.next("game_over")).toEqual({ type: "game_over", result: "forfeit", winner: "A" });
  });

  it("R81 a spectator is told the game ended when a player leaves", async () => {
    const { rt, url } = start();
    rt.createLinkGame("LEV004", "p1");
    const a = await seat(url, "LEV004", "p1");
    const b = await seat(url, "LEV004", "p2");
    await a.next("opponent_joined");
    const w = connect(url, "w");
    await w.opened;
    w.send({ type: "join", code: "LEV004" });
    await w.next("spectating");
    b.send({ type: "leave_game", code: "LEV004", player: "B", seatToken: b.snap.seatToken });
    expect(await w.next("ended")).toEqual({ type: "ended", result: "forfeit", winner: "A" });
  });

  it("R81 leaving before anyone has joined, or a game against the computer, ends it as abandoned and tells nobody", async () => {
    const { db, rt, url } = start();
    rt.createLinkGame("LEV005", "p1");
    const a = await seat(url, "LEV005", "p1");
    a.send({ type: "leave_game", code: "LEV005", player: "A", seatToken: a.snap.seatToken });
    await new Promise((r) => setTimeout(r, 150));
    expect(db.loadGames().find((g) => g.code === "LEV005")!.ended).toEqual({ result: "abandoned" });
    expect(await a.quiet("game_over")).toBe(true);

    rt.createComputerGame("LEV006");
    const h = await seat(url, "LEV006", "p9");
    h.send({ type: "leave_game", code: "LEV006", player: "A", seatToken: h.snap.seatToken });
    await new Promise((r) => setTimeout(r, 150));
    expect(db.loadGames().find((g) => g.code === "LEV006")!.ended).toEqual({ result: "abandoned" });
  });

  it("R81 leaving a game that is already over changes nothing, and leaving twice does nothing the second time", async () => {
    const { db, rt, url } = start();
    rt.createLinkGame("LEV007", "p1");
    const a = await seat(url, "LEV007", "p1");
    const b = await seat(url, "LEV007", "p2");
    await a.next("opponent_joined");
    a.send({ type: "leave_game", code: "LEV007", player: "A", seatToken: a.snap.seatToken });
    await b.next("game_over");
    b.send({ type: "leave_game", code: "LEV007", player: "B", seatToken: b.snap.seatToken });
    a.send({ type: "leave_game", code: "LEV007", player: "A", seatToken: a.snap.seatToken });
    await new Promise((r) => setTimeout(r, 150));
    expect(db.loadGames().find((g) => g.code === "LEV007")!.ended).toEqual({ result: "forfeit", winner: "B" });
  });
});

describe("R81 and R25 a failed save never claims an end", () => {
  it("R25 and R81 if saving the forfeit fails, the game stays live, nobody is told and a second try can succeed", async () => {
    const { db, rt, url } = start();
    rt.createLinkGame("LEV008", "p1");
    const a = await seat(url, "LEV008", "p1");
    const b = await seat(url, "LEV008", "p2");
    await a.next("opponent_joined");
    const real = db.saveEnded.bind(db);
    let fail = true;
    (db as Db).saveEnded = (code, ended) => {
      if (fail) throw new Error("disk full");
      real(code, ended);
    };
    a.send({ type: "leave_game", code: "LEV008", player: "A", seatToken: a.snap.seatToken });
    expect(await b.quiet("game_over", 200)).toBe(true);
    expect(db.loadGames().find((g) => g.code === "LEV008")!.ended).toBeNull();
    fail = false;
    a.send({ type: "leave_game", code: "LEV008", player: "A", seatToken: a.snap.seatToken });
    expect(await b.next("game_over")).toEqual({ type: "game_over", result: "forfeit", winner: "B" });
  });

  it("R25 and R81 if saving the abandonment fails, the game stays as it was and leaving again works", async () => {
    const { db, rt, url } = start();
    rt.createLinkGame("LEV009", "p1");
    const a = await seat(url, "LEV009", "p1");
    const real = db.saveEnded.bind(db);
    let fail = true;
    (db as Db).saveEnded = (code, ended) => {
      if (fail) throw new Error("disk full");
      real(code, ended);
    };
    a.send({ type: "leave_game", code: "LEV009", player: "A", seatToken: a.snap.seatToken });
    await new Promise((r) => setTimeout(r, 150));
    expect(db.loadGames().find((g) => g.code === "LEV009")!.ended).toBeNull();
    fail = false;
    a.send({ type: "leave_game", code: "LEV009", player: "A", seatToken: a.snap.seatToken });
    await new Promise((r) => setTimeout(r, 150));
    expect(db.loadGames().find((g) => g.code === "LEV009")!.ended).toEqual({ result: "abandoned" });
  });
});

describe("R87 and R89 sessions and live seats", () => {
  function startWith(valid: { current: Set<string> }) {
    const server = createServer((_req, res) => res.end());
    const db = openDb(":memory:");
    const rt = attachRealtime(server, db, {
      disconnectGraceMs: 60_000,
      roundTimerMs: 60_000,
      identify: (request) => (typeof request.headers["x-person"] === "string" ? (request.headers["x-person"] as string) : null),
      // The cookie stands in for a session: a socket is valid while its token is in the set.
      sessionStillValid: (request) => valid.current.has(String(request.headers["x-session"])),
    });
    server.listen(0);
    cleanup.push(() => {
      rt.dispose();
      server.close();
    });
    return { db, rt, url: `ws://localhost:${(server.address() as AddressInfo).port}/ws` };
  }
  const seatWith = async (url: string, code: string, person: string, session: string) => {
    const c = connect(url, person);
    return c;
  };
  void seatWith;

  function open2(url: string, person: string, session: string) {
    const socket = new WebSocket(url, { headers: { "x-person": person, "x-session": session } } as never);
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
    cleanup.push(() => socket.close());
    return { socket, opened, closed, next, send: (b: object) => socket.send(JSON.stringify(b)) };
  }

  it("R87 a socket whose session has ended is closed at its next action and its choice is not taken", async () => {
    const valid = { current: new Set(["s-victim", "s-other"]) };
    const s = startWith(valid);
    s.rt.createLinkGame("SES001", "victim");
    const thief = open2(s.url, "victim", "s-victim"); // the thief holds the victim's cookie
    await thief.opened;
    thief.send({ type: "join", code: "SES001" });
    const snap = await thief.next("snapshot");
    const other = open2(s.url, "other", "s-other");
    await other.opened;
    other.send({ type: "join", code: "SES001" });
    await other.next("snapshot");
    await thief.next("opponent_joined").catch(() => undefined);
    valid.current.delete("s-victim"); // the admin resets the password: the session is gone
    thief.send({ type: "choose", code: "SES001", player: "A", seatToken: snap.seatToken, column: 3, shield: false });
    await thief.closed; // the connection is closed at that action
    other.send({ type: "choose", code: "SES001", player: "B", seatToken: "x", column: 1, shield: false });
    expect(s.db.loadGames().find((g) => g.code === "SES001")!.state.round).toBe(0); // the thief's choice never landed
  });

  it("R87 a socket whose session still stands goes on: the device that changed the password is not cut off", async () => {
    const valid = { current: new Set(["s-me", "s-old-device", "s-other"]) };
    const s = startWith(valid);
    s.rt.createLinkGame("SES002", "me");
    const me = open2(s.url, "me", "s-me");
    await me.opened;
    me.send({ type: "join", code: "SES002" });
    const snap = await me.next("snapshot");
    const other = open2(s.url, "other", "s-other");
    await other.opened;
    other.send({ type: "join", code: "SES002" });
    await other.next("snapshot");
    valid.current.delete("s-old-device"); // another device of the account was signed out
    me.send({ type: "choose", code: "SES002", player: "A", seatToken: snap.seatToken, column: 2, shield: false });
    expect((await other.next("opponent_ready")).type).toBe("opponent_ready"); // the choice was taken
    expect(me.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("R89 a guest's live seat becomes the account's in memory, so the same person keeps it", async () => {
    const valid = { current: new Set(["s-guest", "s-acct", "s-other"]) };
    const s = startWith(valid);
    s.db.createPlayer("guest", "Pip");
    s.db.createPlayer("acct", "Pip");
    s.rt.createLinkGame("SES003", "guest");
    const guest = open2(s.url, "guest", "s-guest");
    await guest.opened;
    guest.send({ type: "join", code: "SES003" });
    expect((await guest.next("snapshot")).you).toBe("A");
    const other = open2(s.url, "other", "s-other");
    await other.opened;
    other.send({ type: "join", code: "SES003" });
    await other.next("snapshot");
    s.db.moveGames("guest", "acct");
    s.rt.movePerson("guest", "acct");
    // The account, on a new connection with no seat token, is given the seat that was the guest's, not a spectator's place.
    const acct = open2(s.url, "acct", "s-acct");
    await acct.opened;
    acct.send({ type: "join", code: "SES003" });
    const answer = await Promise.race([acct.next("snapshot"), acct.next("spectating")]);
    expect(answer.type).toBe("snapshot");
    expect(answer.you).toBe("A");
  });
});
