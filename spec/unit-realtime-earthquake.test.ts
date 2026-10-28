// Unit check: needs no running app. Earthquake over the real WebSocket server (R53 to R58, R21, R22)
// on an ephemeral server, so a pending Earthquake can be shown never to reach the opponent.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

function startServer() {
  const server = createServer((_req, res) => res.end());
  const db = openDb(":memory:");
  const rt = attachRealtime(server, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0, roundTimerMs: 5000, computerDelayMs: 50, computerSeed: 1 });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, rt, url: `ws://localhost:${port}/ws` };
}

function queue(socket: WebSocket, raw: string[]): () => Promise<any> {
  const queued: any[] = [];
  const waiting: Array<(v: any) => void> = [];
  socket.addEventListener("message", (e) => {
    raw.push(e.data as string);
    const m = JSON.parse(e.data as string);
    const w = waiting.shift();
    if (w) w(m);
    else queued.push(m);
  });
  return () => new Promise((resolve) => (queued.length ? resolve(queued.shift()) : waiting.push(resolve)));
}

async function seat(url: string, code: string, player: "A" | "B") {
  const socket = new WebSocket(url);
  const raw: string[] = [];
  const next = queue(socket, raw);
  await new Promise((r) => socket.addEventListener("open", () => r(null), { once: true }));
  socket.send(JSON.stringify({ type: "join", code, player }));
  const snapshot = await next();
  return { socket, next, raw, seatToken: snapshot.seatToken as string, code, player };
}

type Seat = Awaited<ReturnType<typeof seat>>;
const send = (s: Seat, body: Record<string, unknown>) => s.socket.send(JSON.stringify({ type: "choose", code: s.code, player: s.player, seatToken: s.seatToken, ...body }));
const quiet = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

// Two seated players with one piece on the board, so an Earthquake is allowed (R55).
async function startedGame(code: string) {
  const { server, rt, url } = startServer();
  cleanup = () => {
    rt.dispose();
    server.close();
  };
  const a = await seat(url, code, "A");
  const b = await seat(url, code, "B");
  expect(await a.next()).toEqual({ type: "opponent_joined" });
  send(a, { column: 0, shield: false });
  expect(await b.next()).toEqual({ type: "opponent_ready" });
  send(b, { column: 3, shield: false });
  expect((await a.next()).state.round).toBe(1);
  expect((await b.next()).state.round).toBe(1);
  return { a, b };
}

describe("R54 an Earthquake choice is hidden until the round resolves (R21, R22)", () => {
  it("R22 the opponent hears only opponent_ready, the same message as for a column choice", async () => {
    const { a, b } = await startedGame("EQK001");
    const before = b.raw.length;
    send(a, { earthquake: true });
    expect(await b.next()).toEqual({ type: "opponent_ready" });
    await quiet(100);
    for (const raw of b.raw.slice(before)) {
      expect(raw.toLowerCase()).not.toContain("earthquake");
      expect(raw).toBe(JSON.stringify({ type: "opponent_ready" }));
    }
    expect(b.raw.length - before).toBe(1);
  });

  it("R22 a snapshot sent to the opponent mid-round does not reveal a pending Earthquake", async () => {
    const { a, b } = await startedGame("EQK002");
    send(a, { earthquake: true });
    expect(await b.next()).toEqual({ type: "opponent_ready" });
    const url = (b.socket as WebSocket).url;
    b.socket.close();
    const again = new WebSocket(url);
    const raw: string[] = [];
    const next = queue(again, raw);
    await new Promise((r) => again.addEventListener("open", () => r(null), { once: true }));
    again.send(JSON.stringify({ type: "join", code: "EQK002", player: "B", seatToken: b.seatToken }));
    const snapshot = await next();
    expect(snapshot.opponentReady).toBe(true);
    expect(snapshot.state.earthquakesLeft).toEqual({ A: true, B: true }); // not spent until the round resolves
    expect(JSON.stringify(snapshot)).not.toMatch(/"earthquake"\s*:\s*true/);
    again.close();
  });

  it("R22 a rejected Earthquake produces no message to the opponent", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => {
      rt.dispose();
      server.close();
    };
    const a = await seat(url, "EQK003", "A");
    const b = await seat(url, "EQK003", "B");
    await a.next(); // opponent_joined
    send(a, { earthquake: true }); // the board is empty (R55)
    expect(await a.next()).toEqual({ type: "rejected", reason: "nothing_to_shake" });
    await quiet(100);
    expect(b.raw.length).toBe(1); // only its own snapshot
  });
});

describe("R53 to R58 Earthquake through the server", () => {
  it("R56 an Earthquake and a disc resolve together: the bottom row goes, then the disc drops, and the snapshot says it is spent", async () => {
    const { a, b } = await startedGame("EQK004");
    send(a, { earthquake: true });
    await b.next(); // opponent_ready
    send(b, { column: 5, shield: false });
    const result = await a.next();
    expect(result.state.round).toBe(2);
    expect(result.state.board).toEqual([[], [], [], [], [], ["B"], []]); // A's disc in column 0 and B's in column 3 were both in the bottom row
    expect(result.state.earthquakesLeft).toEqual({ A: false, B: true });
    expect((await b.next()).state).toEqual(result.state);
  });

  it("R57 both players choosing Earthquake shake once", async () => {
    const { a, b } = await startedGame("EQK005");
    send(a, { earthquake: true });
    await b.next();
    send(b, { earthquake: true });
    const result = await a.next();
    expect(result.state.board.flat()).toEqual([]);
    expect(result.state.earthquakesLeft).toEqual({ A: false, B: false });
  });

  it("R53 a shield with an Earthquake is rejected as one_power_up, and the choice stands unmade", async () => {
    const { a, b } = await startedGame("EQK006");
    send(a, { earthquake: true, shield: true });
    expect(await a.next()).toEqual({ type: "rejected", reason: "one_power_up" });
    send(a, { earthquake: true, column: 2 });
    expect(await a.next()).toEqual({ type: "rejected", reason: "one_power_up" });
    send(a, { earthquake: true }); // still allowed: the first two were not accepted
    expect(await b.next()).toEqual({ type: "opponent_ready" });
  });

  it("R53 a spent Earthquake is rejected as no_earthquake", async () => {
    const { a, b } = await startedGame("EQK007");
    send(a, { earthquake: true });
    await b.next();
    send(b, { column: 1, shield: false });
    await a.next();
    await b.next();
    send(a, { earthquake: true });
    expect(await a.next()).toEqual({ type: "rejected", reason: "no_earthquake" });
  });

  it("R54 an Earthquake choice is final (R4): a second choice is already_chosen", async () => {
    const { a } = await startedGame("EQK008");
    send(a, { earthquake: true });
    send(a, { column: 4, shield: false });
    expect(await a.next()).toEqual({ type: "rejected", reason: "already_chosen" });
  });

  it("R54 a malformed earthquake flag is ignored, never read as a choice", async () => {
    const { a, b } = await startedGame("EQK009");
    const before = b.raw.length;
    send(a, { earthquake: "yes" });
    send(a, { earthquake: 1 });
    await quiet(100);
    expect(b.raw.length).toBe(before); // nothing was accepted, so the opponent heard nothing
  });
});

// ---- The shrinking board over the wire (R61 to R65, R21, R22) ----

// Plays crashes in column `column` (both choose it), so each round resolves at once and adds rubble.
async function crash(a: Seat, b: Seat, column: number): Promise<any> {
  send(a, { column, shield: false });
  await b.next(); // opponent_ready
  send(b, { column, shield: false });
  const result = await a.next();
  await b.next();
  return result;
}

describe("R61 and R65 the shrinking board through the server", () => {
  it("R61 after round 12 the snapshot has 5 rows, the same on both screens, with the top piece gone", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => {
      rt.dispose();
      server.close();
    };
    const a = await seat(url, "SHR001", "A");
    const b = await seat(url, "SHR001", "B");
    expect(await a.next()).toEqual({ type: "opponent_joined" });
    let last: any;
    for (let round = 1; round <= 11; round++) {
      last = await crash(a, b, (round - 1) % 7);
      expect(last.state.rows, `after round ${round}`).toBe(6); // nothing closes before round 12
    }
    last = await crash(a, b, 0);
    expect(last.state.round).toBe(12);
    expect(last.state.rows).toBe(5);
    expect(last.state.board.every((column: string[]) => column.length <= 5)).toBe(true);
    expect("firstColumn" in last.state || "lastColumn" in last.state).toBe(false);
  });

  it("R64 every column stays choosable at every round: nothing is ever rejected as closed (the walls are gone)", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => {
      rt.dispose();
      server.close();
    };
    const a = await seat(url, "SHR002", "A");
    const b = await seat(url, "SHR002", "B");
    expect(await a.next()).toEqual({ type: "opponent_joined" });
    for (let round = 1; round <= 12; round++) await crash(a, b, 1 + ((round - 1) % 5)); // columns 1 to 5 only
    const before = b.raw.length;
    send(a, { column: 0, shield: false }); // the outer columns would have been closed by the old walls
    await quiet(50);
    expect(b.raw.slice(before)).toEqual([JSON.stringify({ type: "opponent_ready" })]); // accepted, and the opponent hears only "ready"
  });
});
