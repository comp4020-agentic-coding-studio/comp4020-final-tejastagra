// Unit check: needs no running app. A first-time player's seat is held while they do the tutorial (R102, ADR 0017), over the real
// WebSocket server on an ephemeral server. Check R102 in spec/CHECKS.md.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";

function start(options: { graceMs?: number; countdownMs?: number; db?: Db } = {}) {
  const server = createServer((_req, res) => res.end());
  const db = options.db ?? openDb(":memory:");
  const rt = attachRealtime(server, db, {
    countdownMs: options.countdownMs ?? 0,
    roundTimerMs: 5000,
    disconnectGraceMs: options.graceMs ?? 60_000,
    computerDelayMs: 40,
    computerSeed: 7,
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
  const queued: any[] = [];
  const waiting: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string);
    const at = waiting.findIndex((w) => w.match(message));
    if (at >= 0) waiting.splice(at, 1)[0].resolve(message);
    else queued.push(message);
  });
  const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const next = (type: string): Promise<any> => {
    const at = queued.findIndex((m) => m.type === type);
    if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]);
    return new Promise((resolve) => waiting.push({ match: (m) => m.type === type, resolve }));
  };
  const seen = (type: string) => queued.some((m) => m.type === type);
  const nothing = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));
  cleanup.push(() => socket.close());
  return { socket, next, seen, nothing, opened, send: (body: object) => socket.send(JSON.stringify(body)) };
}
type Conn = ReturnType<typeof connect>;

async function open(s: Started, code: string, person: string, extra: Record<string, unknown> = {}): Promise<{ c: Conn; first: any }> {
  const c = connect(s.url, person);
  await c.opened;
  c.send({ type: "join", code, ...extra });
  const first = await Promise.race([c.next("snapshot"), c.next("spectating"), c.next("game_full")]);
  return { c, first };
}

const link = (s: Started, code: string) => s.rt.createLinkGame(code, "host");
const finish = (c: Conn, code: string, first: any) => c.send({ type: "learning_done", code, player: first.you, seatToken: first.seatToken });

describe("R102 a first-time player holds their seat while they do the tutorial", () => {
  it("R102 the learner takes the seat at once, so a third visitor is a spectator, and the game does not start", async () => {
    const s = track(start({ countdownMs: 50 }));
    link(s, "LRN001");
    const host = await open(s, "LRN001", "host");
    const learner = await open(s, "LRN001", "newbie", { learning: true });
    expect(learner.first.type).toBe("snapshot");
    expect(learner.first.you).toBe("B");
    expect(learner.first.learning).toBe(true);
    expect(await host.c.next("opponent_learning")).toEqual({ type: "opponent_learning" });
    const third = await open(s, "LRN001", "stranger");
    expect(third.first.type).toBe("spectating");
    expect(third.first.learning).toBe(true);
    await host.c.nothing(300); // longer than the countdown: nothing started
    expect(host.c.seen("countdown")).toBe(false);
    expect(learner.c.seen("countdown")).toBe(false);
  });

  it("R102 the host's snapshot says the other seat is learning, and that the opponent is not yet present", async () => {
    const s = track(start());
    link(s, "LRN002");
    await open(s, "LRN002", "newbie", { learning: true });
    const host = await open(s, "LRN002", "host");
    expect(host.first.opponentLearning).toBe(true);
    expect(host.first.opponentPresent).toBe(false);
    expect(host.first.learning).toBe(false);
  });

  it("R102 learning_done starts the countdown, tells the host and the spectators, and clears the learning flag", async () => {
    const s = track(start({ countdownMs: 50 }));
    link(s, "LRN003");
    const host = await open(s, "LRN003", "host");
    const learner = await open(s, "LRN003", "newbie", { learning: true });
    const watcher = await open(s, "LRN003", "stranger");
    await host.c.next("opponent_learning");
    finish(learner.c, "LRN003", learner.first);
    expect((await host.c.next("opponent_joined")).type).toBe("opponent_joined");
    expect((await watcher.c.next("learning_over")).type).toBe("learning_over");
    expect((await host.c.next("countdown")).type).toBe("countdown");
    expect((await learner.c.next("countdown")).type).toBe("countdown");
    expect((await host.c.next("started")).type).toBe("started");
    const again = await learner.c.next("snapshot");
    expect(again.learning).toBe(false);
  });

  it("R102 only the learner's own connection with the seat's token can end the hold", async () => {
    const s = track(start({ countdownMs: 50 }));
    link(s, "LRN004");
    const host = await open(s, "LRN004", "host");
    const learner = await open(s, "LRN004", "newbie", { learning: true });
    // The host cannot say it for them, and neither can anyone with a wrong token.
    host.c.send({ type: "learning_done", code: "LRN004", player: "B", seatToken: host.first.seatToken });
    learner.c.send({ type: "learning_done", code: "LRN004", player: "B", seatToken: "nope" });
    learner.c.send({ type: "learning_done", code: "LRN004", player: "B" });
    const other = connect(s.url, "stranger");
    await other.opened;
    other.send({ type: "learning_done", code: "LRN004", player: "B", seatToken: learner.first.seatToken });
    await host.c.nothing(300);
    expect(host.c.seen("countdown")).toBe(false);
    finish(learner.c, "LRN004", learner.first);
    expect((await host.c.next("countdown")).type).toBe("countdown");
  });

  it("R102 the flag is ignored for a quick match game, a computer game and a game that has started", async () => {
    const s = track(start({ countdownMs: 50 }));
    s.rt.createQuickGame("LRN005");
    const a = await open(s, "LRN005", "p1", { learning: true });
    const b = await open(s, "LRN005", "p2", { learning: true });
    expect(a.first.learning).toBe(false);
    expect(b.first.learning).toBe(false);
    expect((await a.c.next("countdown")).type).toBe("countdown"); // nobody was held

    s.rt.createComputerGame("LRN006");
    const human = await open(s, "LRN006", "p3", { learning: true });
    expect(human.first.learning).toBe(false);

    link(s, "LRN007");
    const host = await open(s, "LRN007", "host");
    const joiner = await open(s, "LRN007", "p4");
    await host.c.next("countdown");
    await host.c.next("started");
    host.c.socket.close();
    await joiner.c.nothing(50);
    const late = await open(s, "LRN007", "p5", { learning: true }); // both seats taken: a spectator, whatever it says
    expect(late.first.type).toBe("spectating");
  });

  it("R102 a learner who reloads, or comes back inside the grace, keeps the seat and is still learning", async () => {
    const s = track(start({ graceMs: 400 }));
    link(s, "LRN008");
    const host = await open(s, "LRN008", "host");
    const learner = await open(s, "LRN008", "newbie", { learning: true });
    await host.c.next("opponent_learning");
    learner.c.socket.close();
    await host.c.nothing(120);
    const back = await open(s, "LRN008", "newbie", { player: "B", seatToken: learner.first.seatToken });
    expect(back.first.type).toBe("snapshot");
    expect(back.first.you).toBe("B");
    expect(back.first.learning).toBe(true);
    await host.c.nothing(600); // longer than the grace: it was cleared by the return
    expect(host.c.seen("opponent_gone")).toBe(false);
    const third = await open(s, "LRN008", "stranger");
    expect(third.first.type).toBe("spectating");
  });

  it("R102 a learner gone for longer than the grace gives the seat back as if they had never come", async () => {
    const s = track(start({ graceMs: 200 }));
    link(s, "LRN009");
    const host = await open(s, "LRN009", "host");
    const learner = await open(s, "LRN009", "newbie", { learning: true });
    const watcher = await open(s, "LRN009", "stranger");
    await host.c.next("opponent_learning");
    learner.c.socket.close();
    expect((await host.c.next("opponent_gone")).type).toBe("opponent_gone");
    expect((await watcher.c.next("seat_released")).type).toBe("seat_released");
    // The seat is free again: the next person to open the link plays, and their old token is worth nothing.
    const next = await open(s, "LRN009", "someone");
    expect(next.first.type).toBe("snapshot");
    expect(next.first.you).toBe("B");
    expect(next.first.learning).toBe(false);
    expect(next.first.seatToken).not.toBe(learner.first.seatToken);
    const old = await open(s, "LRN009", "newbie", { player: "B", seatToken: learner.first.seatToken });
    expect(old.first.type === "game_full" || old.first.type === "spectating").toBe(true);
  });

  it("R102 the learner's seat is saved with their person only when they finish, so a restart leaves it free", async () => {
    const s = track(start({ countdownMs: 0 }));
    link(s, "LRN010");
    await open(s, "LRN010", "host");
    const learner = await open(s, "LRN010", "newbie", { learning: true });
    const seatedBefore = s.db.loadGames().find((g) => g.code === "LRN010");
    expect(seatedBefore?.playerB ?? null).toBeNull();
    finish(learner.c, "LRN010", learner.first);
    await learner.c.next("snapshot");
    const seatedAfter = s.db.loadGames().find((g) => g.code === "LRN010");
    expect(seatedAfter?.playerB).toBe("newbie");
  });

  it("R102 the host cancelling while the opponent learns abandons the game, never forfeits it, and tells the learner", async () => {
    const s = track(start());
    link(s, "LRN011");
    const host = await open(s, "LRN011", "host");
    const learner = await open(s, "LRN011", "newbie", { learning: true });
    await host.c.next("opponent_learning");
    host.c.send({ type: "leave_game", code: "LRN011", player: "A", seatToken: host.first.seatToken });
    expect((await learner.c.next("opponent_cancelled")).type).toBe("opponent_cancelled");
    expect(learner.c.seen("game_over")).toBe(false); // no result for anyone: it never started
    expect(s.db.loadGames().find((g) => g.code === "LRN011")?.ended).toEqual({ result: "abandoned" });
  });

  it("R102 a host who is gone for longer than the grace while the opponent learns abandons it too", async () => {
    const s = track(start({ graceMs: 200 }));
    link(s, "LRN012");
    const host = await open(s, "LRN012", "host");
    const learner = await open(s, "LRN012", "newbie", { learning: true });
    await host.c.next("opponent_learning");
    host.c.socket.close();
    expect((await learner.c.next("opponent_cancelled")).type).toBe("opponent_cancelled");
    expect(s.db.loadGames().find((g) => g.code === "LRN012")?.ended).toEqual({ result: "abandoned" });
  });

  it("R102 a learner leaving on purpose releases the seat and the host sees the share link card again", async () => {
    const s = track(start());
    link(s, "LRN013");
    const host = await open(s, "LRN013", "host");
    const learner = await open(s, "LRN013", "newbie", { learning: true });
    await host.c.next("opponent_learning");
    learner.c.send({ type: "leave_game", code: "LRN013", player: "B", seatToken: learner.first.seatToken });
    expect((await host.c.next("opponent_gone")).type).toBe("opponent_gone");
    const next = await open(s, "LRN013", "someone");
    expect(next.first.you).toBe("B");
  });

  it("R102 the learner's messages to the host carry no choice and nothing of the tutorial (R22)", async () => {
    const s = track(start());
    link(s, "LRN014");
    const host = await open(s, "LRN014", "host");
    await open(s, "LRN014", "newbie", { learning: true });
    const told = await host.c.next("opponent_learning");
    expect(Object.keys(told)).toEqual(["type"]);
  });

  it("R102 when one of two learners finishes, the other still holds the game: no learning_over, no countdown", async () => {
    const s = track(start({ countdownMs: 50 }));
    link(s, "LRN015");
    const a = await open(s, "LRN015", "host", { learning: true });
    const b = await open(s, "LRN015", "newbie", { learning: true });
    const watcher = await open(s, "LRN015", "stranger");
    finish(a.c, "LRN015", a.first);
    await b.c.next("opponent_learning");
    await a.c.nothing(300);
    expect(watcher.c.seen("learning_over")).toBe(false);
    expect(b.c.seen("opponent_joined")).toBe(false);
    expect(a.c.seen("countdown")).toBe(false);
    finish(b.c, "LRN015", b.first);
    expect((await watcher.c.next("learning_over")).type).toBe("learning_over");
    expect((await a.c.next("countdown")).type).toBe("countdown");
  });
});
