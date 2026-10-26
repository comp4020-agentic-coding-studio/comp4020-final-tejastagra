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

describe("L: playing modes (R33 to R36)", () => {
  it.todo("L1 (R33) play the computer starts a game with no waiting");
  it.todo("L2 (R34) game codes use only the allowed letters and are 6 characters long");
  it.todo("L3 (R34) opening /g/<code> or entering the code joins the same game");
  it.todo("L4 (R35) 20 clients arriving at once in quick match are paired into exactly 10 games, each client once");

  it("L5 (R36) a third client joining a full game is refused with game_full", async () => {
    const code = freshCode();
    const a = new WebSocket(wsUrl("/ws"));
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code, player: "A" }));
    await onceMessage(a);

    const b = new WebSocket(wsUrl("/ws"));
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code, player: "B" }));
    await onceMessage(b);

    const third = new WebSocket(wsUrl("/ws"));
    await onceOpen(third);
    third.send(JSON.stringify({ type: "join", code }));
    const reply = await onceMessage(third);

    expect(reply.type).toBe("game_full");
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
