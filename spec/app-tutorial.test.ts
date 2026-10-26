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
