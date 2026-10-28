// Unit check: needs no running app. The start countdown (R97, ADR 0014) on an ephemeral server. The countdown here is
// 400ms rather than 3 seconds so the checks are quick; the length itself is checked against the constant.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime, START_COUNTDOWN_MS } from "../src/server/realtime.ts";

const COUNTDOWN = 400;

function start(options: { db?: Db; roundTimerMs?: number; graceMs?: number } = {}) {
  const server = createServer((_req, res) => res.end());
  const db = options.db ?? openDb(":memory:");
  const rt = attachRealtime(server, db, {
    disconnectGraceMs: options.graceMs ?? 60_000,
    roundTimerMs: options.roundTimerMs ?? 60_000,
    computerDelayMs: 20,
    computerSeed: 3,
    countdownMs: COUNTDOWN,
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
  const all: any[] = [];
  const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string);
    all.push({ at: Date.now(), message });
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
  const has = (type: string) => all.some((m) => m.message.type === type);
  cleanup.push(() => socket.close());
  return { socket, opened, next, has, all, send: (body: object) => socket.send(JSON.stringify(body)) };
}

async function seat(url: string, code: string, person: string) {
  const c = connect(url, person);
  await c.opened;
  c.send({ type: "join", code });
  const snap = await c.next("snapshot");
  return { ...c, snap, token: snap.seatToken as string, you: snap.you as "A" | "B" };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("R97 every game starts with a countdown", () => {
  it("R97 the countdown is 3 seconds", () => {
    expect(START_COUNTDOWN_MS).toBe(3_000);
  });

  it("R97 when the second player joins, both are sent the countdown, and round 1 opens only when it ends, with started", async () => {
    const s = start();
    s.rt.createLinkGame("CDN001", "p1");
    const a = await seat(s.url, "CDN001", "p1");
    expect(a.snap.started).toBe(false); // nobody else yet: no countdown, no round (R51)
    await wait(COUNTDOWN + 100);
    expect(a.has("countdown")).toBe(false);
    const joinedAt = Date.now();
    const b = await seat(s.url, "CDN001", "p2");
    const ca = await a.next("countdown");
    const cb = await b.next("countdown");
    expect(ca).toEqual({ type: "countdown", ms: COUNTDOWN });
    expect(cb.ms).toBeGreaterThan(COUNTDOWN - 100);
    await a.next("started");
    await b.next("started");
    expect(Date.now() - joinedAt, "round 1 opened after the countdown").toBeGreaterThanOrEqual(COUNTDOWN - 20);
  });

  it("R97 a choice during the countdown is refused with not_started and the opponent hears nothing", async () => {
    const s = start();
    s.rt.createLinkGame("CDN002", "p1");
    const a = await seat(s.url, "CDN002", "p1");
    const b = await seat(s.url, "CDN002", "p2");
    await a.next("countdown");
    a.send({ type: "choose", code: "CDN002", player: "A", seatToken: a.token, column: 3, shield: false });
    expect(await a.next("rejected")).toEqual({ type: "rejected", reason: "not_started" });
    await wait(50);
    expect(b.has("opponent_ready"), "the opponent is told nothing").toBe(false);
    // After it ends, the same choice is accepted.
    await a.next("started");
    a.send({ type: "choose", code: "CDN002", player: "A", seatToken: a.token, column: 3, shield: false });
    expect(await b.next("opponent_ready")).toEqual({ type: "opponent_ready" });
  });

  it("R97 R18 no round timer runs during the countdown: with a short round timer, no round resolves before the countdown has ended", async () => {
    const s = start({ roundTimerMs: 150 });
    s.rt.createLinkGame("CDN003", "p1");
    const a = await seat(s.url, "CDN003", "p1");
    const b = await seat(s.url, "CDN003", "p2");
    await a.next("countdown");
    await wait(COUNTDOWN - 100);
    const resolvedEarly = a.all.filter((m) => m.message.type === "snapshot" && m.message.state.round > 0);
    expect(resolvedEarly, "no round resolved during the countdown").toEqual([]);
    await a.next("started");
    const first = await (async () => {
      for (;;) {
        const snap = await a.next("snapshot");
        if (snap.state.round >= 1) return snap;
      }
    })();
    expect(first.state.round).toBe(1); // round 1 timed out only after the countdown ended
    void b;
  });

  it("R97 R52 in a computer game the countdown runs when the human joins, and the computer chooses only after it", async () => {
    const s = start();
    s.rt.createComputerGame("CDN004");
    const a = await seat(s.url, "CDN004", "p1");
    expect(await a.next("countdown")).toEqual({ type: "countdown", ms: COUNTDOWN });
    await wait(COUNTDOWN - 100);
    expect(a.has("opponent_ready"), "the computer has not chosen during the countdown").toBe(false);
    await a.next("started");
    expect(await a.next("opponent_ready")).toEqual({ type: "opponent_ready" });
  });

  it("R97 a player who reconnects during the countdown is told the time left, and the snapshot says it has not started", async () => {
    const s = start();
    s.rt.createLinkGame("CDN005", "p1");
    const a = await seat(s.url, "CDN005", "p1");
    await seat(s.url, "CDN005", "p2");
    await a.next("countdown");
    await wait(150);
    const again = connect(s.url, "p1");
    await again.opened;
    again.send({ type: "join", code: "CDN005", player: "A", seatToken: a.token });
    const snap = await again.next("snapshot");
    expect(snap.started).toBe(false);
    const left = await again.next("countdown");
    expect(left.ms).toBeLessThan(COUNTDOWN - 100);
    expect(left.ms).toBeGreaterThan(0);
    await again.next("started");
    const after = connect(s.url, "p1");
    await after.opened;
    after.send({ type: "join", code: "CDN005", player: "A", seatToken: a.token });
    expect((await after.next("snapshot")).started).toBe(true);
  });

  it("R97 R85 a rematch starts with a new countdown", async () => {
    const s = start();
    s.rt.createLinkGame("CDN006", "p1");
    const a = await seat(s.url, "CDN006", "p1");
    const b = await seat(s.url, "CDN006", "p2");
    await a.next("started");
    await b.next("started");
    for (let i = 0; i < 4; i++) {
      a.send({ type: "choose", code: "CDN006", player: "A", seatToken: a.token, column: 0, shield: false });
      b.send({ type: "choose", code: "CDN006", player: "B", seatToken: b.token, column: 1 + (i % 2), shield: false });
      await a.next("snapshot");
    }
    a.send({ type: "rematch", code: "CDN006", player: "A", seatToken: a.token });
    b.send({ type: "rematch", code: "CDN006", player: "B", seatToken: b.token });
    await a.next("rematch_started");
    expect((await a.next("countdown")).ms).toBe(COUNTDOWN);
    expect((await b.next("countdown")).ms).toBe(COUNTDOWN);
    await a.next("started");
  });

  it("R97 R72 a spectator is never sent the countdown or started", async () => {
    const s = start();
    s.rt.createLinkGame("CDN007", "p1");
    const a = await seat(s.url, "CDN007", "p1");
    await seat(s.url, "CDN007", "p2");
    const watcher = connect(s.url, "p3");
    await watcher.opened;
    watcher.send({ type: "join", code: "CDN007" });
    await watcher.next("spectating");
    await a.next("started");
    await wait(50);
    expect(watcher.has("countdown")).toBe(false);
    expect(watcher.has("started")).toBe(false);
  });

  it("R97 R51 if a player leaves during the countdown, round 1 does not open, and the countdown runs again when both are back", async () => {
    const s = start();
    s.rt.createLinkGame("CDN008", "p1");
    const a = await seat(s.url, "CDN008", "p1");
    const b = await seat(s.url, "CDN008", "p2");
    await b.next("countdown");
    b.socket.close();
    await wait(COUNTDOWN + 150);
    expect(a.has("started"), "round 1 did not open with a seat empty").toBe(false);
    const back = await seat(s.url, "CDN008", "p2");
    expect((await back.next("countdown")).ms).toBe(COUNTDOWN);
    await a.next("started");
  });
});
