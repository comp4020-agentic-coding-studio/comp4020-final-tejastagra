// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// Use const baseUrl = inject("baseUrl") and real HTTP or WebSocket clients, so it also runs in CI.
// Stubs: turn each it.todo into a real test as the feature lands. Keep the ID and rule in the name.
import { describe, expect, inject, it } from "vitest";

const base = () => inject("baseUrl");
const unique = () => Math.random().toString(36).slice(2, 8);

// A guest with a cookie, who can open a game socket carrying that cookie.
async function guest(nickname: string) {
  const res = await fetch(base() + "/api/guest", {
    method: "POST",
    headers: { "content-type": "application/json", "fly-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ nickname }),
  });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const { player } = await res.json();
  return { cookie, name: player.displayName as string };
}

function queue(socket: WebSocket) {
  const queued: any[] = [];
  const waiting: Array<(v: any) => void> = [];
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data as string);
    const w = waiting.shift();
    if (w) w(m);
    else queued.push(m);
  });
  return () => new Promise<any>((resolve) => (queued.length ? resolve(queued.shift()) : waiting.push(resolve)));
}

async function seat(code: string, who: { cookie: string }) {
  const socket = new (WebSocket as any)(base().replace(/^http/, "ws") + "/ws", { headers: { cookie: who.cookie } }) as WebSocket;
  const next = queue(socket);
  await new Promise((r) => socket.addEventListener("open", () => r(null), { once: true }));
  socket.send(JSON.stringify({ type: "join", code }));
  const snap = await next();
  return { socket, next, you: snap.you as "A" | "B", seatToken: snap.seatToken as string };
}

// A drops in column 0 four times while B alternates columns 1 and 2, so only A makes four in a row.
async function playVertical(a: Awaited<ReturnType<typeof seat>>, b: Awaited<ReturnType<typeof seat>>, code: string) {
  // A was waiting when B joined, so A is told that someone arrived (no choice in it, R21, R22).
  expect(await a.next()).toEqual({ type: "opponent_joined" });
  let last: any;
  for (let i = 0; i < 4; i++) {
    a.socket.send(JSON.stringify({ type: "choose", code, player: a.you, seatToken: a.seatToken, column: 0, shield: false }));
    expect((await b.next()).type).toBe("opponent_ready");
    b.socket.send(JSON.stringify({ type: "choose", code, player: b.you, seatToken: b.seatToken, column: 1 + (i % 2), shield: false }));
    last = await a.next();
    await b.next();
  }
  return last;
}

async function board() {
  return (await (await fetch(base() + "/api/leaderboard?limit=1000")).json()) as {
    wins: Array<{ name: string; value: number }>;
    rounds: Array<{ name: string; value: number }>;
  };
}

async function newGameCode(path = "/api/games") {
  return (await (await fetch(base() + path, { method: "POST", headers: { "fly-client-ip": fakeAddress() } })).json()).code as string;
}

const fakeAddress = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("B: leaderboard (R37 to R39)", () => {
  it("B2 (R38) and B5 (R17) a win against a person adds one win and records the round count at the win", async () => {
    const one = await guest("Ace" + unique());
    const two = await guest("Bee" + unique());
    const code = await newGameCode();
    const a = await seat(code, one);
    const b = await seat(code, two);
    const result = await playVertical(a, b, code);
    expect(result.state.status).toBe("won");
    expect(result.state.winner).toBe("A");
    expect(result.state.round).toBe(4);
    const lists = await board();
    expect(lists.wins.find((r) => r.name === one.name)?.value).toBe(1);
    expect(lists.rounds.find((r) => r.name === one.name)?.value).toBe(4);
    expect(lists.wins.find((r) => r.name === two.name)).toBeUndefined();
    a.socket.close();
    b.socket.close();
  });

  it("B1 (R37) a player seated in a computer game is never recorded against it (the full rule is in spec/unit-leaderboard.test.ts)", async () => {
    const who = await guest("Solo" + unique());
    const code = await newGameCode("/api/computer");
    const a = await seat(code, who);
    a.socket.send(JSON.stringify({ type: "choose", code, player: a.you, seatToken: a.seatToken, column: 3, shield: false }));
    await a.next();
    const lists = await board();
    expect(lists.wins.find((r) => r.name === who.name)).toBeUndefined();
    expect(lists.rounds.find((r) => r.name === who.name)).toBeUndefined();
    a.socket.close();
  });

  it("B2 (R38) a guest with no cookie is never listed", async () => {
    const code = await newGameCode();
    const open = async () => {
      const socket = new WebSocket(base().replace(/^http/, "ws") + "/ws");
      const next = queue(socket);
      await new Promise((r) => socket.addEventListener("open", () => r(null), { once: true }));
      socket.send(JSON.stringify({ type: "join", code }));
      const snap = await next();
      return { socket, next, you: snap.you, seatToken: snap.seatToken };
    };
    const a = await open();
    const b = await open();
    const before = await board();
    const last = await playVertical(a as never, b as never, code);
    expect(last.state.status).toBe("won"); // the game really finished, so nothing was recorded for a reason
    expect(await board()).toEqual(before);
    a.socket.close();
    b.socket.close();
  });

  it.todo("B3 (R39) a win where the opponent missed a round does not count for fewest rounds (rule covered in spec/unit-leaderboard.test.ts; needs a real 15 second timer here)");
  it.todo("B4 (R19) an abandoned game changes neither list (needs three real 15 second rounds here; covered in spec/unit-realtime-abandon.test.ts)");
});
