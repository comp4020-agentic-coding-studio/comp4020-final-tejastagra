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

function onceMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) =>
    socket.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true }),
  );
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // R34
function freshCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

// The person who makes a link game is player 1 (R36): the server keeps seat A for their session, so the first socket in a
// check that stands for the creator carries the cookie the server gave them when it made the game.
async function linkGame(): Promise<{ code: string; creator: { headers: { cookie: string } } }> {
  const res = await fetch(inject("baseUrl") + "/api/games", { method: "POST", headers: { "fly-client-ip": fakeAddress() } });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return { code: (await res.json()).code as string, creator: { headers: { cookie } } };
}

const fakeAddress = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("L: playing modes (R33 to R36)", () => {
  it("L1 (R33) play the computer starts a game with no waiting", async () => {
    const res = await fetch(inject("baseUrl") + "/api/computer", { method: "POST", headers: { "fly-client-ip": fakeAddress() } });
    expect(res.status).toBe(200);
    const { code } = await res.json();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    const human = new WebSocket(wsUrl("/ws"));
    await onceOpen(human);
    const started = Date.now();
    human.send(JSON.stringify({ type: "join", code }));
    const snapshot = await onceMessage(human);
    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.you).toBe("A");
    expect(Date.now() - started).toBeLessThan(1000);
    // Nobody else can take the computer's seat (R36).
    const other = new WebSocket(wsUrl("/ws"));
    await onceOpen(other);
    other.send(JSON.stringify({ type: "join", code }));
    expect((await onceMessage(other)).type).toBe("game_full");
    human.close();
    other.close();
  });
  it("L2 (R34) POST /api/games returns a fresh 6-character code from the allowed letters", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await fetch(inject("baseUrl") + "/api/games", { method: "POST", headers: { "fly-client-ip": fakeAddress() } });
      expect(res.status).toBe(200);
      const { code } = await res.json();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(5);
  });

  it("L3 (R34) the created code's /g/<code> page loads and two clients joining it share one game", async () => {
    const { code, creator } = await linkGame();
    expect((await fetch(inject("baseUrl") + "/g/" + code)).status).toBe(200);
    const a = new WebSocket(wsUrl("/ws"), creator as never);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code }));
    const first = await onceMessage(a);
    const b = new WebSocket(wsUrl("/ws"));
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code }));
    const second = await onceMessage(b);
    expect([first.you, second.you].sort()).toEqual(["A", "B"]);
    a.close();
    b.close();
  });
  it("L4 (R35) 20 clients arriving at once in quick match are paired into exactly 10 games, each client once", async () => {
    const base = inject("baseUrl");
    // Clear any ticket left waiting by an earlier run, so the count is exact.
    const probe = await (await fetch(`${base}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": fakeAddress() } })).json();
    if (probe.state === "waiting") await fetch(`${base}/api/quick/${crypto.randomUUID()}`, { method: "POST", headers: { "fly-client-ip": fakeAddress() } });
    const tickets = Array.from({ length: 20 }, () => crypto.randomUUID());
    const codes = new Map<string, string>();
    await Promise.all(
      tickets.map(async (ticket) => {
        const joined = await (await fetch(`${base}/api/quick/${ticket}`, { method: "POST", headers: { "fly-client-ip": fakeAddress() } })).json();
        if (joined.state === "matched") codes.set(ticket, joined.code);
      }),
    );
    for (let i = 0; i < 20 && codes.size < 20; i++) {
      for (const ticket of tickets) {
        if (codes.has(ticket)) continue;
        const status = await (await fetch(`${base}/api/quick/${ticket}`)).json();
        if (status.state === "matched") codes.set(ticket, status.code);
      }
    }
    expect(codes.size).toBe(20);
    const perGame = new Map<string, number>();
    for (const code of codes.values()) perGame.set(code, (perGame.get(code) ?? 0) + 1);
    expect(perGame.size).toBe(10);
    for (const count of perGame.values()) expect(count).toBe(2);
    for (const code of perGame.keys()) expect((await fetch(`${base}/g/${code}`)).status).toBe(200);
  });

  it("L5 (R36, replaced on 28 October 2026) a third client joining a full link game watches it: it is never given a seat and never refused", async () => {
    const { code, creator } = await linkGame();
    const a = new WebSocket(wsUrl("/ws"), creator as never);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code }));
    expect((await onceMessage(a)).you).toBe("A");

    const b = new WebSocket(wsUrl("/ws"));
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code }));
    expect((await onceMessage(b)).you).toBe("B");

    const third = new WebSocket(wsUrl("/ws"));
    await onceOpen(third);
    third.send(JSON.stringify({ type: "join", code }));
    const reply = await onceMessage(third);

    expect(reply.type).toBe("spectating");
    expect(reply.because).toBe("two_players");
    expect(JSON.stringify(reply)).not.toMatch(/seatToken/);
    a.close();
    b.close();
    third.close();
  });

  it("L5 (R36) a third client cannot take over a seat already held by naming it, either", async () => {
    const code = freshCode();
    const a = new WebSocket(wsUrl("/ws"));
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code, player: "A" }));
    await onceMessage(a);

    const b = new WebSocket(wsUrl("/ws"));
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code, player: "B" }));
    await onceMessage(b);

    const impostor = new WebSocket(wsUrl("/ws"));
    await onceOpen(impostor);
    impostor.send(JSON.stringify({ type: "join", code, player: "A" }));
    const reply = await onceMessage(impostor);

    expect(reply.type).toBe("game_full");
    a.close();
    b.close();
    impostor.close();
  });
});
