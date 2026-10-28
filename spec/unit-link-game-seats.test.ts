// Unit check: needs no running app. Who sits and who watches in a link game (R34, R36, ADR 0012 amended), over the real
// WebSocket server on an ephemeral server. Checks W12 and W13 in spec/CHECKS.md.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

function start(options: { graceMs?: number; roundTimerMs?: number; db?: Db; perGame?: number } = {}) {
  const server = createServer((_req, res) => res.end());
  const db = options.db ?? openDb(":memory:");
  const rt = attachRealtime(server, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0,
    roundTimerMs: options.roundTimerMs ?? 5000,
    disconnectGraceMs: options.graceMs,
    computerDelayMs: 40,
    computerSeed: 7,
    spectatorsPerGame: options.perGame,
    // Who is connecting: a test sends its person in a header, as the session cookie does in the real app.
    identify: (request) => (typeof request.headers["x-person"] === "string" ? (request.headers["x-person"] as string) : null),
    nameFor: (id) => `Person ${id}`,
  });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, db, rt, url: `ws://localhost:${port}/ws` };
}
type Started = ReturnType<typeof start>;

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});
function track(s: Started): Started {
  cleanup.push(() => {
    s.rt.dispose();
    s.server.close();
  });
  return s;
}

function connect(url: string, person?: string) {
  const socket = new WebSocket(url, person ? ({ headers: { "x-person": person } } as never) : undefined);
  const raw: string[] = [];
  const queued: any[] = [];
  const waiting: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    raw.push(event.data as string);
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.match(message));
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const next = (type?: string): Promise<any> => {
    const match = (m: any) => type === undefined || m.type === type;
    const at = queued.findIndex(match);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return new Promise((resolve) => waiting.push({ match, resolve }));
  };
  const nothing = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
  cleanup.push(() => socket.close());
  return { socket, raw, next, nothing, opened, send: (body: object) => socket.send(JSON.stringify(body)) };
}
type Conn = ReturnType<typeof connect>;

// A visitor opens a link game's page: the browser sends join with a code and no seat. The server decides.
async function open(s: Started, code: string, person?: string, extra: Record<string, unknown> = {}): Promise<{ c: Conn; first: any }> {
  const c = connect(s.url, person);
  await c.opened;
  c.send({ type: "join", code, ...extra });
  const first = await Promise.race([c.next("snapshot"), c.next("spectating"), c.next("game_over")]);
  return { c, first };
}

const link = (s: Started, code: string, creator?: string) => s.rt.createLinkGame(code, creator ?? null);

describe("R36 who plays and who watches in a link game (W12)", () => {
  it("W12 (R36) the first two arrivals play, as player 1 and player 2, and every later arrival watches", async () => {
    const s = track(start());
    link(s, "LNK001", "p1");
    const one = await open(s, "LNK001", "p1");
    const two = await open(s, "LNK001", "p2");
    const three = await open(s, "LNK001", "p3");
    const four = await open(s, "LNK001", "p4");
    expect(one.first.type).toBe("snapshot");
    expect(one.first.you).toBe("A");
    expect(two.first.type).toBe("snapshot");
    expect(two.first.you).toBe("B");
    expect(three.first.type).toBe("spectating");
    expect(three.first.kind).toBe("link");
    expect(three.first.because).toBe("two_players");
    expect(four.first.type).toBe("spectating");
    expect(four.first.watching).toBe(2);
  });

  it("W12 (R36) a spectator is never given a seat token, and cannot choose", async () => {
    const s = track(start());
    link(s, "LNK002", "p1");
    await open(s, "LNK002", "p1");
    await open(s, "LNK002", "p2");
    const watcher = await open(s, "LNK002", "p3");
    expect(JSON.stringify(watcher.first)).not.toMatch(/seatToken/);
    watcher.c.send({ type: "choose", code: "LNK002", player: "A", column: 3, shield: false });
    expect(await watcher.c.next("rejected")).toEqual({ type: "rejected", reason: "spectator" });
  });

  it("W12 (R36) the creator is player 1 even if someone else opens the link first", async () => {
    const s = track(start());
    link(s, "LNK003", "creator");
    const early = await open(s, "LNK003", "stranger"); // opens the link before the creator does
    const creator = await open(s, "LNK003", "creator");
    expect(creator.first.you).toBe("A");
    expect(early.first.you).toBe("B"); // the first other person is player 2
    const late = await open(s, "LNK003", "late");
    expect(late.first.type).toBe("spectating");
  });

  it("W12 (R36) two arrivals at the same moment for the last seat give exactly one player and one spectator", async () => {
    const s = track(start());
    link(s, "LNK004", "p1");
    await open(s, "LNK004", "p1");
    // Open both sockets first, then send both joins in the same tick: the server handles one request first.
    const a = connect(s.url, "pa");
    const b = connect(s.url, "pb");
    await Promise.all([a.opened, b.opened]);
    a.send({ type: "join", code: "LNK004" });
    b.send({ type: "join", code: "LNK004" });
    const [ra, rb] = await Promise.all([Promise.race([a.next("snapshot"), a.next("spectating")]), Promise.race([b.next("snapshot"), b.next("spectating")])]);
    const players = [ra, rb].filter((m) => m.type === "snapshot");
    const watchers = [ra, rb].filter((m) => m.type === "spectating");
    expect(players.length).toBe(1);
    expect(watchers.length).toBe(1);
    expect(players[0].you).toBe("B");
  });

  it("W12 (R36) repeated races never produce two players in one seat or two spectators and no player", async () => {
    for (let round = 0; round < 8; round++) {
      const s = start();
      link(s, "RACE01", "p1");
      await open(s, "RACE01", "p1");
      const racers = Array.from({ length: 5 }, (_, i) => connect(s.url, `r${i}`));
      await Promise.all(racers.map((r) => r.opened));
      for (const r of racers) r.send({ type: "join", code: "RACE01" });
      const results = await Promise.all(racers.map((r) => Promise.race([r.next("snapshot"), r.next("spectating")])));
      expect(results.filter((m) => m.type === "snapshot").length, `round ${round}: exactly one takes seat B`).toBe(1);
      expect(results.filter((m) => m.type === "spectating").length).toBe(4);
      for (const r of racers) r.socket.close();
      s.rt.dispose();
      s.server.close();
    }
  });

  it("W12 (R36) the 50 spectator limit applies to a link game, and a full game says so", async () => {
    const s = track(start({ perGame: 2 }));
    link(s, "LNK005", "p1");
    await open(s, "LNK005", "p1");
    await open(s, "LNK005", "p2");
    expect((await open(s, "LNK005", "w1")).first.type).toBe("spectating");
    expect((await open(s, "LNK005", "w2")).first.type).toBe("spectating");
    const over = connect(s.url, "w3");
    await over.opened;
    over.send({ type: "join", code: "LNK005" });
    expect(await over.next("not_watchable")).toEqual({ type: "not_watchable", reason: "full" });
  });

  it("W12 (R36) a player who comes back with their seat token gets their own seat, not a spectator's place", async () => {
    const s = track(start());
    link(s, "LNK006", "p1");
    const one = await open(s, "LNK006", "p1");
    await open(s, "LNK006", "p2");
    await open(s, "LNK006", "w1");
    one.c.socket.close();
    await one.c.nothing(60);
    const back = await open(s, "LNK006", "p1", { player: "A", seatToken: one.first.seatToken });
    expect(back.first.type).toBe("snapshot");
    expect(back.first.you).toBe("A");
  });
});

describe("R36 and R27 a spectator cannot take a seat while its player is away (W13)", () => {
  it("W13 (R36, R27) when player 2 drops, the next arrival watches, and player 2 gets the seat back within the 30 seconds", async () => {
    const s = track(start({ graceMs: 600 }));
    link(s, "LNK010", "p1");
    await open(s, "LNK010", "p1");
    const two = await open(s, "LNK010", "p2");
    two.c.socket.close(); // player 2 drops
    await two.c.nothing(80);
    const arrival = await open(s, "LNK010", "p3"); // arrives during the reconnection window
    expect(arrival.first.type).toBe("spectating");
    expect(arrival.first.because).toBe("two_players");
    const back = await open(s, "LNK010", "p2", { player: "B", seatToken: two.first.seatToken });
    expect(back.first.type).toBe("snapshot");
    expect(back.first.you).toBe("B");
  });

  it("W13 (R36, R27, R32) a visitor who names the dropped player's seat without its token cannot take it, and is told nothing about the game", async () => {
    const s = track(start({ graceMs: 600 }));
    link(s, "LNK011", "p1");
    await open(s, "LNK011", "p1");
    const two = await open(s, "LNK011", "p2");
    two.c.socket.close();
    await two.c.nothing(80);
    const thief = connect(s.url, "p3");
    await thief.opened;
    thief.send({ type: "join", code: "LNK011", player: "B" }); // names the seat: this is a guess, not a visitor opening a link
    expect(await Promise.race([thief.next("game_full"), thief.next("snapshot"), thief.next("spectating")])).toEqual({ type: "game_full" });
    // The real player still gets it back.
    const back = await open(s, "LNK011", "p2", { player: "B", seatToken: two.first.seatToken });
    expect(back.first.you).toBe("B");
  });

  it("W13 (R36, R27) a spectator cannot take a seat after the grace period ends either: the game is over", async () => {
    const s = track(start({ graceMs: 120 }));
    link(s, "LNK012", "p1");
    await open(s, "LNK012", "p1");
    const two = await open(s, "LNK012", "p2");
    const watcher = await open(s, "LNK012", "w");
    two.c.socket.close();
    expect((await watcher.c.next("ended")).result).toBe("forfeit");
    // A visitor who opens the link of a game that has ended is shown its result and given no seat (R36).
    const later = connect(s.url, "p3");
    await later.opened;
    later.send({ type: "join", code: "LNK012" });
    const shown = await Promise.race([later.next("snapshot"), later.next("spectating"), later.next("ended"), later.next("not_watchable")]);
    expect(shown.type).toBe("ended");
    expect(shown.result).toBe("forfeit");
    expect(JSON.stringify(shown)).not.toMatch(/seatToken/);
  });

  it("W13 (R36) after a restart the seats still belong to the same two people, and a spectator cannot take one", async () => {
    const db = openDb(":memory:");
    const first = track(start({ db }));
    link(first, "LNK013", "p1");
    await open(first, "LNK013", "p1");
    await open(first, "LNK013", "p2");
    first.rt.dispose();
    first.server.close();
    const second = track(start({ db }));
    const stranger = await open(second, "LNK013", "p3"); // before either player has come back
    expect(stranger.first.type, "a stranger cannot take a seat the two people still own").toBe("spectating");
    const one = await open(second, "LNK013", "p1");
    const two = await open(second, "LNK013", "p2");
    expect(one.first.you).toBe("A");
    expect(two.first.you).toBe("B");
  });
});

describe("R71 a game against the computer can never be watched", () => {
  it("R71 a computer game is answered exactly like a code that does not exist, by code and by Watch live", async () => {
    const s = track(start());
    s.rt.createComputerGame("CMP001");
    const human = await open(s, "CMP001", "h");
    expect(human.first.you).toBe("A");
    const byCode = connect(s.url, "w1");
    await byCode.opened;
    byCode.send({ type: "spectate", code: "CMP001" });
    const real = await byCode.next("not_watchable");
    const none = connect(s.url, "w2");
    await none.opened;
    none.send({ type: "spectate", code: "NOSUCH" });
    expect(real).toEqual(await none.next("not_watchable"));
    expect(real.reason).toBe("unknown");
    // Watch live never offers it, and counts nothing.
    const random = connect(s.url, "w3");
    await random.opened;
    random.send({ type: "spectate" });
    expect(await random.next("none_live")).toEqual({ type: "none_live" });
    expect(s.rt.liveCount()).toBe(0);
  });

  it("R71 a third person who opens a computer game's link is not made a spectator of it: it has one seat", async () => {
    const s = track(start());
    s.rt.createComputerGame("CMP002");
    await open(s, "CMP002", "h");
    const second = connect(s.url, "other");
    await second.opened;
    second.send({ type: "join", code: "CMP002" });
    const answer = await Promise.race([second.next("game_full"), second.next("spectating"), second.next("snapshot")]);
    expect(answer.type).toBe("game_full"); // told it is a private game against the computer, never shown it
  });
});

describe("R70 Watch live shows quick match games only", () => {
  it("R70 and R80 with no quick match game live, Watch live says none_live; a link game does not count", async () => {
    const s = track(start());
    link(s, "LNK020", "p1");
    await open(s, "LNK020", "p1");
    await open(s, "LNK020", "p2");
    expect(s.rt.liveCount()).toBe(0);
    const w = connect(s.url, "w");
    await w.opened;
    w.send({ type: "spectate" });
    expect(await w.next("none_live")).toEqual({ type: "none_live" });
  });

  it("R70 and R80 a live quick match game is offered and counted; a link game beside it is not", async () => {
    const s = track(start());
    link(s, "LNK021", "p1");
    await open(s, "LNK021", "p1");
    await open(s, "LNK021", "p2");
    s.rt.createQuickGame("QCK001");
    await open(s, "QCK001", "q1");
    await open(s, "QCK001", "q2");
    expect(s.rt.liveCount()).toBe(1);
    for (let i = 0; i < 6; i++) {
      const w = connect(s.url, `w${i}`);
      await w.opened;
      w.send({ type: "spectate" });
      expect((await w.next("spectating")).code).toBe("QCK001");
      w.socket.close();
    }
  });

  it("R71 a link game can be watched by its code, and a quick match game too, by those who know it", async () => {
    const s = track(start());
    link(s, "LNK022", "p1");
    await open(s, "LNK022", "p1");
    await open(s, "LNK022", "p2");
    const w = connect(s.url, "w");
    await w.opened;
    w.send({ type: "spectate", code: "LNK022" });
    const joined = await w.next("spectating");
    expect(joined.kind).toBe("link");
    expect(s.rt.liveCount()).toBe(0); // watching it still does not list or count it
  });

  it("R71 a link game that has only one player yet is not watchable: there is nothing to watch", async () => {
    const s = track(start());
    link(s, "LNK023", "p1");
    await open(s, "LNK023", "p1");
    const w = connect(s.url, "w");
    await w.opened;
    w.send({ type: "spectate", code: "LNK023" });
    expect(await w.next("not_watchable")).toEqual({ type: "not_watchable", reason: "unknown" });
  });
});

describe("R36 a link game that has finished is shown to a later visitor with its result", () => {
  it("W13 (R36, U92) a visitor sent to the watching page by the link joins again and is shown a finished game, not 'cannot be watched'", async () => {
    const s = track(start({ graceMs: 100 }));
    link(s, "LNK030", "p1");
    await open(s, "LNK030", "p1");
    const two = await open(s, "LNK030", "p2");
    two.c.socket.close();
    await two.c.nothing(250); // the grace period passes: the game is forfeited
    const again = connect(s.url, "p3");
    await again.opened;
    again.send({ type: "join", code: "LNK030" });
    const shown = await again.next("ended");
    expect(shown.result).toBe("forfeit");
  });
});
