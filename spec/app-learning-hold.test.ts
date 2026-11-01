// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts, with real HTTP and WebSocket clients.
// A first-time player's seat is held while they do the tutorial, and released after 30 seconds of disconnection (R102, ADR 0017).
// The 30 seconds is the real production grace, so this check takes about half a minute.
import { describe, expect, inject, it } from "vitest";

const base = () => inject("baseUrl");
const wsUrl = () => base().replace(/^http/, "ws") + "/ws";
const address = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function open(cookie?: string) {
  const socket = new WebSocket(wsUrl(), { headers: { "fly-client-ip": address(), ...(cookie ? { cookie } : {}) } } as never);
  const queued: any[] = [];
  const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.type === message.type);
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const ready = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const next = (type: string, ms = 5_000) => {
    const at = queued.findIndex((m) => m.type === type);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return Promise.race([
      new Promise<any>((resolve) => waiting.push({ type, resolve })),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`no ${type} within ${ms}ms`)), ms)),
    ]);
  };
  const seen = (type: string) => queued.some((m) => m.type === type);
  return { socket, ready, next, seen, send: (body: object) => socket.send(JSON.stringify(body)) };
}

async function linkGame(): Promise<{ code: string; cookie: string }> {
  const res = await fetch(base() + "/api/games", { method: "POST", headers: { "fly-client-ip": address() } });
  return { code: (await res.json()).code as string, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}

// A guest with a session of their own, so the server can tell two people apart.
async function guest(): Promise<string> {
  const res = await fetch(base() + "/api/guest", { method: "POST", headers: { "fly-client-ip": address(), "content-type": "application/json" }, body: JSON.stringify({ nickname: "Learner" }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("R102 a first-time player holds their seat while they learn", () => {
  it("R102 the seat is held: a third visitor watches, the host is told, and nothing starts", async () => {
    const { code, cookie } = await linkGame();
    const host = open(cookie);
    await host.ready;
    host.send({ type: "join", code });
    await host.next("snapshot");

    const learner = open(await guest());
    await learner.ready;
    learner.send({ type: "join", code, learning: true });
    const mine = await learner.next("snapshot");
    expect(mine.you).toBe("B");
    expect(mine.learning).toBe(true);
    expect((await host.next("opponent_learning")).type).toBe("opponent_learning");

    const stranger = open(await guest());
    await stranger.ready;
    stranger.send({ type: "join", code });
    const shown = await stranger.next("spectating");
    expect(shown.learning).toBe(true);

    await new Promise((r) => setTimeout(r, 4_500)); // longer than the 3 second start countdown
    expect(host.seen("countdown"), "no countdown while they learn").toBe(false);

    // Finishing the tutorial starts the usual countdown.
    learner.send({ type: "learning_done", code, player: "B", seatToken: mine.seatToken });
    expect((await host.next("opponent_joined")).type).toBe("opponent_joined");
    expect((await host.next("countdown")).type).toBe("countdown");
    for (const c of [host, learner, stranger]) c.socket.close();
  }, 30_000);

  it("R102 R27 the seat is released after 30 seconds of disconnection, and the next person to open the link plays", async () => {
    const { code, cookie } = await linkGame();
    const host = open(cookie);
    await host.ready;
    host.send({ type: "join", code });
    await host.next("snapshot");

    const learner = open(await guest());
    await learner.ready;
    learner.send({ type: "join", code, learning: true });
    const mine = await learner.next("snapshot");
    await host.next("opponent_learning");
    learner.socket.close();

    // Just inside the grace the seat is still held: a newcomer watches.
    await new Promise((r) => setTimeout(r, 15_000));
    expect(host.seen("opponent_gone"), "still held at 15 seconds").toBe(false);
    const early = open(await guest());
    await early.ready;
    early.send({ type: "join", code });
    expect((await early.next("spectating")).type).toBe("spectating");

    // After 30 seconds it is free again and the host sees the share link card.
    expect((await host.next("opponent_gone", 25_000)).type).toBe("opponent_gone");
    const later = open(await guest());
    await later.ready;
    later.send({ type: "join", code });
    const taken = await later.next("snapshot");
    expect(taken.you).toBe("B");
    expect(taken.learning).toBe(false);
    expect(taken.seatToken).not.toBe(mine.seatToken);
    for (const c of [host, early, later]) c.socket.close();
  }, 70_000);
});
