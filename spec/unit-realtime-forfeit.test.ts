// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast
// (vitest.unit.config.ts). Starts its own ephemeral HTTP server with a short,
// injected disconnect grace period (R27), so it does not need the 30 second
// production grace period or the shared dev server.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

// Long enough that joining (a local socket round trip) reliably finishes
// before it fires, even on a slow CI runner, but still fast for tests. The
// round timer is set much longer so it never interferes with these tests.
const DISCONNECT_GRACE_MS = 1_000;
const ROUND_TIMER_MS = 60_000;

function startServer(): { server: Server; url: string; dispose: () => void } {
  const server = createServer((_req, res) => res.end());
  const { dispose } = attachRealtime(server, openDb(":memory:"), {
    disconnectGraceMs: DISCONNECT_GRACE_MS,
    roundTimerMs: ROUND_TIMER_MS,
  });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: `ws://localhost:${port}/ws`, dispose };
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
}

function onceClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("close", () => resolve(), { once: true }));
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
  seatToken?: string,
): Promise<{ socket: WebSocket; next: () => Promise<any>; seatToken: string }> {
  const socket = new WebSocket(url);
  const next = messageQueue(socket);
  await onceOpen(socket);
  socket.send(JSON.stringify({ type: "join", code, player, seatToken }));
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

describe("R27: a player who disconnects and does not return forfeits", () => {
  it("R27 the other player is told game_over with result forfeit once the grace period ends", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => {
      dispose();
      server.close();
    };

    const code = "FORFEIT1";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    const aClosed = onceClose(a.socket);
    a.socket.close();
    await aClosed;

    const message = await b.next();
    expect(message).toEqual({ type: "game_over", result: "forfeit", winner: "B" });
  });

  it("R27 reconnecting with the right seat token within the grace period cancels the forfeit", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => {
      dispose();
      server.close();
    };

    const code = "FORFEIT2";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    const aClosed = onceClose(a.socket);
    a.socket.close();
    await aClosed;

    // Reconnect promptly; the exact timing does not matter so long as the
    // reconnect's own snapshot (not a sleep) is what we synchronise on.
    const a2 = await joinGame(url, code, "A", a.seatToken);
    expect(a2.seatToken).toBe(a.seatToken);

    // Wait past where the forfeit would have fired if it were not cancelled.
    await new Promise((resolve) => setTimeout(resolve, DISCONNECT_GRACE_MS * 1.5));

    // B is told A is back (opponent_joined, which carries no choice), and nothing else:
    // in particular, nobody is told the game is over.
    expect(await b.next()).toEqual({ type: "opponent_joined" });
    const raceResult = await Promise.race([
      b.next().then((message) => ({ arrived: true, message })),
      new Promise((resolve) => setTimeout(() => resolve({ arrived: false }), 100)),
    ]);
    expect((raceResult as { arrived: boolean }).arrived).toBe(false);

    a2.socket.close();
    b.socket.close();
  });

  it("R27 a late reconnect, after the forfeit already fired, is told the game is over", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => {
      dispose();
      server.close();
    };

    const code = "FORFEIT3";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    const aClosed = onceClose(a.socket);
    a.socket.close();
    await aClosed;
    await b.next(); // game_over for B

    // A tries to rejoin after the forfeit has already happened.
    const socket = new WebSocket(url);
    const next = messageQueue(socket);
    await onceOpen(socket);
    socket.send(JSON.stringify({ type: "join", code, player: "A", seatToken: a.seatToken }));
    const reply = await next();

    expect(reply).toEqual({ type: "game_over", result: "forfeit", winner: "B" });

    socket.close();
    b.socket.close();
  });

  it("R27, R32 a reconnect with the wrong seat token does not cancel the forfeit or learn the result", async () => {
    const { server, url, dispose } = startServer();
    cleanup = () => {
      dispose();
      server.close();
    };

    const code = "FORFEIT4";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    const aClosed = onceClose(a.socket);
    a.socket.close();
    await aClosed;

    // An impostor claims seat A with the wrong token while the grace period
    // is still open.
    const impostor = new WebSocket(url);
    const impostorNext = messageQueue(impostor);
    await onceOpen(impostor);
    impostor.send(JSON.stringify({ type: "join", code, player: "A", seatToken: "not-the-real-token" }));
    const impostorReply = await impostorNext();
    expect(impostorReply).toEqual({ type: "game_full" });

    // The forfeit still fires on schedule: the impostor's attempt did not
    // cancel it, and did not get the result either (checked above).
    const message = await b.next();
    expect(message).toEqual({ type: "game_over", result: "forfeit", winner: "B" });

    impostor.close();
    b.socket.close();
  });

  it("R27 does not forfeit a game that has already been won or drawn while a player was disconnected", async () => {
    // This test needs rounds to resolve by timeout (A never chooses once
    // disconnected) well within the disconnect grace period, so it uses its
    // own server with a short round timer rather than the 60 second one the
    // other tests in this file use to stay clear of R18 entirely.
    const server = createServer((_req, res) => res.end());
    const shortRoundTimerMs = 100;
    const { dispose } = attachRealtime(server, openDb(":memory:"), {
      disconnectGraceMs: DISCONNECT_GRACE_MS,
      roundTimerMs: shortRoundTimerMs,
    });
    server.listen(0);
    const { port } = server.address() as AddressInfo;
    const url = `ws://localhost:${port}/ws`;
    cleanup = () => {
      dispose();
      server.close();
    };

    const code = "FORFEIT5";
    const a = await joinGame(url, code, "A");
    const b = await joinGame(url, code, "B");
    await expectArrival(a);

    // A disconnects, starting its grace timer.
    const aClosed = onceClose(a.socket);
    a.socket.close();
    await aClosed;

    // B still has a connection and can keep choosing; nobody chooses for A,
    // so each round times out (R18) with only B's choice landing. B wins
    // outright well before the disconnect grace period would end.
    let winResult: any;
    for (let i = 0; i < 4; i++) {
      b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 0, shield: false }));
      winResult = await b.next();
      if (winResult.state.status === "won") break;
    }
    expect(winResult.state.status).toBe("won");
    expect(winResult.state.winner).toBe("B");

    // Wait past the disconnect grace period: it must not also send a forfeit
    // game_over now that the game has already ended normally.
    const raceResult = await Promise.race([
      b.next().then((message) => ({ arrived: true, message })),
      new Promise((resolve) => setTimeout(() => resolve({ arrived: false }), DISCONNECT_GRACE_MS * 1.5)),
    ]);
    expect((raceResult as { arrived: boolean }).arrived).toBe(false);

    b.socket.close();
  });
});

describe("R27: the production default grace period", () => {
  it("R27 defaults to 30 seconds when no override is given", async () => {
    const { DISCONNECT_GRACE_MS: productionDefault } = await import("../src/server/realtime.ts");
    expect(productionDefault).toBe(30_000);
  });
});
