// App check: runs with pnpm check against the RUNNING app, found by spec/global-setup.ts.
// R47 to R50: the tutorial is shown once, saved with the player and replayable.
import { describe, expect, inject, it } from "vitest";

const base = () => inject("baseUrl");

// A tiny cookie jar with its own client address, so each "browser" is its own visitor
// and the per-address limits (CLAUDE.md) never pool the checks together.
function browser(startCookie = "") {
  let cookie = startCookie;
  const n = () => Math.floor(Math.random() * 250);
  const address = `10.${n()}.${n()}.${n()}`;
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(base() + path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", "fly-client-ip": address, ...(cookie ? { cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, json: text.startsWith("{") ? JSON.parse(text) : null, text };
  };
  return Object.assign(call, { cookie: () => cookie });
}

describe("Tutorial (R47 to R50)", () => {
  it("R47 a new visitor and a new guest are told to show the tutorial", async () => {
    const b = browser();
    expect((await b("/api/me")).json.tutorialDue).toBe(true); // no cookie yet
    await b("/api/guest", { body: { nickname: "Newcomer" } });
    expect((await b("/api/me")).json.tutorialDue).toBe(true);
  });

  it("R48 after finishing the tutorial, the same guest is not told to show it again, even on a new connection", async () => {
    const b = browser();
    await b("/api/guest", { body: { nickname: "Finisher" } });
    expect((await b("/api/tutorial", { body: { result: "finished" } })).status).toBe(200);
    expect((await b("/api/me")).json.tutorialDue).toBe(false);
    // A new connection: a second client that presents the same session cookie.
    const again = browser(b.cookie());
    expect((await again("/api/me")).json.tutorialDue).toBe(false);
  });

  it("R48 after skipping the tutorial, the same guest is not told to show it again", async () => {
    const b = browser();
    await b("/api/guest", { body: { nickname: "Skipper" } });
    await b("/api/tutorial", { body: { result: "skipped" } });
    expect((await b("/api/me")).json.tutorialDue).toBe(false);
  });

  it("R48 a visitor with no name yet who finishes keeps that across requests", async () => {
    const b = browser();
    expect((await b("/api/tutorial", { body: { result: "finished" } })).status).toBe(200);
    expect((await b("/api/me")).json.tutorialDue).toBe(false);
  });

  it("R48 it stays saved when the guest signs up for an account and signs in again elsewhere", async () => {
    const b = browser();
    const username = `tut_${Math.random().toString(36).slice(2, 10)}`;
    await b("/api/guest", { body: { nickname: "Keeper" } });
    await b("/api/tutorial", { body: { result: "finished" } });
    await b("/api/account/signup", { body: { username, password: "a long enough password" } });
    const elsewhere = browser();
    await elsewhere("/api/account/signin", { body: { username, password: "a long enough password" } });
    expect((await elsewhere("/api/me")).json.tutorialDue).toBe(false);
  });

  it("R49 a guest can ask to replay the tutorial at any time, and it is due again until they finish or skip", async () => {
    const b = browser();
    await b("/api/guest", { body: { nickname: "Replayer" } });
    await b("/api/tutorial", { body: { result: "finished" } });
    expect((await b("/api/tutorial", { body: { result: "replay" } })).status).toBe(200);
    expect((await b("/api/me")).json.tutorialDue).toBe(true);
    await b("/api/tutorial", { body: { result: "skipped" } });
    expect((await b("/api/me")).json.tutorialDue).toBe(false);
  });

  it("R47 to R49 the endpoint only takes JSON with a known result", async () => {
    const b = browser();
    expect((await b("/api/tutorial", { body: { result: "nonsense" } })).status).toBe(400);
    const form = await fetch(base() + "/api/tutorial", { method: "POST", headers: { "content-type": "text/plain", "fly-client-ip": "10.9.9.9" }, body: '{"result":"finished"}' });
    expect(form.status).toBe(400);
  });

  // R50 holds because the practice board runs in the browser against a scripted computer and
  // never opens a game on the server, so there is nothing to count. A server-side check cannot
  // fail for that reason, so the check that can is the browser one: during the whole tutorial
  // the page opens no WebSocket and calls neither /api/games nor /api/computer
  // (e2e/design.spec.ts, "R50").
  it.todo("R50 a tutorial run opens no game on the server, so it cannot change the leaderboard (browser check in e2e/design.spec.ts)");

  it("R28 a first-time visitor is given a generated nickname, and an existing one is left alone", async () => {
    const b = browser();
    const made = await b("/api/visitor", { body: {} });
    expect(made.status).toBe(200);
    expect(made.json.player.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ #[0-9a-f]{4}$/);
    const again = await b("/api/visitor", { body: {} });
    expect(again.json.player.displayName).toBe(made.json.player.displayName);
    expect((await b("/api/me")).json.player.displayName).toBe(made.json.player.displayName);
  });

  it("R28 an empty nickname is still refused on the nickname path (I1 is unchanged)", async () => {
    const b = browser();
    expect((await b("/api/guest", { body: { nickname: "" } })).status).toBe(400);
  });
});

// ---- Who is offered the tutorial (R47, R48, R100, second fix list Parts I and J) ----

const wsUrl = (path: string) => base().replace(/^http/, "ws") + path;
const onceOpen = (socket: WebSocket) => new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
const onceMessage = (socket: WebSocket) => new Promise<any>((resolve) => socket.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true }));

// Two people in one link game over real sockets: the first is the creator (seat A), the second takes seat B.
async function fullGame(): Promise<{ code: string; close: () => void; sockets: WebSocket[]; cookieA: string; tokenA: string }> {
  const n = () => Math.floor(Math.random() * 250);
  const created = await fetch(base() + "/api/games", { method: "POST", headers: { "fly-client-ip": `10.${n()}.${n()}.${n()}` } });
  const cookieA = (created.headers.get("set-cookie") ?? "").split(";")[0];
  const { code } = await created.json();
  const a = new WebSocket(wsUrl("/ws"), { headers: { cookie: cookieA } } as never);
  await onceOpen(a);
  a.send(JSON.stringify({ type: "join", code }));
  const first = await onceMessage(a);
  const b = new WebSocket(wsUrl("/ws"));
  await onceOpen(b);
  b.send(JSON.stringify({ type: "join", code }));
  await onceMessage(b);
  return { code, sockets: [a, b], cookieA, tokenA: first.seatToken as string, close: () => [a, b].forEach((s) => s.close()) };
}

describe("R100 the seat check", () => {
  it("R100 a new visitor to a game with a free seat is told player, and the check takes no seat", async () => {
    const created = await fetch(base() + "/api/games", { method: "POST", headers: { "fly-client-ip": "10.4.4.4" } });
    const { code } = await created.json();
    const visitor = browser();
    for (let i = 0; i < 3; i++) expect((await visitor(`/api/seat?code=${code}`)).json).toEqual({ role: "player" }); // asking never seats anyone
  });

  it("R100 a third person at a full game is told spectator", async () => {
    const game = await fullGame();
    try {
      expect((await browser()(`/api/seat?code=${game.code}`)).json).toEqual({ role: "spectator" });
    } finally {
      game.close();
    }
  });

  it("R100 a seat's own person is still told player, so a reload of their game is not a spectator", async () => {
    const game = await fullGame();
    try {
      const creator = browser(game.cookieA);
      expect((await creator(`/api/seat?code=${game.code}`)).json).toEqual({ role: "player" });
    } finally {
      game.close();
    }
  });

  it("R100 a finished game is told ended", async () => {
    const game = await fullGame();
    try {
      // A forfeit ends the game: the creator leaves it on purpose (R81), proving the seat with its token.
      game.sockets[0].send(JSON.stringify({ type: "leave_game", code: game.code, player: "A", seatToken: game.tokenA }));
      await new Promise((r) => setTimeout(r, 600));
      expect((await browser()(`/api/seat?code=${game.code}`)).json).toEqual({ role: "ended" });
    } finally {
      game.close();
    }
  });

  it("R100 an unknown code and a malformed one are both told unknown, and only GET is answered", async () => {
    const b = browser();
    expect((await b("/api/seat?code=ZZZZZZ")).json).toEqual({ role: "unknown" });
    expect((await b("/api/seat?code=nope")).json).toEqual({ role: "unknown" });
    expect((await b("/api/seat")).json).toEqual({ role: "unknown" });
    const post = await fetch(base() + "/api/seat?code=ZZZZZZ", { method: "POST", headers: { "content-type": "application/json", "fly-client-ip": "10.4.4.5" }, body: "{}" });
    expect(post.status).toBeGreaterThanOrEqual(400);
  });

  it("R100 the answer carries nothing but the role, never a name, a seat or a token", async () => {
    const game = await fullGame();
    try {
      const { text } = await browser()(`/api/seat?code=${game.code}`);
      expect(Object.keys(JSON.parse(text))).toEqual(["role"]);
    } finally {
      game.close();
    }
  });
});

describe("R47 R48 an experienced account is never offered the tutorial", () => {
  const PASSWORD = "a long enough password";
  const nameOf = () => `exp_${Math.random().toString(36).slice(2, 10)}`;

  it("R48 finishing the tutorial while signed in marks the account, so another device is not offered it", async () => {
    const b = browser();
    const username = nameOf();
    await b("/api/guest", { body: { nickname: "Account Seen" } });
    await b("/api/account/signup", { body: { username, password: PASSWORD } });
    expect((await b("/api/me")).json.tutorialDue).toBe(true);
    await b("/api/tutorial", { body: { result: "skipped" } });
    const elsewhere = browser();
    await elsewhere("/api/account/signin", { body: { username, password: PASSWORD } });
    expect((await elsewhere("/api/me")).json.tutorialDue, "on any device").toBe(false);
  });

  it("R48 a guest who has seen it and then signs in to an account has the mark copied to the account", async () => {
    const maker = browser();
    const username = nameOf();
    await maker("/api/guest", { body: { nickname: "Fresh Account" } });
    await maker("/api/account/signup", { body: { username, password: PASSWORD } });
    // The account itself has never seen it; a different browser's guest has, and signs in to it.
    const guest = browser();
    await guest("/api/guest", { body: { nickname: "Seen Guest" } });
    await guest("/api/tutorial", { body: { result: "finished" } });
    await guest("/api/account/signin", { body: { username, password: PASSWORD } });
    const later = browser();
    await later("/api/account/signin", { body: { username, password: PASSWORD } });
    expect((await later("/api/me")).json.tutorialDue, "the guest's mark was copied to the account").toBe(false);
  });

  it("R47 an account that has finished a game is never offered the tutorial, on any device", async () => {
    // A forfeit by a signed-in player against another person is a finished game with a round played.
    const n = () => Math.floor(Math.random() * 250);
    const owner = browser();
    const username = nameOf();
    await owner("/api/guest", { body: { nickname: "Veteran" } });
    await owner("/api/account/signup", { body: { username, password: PASSWORD } });
    const created = await owner("/api/games", { body: {} });
    const code = created.json.code as string;
    const a = new WebSocket(wsUrl("/ws"), { headers: { cookie: owner.cookie() } } as never);
    await onceOpen(a);
    a.send(JSON.stringify({ type: "join", code }));
    const first = await onceMessage(a);
    const b = new WebSocket(wsUrl("/ws"), { headers: { "fly-client-ip": `10.${n()}.${n()}.${n()}` } } as never);
    await onceOpen(b);
    b.send(JSON.stringify({ type: "join", code }));
    const second = await onceMessage(b);
    expect([first.you, second.you].sort()).toEqual(["A", "B"]);
    // Both choose a column so round 1 resolves (a game with no round is never recorded, R98), then the creator leaves.
    await new Promise((r) => setTimeout(r, 3_500)); // the start countdown (R97)
    a.send(JSON.stringify({ type: "choose", code, player: first.you, seatToken: first.seatToken, column: 0 }));
    b.send(JSON.stringify({ type: "choose", code, player: second.you, seatToken: second.seatToken, column: 3 }));
    await new Promise((r) => setTimeout(r, 1_200));
    a.send(JSON.stringify({ type: "leave_game", code, player: first.you, seatToken: first.seatToken }));
    await new Promise((r) => setTimeout(r, 600));
    a.close();
    b.close();
    const fresh = browser();
    await fresh("/api/account/signin", { body: { username, password: PASSWORD } });
    expect((await fresh("/api/me")).json.tutorialDue, "an account with a finished game is never offered it").toBe(false);
  }, 20_000);

  it("R47 a brand-new guest is still offered it", async () => {
    expect((await browser()("/api/me")).json.tutorialDue).toBe(true);
  });
});
