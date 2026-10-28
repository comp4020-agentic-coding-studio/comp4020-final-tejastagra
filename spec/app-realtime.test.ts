// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, expect, inject, it } from "vitest";

function wsUrl(path: string): string {
  return inject("baseUrl").replace(/^http/, "ws") + path;
}

// Queues incoming messages per socket, so a message that arrives before
// nextMessage() is called is not lost (avoids timing-dependent tests).
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

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.addEventListener("open", () => resolve(), { once: true });
  });
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // R34
function freshCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function joinGame(
  code: string,
  player: "A" | "B",
): Promise<{ socket: WebSocket; next: () => Promise<any>; seatToken: string }> {
  const socket = new WebSocket(wsUrl("/ws"));
  const next = messageQueue(socket);
  await onceOpen(socket);
  socket.send(JSON.stringify({ type: "join", code, player }));
  const snapshot = await next();
  return { socket, next, seatToken: snapshot.seatToken };
}

// When the second seat joins, the first seat is told that someone arrived (opponent_joined).
// It carries nothing about a choice (R21, R22). Tests that go on to read the next message
// from the first seat call this first, so the protocol step is visible and not skipped.
async function expectArrival(first: { next: () => Promise<any> }, second?: { next: () => Promise<any> }): Promise<void> {
  expect(await first.next()).toEqual({ type: "opponent_joined" });
  // Both are here, so the start countdown runs and round 1 opens after it, with `started` (R97). Every message in between is the
  // countdown itself, which carries nothing about a choice.
  for (const who of second ? [first, second] : [first]) {
    expect(await who.next()).toEqual({ type: "countdown", ms: expect.any(Number) });
    expect(await who.next()).toEqual({ type: "started" });
  }
}

describe("T: both players see the same result at the same moment (promise 2)", () => {
  it("T1 (R23) both clients receive a round's result within 1 second of the second choice", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);

    const startedAt = Date.now();
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 2, shield: false }));
    await b.next(); // opponent_ready, not the result
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 4, shield: false }));

    const aResult = await a.next();
    const bResult = await b.next();
    const elapsedMs = Date.now() - startedAt;

    expect(aResult.type).toBe("snapshot");
    expect(bResult.type).toBe("snapshot");
    expect(elapsedMs).toBeLessThan(1000);

    a.socket.close();
    b.socket.close();
  });

  it("T2 (R23) both clients receive identical results for the same round", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);

    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 1, shield: false }));
    await b.next();
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 5, shield: false }));

    const aResult = await a.next();
    const bResult = await b.next();

    expect(aResult.state).toEqual(bResult.state);
    expect(aResult.state.round).toBe(1);

    a.socket.close();
    b.socket.close();
  });

  it("T3 (R21) the opponent's ready status reaches the other client within 1 second", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);

    const startedAt = Date.now();
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 3, shield: false }));
    const readyMessage = await b.next();
    const elapsedMs = Date.now() - startedAt;

    expect(readyMessage).toEqual({ type: "opponent_ready" });
    expect(elapsedMs).toBeLessThan(1000);

    a.socket.close();
    b.socket.close();
  });

  it("T4 (R24) a client that reconnects receives a full snapshot matching the other client's board", async () => {
    const code = freshCode();
    const a = new WebSocket(wsUrl("/ws"));
    const aNext = messageQueue(a);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code, player: "A" }));
    const aSnapshot = await aNext();
    expect(aSnapshot.type).toBe("snapshot");

    const b1 = new WebSocket(wsUrl("/ws"));
    const b1Next = messageQueue(b1);
    await onceOpen(b1);
    b1.send(JSON.stringify({ type: "join", code, player: "B" }));
    const b1Snapshot = await b1Next();
    b1.close();

    const b2 = new WebSocket(wsUrl("/ws"));
    const b2Next = messageQueue(b2);
    await onceOpen(b2);
    b2.send(JSON.stringify({ type: "join", code, player: "B", seatToken: b1Snapshot.seatToken }));
    const reconnectSnapshot = await b2Next();

    expect(reconnectSnapshot.type).toBe("snapshot");
    expect(reconnectSnapshot.state).toEqual(aSnapshot.state);
    a.close();
    b2.close();
  });

  it("T5 (R27) a client that disconnects and returns well within 30 seconds continues the same game", async () => {
    // Only the "returns in time" half is tested here, against the real app
    // and its full 30 second grace period: proving it waits the full 30
    // seconds before forfeiting needs an injectable grace period, which
    // spec/unit-realtime-forfeit.test.ts covers against an ephemeral server.
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);
    a.socket.close();

    const a2 = new WebSocket(wsUrl("/ws"));
    const a2Next = messageQueue(a2);
    await onceOpen(a2);
    a2.send(JSON.stringify({ type: "join", code, player: "A", seatToken: a.seatToken }));
    const reconnectSnapshot = await a2Next();

    expect(reconnectSnapshot.type).toBe("snapshot");
    expect(reconnectSnapshot.seatToken).toBe(a.seatToken);

    // The game must still be playable: A can choose and the round resolves.
    a2.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 2, shield: false }));
    await b.next(); // opponent_ready
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 4, shield: false }));

    const result = await a2Next();
    expect(result.type).toBe("snapshot");
    expect(result.state.round).toBe(1);

    a2.close();
    b.socket.close();
  });

  it("T6 (R32) a second connection for the same player replaces the first and the first is told", async () => {
    const code = freshCode();
    const first = new WebSocket(wsUrl("/ws"));
    const firstNext = messageQueue(first);
    await onceOpen(first);
    first.send(JSON.stringify({ type: "join", code, player: "A" }));
    const firstSnapshot = await firstNext();

    const second = new WebSocket(wsUrl("/ws"));
    const secondNext = messageQueue(second);
    await onceOpen(second);
    second.send(JSON.stringify({ type: "join", code, player: "A", seatToken: firstSnapshot.seatToken }));

    const firstTold = await firstNext();
    expect(firstTold.type).toBe("tab_replaced");

    const secondSnapshot = await secondNext();
    expect(secondSnapshot.type).toBe("snapshot");
    second.close();
  });

  it("T6 (R32, R36) a connection naming a held seat without that seat's token is refused, not given it", async () => {
    const code = freshCode();
    const a = new WebSocket(wsUrl("/ws"));
    const aNext = messageQueue(a);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code, player: "A" }));
    await aNext();

    const impostor = new WebSocket(wsUrl("/ws"));
    const impostorNext = messageQueue(impostor);
    await onceOpen(impostor);
    impostor.send(JSON.stringify({ type: "join", code, player: "A", seatToken: "not-the-real-token" }));
    const reply = await impostorNext();

    expect(reply.type).toBe("game_full");
    a.close();
    impostor.close();
  });

  it("a malformed message (JSON that parses to null or a non-object) does not crash the server", async () => {
    const probe = new WebSocket(wsUrl("/ws"));
    await onceOpen(probe);
    probe.send("null");
    probe.send("42");
    probe.send('"just a string"');

    // The server would need a moment to crash if it were going to; prove it
    // is still answering ordinary requests afterwards.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response = await fetch(inject("baseUrl"));
    expect(response.status).toBe(200);
    probe.close();
  });

  it("T7 (R24) a snapshot says whether the opponent is present, and the waiting player is told when they arrive, and nothing else", async () => {
    const code = freshCode();
    const a = new WebSocket(wsUrl("/ws"));
    const nextA = messageQueue(a);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code, player: "A" }));
    const first = await nextA();
    expect(first.opponentPresent).toBe(false);

    const b = new WebSocket(wsUrl("/ws"));
    const nextB = messageQueue(b);
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code, player: "B" }));
    const second = await nextB();
    expect(second.opponentPresent).toBe(true);
    // A is told only that someone arrived: the whole message is the type, nothing about a choice.
    expect(await nextA()).toEqual({ type: "opponent_joined" });
    // Then the start countdown, which says how long and nothing else (R97).
    expect(await nextA()).toEqual({ type: "countdown", ms: 3000 });
    a.close();
    b.close();
  });
});
