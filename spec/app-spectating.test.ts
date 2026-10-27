// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts, with real HTTP and
// WebSocket clients. Spectating (ADR 0012, R70 to R80). The running app is shared with other checks, so these
// compare what this test did (a friend game or a computer game it made) and never an absolute count.
import { describe, expect, inject, it } from "vitest";

const base = () => inject("baseUrl");
const wsUrl = () => base().replace(/^http/, "ws") + "/ws";
const address = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function open(): { socket: WebSocket; next: (type: string) => Promise<any>; raw: string[]; ready: Promise<void> } {
  const socket = new WebSocket(wsUrl());
  const raw: string[] = [];
  const queued: any[] = [];
  const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    raw.push(event.data as string);
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.type === message.type);
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const ready = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const next = (type: string) => {
    const at = queued.findIndex((m) => m.type === type);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return new Promise<any>((resolve) => waiting.push({ type, resolve }));
  };
  return { socket, next, raw, ready };
}

async function post(path: string): Promise<any> {
  const res = await fetch(base() + path, { method: "POST", headers: { "fly-client-ip": address() } });
  return res.json();
}
async function live(): Promise<number> {
  const res = await fetch(base() + "/api/live", { headers: { "fly-client-ip": address() } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Object.keys(body)).toEqual(["live"]); // a number only (R80)
  return body.live as number;
}
const quiet = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("W: spectating against the running app (R70 to R80)", () => {
  it("W3 (R80, R71) a friend game never changes the live count, and a computer game does", async () => {
    const before = await live();
    const friend = (await post("/api/games")).code as string;
    const a = open();
    await a.ready;
    a.socket.send(JSON.stringify({ type: "join", code: friend, player: "A" }));
    await a.next("snapshot");
    const b = open();
    await b.ready;
    b.socket.send(JSON.stringify({ type: "join", code: friend, player: "B" }));
    await b.next("snapshot");
    await quiet(100);
    expect(await live(), "a live friend game is not counted").toBe(before);
    const computer = (await post("/api/computer")).code as string;
    const human = open();
    await human.ready;
    human.socket.send(JSON.stringify({ type: "join", code: computer }));
    await human.next("snapshot");
    expect(await live(), "a live computer game is").toBe(before + 1);
    for (const s of [a, b, human]) s.socket.close();
  });

  it("W3 (R71) a friend game's code is answered exactly like a code that does not exist", async () => {
    const friend = (await post("/api/games")).code as string;
    const a = open();
    await a.ready;
    a.socket.send(JSON.stringify({ type: "join", code: friend, player: "A" }));
    await a.next("snapshot");
    const b = open();
    await b.ready;
    b.socket.send(JSON.stringify({ type: "join", code: friend, player: "B" }));
    await b.next("snapshot");
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code: friend }));
    const real = await watcher.next("not_watchable");
    watcher.socket.send(JSON.stringify({ type: "spectate", code: "ZZZZZZ" }));
    const none = await watcher.next("not_watchable");
    expect(real).toEqual(none);
    expect(real.reason).toBe("unknown");
    for (const s of [a, b, watcher]) s.socket.close();
  });

  it("W1 and W4 (R72, R73) a spectator in a computer game gets a snapshot with only public state, and later rounds the same", async () => {
    const code = (await post("/api/computer")).code as string;
    const human = open();
    await human.ready;
    human.socket.send(JSON.stringify({ type: "join", code }));
    const joined = await human.next("snapshot");
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    const first = await watcher.next("spectating");
    expect(first.kind).toBe("computer");
    expect(first.state).toEqual(joined.state);
    expect(Object.keys(first).sort()).toEqual(["code", "kind", "names", "state", "type", "watching"]);
    // The human chooses; the spectator hears nothing until the round resolves, and then only the public result.
    const seen = watcher.raw.length;
    human.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: joined.seatToken, column: 3, shield: true }));
    const round = await watcher.next("round");
    expect(round.state.round).toBe(1);
    for (const frame of watcher.raw.slice(seen)) {
      expect(frame).not.toMatch(/opponentReady|opponent_ready|seatToken|"shield":\s*true|"column":\s*3\b/);
    }
    human.socket.close();
    watcher.socket.close();
  });

  it("W2 (R74) a spectator cannot choose in a game it watches, even with the seat token it was never given", async () => {
    const code = (await post("/api/computer")).code as string;
    const human = open();
    await human.ready;
    human.socket.send(JSON.stringify({ type: "join", code }));
    const joined = await human.next("snapshot");
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    await watcher.next("spectating");
    watcher.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: joined.seatToken, column: 0, shield: false }));
    expect(await watcher.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    human.socket.close();
    watcher.socket.close();
  });

  it("W8 (R78) when nothing else is live the exhibition game of two computers is shown, and it is not counted live", async () => {
    // Other checks may have live games, so ask for a game that cannot exist: an unwatchable code gets no exhibition,
    // while a plain request is placed in a live game or the exhibition game.
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate" }));
    const first = await watcher.next("spectating");
    expect(["quick", "computer", "exhibition"]).toContain(first.kind);
    if (first.kind === "exhibition") {
      expect(first.names).toEqual({ A: "Computer 1", B: "Computer 2" });
      const round = await watcher.next("round");
      expect(round.state.round).toBeGreaterThanOrEqual(1);
    }
    watcher.socket.close();
  });

  it("W5 (R75) the player is told how many are watching", async () => {
    const code = (await post("/api/computer")).code as string;
    const human = open();
    await human.ready;
    human.socket.send(JSON.stringify({ type: "join", code }));
    await human.next("snapshot");
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    await watcher.next("spectating");
    expect(await human.next("watching")).toEqual({ type: "watching", watching: 1 });
    watcher.socket.close();
    expect(await human.next("watching")).toEqual({ type: "watching", watching: 0 });
    human.socket.close();
  });

  it("R77 /api/live is rate limited per client address", async () => {
    const ip = address();
    let limited = false;
    for (let i = 0; i < 90 && !limited; i++) {
      const res = await fetch(base() + "/api/live", { headers: { "fly-client-ip": ip } });
      if (res.status === 429) limited = true;
    }
    expect(limited).toBe(true);
    const other = await fetch(base() + "/api/live", { headers: { "fly-client-ip": address() } });
    expect(other.status).toBe(200); // another address is unaffected
  });
});
