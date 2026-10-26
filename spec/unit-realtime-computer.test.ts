// Unit check: needs no running app. A game against the computer (R33) on an
// ephemeral server with a short injected computer delay, so tests do not wait.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

function startServer(roundTimerMs = 5000) {
  const server = createServer((_req, res) => res.end());
  const db = openDb(":memory:");
  const rt = attachRealtime(server, db, { roundTimerMs, computerDelayMs: 100, computerSeed: 1 });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, db, rt, url: `ws://localhost:${port}/ws` };
}

function queue(socket: WebSocket): () => Promise<any> {
  const queued: any[] = [];
  const waiting: Array<(v: any) => void> = [];
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data as string);
    const w = waiting.shift();
    if (w) w(m);
    else queued.push(m);
  });
  return () => new Promise((resolve) => (queued.length ? resolve(queued.shift()) : waiting.push(resolve)));
}

async function open(url: string) {
  const socket = new WebSocket(url);
  const next = queue(socket);
  await new Promise((r) => socket.addEventListener("open", () => r(null), { once: true }));
  return { socket, next };
}

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("R33 playing the computer", () => {
  it("L1 (R33) the game starts at once: the human is seated as A and sees a snapshot with no waiting", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("CMP234");
    const a = await open(url);
    a.socket.send(JSON.stringify({ type: "join", code: "CMP234" }));
    const snap = await a.next();
    expect(snap.type).toBe("snapshot");
    expect(snap.you).toBe("A");
    a.socket.close();
  });

  it("L1 (R33) the computer chooses by itself, and the round resolves once the human chooses too", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("CMP235");
    const a = await open(url);
    a.socket.send(JSON.stringify({ type: "join", code: "CMP235" }));
    const snap = await a.next();
    // The computer shows as ready first (the only thing the human may learn, R21).
    expect(await a.next()).toEqual({ type: "opponent_ready" });
    a.socket.send(JSON.stringify({ type: "choose", code: "CMP235", player: "A", seatToken: snap.seatToken, column: 0, shield: false }));
    const result = await a.next();
    expect(result.type).toBe("snapshot");
    expect(result.state.round).toBe(1);
    a.socket.close();
  });

  it("R33 a missed human round still resolves, with the computer's disc landing alone (R18, R10)", async () => {
    const { server, rt, url } = startServer(400);
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("CMP236");
    const a = await open(url);
    a.socket.send(JSON.stringify({ type: "join", code: "CMP236" }));
    await a.next();
    await a.next(); // opponent_ready
    const result = await a.next();
    expect(result.state.round).toBe(1);
    expect(result.state.board.flat()).toEqual(["B"]);
    a.socket.close();
  });

  it("R36 a second human cannot join a game against the computer", async () => {
    const { server, rt, url } = startServer();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("CMP237");
    const a = await open(url);
    a.socket.send(JSON.stringify({ type: "join", code: "CMP237" }));
    await a.next();
    const b = await open(url);
    b.socket.send(JSON.stringify({ type: "join", code: "CMP237" }));
    expect((await b.next()).type).toBe("game_full");
    a.socket.close();
    b.socket.close();
  });

  it("R37 a game against the computer is marked in the database, so the leaderboard can skip it", () => {
    const { server, db, rt } = startServer();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("CMP238");
    expect(db.loadGames().find((g) => g.code === "CMP238")?.vsComputer).toBe(true);
  });

  it("R37 after a restart the game is still marked, seat B stays reserved and the computer waits for its human", async () => {
    const path = join(tmpdir(), `rubble-test-${process.pid}-${Date.now()}-computer.db`);
    try {
      const first = createServer((_req, res) => res.end());
      const db1 = openDb(path);
      const rt1 = attachRealtime(first, db1, { roundTimerMs: 300, computerDelayMs: 50, computerSeed: 1 });
      rt1.createComputerGame("CMP239");
      rt1.dispose();
      db1.close();

      const server = createServer((_req, res) => res.end());
      const db2 = openDb(path);
      const rt2 = attachRealtime(server, db2, { roundTimerMs: 300, computerDelayMs: 50, computerSeed: 1 });
      cleanup = () => { rt2.dispose(); server.close(); db2.close(); };
      server.listen(0);
      const url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
      expect(db2.loadGames().find((g) => g.code === "CMP239")?.vsComputer).toBe(true);

      // No human yet: the computer must not play on alone.
      await new Promise((r) => setTimeout(r, 700));
      expect(rt2.game.getGame("CMP239")?.state.round).toBe(0);

      const a = await open(url);
      a.socket.send(JSON.stringify({ type: "join", code: "CMP239" }));
      expect((await a.next()).you).toBe("A");
      const b = await open(url);
      b.socket.send(JSON.stringify({ type: "join", code: "CMP239" }));
      expect((await b.next()).type).toBe("game_full");
      a.socket.close();
      b.socket.close();
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});
