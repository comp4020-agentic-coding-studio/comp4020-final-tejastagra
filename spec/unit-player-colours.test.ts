// Unit check: needs no running app. Player colours (R93 to R96, ADR 0014) on an ephemeral server.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

type Colour = "red" | "yellow";
type Colours = { A: Colour; B: Colour };

function start(options: { db?: Db; countdownMs?: number; retainMs?: number } = {}) {
  const server = createServer((_req, res) => res.end());
  const db = options.db ?? openDb(":memory:");
  const rt = attachRealtime(server, db, {
    disconnectGraceMs: 60_000,
    roundTimerMs: 60_000,
    computerDelayMs: 20,
    computerSeed: 3,
    countdownMs: options.countdownMs ?? 0,
    finishedRetainMs: options.retainMs,
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
  const waiting: Array<{ type: string; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string);
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
  cleanup.push(() => socket.close());
  return { socket, opened, next, send: (body: object) => socket.send(JSON.stringify(body)) };
}

async function seat(url: string, code: string, person: string) {
  const c = connect(url, person);
  await c.opened;
  c.send({ type: "join", code });
  const snap = await c.next("snapshot");
  return { ...c, snap, token: snap.seatToken as string, you: snap.you as "A" | "B" };
}

const isColours = (c: unknown): c is Colours =>
  !!c && typeof c === "object" && (((c as Colours).A === "red" && (c as Colours).B === "yellow") || ((c as Colours).A === "yellow" && (c as Colours).B === "red"));

async function playToWin(a: Awaited<ReturnType<typeof seat>>, b: Awaited<ReturnType<typeof seat>>, code: string) {
  for (let i = 0; i < 4; i++) {
    a.send({ type: "choose", code, player: "A", seatToken: a.token, column: 0, shield: false });
    b.send({ type: "choose", code, player: "B", seatToken: b.token, column: 1 + (i % 2), shield: false });
    await a.next("snapshot");
    await b.next("snapshot");
  }
}

describe("R93 and R94 the server decides each player's colour and every screen is told the same", () => {
  it("R93 R94 both players' snapshots carry the same colours: one seat red, the other yellow", async () => {
    const s = start();
    s.rt.createLinkGame("COL001", "p1");
    const a = await seat(s.url, "COL001", "p1");
    const b = await seat(s.url, "COL001", "p2");
    expect(isColours(a.snap.colours)).toBe(true);
    expect(b.snap.colours).toEqual(a.snap.colours);
    // Later snapshots (a resolved round) say the same.
    await a.next("opponent_joined");
    a.send({ type: "choose", code: "COL001", player: "A", seatToken: a.token, column: 0, shield: false });
    b.send({ type: "choose", code: "COL001", player: "B", seatToken: b.token, column: 1, shield: false });
    expect((await a.next("snapshot")).colours).toEqual(a.snap.colours);
    expect((await b.next("snapshot")).colours).toEqual(a.snap.colours);
  });

  it("R94 a spectator is told the same colours as the players", async () => {
    const s = start();
    s.rt.createLinkGame("COL002", "p1");
    const a = await seat(s.url, "COL002", "p1");
    await seat(s.url, "COL002", "p2");
    const watcher = connect(s.url, "p3");
    await watcher.opened;
    watcher.send({ type: "join", code: "COL002" }); // both seats taken: the third person watches (R36)
    const spectating = await watcher.next("spectating");
    expect(spectating.colours).toEqual(a.snap.colours);
  });

  it("R93 the colours are saved with the game, so a restart keeps them", async () => {
    const db = openDb(":memory:");
    const first = start({ db });
    first.rt.createLinkGame("COL003", "p1");
    const a = await seat(first.url, "COL003", "p1");
    const saved = db.loadGames().find((g) => g.code === "COL003")!;
    expect(saved.colours).toEqual(a.snap.colours);
    first.rt.dispose();
    const second = start({ db }); // the same database, a new server (R26)
    const again = await seat(second.url, "COL003", "p1");
    expect(again.snap.colours).toEqual(a.snap.colours);
  });

  it("R93 colours are random across many games: both seats are red in some games, for quick match, link and computer games", async () => {
    const s = start();
    const seen = { quick: new Set<string>(), link: new Set<string>(), computer: new Set<string>() };
    for (let i = 0; i < 40; i++) {
      const code = `CR${String(i).padStart(4, "0")}`;
      const kind = (["quick", "link", "computer"] as const)[i % 3];
      if (kind === "quick") s.rt.createQuickGame(code);
      else if (kind === "link") s.rt.createLinkGame(code, null);
      else s.rt.createComputerGame(code);
      const colours = s.db.loadGames().find((g) => g.code === code)!.colours;
      expect(isColours(colours)).toBe(true);
      seen[kind].add(colours.A);
    }
    for (const kind of ["quick", "link", "computer"] as const) expect([...seen[kind]].sort(), `${kind}: seat A is red in some games and yellow in others`).toEqual(["red", "yellow"]);
  });

  it("R93 a computer game's snapshot carries its colours too", async () => {
    const s = start();
    s.rt.createComputerGame("COL004");
    const a = await seat(s.url, "COL004", "p1");
    expect(isColours(a.snap.colours)).toBe(true);
  });
});

describe("R96 a rematch swaps the colours", () => {
  it("R96 after a rematch each seat has the other colour, on both screens, and it is saved", async () => {
    const s = start();
    s.rt.createLinkGame("COL010", "p1");
    const a = await seat(s.url, "COL010", "p1");
    const b = await seat(s.url, "COL010", "p2");
    await a.next("opponent_joined");
    const before = a.snap.colours as Colours;
    await playToWin(a, b, "COL010");
    a.send({ type: "rematch", code: "COL010", player: "A", seatToken: a.token });
    b.send({ type: "rematch", code: "COL010", player: "B", seatToken: b.token });
    await a.next("rematch_started");
    await b.next("rematch_started");
    const freshA = await a.next("snapshot");
    const freshB = await b.next("snapshot");
    expect(freshA.colours).toEqual({ A: before.B, B: before.A });
    expect(freshB.colours).toEqual(freshA.colours);
    expect(s.db.loadGames().find((g) => g.code === "COL010")!.colours).toEqual(freshA.colours);
    // The archived first game keeps its own colours.
    expect(s.db.loadGames().find((g) => g.code === "COL010#1")!.colours).toEqual(before);
  });

  it("R96 a rematch against the computer swaps the colours too", async () => {
    const s = start();
    s.rt.createComputerGame("COL011");
    const a = await seat(s.url, "COL011", "p1");
    const before = a.snap.colours as Colours;
    a.send({ type: "leave_game", code: "COL011", player: "A", seatToken: a.token }); // ends it as abandoned (R81)
    await new Promise((r) => setTimeout(r, 50));
    a.send({ type: "rematch", code: "COL011", player: "A", seatToken: a.token });
    await a.next("rematch_started");
    const fresh = await a.next("snapshot");
    expect(fresh.colours).toEqual({ A: before.B, B: before.A });
  });
});

describe("R93 colours are kept in memory only while a game may still need them", () => {
  it("R93 a game made by its first join gets colours, and they are forgotten with the game once it is over (memory bounds)", async () => {
    const s = start({ retainMs: 100 });
    const a = await seat(s.url, "COL020", "p1"); // no kind: the game is made by this join
    expect(isColours(a.snap.colours)).toBe(true);
    expect(s.db.loadGames().find((g) => g.code === "COL020")!.colours).toEqual(a.snap.colours); // saved (R93)
    const b = await seat(s.url, "COL020", "p2");
    await a.next("opponent_joined");
    expect(s.rt.retained().colours).toBe(1);
    expect(s.rt.retained().started).toBe(1);
    a.send({ type: "leave_game", code: "COL020", player: "A", seatToken: a.token }); // a forfeit ends it (R81)
    await b.next("game_over");
    await new Promise((r) => setTimeout(r, 2300)); // the sweep runs once a second: the first notes the game is over, a later one forgets it
    expect(s.rt.retained().colours).toBe(0);
    expect(s.rt.retained().started).toBe(0);
  });
});
