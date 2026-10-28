// Unit check: needs no running app. R19 on an ephemeral server with a short
// injected round timer, so three idle rounds take well under a second.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";
import { leaderboardFrom } from "../src/server/leaderboard.ts";

const ROUND_MS = 150;

function start() {
  const server = createServer((_req, res) => res.end());
  const db = openDb(":memory:");
  const rt = attachRealtime(server, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0, roundTimerMs: ROUND_MS, disconnectGraceMs: 60_000, computerDelayMs: 20, computerSeed: 3 });
  server.listen(0);
  const url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
  return { server, db, rt, url };
}

function queue(socket: WebSocket) {
  const queued: any[] = [];
  const waiting: Array<(v: any) => void> = [];
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data as string);
    const w = waiting.shift();
    if (w) w(m);
    else queued.push(m);
  });
  return () => new Promise<any>((resolve) => (queued.length ? resolve(queued.shift()) : waiting.push(resolve)));
}

async function join(url: string, code: string, player?: "A" | "B") {
  const socket = new WebSocket(url);
  const next = queue(socket);
  await new Promise((r) => socket.addEventListener("open", () => r(null), { once: true }));
  socket.send(JSON.stringify({ type: "join", code, ...(player ? { player } : {}) }));
  const snap = await next();
  return { socket, next, snap };
}

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("R19 abandonment", () => {
  it("R19 three rounds in a row with no choice from either player ends the game as abandoned, with no winner", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    const a = await join(url, "ABN234", "A");
    const b = await join(url, "ABN234", "B");
    expect(await a.next()).toEqual({ type: "opponent_joined" }); // A is told B arrived
    const seen: any[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await a.next();
      seen.push(m);
      if (m.type === "game_over") break;
    }
    expect(seen.filter((m) => m.type === "snapshot").map((m) => m.state.round)).toEqual([1, 2, 3]);
    expect(seen.at(-1)).toEqual({ type: "game_over", result: "abandoned" });
    // B is told the same things, ending with the same exact message.
    const bSeen: any[] = [];
    for (;;) {
      const m = await b.next();
      bSeen.push(m);
      if (m.type === "game_over") break;
    }
    expect(bSeen.filter((m) => m.type === "snapshot").map((m) => m.state.round)).toEqual([1, 2, 3]);
    expect(bSeen.at(-1)).toEqual({ type: "game_over", result: "abandoned" });
    // R25: saved, with no winner, and the engine's status is untouched.
    const saved = db.loadGames().find((g) => g.code === "ABN234")!;
    expect(saved.ended).toEqual({ result: "abandoned" });
    expect(saved.state.status).toBe("playing");
    expect(saved.state.winner).toBeNull();
    a.socket.close();
    b.socket.close();
  });

  it("R19 one choice in the three rounds resets the count, so the game goes on", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    const a = await join(url, "ABN235", "A");
    await join(url, "ABN235", "B");
    await a.next(); // round 1 idle
    await a.next(); // round 2 idle
    a.socket.send(JSON.stringify({ type: "choose", code: "ABN235", player: "A", seatToken: a.snap.seatToken, column: 0, shield: false }));
    // Round 3 has a choice, so it is not idle; wait past where abandonment would have fired.
    await new Promise((r) => setTimeout(r, ROUND_MS * 3));
    expect(db.loadGames().find((g) => g.code === "ABN235")?.ended).toBeNull();
    a.socket.close();
  });

  it("R19 a stranger without the seat's token is not told the result of an abandoned game", async () => {
    const { server, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    const a = await join(url, "ABN236", "A");
    await join(url, "ABN236", "B");
    for (;;) if ((await a.next()).type === "game_over") break;
    const stranger = new WebSocket(url);
    const next = queue(stranger);
    await new Promise((r) => stranger.addEventListener("open", () => r(null), { once: true }));
    stranger.send(JSON.stringify({ type: "join", code: "ABN236", player: "A" }));
    expect(await next()).toEqual({ type: "game_full" });
    stranger.close();
    a.socket.close();
  });

  it("R19 the real seat holder, returning with their token, is told the game was abandoned", async () => {
    const { server, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    const a = await join(url, "ABN239", "A");
    await join(url, "ABN239", "B");
    for (;;) if ((await a.next()).type === "game_over") break;
    a.socket.close();
    const back = new WebSocket(url);
    const next = queue(back);
    await new Promise((r) => back.addEventListener("open", () => r(null), { once: true }));
    back.send(JSON.stringify({ type: "join", code: "ABN239", player: "A", seatToken: a.snap.seatToken }));
    expect(await next()).toEqual({ type: "game_over", result: "abandoned" });
    back.close();
  });

  it("R19 an abandoned game is still abandoned after a restart: saved, never played on", async () => {
    const { server, db, rt, url } = start();
    const a = await join(url, "ABN240", "A");
    await join(url, "ABN240", "B");
    for (;;) if ((await a.next()).type === "game_over") break;
    a.socket.close();
    rt.dispose();
    server.close();

    const second = createServer((_req, res) => res.end());
    const rt2 = attachRealtime(second, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0, roundTimerMs: ROUND_MS });
    cleanup = () => { rt2.dispose(); second.close(); };
    expect(db.loadGames().find((g) => g.code === "ABN240")?.ended).toEqual({ result: "abandoned" });
    // Nothing restarts its timer, so no round is ever played in it again.
    await new Promise((r) => setTimeout(r, ROUND_MS * 3));
    expect(rt2.game.getGame("ABN240")?.state.round).toBe(3);
  });

  it("R19 a failed save of the abandonment leaves the game live and tries again next round", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    const real = db.saveEnded.bind(db);
    let failures = 1;
    db.saveEnded = (code, ended) => {
      if (failures-- > 0) throw new Error("disk full");
      real(code, ended);
    };
    const a = await join(url, "ABN241", "A");
    await join(url, "ABN241", "B");
    const seen: any[] = [];
    for (;;) {
      const m = await a.next();
      seen.push(m);
      if (m.type === "game_over") break;
    }
    // Round 4 happened because the first attempt failed; then it was abandoned and saved.
    expect(seen.filter((m) => m.type === "snapshot").map((m) => m.state.round)).toEqual([1, 2, 3, 4]);
    expect(db.loadGames().find((g) => g.code === "ABN241")?.ended).toEqual({ result: "abandoned" });
    a.socket.close();
  });

  it("R19 an abandoned game changes neither leaderboard list", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    db.createPlayer("a7f3c1d2-1111-4222-8333-444455556666", "Ann");
    db.createPlayer("b8e4d2c3-1111-4222-8333-444455556666", "Bob");
    const a = await join(url, "ABN237", "A");
    await join(url, "ABN237", "B");
    db.seatPlayer("ABN237", "A", "a7f3c1d2-1111-4222-8333-444455556666");
    db.seatPlayer("ABN237", "B", "b8e4d2c3-1111-4222-8333-444455556666");
    for (;;) if ((await a.next()).type === "game_over") break;
    expect(leaderboardFrom(db, 10)).toEqual({ wins: [], rounds: [], you: null }); // both lists empty (R19); no asking player (R92)
    a.socket.close();
  });

  it("R19 and R33 a game against the computer is abandoned when the human misses 3 rounds in a row", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("ABN238");
    const a = await join(url, "ABN238");
    for (;;) {
      const m = await a.next();
      if (m.type === "game_over") {
        expect(m).toEqual({ type: "game_over", result: "abandoned" });
        break;
      }
    }
    expect(db.loadGames().find((g) => g.code === "ABN238")?.ended).toEqual({ result: "abandoned" });
    a.socket.close();
  });

  it("R19 and R33 a human who chooses in a computer game keeps it alive", async () => {
    const { server, db, rt, url } = start();
    cleanup = () => { rt.dispose(); server.close(); };
    rt.createComputerGame("ABN242");
    const a = await join(url, "ABN242");
    // Choose in every round for six rounds: the count never reaches 3.
    for (let i = 0; i < 6; i++) {
      a.socket.send(JSON.stringify({ type: "choose", code: "ABN242", player: "A", seatToken: a.snap.seatToken, column: i % 7, shield: false }));
      for (;;) {
        const m = await a.next();
        if (m.type === "snapshot") break;
      }
    }
    expect(db.loadGames().find((g) => g.code === "ABN242")?.ended).toBeNull();
    a.socket.close();
  });
});
