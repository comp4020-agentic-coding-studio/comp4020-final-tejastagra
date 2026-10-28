// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast
// (vitest.unit.config.ts). Starts its own ephemeral HTTP server with a short,
// injected round timer (R18), so it does not need the 10 second production
// timer or the shared dev server.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

// Long enough that joining and choosing (local socket round trips) reliably
// finish before it fires, even on a slow CI runner, but still fast for tests.
const ROUND_TIMER_MS = 300;

function startServer(): { server: Server; url: string; dispose: () => void; createGame: (code: string) => void } {
  const server = createServer((_req, res) => res.end());
  const { dispose, game } = attachRealtime(server, openDb(":memory:"), { roundTimerMs: ROUND_TIMER_MS, countdownMs: 0 }); // no start countdown (R97): these checks time rounds
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: `ws://localhost:${port}/ws`, dispose, createGame: (code) => void game.createGame(code) };
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
}

// Queues incoming messages per socket, so a message that arrives before
// next() is called is not lost.
function messageQueue(socket: WebSocket): () => Promise<any> {
  const queued: any[] = [];
  const waiting: Array<(value: any) => void> = [];
  socket.addEventListener("message", (event) => {
    const parsed = JSON.parse(event.data as string);
    const resolve = waiting.shift();
    if (resolve) resolve(parsed);
    else queued.push(parsed);
  });
  return () =>
    new Promise((resolve) => {
      const next = queued.shift();
      if (next !== undefined) resolve(next);
      else waiting.push(resolve);
    });
}

async function joinGame(
  url: string,
  code: string,
  player: "A" | "B",
): Promise<{ socket: WebSocket; next: () => Promise<any>; seatToken: string }> {
  const socket = new WebSocket(url);
  const next = messageQueue(socket);
  await onceOpen(socket);
  socket.send(JSON.stringify({ type: "join", code, player }));
  const snapshot = await next();
  return { socket, next, seatToken: snapshot.seatToken };
}

// When the second seat joins, the first seat is told that someone arrived (opponent_joined).
// It carries nothing about a choice (R21, R22). Tests that go on to read the next message
// from the first seat call this first, so the protocol step is visible and not skipped.
async function expectArrival(first: { next: () => Promise<any> }): Promise<void> {
  expect(await first.next()).toEqual({ type: "opponent_joined" });
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("R51: a game starts only when both players are present", () => {
  it("R51 (replaces the old R18 first-round check) a player waiting alone never starts a round, misses one or abandons the game", async () => {
    const { server, url, dispose, createGame } = startServer();
    cleanup = () => { dispose(); server.close(); };
    createGame("ABC234");
    const a = await joinGame(url, "ABC234", "A");
    // Wait for ten round timers (the 60 seconds of the rule, scaled down): nothing may arrive.
    const outcome = await Promise.race([
      a.next().then((message) => ({ arrived: true, message })),
      new Promise((resolve) => setTimeout(() => resolve({ arrived: false }), ROUND_TIMER_MS * 10)),
    ]);
    expect(outcome).toEqual({ arrived: false });
    a.socket.close();
  });

  it("R51 once the second player joins the first round does time out", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => { dispose(); server.close(); };
    const a = await joinGame(url, "WAIT22", "A");
    await new Promise((resolve) => setTimeout(resolve, ROUND_TIMER_MS * 2)); // alone: nothing happens
    const b = await joinGame(url, "WAIT22", "B");
    await expectArrival(a);
    const next = await a.next();
    expect(next.type).toBe("snapshot");
    expect(next.state.round).toBe(1);
    expect((await b.next()).state.round).toBe(1);
    a.socket.close();
    b.socket.close();
  });
});

describe("R4: a choice is final", () => {
  it("R4 a second choice in the same round is rejected with already_chosen and the first one counts", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => { dispose(); server.close(); };
    const code = "LOCK22";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 2, shield: false }));
    expect(await b.next()).toEqual({ type: "opponent_ready" });
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 5, shield: true }));
    expect(await a.next()).toEqual({ type: "rejected", reason: "already_chosen" });
    // The rejection says nothing the opponent can see (R22): B gets no message for it.
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 4, shield: false }));
    const result = await a.next();
    expect(result.state.board[2][0]).toBe("A");
    expect(result.state.board[5]).toHaveLength(0);
    expect(result.state.shieldsLeft.A).toBe(true);
    a.socket.close();
    b.socket.close();
  });
});

describe("R18: the round timer resolves a round even if a player never chooses", () => {
  it("R18 resolves the round when the timer ends with only one player having chosen", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => { dispose(); server.close(); };

    const code = "TIMER1";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 2, shield: false }));
    await b.next(); // opponent_ready

    // Neither player chooses again; the timer should resolve the round with
    // only A's choice counted (R10: one_landed).
    const aResult = await a.next();
    const bResult = await b.next();

    expect(aResult.type).toBe("snapshot");
    expect(aResult.state).toEqual(bResult.state);
    expect(aResult.state.round).toBe(1);
    expect(aResult.state.board.flat().filter((cell: string) => cell === "A")).toHaveLength(1);
    expect(aResult.state.board.flat().filter((cell: string) => cell === "B")).toHaveLength(0);

    a.socket.close();
    b.socket.close();
  });

  it("R18 resolves the round when the timer ends with neither player having chosen", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => { dispose(); server.close(); };

    const code = "TIMER2";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    const aResult = await a.next();
    const bResult = await b.next();

    expect(aResult.state.round).toBe(1);
    expect(bResult.state.round).toBe(1);
    expect(aResult.state.board.flat()).toHaveLength(0);

    a.socket.close();
    b.socket.close();
  });

  it("R18 a new timer starts for the next round after the previous round resolves early", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => { dispose(); server.close(); };

    const code = "TIMER3";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 0, shield: false }));
    await b.next(); // opponent_ready
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 1, shield: false }));

    const round1 = await a.next();
    expect(round1.state.round).toBe(1);
    await b.next(); // B's copy of the same result

    // Nobody chooses in round 2; its own timer should fire once, advancing
    // to round 2 exactly (not resolving round 1's timer a second time).
    const round2 = await a.next();
    expect(round2.state.round).toBe(2);

    a.socket.close();
    b.socket.close();
  });
});
