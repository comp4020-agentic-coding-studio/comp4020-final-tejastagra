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

describe("T: both players see the same result at the same moment (promise 2)", () => {
  it.todo("T1 (R23) both clients receive a round's result within 1 second of the second choice");
  it.todo("T2 (R23) both clients receive identical results for the same round");
  it.todo("T3 (R21) the opponent's ready status reaches the other client within 1 second");

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

  it.todo("T5 (R27) a client that disconnects and returns within 30 seconds continues the same game");

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
});
