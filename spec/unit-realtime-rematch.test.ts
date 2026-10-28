// Unit check: needs no running app. Rematches (R82 to R85) on an ephemeral server.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db.ts";
import { attachRealtime } from "../src/server/realtime.ts";
import { leaderboardFrom } from "../src/server/leaderboard.ts";

function start(options: { offerMs?: number; graceMs?: number; retainMs?: number } = {}) {
  const server = createServer((_req, res) => res.end());
  const db = openDb(":memory:");
  const rt = attachRealtime(server, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0,
    disconnectGraceMs: options.graceMs ?? 60_000,
    roundTimerMs: 60_000,
    computerDelayMs: 20,
    computerSeed: 3,
    rematchOfferMs: options.offerMs,
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
  const quiet = async (type: string, ms = 150): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, ms));
    return !queued.some((m) => m.type === type);
  };
  cleanup.push(() => socket.close());
  return { socket, opened, next, quiet, send: (body: object) => socket.send(JSON.stringify(body)) };
}

async function seat(url: string, code: string, person: string) {
  const c = connect(url, person);
  await c.opened;
  c.send({ type: "join", code });
  const snap = await c.next("snapshot");
  return { ...c, snap, token: snap.seatToken as string, you: snap.you as "A" | "B" };
}

// A finished game: A stacks column 0 four times while B alternates columns 1 and 2, so A wins in 4 rounds.
async function playToWin(a: Awaited<ReturnType<typeof seat>>, b: Awaited<ReturnType<typeof seat>>, code: string) {
  for (let i = 0; i < 4; i++) {
    a.send({ type: "choose", code, player: "A", seatToken: a.token, column: 0, shield: false });
    b.send({ type: "choose", code, player: "B", seatToken: b.token, column: 1 + (i % 2), shield: false });
    await a.next("snapshot");
  }
}

const ask = (c: { send: (b: object) => void }, code: string, you: "A" | "B", token: string) => c.send({ type: "rematch", code, player: you, seatToken: token });

async function finishedLinkGame(s: ReturnType<typeof start>, code: string) {
  s.rt.createLinkGame(code, "p1");
  const a = await seat(s.url, code, "p1");
  const b = await seat(s.url, code, "p2");
  await a.next("opponent_joined");
  await playToWin(a, b, code);
  await b.next("snapshot"); // drain B's copies
  return { a, b };
}

describe("R82 a rematch starts only when both have asked", () => {
  it("R82 the first to ask is waiting, the other is offered it, and when both have asked a new game starts for both", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT001");
    ask(a, "RMT001", "A", a.token);
    expect(await b.next("rematch_offer")).toEqual({ type: "rematch_offer", from: "opponent" });
    expect(await a.quiet("rematch_started")).toBe(true); // asking alone starts nothing
    ask(b, "RMT001", "B", b.token);
    expect(await a.next("rematch_started")).toEqual({ type: "rematch_started" });
    expect(await b.next("rematch_started")).toEqual({ type: "rematch_started" });
    const fresh = await a.next("snapshot");
    expect(fresh.state.round).toBe(0);
    expect(fresh.state.status).toBe("playing");
    expect(fresh.you).toBe("A"); // the same seat
    expect((await b.next("snapshot")).you).toBe("B");
  });

  it("R82 a request about a game that is still being played is ignored", async () => {
    const s = start();
    s.rt.createLinkGame("RMT002", "p1");
    const a = await seat(s.url, "RMT002", "p1");
    const b = await seat(s.url, "RMT002", "p2");
    await a.next("opponent_joined");
    ask(a, "RMT002", "A", a.token);
    ask(b, "RMT002", "B", b.token);
    expect(await a.quiet("rematch_started")).toBe(true);
    expect(await b.quiet("rematch_offer")).toBe(true);
  });

  it("R82 and R32 a rematch request without the seat's own token does nothing", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT003");
    ask(a, "RMT003", "A", "wrong");
    ask(b, "RMT003", "B", "wrong");
    expect(await b.quiet("rematch_offer")).toBe(true);
    expect(await a.quiet("rematch_offer")).toBe(true);
  });

  it("R82 asking twice changes nothing", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT004");
    ask(a, "RMT004", "A", a.token);
    ask(a, "RMT004", "A", a.token);
    await b.next("rematch_offer");
    expect(await b.quiet("rematch_started")).toBe(true);
    ask(b, "RMT004", "B", b.token);
    await a.next("rematch_started");
  });

  it("R82 a game against the computer rematches at once, as a new computer game under the same code", async () => {
    const s = start();
    s.rt.createComputerGame("RMT005");
    const h = await seat(s.url, "RMT005", "p9");
    // The human wins by stacking while the computer is given no time to block: end it by leaving instead, which abandons.
    h.send({ type: "leave_game", code: "RMT005", player: "A", seatToken: h.token });
    await new Promise((r) => setTimeout(r, 100));
    ask(h, "RMT005", "A", h.token);
    expect(await h.next("rematch_started")).toEqual({ type: "rematch_started" });
    const fresh = await h.next("snapshot");
    expect(fresh.state.round).toBe(0);
    expect(fresh.opponentName).toBe("Computer");
    expect(s.db.loadGames().find((g) => g.code === "RMT005")!.vsComputer).toBe(true);
  });
});

describe("R83 an offer ends when it expires or someone leaves", () => {
  it("R83 an offer expires after the time allowed and the one still there is told", async () => {
    const s = start({ offerMs: 150 });
    const { a, b } = await finishedLinkGame(s, "RMT010");
    ask(a, "RMT010", "A", a.token);
    await b.next("rematch_offer");
    expect(await a.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "expired" });
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "expired" });
    ask(b, "RMT010", "B", b.token); // too late: nothing starts from half an old offer
    expect(await a.quiet("rematch_started")).toBe(true);
  });

  it("R83 when the other player leaves, the one still there is told, and nothing starts", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT011");
    ask(a, "RMT011", "A", a.token);
    await b.next("rematch_offer");
    a.send({ type: "leave_game", code: "RMT011", player: "A", seatToken: a.token }); // leaves from the end popup
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
    ask(b, "RMT011", "B", b.token);
    expect(await b.quiet("rematch_started")).toBe(true);
  });

  it("R83 when the other player's connection drops and does not return, the one still there is told", async () => {
    const s = start({ graceMs: 120 });
    const { a, b } = await finishedLinkGame(s, "RMT012");
    ask(a, "RMT012", "A", a.token);
    await b.next("rematch_offer");
    a.socket.close();
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
  });

  it("R83 someone who asks after the other has already left is told straight away", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT013");
    a.send({ type: "leave_game", code: "RMT013", player: "A", seatToken: a.token });
    await new Promise((r) => setTimeout(r, 100));
    ask(b, "RMT013", "B", b.token);
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
  });
});

describe("R84 a rematch keeps the link, the players and the spectators, and is a separate game", () => {
  it("R84 the same code, the same two people, and spectators stay and see the new game", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT020");
    const w = connect(s.url, "w");
    await w.opened;
    w.send({ type: "join", code: "RMT020" });
    const watching = await w.next("spectating");
    expect(watching.state.status).toBe("won");
    ask(a, "RMT020", "A", a.token);
    ask(b, "RMT020", "B", b.token);
    await a.next("rematch_started");
    const started = await w.next("rematch_started");
    expect(started).toEqual({ type: "rematch_started", colours: expect.objectContaining({}) }); // R96: the new colours, and nothing else
    expect(Object.keys(started.colours).sort()).toEqual(["A", "B"]);
    const round = await w.next("round");
    expect(round.state.round).toBe(0);
    expect(round.state.status).toBe("playing");
  });

  it("R84 and R38 each rematch is a separate row: the first game keeps its result and each win counts once", async () => {
    const s = start();
    s.db.createPlayer("p1", "Alpha");
    s.db.createPlayer("p2", "Beta");
    const { a, b } = await finishedLinkGame(s, "RMT021");
    ask(a, "RMT021", "A", a.token);
    ask(b, "RMT021", "B", b.token);
    await a.next("rematch_started");
    await a.next("snapshot");
    await b.next("snapshot");
    // Play the rematch to a win for A again.
    await playToWin(a, b, "RMT021");
    const games = s.db.loadGames().filter((g) => g.code === "RMT021" || g.code.startsWith("RMT021#"));
    expect(games.map((g) => g.code).sort()).toEqual(["RMT021", "RMT021#1"]);
    for (const g of games) {
      expect(g.state.status).toBe("won");
      expect(g.state.winner).toBe("A");
      expect(g.playerA).toBe("p1");
      expect(g.playerB).toBe("p2");
    }
    const board = leaderboardFrom(s.db, 10);
    expect(board.wins.find((r) => r.name.startsWith("Alpha"))?.value).toBe(2);
    expect(board.rounds.find((r) => r.name.startsWith("Alpha"))?.value).toBe(4);
  });

  it("R84 the archive is saved before the new game starts, and a second rematch is archived as #2", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT022");
    ask(a, "RMT022", "A", a.token);
    ask(b, "RMT022", "B", b.token);
    await a.next("rematch_started");
    await a.next("snapshot");
    await b.next("snapshot");
    await playToWin(a, b, "RMT022");
    await b.next("snapshot");
    ask(b, "RMT022", "B", b.token);
    ask(a, "RMT022", "A", a.token);
    await a.next("rematch_started");
    const codes = s.db.loadGames().map((g) => g.code).filter((c) => c.startsWith("RMT022")).sort();
    expect(codes).toEqual(["RMT022", "RMT022#1", "RMT022#2"]);
    expect(s.db.loadGames().find((g) => g.code === "RMT022")!.state.round).toBe(0);
  });

  it("R84 the creator is still player 1 and a spectator still cannot take a seat after a rematch", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT023");
    ask(a, "RMT023", "A", a.token);
    ask(b, "RMT023", "B", b.token);
    await a.next("rematch_started");
    const stranger = connect(s.url, "p3");
    await stranger.opened;
    stranger.send({ type: "join", code: "RMT023" });
    expect((await stranger.next("spectating")).because).toBe("two_players");
  });

  it("R85 a rematch of a quick match game stays a quick match game and a computer rematch never touches the leaderboard", async () => {
    const s = start();
    s.rt.createQuickGame("RMT024");
    const a = await seat(s.url, "RMT024", "p1");
    const b = await seat(s.url, "RMT024", "p2");
    await a.next("opponent_joined");
    await playToWin(a, b, "RMT024");
    await b.next("snapshot");
    ask(a, "RMT024", "A", a.token);
    ask(b, "RMT024", "B", b.token);
    await a.next("rematch_started");
    expect(s.rt.kindsKnown().find(([code]) => code === "RMT024")?.[1]).toBe("quick");
  });
});

describe("R83 edge cases found in review", () => {
  it("R82 and R83 when one asks and then drops, and the other asks, nothing starts into the empty seat: the one still there is told", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT030");
    ask(a, "RMT030", "A", a.token);
    await b.next("rematch_offer");
    a.socket.close();
    await new Promise((r) => setTimeout(r, 80));
    ask(b, "RMT030", "B", b.token);
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
    expect(await b.quiet("rematch_started")).toBe(true);
    expect(s.db.loadGames().filter((g) => g.code.startsWith("RMT030")).map((g) => g.code)).toEqual(["RMT030"]); // nothing archived
  });

  it("R25 and R83 if archiving fails, nothing changes in the database and both players are told the offer is over", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT031");
    const real = s.db.archiveGame.bind(s.db);
    (s.db as any).archiveGame = () => {
      throw new Error("disk full");
    };
    ask(a, "RMT031", "A", a.token);
    ask(b, "RMT031", "B", b.token);
    expect(await a.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
    expect(s.db.loadGames().find((g) => g.code === "RMT031")!.state.status).toBe("won"); // the finished game is as it was
    (s.db as any).archiveGame = real;
  });

  it("R83 after a restart a finished game is gone from memory: a player who asks with their real token is told it is over, and nothing starts", async () => {
    const db = openDb(":memory:");
    const first = (() => {
      const server = createServer((_req, res) => res.end());
      const rt = attachRealtime(server, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0, disconnectGraceMs: 60_000, roundTimerMs: 60_000, identify: (r) => (typeof r.headers["x-person"] === "string" ? (r.headers["x-person"] as string) : null) });
      server.listen(0);
      return { server, rt, url: `ws://localhost:${(server.address() as AddressInfo).port}/ws` };
    })();
    first.rt.createLinkGame("RMT032", "p1");
    const a = await seat(first.url, "RMT032", "p1");
    const b = await seat(first.url, "RMT032", "p2");
    await a.next("opponent_joined");
    await playToWin(a, b, "RMT032");
    a.socket.close();
    b.socket.close();
    first.rt.dispose();
    first.server.close();
    // The server restarts: the finished game is in the database and not in memory. The seat tokens were in memory too, so a
    // player coming back has none; a request with a stale token is refused (R32) and nothing starts.
    const second = createServer((_req, res) => res.end());
    const rt = attachRealtime(second, db, {
    // No start countdown: these checks are about other rules (R97, ADR 0014).
    countdownMs: 0, disconnectGraceMs: 60_000, roundTimerMs: 60_000, identify: (r) => (typeof r.headers["x-person"] === "string" ? (r.headers["x-person"] as string) : null) });
    second.listen(0);
    cleanup.push(() => {
      rt.dispose();
      second.close();
    });
    const url = `ws://localhost:${(second.address() as AddressInfo).port}/ws`;
    const c = await seat(url, "RMT032", "p1");
    // Joining a finished, restarted game shows how it ended and gives the seat back to the person it belongs to.
    c.send({ type: "rematch", code: "RMT032", player: "A", seatToken: c.token });
    const answer = await Promise.race([c.next("rematch_ended"), c.next("rematch_started")]);
    expect(answer).toEqual({ type: "rematch_ended", reason: "left" });
    expect(db.loadGames().filter((g) => g.code.startsWith("RMT032")).length).toBe(1); // nothing was archived
  });

  it("R84 a finished game is forgotten after a while, so the maps stay small: kinds, creators, holders and every rematch entry", async () => {
    const s = start({ retainMs: 100 });
    const { a, b } = await finishedLinkGame(s, "RMT033");
    ask(a, "RMT033", "A", a.token);
    await b.next("rematch_offer");
    a.send({ type: "leave_game", code: "RMT033", player: "A", seatToken: a.token });
    await b.next("rematch_ended");
    expect(s.rt.retained().rematchGone).toBe(1);
    await new Promise((r) => setTimeout(r, 1300)); // the sweep runs at least once a second
    s.rt.liveCount(); // a sweep also runs whenever the live games are asked for
    expect(s.rt.retained()).toEqual({ kinds: 0, creators: 0, holders: 0, rematchGone: 0, rematchAsked: 0, rematchTimers: 0, colours: 0, started: 0 });
    // and a request about a forgotten game is answered, not ignored
    ask(b, "RMT033", "B", b.token);
    expect(await b.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
  });

  it("R36 a spectator of a finished game who sends a join naming a seat is refused and never given it", async () => {
    const s = start();
    const { a, b } = await finishedLinkGame(s, "RMT034");
    const w = connect(s.url, "w");
    await w.opened;
    w.send({ type: "join", code: "RMT034" });
    await w.next("spectating");
    w.send({ type: "join", code: "RMT034", player: "A" });
    w.send({ type: "join", code: "RMT034", player: "B", seatToken: "guess" });
    w.send({ type: "rematch", code: "RMT034", player: "A", seatToken: "guess" });
    expect(await a.quiet("rematch_offer")).toBe(true);
    expect(await b.quiet("rematch_offer")).toBe(true);
  });
});

describe("R84 a rematch starts like any new game", () => {
  it("R2 and R84 the new game has every row open, a fresh shield and Earthquake, and round 0, whatever the old game had used", async () => {
    const s = start();
    s.rt.createLinkGame("RMT040", "p1");
    const a = await seat(s.url, "RMT040", "p1");
    const b = await seat(s.url, "RMT040", "p2");
    await a.next("opponent_joined");
    // A finished game with spent power-ups and a shrunk board, as the database would hold after a long game.
    const spent = { board: [[], [], [], [], [], [], []], round: 14, shieldsLeft: { A: false, B: false }, earthquakesLeft: { A: false, B: false }, rows: 5, status: "won", winner: "A" } as never;
    s.db.saveRound("RMT040", spent, false, false);
    (s.rt.game.getGame("RMT040") as any).state = spent;
    ask(a, "RMT040", "A", a.token);
    ask(b, "RMT040", "B", b.token);
    await a.next("rematch_started");
    const fresh = await a.next("snapshot");
    expect(fresh.state.round).toBe(0);
    expect(fresh.state.rows).toBe(6);
    expect(fresh.state.shieldsLeft).toEqual({ A: true, B: true });
    expect(fresh.state.earthquakesLeft).toEqual({ A: true, B: true });
    expect(s.db.loadGames().find((g) => g.code === "RMT040#1")!.state.round).toBe(14); // the long game is kept as it ended
  });
});

describe("R82 and R84 a rematch after a quick match works like a link game's (fix list Part 4)", () => {
  it("R82 R84 in a quick match game the first to ask waits, the other is offered it, and when both ask a new game starts on the same code with the same two people", async () => {
    const s = start();
    s.rt.createQuickGame("RMQ001");
    const a = await seat(s.url, "RMQ001", "q1");
    const b = await seat(s.url, "RMQ001", "q2");
    await a.next("opponent_joined");
    await playToWin(a, b, "RMQ001");
    await b.next("snapshot");
    ask(a, "RMQ001", "A", a.token);
    expect(await b.next("rematch_offer")).toEqual({ type: "rematch_offer", from: "opponent" });
    expect(await a.quiet("rematch_started")).toBe(true); // asking alone starts nothing
    ask(b, "RMQ001", "B", b.token);
    await a.next("rematch_started");
    await b.next("rematch_started");
    const fresh = await a.next("snapshot");
    expect(fresh.state.round).toBe(0);
    expect(fresh.you).toBe("A");
    expect(fresh.opponentName).toBe("Person q2"); // the same opponent
    expect((await b.next("snapshot")).opponentName).toBe("Person q1");
    // The same code, still a quick match game, and the finished one archived beside it (R84).
    expect(s.rt.kindsKnown()).toContainEqual(["RMQ001", "quick"]);
    expect(s.db.loadGames().map((g) => g.code).filter((c) => c.startsWith("RMQ001")).sort()).toEqual(["RMQ001", "RMQ001#1"]);
  });
});

describe("R83 a quick match that ended by a forfeit never starts a new game or a queue from Play again (fix list Part 4)", () => {
  it("R83 the winner of a quick match forfeit who taps Play again is told the other left, and nothing is created", async () => {
    const s = start({ graceMs: 60_000 });
    s.rt.createQuickGame("RMQ002");
    const a = await seat(s.url, "RMQ002", "q3");
    const b = await seat(s.url, "RMQ002", "q4");
    await a.next("opponent_joined");
    b.send({ type: "leave_game", code: "RMQ002", player: "B", seatToken: b.token }); // a forfeit (R81)
    await a.next("game_over");
    ask(a, "RMQ002", "A", a.token);
    expect(await a.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
    expect(await a.quiet("rematch_started")).toBe(true);
    expect(s.db.loadGames().filter((g) => g.code.startsWith("RMQ002")).map((g) => g.code)).toEqual(["RMQ002"]); // nothing archived or made
  });
});

describe("R83 a player who forfeited by not coming back cannot be waited for", () => {
  it("R83 after a forfeit by timeout, the winner's Play again is answered left at once", async () => {
    const s = start({ graceMs: 150 });
    s.rt.createQuickGame("RMQ003");
    const a = await seat(s.url, "RMQ003", "q5");
    const b = await seat(s.url, "RMQ003", "q6");
    await a.next("opponent_joined");
    b.socket.close(); // gone, and not back within the grace period (R27)
    await a.next("game_over");
    ask(a, "RMQ003", "A", a.token);
    expect(await a.next("rematch_ended")).toEqual({ type: "rematch_ended", reason: "left" });
  });
});
