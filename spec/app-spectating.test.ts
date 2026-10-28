// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts, with real HTTP and
// WebSocket clients. Spectating (ADR 0012, R70 to R80). The running app is shared with other checks, so these
// compare what this test did (the games it made, by code) and never an absolute count.
import { describe, expect, inject, it } from "vitest";
import { withQuickQueue } from "./quick-lock.ts";

const base = () => inject("baseUrl");
const wsUrl = () => base().replace(/^http/, "ws") + "/ws";
const address = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const fresh = address;

// Each connection sends its own client address, as every check that creates anything must (CLAUDE.md), so no check shares
// the per-address limit on watching (R77) with another, or with the rest of the suite running at the same time.
function open(address: string = fresh(), cookie?: string): { socket: WebSocket; next: (type: string) => Promise<any>; raw: string[]; ready: Promise<void> } {
  const socket = new WebSocket(wsUrl(), { headers: { "fly-client-ip": address, ...(cookie ? { cookie } : {}) } } as never);
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

// The cookie the server gave the last person to make a link game: the creator is player 1 and their session is the proof (R36).
let creatorCookie = "";
async function post(path: string): Promise<any> {
  const res = await fetch(base() + path, { method: "POST", headers: { "fly-client-ip": address() } });
  if (path === "/api/games") creatorCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
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

// Two players in a quick match game (R35), paired through the shared lobby. A waiting ticket left by another check would pair
// with the first of ours, so one throwaway ticket first leaves the lobby empty, as the other lobby checks do.
async function quickPair() {
  const code = await withQuickQueue(async () => {
    const probe = await (await fetch(`${base()}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": address() } })).json();
    if (probe.state === "waiting") await fetch(`${base()}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": address() } });
    const first = await (await fetch(`${base()}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": address() } })).json();
    const second = await (await fetch(`${base()}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": address() } })).json();
    return (second.code ?? first.code) as string;
  });
  return players(code);
}

// Two people join a game by its code, as two people opening the link do (R36).
async function players(code: string, creator = "") {
  const a = open(fresh(), creator || undefined);
  await a.ready;
  a.socket.send(JSON.stringify({ type: "join", code }));
  const joinedA = await a.next("snapshot");
  const b = open();
  await b.ready;
  b.socket.send(JSON.stringify({ type: "join", code }));
  const joinedB = await b.next("snapshot");
  return { code, a, b, joinedA, joinedB };
}

describe("W: spectating against the running app (R70 to R80)", () => {
  it("W3 (R71, R80) a computer game can never be watched: it is answered exactly like a code that does not exist, and it is not counted", async () => {
    const code = (await post("/api/computer")).code as string;
    const human = open();
    await human.ready;
    human.socket.send(JSON.stringify({ type: "join", code }));
    await human.next("snapshot");
    const asker = open();
    await asker.ready;
    asker.socket.send(JSON.stringify({ type: "spectate", code }));
    const real = await asker.next("not_watchable");
    asker.socket.send(JSON.stringify({ type: "spectate", code: "ZZZZZZ" }));
    const none = await asker.next("not_watchable");
    expect(real).toEqual(none);
    expect(real.reason).toBe("unknown");
    // Watch live never offers it: whatever it places a spectator in is not this game.
    for (let i = 0; i < 4; i++) {
      const w = open();
      await w.ready;
      w.socket.send(JSON.stringify({ type: "spectate" }));
      const answer = await Promise.race([w.next("spectating"), w.next("none_live")]);
      if (answer.type === "spectating") expect(answer.code).not.toBe(code);
      w.socket.close();
    }
    for (const x of [human, asker]) x.socket.close();
  });

  it("W3 (R70, R80) a live quick match game is counted and offered by Watch live; a live link game is neither", async () => {
    const link = (await post("/api/games")).code as string;
    const linkPlayers = await players(link, creatorCookie);
    const quick = await quickPair();
    await quiet(100);
    expect(await live(), "a live quick match game is counted").toBeGreaterThanOrEqual(1);
    // Ask for a random game several times, each from its own address: never the link game, whatever else is live.
    for (let i = 0; i < 6; i++) {
      const w = open();
      await w.ready;
      w.socket.send(JSON.stringify({ type: "spectate" }));
      const placed = await Promise.race([w.next("spectating"), w.next("none_live")]);
      expect(placed.type).toBe("spectating");
      expect(placed.code, "a link game is never picked").not.toBe(link);
      expect(placed.kind).toBe("quick");
      w.socket.close();
    }
    for (const x of [linkPlayers.a, linkPlayers.b, quick.a, quick.b]) x.socket.close();
  });

  it("W12 and W14 (R36) the third person to open a link becomes a spectator, and the fourth too, and neither can choose", async () => {
    const code = (await post("/api/games")).code as string;
    const { a, b, joinedA, joinedB } = await players(code, creatorCookie);
    expect([joinedA.you, joinedB.you]).toEqual(["A", "B"]);
    const third = open();
    await third.ready;
    third.socket.send(JSON.stringify({ type: "join", code }));
    const watching3 = await third.next("spectating");
    expect(watching3.kind).toBe("link");
    expect(watching3.because).toBe("two_players");
    expect(JSON.stringify(watching3)).not.toMatch(/seatToken/);
    const fourth = open();
    await fourth.ready;
    fourth.socket.send(JSON.stringify({ type: "join", code }));
    expect((await fourth.next("spectating")).watching).toBe(2);
    third.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: joinedA.seatToken, column: 0, shield: false }));
    expect(await third.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    for (const x of [a, b, third, fourth]) x.socket.close();
  });

  it("W12 (R36) two people arriving at the same moment for the last seat give exactly one player and one spectator", async () => {
    const code = (await post("/api/games")).code as string;
    const first = open(fresh(), creatorCookie);
    await first.ready;
    first.socket.send(JSON.stringify({ type: "join", code }));
    await first.next("snapshot");
    const x = open();
    const y = open();
    await Promise.all([x.ready, y.ready]);
    x.socket.send(JSON.stringify({ type: "join", code }));
    y.socket.send(JSON.stringify({ type: "join", code }));
    const [rx, ry] = await Promise.all([Promise.race([x.next("snapshot"), x.next("spectating")]), Promise.race([y.next("snapshot"), y.next("spectating")])]);
    expect([rx.type, ry.type].sort()).toEqual(["snapshot", "spectating"]);
    for (const c of [first, x, y]) c.socket.close();
  });

  it("W1 and W4 (R72, R73) a spectator of a quick match game gets a snapshot with only public state, and later rounds the same", async () => {
    const { code, a, b, joinedA, joinedB } = await quickPair();
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    const first = await watcher.next("spectating");
    expect(first.kind).toBe("quick");
    expect(first.state).toEqual(joinedA.state);
    expect(Object.keys(first).sort()).toEqual(["code", "kind", "names", "state", "type", "watching"]);
    // A chooses; the spectator hears nothing until the round resolves, and then only the public result.
    const seen = watcher.raw.length;
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: joinedA.seatToken, column: 3, shield: true }));
    await quiet(150);
    expect(watcher.raw.length, "nothing was sent to the spectator while a choice was pending").toBe(seen);
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: joinedB.seatToken, column: 5, shield: false }));
    const round = await watcher.next("round");
    expect(round.state.round).toBe(1);
    // After it resolves the spectator sees what the players see: A's disc in column 3 and B's in column 5 (and A's spent shield).
    expect(round.state.board[3]).toEqual(["A"]);
    expect(round.state.board[5]).toEqual(["B"]);
    expect(round.state.shieldsLeft).toEqual({ A: false, B: true });
    for (const frame of watcher.raw.slice(seen)) expect(frame).not.toMatch(/opponentReady|opponent_ready|seatToken/);
    for (const x of [a, b, watcher]) x.socket.close();
  });

  it("W2 (R74) a spectator cannot choose in a game it watches, even with a seat token it was never given", async () => {
    const { code, a, b, joinedA } = await quickPair();
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    await watcher.next("spectating");
    watcher.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: joinedA.seatToken, column: 0, shield: false }));
    expect(await watcher.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
    for (const x of [a, b, watcher]) x.socket.close();
  });

  it("W5 (R75) the players are told how many are watching, and it goes down when a spectator leaves", async () => {
    const { code, a, b } = await quickPair();
    const watcher = open();
    await watcher.ready;
    watcher.socket.send(JSON.stringify({ type: "spectate", code }));
    await watcher.next("spectating");
    expect(await a.next("watching")).toEqual({ type: "watching", watching: 1 });
    expect(await b.next("watching")).toEqual({ type: "watching", watching: 1 });
    watcher.socket.close();
    expect(await a.next("watching")).toEqual({ type: "watching", watching: 0 });
    for (const x of [a, b]) x.socket.close();
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

describe("R36 every seat belongs to a person, even one who never chose a name", () => {
  const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
  const connectAs = (cookie: string) => {
    const socket = new WebSocket(wsUrl(), { headers: { "fly-client-ip": address(), cookie } } as never);
    const queued: any[] = [];
    const waiting: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string);
      const at = waiting.findIndex((w) => w.match(message));
      if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
      else queued.push(message);
    });
    const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
    const first = () => new Promise<any>((resolve) => {
      const match = (m: any) => m.type === "snapshot" || m.type === "spectating";
      const at = queued.findIndex(match);
      if (at >= 0) resolve(queued.splice(at, 1)[0]);
      else waiting.push({ match, resolve });
    });
    return { socket, opened, first };
  };

  it("R36 a creator with no session is given one, so a stranger who opens the link first cannot take seat A", async () => {
    const made = await fetch(base() + "/api/games", { method: "POST", headers: { "fly-client-ip": address() } });
    const cookie = cookieOf(made);
    expect(cookie, "making a link game gives the creator a session").toMatch(/=/);
    const { code } = await made.json();
    // A stranger, with a session of their own, opens the link before the creator does.
    const strangerPage = await fetch(`${base()}/g/${code}`, { headers: { "fly-client-ip": address() } });
    const stranger = connectAs(cookieOf(strangerPage));
    await stranger.opened;
    stranger.socket.send(JSON.stringify({ type: "join", code }));
    expect((await stranger.first()).you, "the first other person is player 2").toBe("B");
    const creator = connectAs(cookie);
    await creator.opened;
    creator.socket.send(JSON.stringify({ type: "join", code }));
    expect((await creator.first()).you, "the creator is player 1").toBe("A");
    stranger.socket.close();
    creator.socket.close();
  });

  it("R36 a visitor who opens a game's page is given a session, so the seat they take is theirs to come back to", async () => {
    const made = await fetch(base() + "/api/games", { method: "POST", headers: { "fly-client-ip": address() } });
    const { code } = await made.json();
    const page = await fetch(`${base()}/g/${code}`, { headers: { "fly-client-ip": address() } });
    expect(cookieOf(page)).toMatch(/=/);
    const again = await fetch(`${base()}/g/${code}`, { headers: { "fly-client-ip": address(), cookie: cookieOf(page) } });
    expect(again.headers.get("set-cookie"), "a visitor who already has a session is left as they are").toBeNull();
  });
});
