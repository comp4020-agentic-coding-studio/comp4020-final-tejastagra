// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, expect, inject, it } from "vitest";

function wsUrl(path: string): string {
  return inject("baseUrl").replace(/^http/, "ws") + path;
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
}

// Records every raw frame a socket receives (not just parsed messages), so a
// test can assert about everything sent, including the exact bytes.
function recordRawMessages(socket: WebSocket): string[] {
  const raw: string[] = [];
  socket.addEventListener("message", (event) => raw.push(event.data as string));
  return raw;
}

// Queues incoming messages per socket, so a message that arrives before
// next() is called is not lost and tests do not depend on arrival order
// relative to when they start listening.
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

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // R34
function freshCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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
  // Both are here, so the start countdown runs and round 1 opens after it, with `started` (R97). The countdown carries
  // nothing about a choice, and nobody has chosen yet.
  for (const who of second ? [first, second] : [first]) {
    expect(await who.next()).toEqual({ type: "countdown", ms: expect.any(Number) });
    expect(await who.next()).toEqual({ type: "started" });
  }
}

function closeAndWait(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.addEventListener("close", () => resolve(), { once: true });
    socket.close();
  });
}

describe("N: nobody can see the other player's choice early (promise 3)", () => {
  it("N1 (R22) after A chooses, no message sent to B before the round resolves contains A's column or shield flag", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);
    const bMessages = recordRawMessages(b.socket);

    // A chooses a column far from any value B might coincidentally also use,
    // and uses the shield, so both would be easy to spot if leaked under any
    // reasonable field name or JSON formatting.
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 6, shield: true }));

    // B should receive exactly one message (opponent_ready) before choosing.
    const bReceived = await b.next();
    expect(bReceived).toEqual({ type: "opponent_ready" });

    for (const raw of bMessages) {
      expect(raw).not.toMatch(/6/); // no field, under any name, carries the column 6
      expect(raw.toLowerCase()).not.toContain("true"); // no field carries the shield flag
    }
    await closeAndWait(a.socket);
    await closeAndWait(b.socket);
  });

  it("N2 (R21) B receives only opponent_ready, identical whatever column or shield A chose", async () => {
    const codeLow = freshCode();
    const aLow = await joinGame(codeLow, "A");
    const bLow = await joinGame(codeLow, "B");
    await expectArrival(aLow, bLow);
    aLow.socket.send(JSON.stringify({ type: "choose", code: codeLow, player: "A", seatToken: aLow.seatToken, column: 0, shield: false }));
    const lowMessage = await bLow.next();

    const codeHigh = freshCode();
    const aHigh = await joinGame(codeHigh, "A");
    const bHigh = await joinGame(codeHigh, "B");
    await expectArrival(aHigh, bHigh);
    aHigh.socket.send(JSON.stringify({ type: "choose", code: codeHigh, player: "A", seatToken: aHigh.seatToken, column: 6, shield: true }));
    const highMessage = await bHigh.next();

    // Not just equal after parsing: the exact same message, so nothing about
    // A's choice reached the wire to B at all, regardless of field name.
    expect(JSON.stringify(lowMessage)).toBe(JSON.stringify(highMessage));
    expect(lowMessage).toEqual({ type: "opponent_ready" });

    await closeAndWait(aLow.socket);
    await closeAndWait(bLow.socket);
    await closeAndWait(aHigh.socket);
    await closeAndWait(bHigh.socket);
  }, 15_000); // two games, each with its 3 second start countdown (R97)

  it("N3 (R22) an invalid choice by A produces no message to B at all", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);
    const bMessages = recordRawMessages(b.socket);

    // column 99 is out of range: bad_column (R3). A is told; B must hear nothing.
    const aNext = a.next();
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 99, shield: false }));
    const aReply = await aNext;
    expect(aReply).toEqual({ type: "rejected", reason: "bad_column" });

    expect(bMessages).toEqual([]);
    await closeAndWait(a.socket);
    await closeAndWait(b.socket);
  });

  it("N4 (R24) a snapshot sent to B mid-round never includes A's pending choice", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b1 = await joinGame(code, "B");
    await expectArrival(a, b1);

    const b1Ready = b1.next();
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 2, shield: false }));
    await b1Ready;
    await closeAndWait(b1.socket);

    // B reconnects mid-round (A has chosen, B has not), and gets a snapshot.
    const b2 = new WebSocket(wsUrl("/ws"));
    const b2Next = messageQueue(b2);
    await onceOpen(b2);
    b2.send(JSON.stringify({ type: "join", code, player: "B", seatToken: b1.seatToken }));
    const snapshot = await b2Next();

    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.opponentReady).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/"column":\s*2\b/);

    await closeAndWait(a.socket);
    await closeAndWait(b2);
  });

  it("N5 (R21, R22, R54) a pending Earthquake is never revealed: B receives exactly the same opponent_ready as for a column", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    const b = await joinGame(code, "B");
    await expectArrival(a, b);
    // One round first, so there is something to shake (R55).
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 0, shield: false }));
    await b.next();
    b.socket.send(JSON.stringify({ type: "choose", code, player: "B", seatToken: b.seatToken, column: 3, shield: false }));
    await a.next();
    await b.next();
    const bMessages = recordRawMessages(b.socket);

    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, earthquake: true }));
    expect(await b.next()).toEqual({ type: "opponent_ready" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bMessages).toEqual([JSON.stringify({ type: "opponent_ready" })]);
    for (const raw of bMessages) expect(raw.toLowerCase()).not.toContain("earthquake");
    await closeAndWait(a.socket);
    await closeAndWait(b.socket);
  });

  it("N1 (R22) a choose for a seat nobody has joined yet, with no seat token, is ignored rather than accepted", async () => {
    const code = freshCode();
    const a = await joinGame(code, "A");
    // B has never joined this game, so seatTokens has no entry for its key:
    // a `choose` with no seatToken field must not be treated as a match for
    // that absence, or a stranger could inject B's choice sight unseen and
    // force an immediate (wrong) resolution once A genuinely chooses.
    const impostorSocket = new WebSocket(wsUrl("/ws"));
    await onceOpen(impostorSocket);
    impostorSocket.send(JSON.stringify({ type: "choose", code, player: "B", column: 3, shield: false }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then the real B joins and round 1 opens after the start countdown (R51, R97), so A's choice is a real one.
    const b = await joinGame(code, "B");
    await expectArrival(a, b);
    // And again once round 1 is open, where only the seat token stands between a stranger and B's choice (R32).
    impostorSocket.send(JSON.stringify({ type: "choose", code, player: "B", column: 3, shield: false }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const aNext = a.next();
    a.socket.send(JSON.stringify({ type: "choose", code, player: "A", seatToken: a.seatToken, column: 0, shield: false }));

    // If the impostor's choice had been accepted, both choices would now be
    // set and the round would resolve immediately, sending A a result. It
    // must not: B is told only that A is ready, and A hears nothing.
    expect(await b.next()).toEqual({ type: "opponent_ready" });
    const result = await Promise.race([
      aNext.then((message) => ({ arrived: true, message })),
      new Promise((resolve) => setTimeout(() => resolve({ arrived: false }), 300)),
    ]);
    expect((result as { arrived: boolean }).arrived).toBe(false);
    await closeAndWait(b.socket);
    await closeAndWait(a.socket);
    await closeAndWait(impostorSocket);
  });
});
