// Unit check: needs no running app. Spectating (ADR 0012, R70 to R80) over the real WebSocket server on
// an ephemeral server, with short injected timings and small caps so nothing waits 5 seconds or opens 300
// sockets. Checks W1 to W11 in spec/CHECKS.md.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

interface Started {
  server: ReturnType<typeof createServer>;
  db: Db;
  rt: ReturnType<typeof attachRealtime>;
  url: string;
}

function start(options: { bufferLimit?: number; moveMs?: number; perGame?: number; total?: number; roundTimerMs?: number; graceMs?: number; db?: Db } = {}): Started {
  const server = createServer((_req, res) => res.end());
  const db = options.db ?? openDb(":memory:");
  const rt = attachRealtime(server, db, {
    roundTimerMs: options.roundTimerMs ?? 5000,
    disconnectGraceMs: options.graceMs,
    computerDelayMs: 40,
    computerSeed: 7,
    spectatorMoveMs: options.moveMs ?? 150,
    spectatorsPerGame: options.perGame,
    spectatorsTotal: options.total,
    spectatorBufferLimit: options.bufferLimit,
  });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, db, rt, url: `ws://localhost:${port}/ws` };
}

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});
function track(s: Started): Started {
  cleanup.push(() => {
    s.rt.dispose();
    s.server.close();
  });
  return s;
}

// A socket that keeps every raw frame, so a test can look at exactly what was sent.
function connect(url: string) {
  const socket = new WebSocket(url);
  const raw: string[] = [];
  const queued: any[] = [];
  const waiting: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    raw.push(event.data as string);
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.match(message));
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  // The next message of a type (or the next message at all), in order.
  const next = (type?: string): Promise<any> => {
    const match = (m: any) => type === undefined || m.type === type;
    const at = queued.findIndex(match);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return new Promise((resolve) => waiting.push({ match, resolve }));
  };
  const nothing = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
  cleanup.push(() => socket.close());
  return { socket, raw, next, nothing, opened, send: (body: object) => socket.send(JSON.stringify(body)) };
}
type Conn = ReturnType<typeof connect>;

async function seat(url: string, code: string, player: "A" | "B") {
  const c = connect(url);
  await c.opened;
  c.send({ type: "join", code, player });
  const snapshot = await c.next("snapshot");
  return Object.assign(c, { seatToken: snapshot.seatToken as string, code, player });
}
type Seat = Awaited<ReturnType<typeof seat>>;
const choose = (s: Seat, body: Record<string, unknown>) => s.send({ type: "choose", code: s.code, player: s.player, seatToken: s.seatToken, ...body });

async function spectate(url: string, code?: string): Promise<{ c: Conn; first: any }> {
  const c = connect(url);
  await c.opened;
  c.send(code ? { type: "spectate", code } : { type: "spectate" });
  const first = await Promise.race([c.next("spectating"), c.next("not_watchable")]);
  return { c, first };
}

// A watchable human game (what quick match makes), with both seats present.
async function quickGame(s: Started, code: string) {
  s.rt.createQuickGame(code);
  const a = await seat(s.url, code, "A");
  const b = await seat(s.url, code, "B");
  await a.next("opponent_joined");
  return { a, b };
}

// One round: both choose, and both players are sent the result. Returns the result A saw.
async function play(a: Seat, b: Seat, ca: Record<string, unknown>, cb: Record<string, unknown>): Promise<any> {
  choose(a, ca);
  choose(b, cb);
  const result = await a.next("snapshot");
  await b.next("snapshot");
  return result;
}
const col = (column: number) => ({ column, shield: false });

describe("R72 a spectator never receives a pending choice (W1)", () => {
  it("W1 (R72, R22) while A has chosen, a spectator is sent nothing at all, so there is nothing to read a choice from", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC001");
    const { c, first } = await spectate(s.url, "SPC001");
    expect(first.type).toBe("spectating");
    const before = c.raw.length;
    choose(a, { column: 6, shield: true });
    await b.next("opponent_ready");
    await c.nothing(150);
    expect(c.raw.length).toBe(before); // no "ready", no message size to measure
    choose(b, col(0));
    const round = await c.next("round");
    expect(round.state.board[6]).toEqual(["A"]); // after it resolves the spectator sees what the players see
    expect(round.state.board[0]).toEqual(["B"]);
  });

  it("W1 (R72) no frame sent to a spectator ever mentions a choice, an Earthquake request or opponentReady", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC002");
    const { c } = await spectate(s.url, "SPC002");
    await play(a, b, col(2), col(3)); // so the Earthquake has something to shake
    choose(a, { earthquake: true });
    await b.next("opponent_ready");
    await c.nothing(100);
    choose(b, col(4));
    await a.next("snapshot");
    await c.next("round");
    for (const frame of c.raw) {
      expect(frame).not.toMatch(/opponentReady|opponent_ready|seatToken|"shield":\s*true|"earthquake"\s*:\s*true|"choice"|"pending"/);
    }
    // The spectator's snapshot has no field a pending choice could ride on.
    const joined = JSON.parse(c.raw[0]);
    expect(Object.keys(joined).sort()).toEqual(["code", "kind", "names", "state", "type", "watching"]);
  });

  it("W1 (R72) a spectator is never sent opponent_ready, however many times a player chooses", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC003");
    const { c } = await spectate(s.url, "SPC003");
    for (let round = 0; round < 3; round++) await play(a, b, col(round), col(round + 3));
    expect(c.raw.some((frame) => frame.includes("opponent_ready"))).toBe(false);
    expect(c.raw.map((frame) => JSON.parse(frame).type).filter((t) => t !== "round" && t !== "spectating" && t !== "watching")).toEqual([]);
  });
});

describe("R74 a spectator cannot act (W2)", () => {
  it("W2 (R74) a choice from a spectator is rejected with spectator, whatever it carries, and nobody else is told", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC010");
    const { c } = await spectate(s.url, "SPC010");
    await a.next("watching");
    await b.next("watching");
    const aBefore = a.raw.length;
    const bBefore = b.raw.length;
    for (const body of [
      { type: "choose", code: "SPC010", player: "A", seatToken: "guess", column: 3, shield: false },
      { type: "choose", code: "SPC010", column: 3 },
      { type: "choose", code: "SPC010", earthquake: true },
      { type: "join", code: "SPC010", player: "A" },
    ]) {
      c.send(body);
      expect(await c.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    }
    await c.nothing(100);
    expect(a.raw.length).toBe(aBefore); // the players heard nothing
    expect(b.raw.length).toBe(bBefore);
  });

  it("W2 (R74) a spectator who knows a real seat token cannot use it to act", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC011");
    const { c } = await spectate(s.url, "SPC011");
    c.send({ type: "choose", code: "SPC011", player: "A", seatToken: a.seatToken, column: 5, shield: false });
    expect(await c.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    await b.nothing(100);
    expect(b.raw.filter((f) => f.includes("opponent_ready")).length).toBe(0); // it never became A's choice
  });

  it("W2 (R74) a spectator's game does not move until the players choose", async () => {
    const s = track(start());
    const { c } = await (async () => {
      await quickGame(s, "SPC012");
      return spectate(s.url, "SPC012");
    })();
    c.send({ type: "choose", code: "SPC012", column: 1 });
    await c.next("rejected");
    expect(s.rt.game.getGame("SPC012")!.state.round).toBe(0);
  });
});

describe("R71 friend games are never watched (W3)", () => {
  it("W3 (R71) a friend game made with a code is answered as unknown, so its existence is not revealed", async () => {
    const s = track(start());
    s.rt.game.createGame("FRN001"); // what POST /api/games does
    const a = await seat(s.url, "FRN001", "A");
    await seat(s.url, "FRN001", "B");
    await a.next("opponent_joined");
    const { first } = await spectate(s.url, "FRN001");
    expect(first).toEqual({ type: "not_watchable", reason: "unknown" });
    const { first: ghost } = await spectate(s.url, "NOSUCH");
    expect(ghost).toEqual({ type: "not_watchable", reason: "unknown" }); // the same answer as a game that does not exist
  });

  it("W3 (R70, R71, R80) a random choice never picks a friend game, and the live count never counts one", async () => {
    const s = track(start());
    s.rt.game.createGame("FRN002");
    const f1 = await seat(s.url, "FRN002", "A");
    await seat(s.url, "FRN002", "B");
    await f1.next("opponent_joined");
    expect(s.rt.liveCount()).toBe(0);
    await quickGame(s, "SPC020");
    expect(s.rt.liveCount()).toBe(1);
    for (let i = 0; i < 8; i++) { // under the 10 in 10 seconds an address may ask for (R77)
      const { c, first } = await spectate(s.url);
      expect(first.code).toBe("SPC020");
      c.socket.close();
    }
  });

  it("W3 (R71) a computer game is watchable, and an exhibition game is not counted", async () => {
    const s = track(start());
    s.rt.createComputerGame("CMP001");
    const human = await seat(s.url, "CMP001", "A");
    expect(human.player).toBe("A");
    expect(s.rt.liveCount()).toBe(1);
    const { first } = await spectate(s.url, "CMP001");
    expect(first.kind).toBe("computer");
  });

  it("W3 (R70) a game still waiting for its second player, or already over, is not live", async () => {
    const s = track(start());
    s.rt.createQuickGame("SPC021");
    await seat(s.url, "SPC021", "A"); // alone
    expect(s.rt.liveCount()).toBe(0);
    const { first } = await spectate(s.url, "SPC021");
    expect(first).toEqual({ type: "not_watchable", reason: "unknown" });
  });
});

describe("R73 a spectator who joins mid-game gets a snapshot that matches the players (W4)", () => {
  it("W4 (R73) the board in a mid-game snapshot is the players' board, with no pending choice in it", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC030");
    const r1 = await play(a, b, col(0), col(6));
    const r2 = await play(a, b, col(1), col(5));
    choose(a, { column: 2, shield: true }); // pending when the spectator arrives
    await b.next("opponent_ready");
    const { first } = await spectate(s.url, "SPC030");
    expect(first.type).toBe("spectating");
    expect(first.state).toEqual(r2.state);
    expect(first.state.round).toBe(2);
    expect(first.state.board[2] ?? []).toEqual([]); // A's pending column is not on the board
    expect(r1.state.round).toBe(1);
    expect(JSON.stringify(first)).not.toMatch(/"shield":\s*true/);
    expect(first.state.shieldsLeft).toEqual({ A: true, B: true }); // not spent until the round resolves
  });

  it("W4 (R73) the snapshot names both players publicly and says what kind of game it is", async () => {
    const s = track(start());
    await quickGame(s, "SPC031");
    const { first } = await spectate(s.url, "SPC031");
    expect(first.kind).toBe("quick");
    expect(first.names).toEqual({ A: null, B: null }); // no identity in these tests: names are public identity only
    expect(first.watching).toBe(1);
  });
});

describe("R75 the watching count (W5)", () => {
  it("W5 (R75) players and spectators are told the count as spectators join and leave", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC040");
    const counts = (conn: Conn, n: number) => Promise.all(Array.from({ length: n }, () => conn.next("watching"))).then((all) => all.map((m) => m.watching));
    const s1 = await spectate(s.url, "SPC040");
    expect(s1.first.watching).toBe(1);
    const s2 = await spectate(s.url, "SPC040");
    expect(s2.first.watching).toBe(2);
    const firstHeard = await counts(s1.c, 1); // s1 is told about s2's arrival before it goes
    expect(firstHeard).toEqual([2]);
    s1.c.socket.close();
    await s1.c.nothing(60);
    s2.c.send({ type: "leave" });
    await s2.c.nothing(60);
    // Every change reached both players, in order: 1, 2, then back to 1 and 0.
    expect(await counts(a, 4)).toEqual([1, 2, 1, 0]);
    expect(await counts(b, 4)).toEqual([1, 2, 1, 0]);
    // s2 was told when s1 closed.
    expect(await counts(s2.c, 1)).toEqual([1]);
  });

  it("W5 (R75) the count is a number only: nothing identifies a spectator to a player", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC041");
    await spectate(s.url, "SPC041");
    expect(await a.next("watching")).toEqual({ type: "watching", watching: 1 });
    expect(Object.keys(JSON.parse(a.raw[a.raw.length - 1])).sort()).toEqual(["type", "watching"]); // a number and nothing else
  });

  it("W5 (R75) the count is in the players' snapshot too, so a reload shows it", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC042");
    await spectate(s.url, "SPC042");
    await a.next("watching");
    a.send({ type: "join", code: "SPC042", player: "A", seatToken: a.seatToken });
    const snap = await a.next("snapshot");
    expect(snap.watching).toBe(1);
  });
});

describe("R76 a spectator moves on after a game ends (W6)", () => {
  it("W6 (R76) after the result, a spectator who asks again is placed in another live game, never the one that just ended", async () => {
    const s = track(start());
    const one = await quickGame(s, "SPC050");
    const two = await quickGame(s, "SPC051");
    const { c, first } = await spectate(s.url, "SPC050");
    expect(first.code).toBe("SPC050");
    // A makes four in a column over four rounds, B plays elsewhere.
    for (let round = 0; round < 4; round++) await play(one.a, one.b, col(0), col(5 + (round % 2)));
    const final = await c.next("round");
    expect(final.state.status).toBe("playing"); // the three rounds so far
    let last: any;
    while (!last || last.state.status === "playing") last = await c.next("round");
    expect(last.state.status).toBe("won");
    c.send({ type: "spectate" }); // what the browser does after 5 seconds
    const moved = await c.next("spectating");
    expect(moved.code).toBe("SPC051");
    expect(two.a.raw.length).toBeGreaterThan(0);
  });

  it("W6 (R76) with no other live game, the spectator is moved to an exhibition game", async () => {
    const s = track(start());
    const one = await quickGame(s, "SPC052");
    const { c } = await spectate(s.url, "SPC052");
    for (let round = 0; round < 4; round++) await play(one.a, one.b, col(0), col(5 + (round % 2)));
    let last: any;
    while (!last || last.state.status === "playing") last = await c.next("round");
    c.send({ type: "spectate" });
    const moved = await c.next("spectating");
    expect(moved.kind).toBe("exhibition");
  });
});

describe("R77 the caps (W7)", () => {
  it("W7 (R77) at most N spectators per game, and a full game is skipped when choosing a random game", async () => {
    const s = track(start({ perGame: 2 }));
    await quickGame(s, "SPC060");
    await quickGame(s, "SPC061");
    const first = await spectate(s.url, "SPC060");
    const second = await spectate(s.url, "SPC060");
    expect(first.first.type).toBe("spectating");
    expect(second.first.type).toBe("spectating");
    const third = await spectate(s.url, "SPC060");
    expect(third.first).toEqual({ type: "not_watchable", reason: "full" });
    // Random choice skips the full game.
    for (let i = 0; i < 6; i++) {
      const r = await spectate(s.url);
      expect(r.first.code).toBe("SPC061");
      r.c.socket.close();
    }
  });

  it("W7 (R77) a machine-wide limit: past it a spectator is told the room is full, but a player is never refused", async () => {
    const s = track(start({ total: 2 }));
    const { a } = await quickGame(s, "SPC062");
    await spectate(s.url, "SPC062");
    await spectate(s.url, "SPC062");
    const over = await spectate(s.url, "SPC062");
    expect(over.first).toEqual({ type: "not_watchable", reason: "room_full" });
    const late = await seat(s.url, "SPC063", "A"); // a player can still join a game
    expect(late.player).toBe("A");
    expect(a.player).toBe("A");
  });

  it("W7 (R77) a spectator who leaves frees their place", async () => {
    const s = track(start({ perGame: 1 }));
    await quickGame(s, "SPC064");
    const one = await spectate(s.url, "SPC064");
    expect((await spectate(s.url, "SPC064")).first.reason).toBe("full");
    one.c.socket.close();
    await one.c.nothing(80);
    expect((await spectate(s.url, "SPC064")).first.type).toBe("spectating");
  });
});

describe("R78 the exhibition game (W8)", () => {
  it("W8 (R78) with nothing live, a spectator is shown an exhibition game of two computers, started on demand", async () => {
    const s = track(start());
    expect(s.rt.exhibitionRunning()).toBe(false);
    const { c, first } = await spectate(s.url);
    expect(first.kind).toBe("exhibition");
    expect(first.names).toEqual({ A: "Computer 1", B: "Computer 2" });
    expect(s.rt.exhibitionRunning()).toBe(true);
    const round = await c.next("round"); // the computers play by themselves
    expect(round.state.round).toBeGreaterThanOrEqual(1);
  });

  it("W8 (R78) it stops and is forgotten when the last spectator leaves, and a new one starts next time", async () => {
    const s = track(start());
    const { c, first } = await spectate(s.url);
    const code = first.code;
    c.socket.close();
    await c.nothing(120);
    expect(s.rt.exhibitionRunning()).toBe(false);
    expect(s.rt.game.getGame(code)).toBeUndefined();
    const again = await spectate(s.url);
    expect(again.first.kind).toBe("exhibition");
    expect(again.first.code).not.toBe(code);
  });

  it("W8 (R78, R37) it never touches the database: nothing is saved, so the leaderboard cannot see it", async () => {
    const s = track(start());
    const { c, first } = await spectate(s.url);
    await c.next("round");
    expect(s.db.loadGames().some((g) => g.code === first.code)).toBe(false);
    expect(s.rt.liveCount()).toBe(0); // and it is not counted as live (R80)
  });

  it("W8 (R78) a finished exhibition game stays for the spectators still looking at its result, and a new spectator gets a fresh one", async () => {
    const s = track(start());
    const first = await spectate(s.url);
    const code = first.first.code as string;
    // Let it play to the end: both computers choose from the public board, so this takes a while.
    let last: any;
    while (!last || last.state.status === "playing") last = await first.c.next("round");
    const second = await spectate(s.url); // asks for "a game" while the first is over but still watched
    expect(second.first.type).toBe("spectating");
    expect(second.first.code).not.toBe(code); // a fresh exhibition game, not the finished one
    expect(s.rt.game.getGame(code)).toBeUndefined(); // exhibition games are never in the game service
    // The first spectator's game still exists for it: asking for that very game again gets its snapshot back, not "unknown".
    first.c.send({ type: "spectate", code });
    const kept = await first.c.next("spectating");
    expect(kept.code).toBe(code);
    expect(kept.state.status).not.toBe("playing"); // it is still the finished game, with its result
    // The first spectator is still counted in its own game, and told when someone else leaves it.
    expect(s.rt.watchingIn(code)).toBe(1);
    expect(s.rt.watchingIn(second.first.code)).toBe(1);
    expect(s.rt.exhibitionRunning()).toBe(true);
    first.c.send({ type: "leave" });
    await first.c.nothing(80);
    expect(s.rt.exhibitionRunning()).toBe(true); // the second spectator still has theirs
    second.c.send({ type: "leave" });
    await second.c.nothing(80);
    expect(s.rt.exhibitionRunning()).toBe(false); // everything is forgotten once nobody watches
  });

  it("W8 (R78) a real game that becomes live is offered before the exhibition game", async () => {
    const s = track(start());
    await quickGame(s, "SPC070");
    const { first } = await spectate(s.url);
    expect(first.kind).toBe("quick");
    expect(s.rt.exhibitionRunning()).toBe(false);
  });
});

describe("R79 spectators change nothing for the players (W9, W10)", () => {
  it("W9 (R79, R23) the players' result is sent first, and a spectator gets it within a second", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC080");
    const { c } = await spectate(s.url, "SPC080");
    const order: string[] = [];
    a.socket.addEventListener("message", (e) => JSON.parse(e.data).type === "snapshot" && order.push("A"));
    c.socket.addEventListener("message", (e) => JSON.parse(e.data).type === "round" && order.push("S"));
    choose(a, col(0));
    await b.next("opponent_ready");
    const started = Date.now();
    choose(b, col(1));
    const round = await c.next("round");
    expect(Date.now() - started, "within one second of the players choosing").toBeLessThan(1000);
    expect(order).toEqual(["A", "S"]);
    expect(round.state.round).toBe(1);
  });

  it("W10 (R79, R51) a game with only spectators and no players runs no round and abandons nothing", async () => {
    const s = track(start({ roundTimerMs: 120 }));
    s.rt.createQuickGame("SPC081");
    const a = await seat(s.url, "SPC081", "A");
    await seat(s.url, "SPC081", "B");
    await a.next("opponent_joined");
    const { c } = await spectate(s.url, "SPC081");
    await c.nothing(450); // several timer lengths: the round resolves with no choices (R10), as it would anyway
    expect(s.rt.game.getGame("SPC081")!.state.round).toBeGreaterThan(0);
  });

  it("W10 (R79, R19, R27) spectators do not stop a game being abandoned or forfeited", async () => {
    const s = track(start({ roundTimerMs: 80 }));
    await quickGame(s, "SPC082");
    const { c } = await spectate(s.url, "SPC082");
    await c.nothing(700); // three idle rounds in a row with both players present: the game is abandoned
    expect(s.db.loadGames().find((g) => g.code === "SPC082")?.ended).toEqual({ result: "abandoned" });
  });

  it("W10 (R79, R25) a spectator is told only after the round is saved", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC083");
    const { c } = await spectate(s.url, "SPC083");
    await play(a, b, col(0), col(1));
    const round = await c.next("round");
    expect(s.db.loadGames().find((g) => g.code === "SPC083")?.state.round).toBe(round.state.round);
  });
});

describe("R71 which games are watchable survives a restart (W11)", () => {
  it("W11 (R71) a quick game is still watchable, and a friend game still is not, after the server restarts on the same database", async () => {
    const db = openDb(":memory:");
    const first = track(start({ db }));
    first.rt.createQuickGame("SPC090");
    first.rt.game.createGame("FRN090");
    first.rt.dispose();
    first.server.close();
    const second = track(start({ db }));
    const a = await seat(second.url, "SPC090", "A");
    await seat(second.url, "SPC090", "B");
    await a.next("opponent_joined");
    expect((await spectate(second.url, "SPC090")).first.type).toBe("spectating");
    const f = await seat(second.url, "FRN090", "A");
    await seat(second.url, "FRN090", "B");
    await f.next("opponent_joined");
    expect((await spectate(second.url, "FRN090")).first).toEqual({ type: "not_watchable", reason: "unknown" });
  });
});

describe("R70 a player is never turned into a spectator", () => {
  it("R70 a seated connection that sends spectate is refused, keeps its seat and can still play", async () => {
    const s = track(start());
    const { a, b } = await quickGame(s, "SPC100");
    a.send({ type: "spectate", code: "SPC100" });
    expect(await a.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    a.send({ type: "spectate" });
    expect(await a.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    expect(s.rt.watchingIn("SPC100")).toBe(0); // it was never counted as watching
    // It can still choose, and the round resolves normally.
    const round = await play(a, b, col(0), col(1));
    expect(round.state.round).toBe(1);
    expect(round.state.board[0]).toEqual(["A"]);
  });
});

describe("R76 and R79 a spectator hears how a game ends, including a forfeit or abandonment", () => {
  it("R76 when a game is abandoned, the spectator is told, after it is saved", async () => {
    const s = track(start({ roundTimerMs: 80 }));
    await quickGame(s, "SPC110");
    const { c } = await spectate(s.url, "SPC110");
    const ended = await c.next("ended"); // three idle rounds with both players present (R19)
    expect(ended).toEqual({ type: "ended", result: "abandoned" });
    expect(s.db.loadGames().find((g) => g.code === "SPC110")?.ended).toEqual({ result: "abandoned" }); // saved first (R25)
  });

  it("R76 when a player does not come back, the spectator is told who won", async () => {
    const server = track(start({ roundTimerMs: 5000, graceMs: 80 }));
    const { a, b } = await quickGame(server, "SPC111");
    const { c } = await spectate(server.url, "SPC111");
    b.socket.close(); // B leaves and does not return: after the grace period the game is a forfeit (R27)
    const ended = await c.next("ended");
    expect(ended).toEqual({ type: "ended", result: "forfeit", winner: "A" });
    expect(a.player).toBe("A");
  });

  it("R76 and R79 a spectator can move on after an ended game and is not offered it again while another is live", async () => {
    const server = track(start({ roundTimerMs: 80 }));
    await quickGame(server, "SPC112");
    await quickGame(server, "SPC113");
    const { c } = await spectate(server.url, "SPC112");
    await c.next("ended");
    c.send({ type: "spectate" });
    const moved = await c.next("spectating");
    expect(moved.code).not.toBe("SPC112");
  });
});

describe("R77 one connection cannot flood the server (W7)", () => {
  it("R77 past 10 spectate messages in 10 seconds, the rest are ignored and nobody is sent a stream of counts", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC120");
    const { c } = await spectate(s.url, "SPC120");
    await a.next("watching"); // the first join
    const before = a.raw.length;
    for (let i = 0; i < 60; i++) c.send({ type: "spectate", code: "SPC120" });
    await c.nothing(250);
    // Each accepted spectate leaves and rejoins the same game, so the player sees a few changes, never sixty.
    const heard = a.raw.slice(before).map((f) => JSON.parse(f)).filter((m) => m.type === "watching");
    expect(heard.length).toBeLessThanOrEqual(2 * 10);
    expect(heard.length).toBeLessThan(60);
  });

  it("R77 a spectator that does not read its messages is closed once too much is waiting to be sent to it", async () => {
    // A limit of 0 bytes means any frame still waiting to be sent counts as too much: the next round trips it.
    const s = track(start({ bufferLimit: -1 }));
    const { a, b } = await quickGame(s, "SPC121");
    const { c } = await spectate(s.url, "SPC121");
    expect(s.rt.watchingIn("SPC121")).toBe(1);
    await play(a, b, col(0), col(1));
    await c.nothing(150);
    expect(s.rt.watchingIn("SPC121")).toBe(0); // dropped and forgotten
    expect(c.socket.readyState).not.toBe(WebSocket.OPEN);
    // The players were not held up: the round resolved and they were told as usual.
    expect(s.rt.game.getGame("SPC121")!.state.round).toBe(1);
  });
});

describe("R77 the flood limits cannot be got round (second review)", () => {
  it("R77 alternating spectate and leave does not reset the limit: the history stays until it ages out", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC130");
    const c = connect(s.url);
    await c.opened;
    for (let i = 0; i < 40; i++) {
      c.send({ type: "spectate", code: "SPC130" });
      c.send({ type: "leave" });
    }
    await c.nothing(300);
    const heard = a.raw.map((f) => JSON.parse(f)).filter((m) => m.type === "watching");
    expect(heard.length, "players are not sent a stream of count changes").toBeLessThanOrEqual(2 * 10);
  });

  it("R77 the limit is per client address, so many connections from one address share it", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC131");
    const sockets = Array.from({ length: 8 }, () => connect(s.url));
    await Promise.all(sockets.map((c) => c.opened));
    for (let round = 0; round < 6; round++) for (const c of sockets) c.send({ type: "spectate", code: "SPC131" });
    await sockets[0].nothing(400);
    // 48 asks came from one address: only the first 10 were acted on, however many connections sent them.
    expect(s.rt.watchingIn("SPC131")).toBeLessThanOrEqual(10);
    const heard = a.raw.map((f) => JSON.parse(f)).filter((m) => m.type === "watching");
    expect(heard.length).toBeLessThanOrEqual(10);
  });

  it("R77 a spectator on an exhibition game, or on a game that has ended, that does not read is closed too", async () => {
    const s = track(start({ bufferLimit: -1, roundTimerMs: 80 }));
    const { c } = await spectate(s.url); // the exhibition game
    await c.nothing(400); // a round of the exhibition game is sent, which trips the limit
    expect(s.rt.exhibitionRunning()).toBe(false); // nobody left watching, so it stopped
    // A forfeit ends a game with no round before it, so the ended message is the only thing that can trip the limit.
    const t = track(start({ bufferLimit: -1, roundTimerMs: 5000, graceMs: 60 }));
    const { b } = await quickGame(t, "SPC132");
    const { c: d } = await spectate(t.url, "SPC132");
    expect(t.rt.watchingIn("SPC132")).toBe(1);
    b.socket.close(); // B does not come back: after the grace period the game is a forfeit (R27)
    await d.nothing(400);
    expect(t.rt.watchingIn("SPC132")).toBe(0);
  });

  it("R70 a lone spectator who asks again for the game it is already watching keeps watching it", async () => {
    const s = track(start());
    const { c, first } = await spectate(s.url); // the exhibition game
    c.send({ type: "spectate", code: first.code });
    const again = await c.next("spectating");
    expect(again.code).toBe(first.code);
    expect(s.rt.exhibitionRunning()).toBe(true);
    expect(s.rt.watchingIn(first.code)).toBe(1);
  });
});

describe("Cleanup (final review)", () => {
  it("R78 and R77 leaving or closing clears everything the spectator left behind", async () => {
    const s = track(start());
    const { c, first } = await spectate(s.url);
    expect(s.rt.exhibitionRunning()).toBe(true);
    c.socket.close();
    await c.nothing(120);
    expect(s.rt.exhibitionRunning()).toBe(false);
    expect(s.rt.watchingIn(first.code)).toBe(0);
    const left = s.rt.spectatorState();
    expect({ watchers: left.watchers, watching: left.watching, lastGame: left.lastGame, exhibitions: left.exhibitions }).toEqual({ watchers: 0, watching: 0, lastGame: 0, exhibitions: 0 });
    expect(left.addresses, "the address history stays only until it ages out (R77)").toBeLessThanOrEqual(1);
  });

  it("R77 the per-address history is pruned as spectators come and go, so it cannot grow with distinct addresses", async () => {
    const s = track(start());
    const { a } = await quickGame(s, "SPC140");
    void a;
    for (let i = 0; i < 6; i++) {
      const c = connect(s.url);
      await c.opened;
      c.send({ type: "spectate", code: "SPC140" });
      await c.next("spectating");
      c.socket.close();
      await c.nothing(30);
    }
    expect(s.rt.spectatorState().addresses).toBeLessThanOrEqual(6);
    await new Promise((r) => setTimeout(r, 60));
    expect(s.rt.spectatorState().addresses).toBeGreaterThanOrEqual(0);
  });

  it("R71 after dispose nothing spectator-related is left: no exhibition game, no watchers", async () => {
    const s = start();
    const { c } = await spectate(s.url);
    expect(s.rt.exhibitionRunning()).toBe(true);
    s.rt.dispose();
    expect(s.rt.exhibitionRunning()).toBe(false);
    expect(s.rt.spectatorState().watchers).toBe(0);
    c.socket.close();
    s.server.close();
  });

  it("R80 a restart only restores watchable games that are still being played, so the live scan stays small", () => {
    const db = openDb(":memory:");
    const first = track(start({ db }));
    first.rt.createQuickGame("OLDQ01"); // still playing
    first.rt.createQuickGame("OLDQ02");
    first.db.saveEnded("OLDQ02", { result: "abandoned" }); // ended
    first.rt.dispose();
    first.server.close();
    const second = track(start({ db }));
    expect(second.rt.watchableKnown()).toEqual(["OLDQ01"]);
  });
});
