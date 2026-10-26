// App check: every screen in docs/design.md's table is served and carries its test hooks,
// so a broken or missing page fails here before the browser checks in e2e/ (Phase 7).
import { describe, expect, inject, it } from "vitest";

const get = async (path: string) => {
  const res = await fetch(inject("baseUrl") + path);
  return { status: res.status, html: await res.text(), type: res.headers.get("content-type") ?? "" };
};

describe("screens (docs/design.md)", () => {
  it("Home has its modes, nickname, code entry, leaderboard preview and readme link", async () => {
    const { status, html, type } = await get("/");
    expect(status).toBe(200);
    expect(type).toMatch(/text\/html/);
    for (const hook of ["nickname-input", "play-computer", "play-friend", "quick-match", "code-input", "leaderboard-wins", "leaderboard-rounds"]) {
      expect(html).toContain(`data-testid="${hook}"`);
    }
    expect(html).toContain('href="/readme/"');
    expect(html).toContain('href="/leaderboard"');
    expect(html).toContain('href="/account"');
  });

  it("Leaderboard has its two lists", async () => {
    const { status, html } = await get("/leaderboard");
    expect(status).toBe(200);
    expect(html).toContain('data-testid="leaderboard-wins"');
    expect(html).toContain('data-testid="leaderboard-rounds"');
  });

  it("Account has username and password fields for sign up and sign in", async () => {
    const { status, html } = await get("/account");
    expect(status).toBe(200);
    expect(html).toContain('type="password"');
    expect(html).toContain('autocomplete="new-password"');
    expect(html).toContain('autocomplete="current-password"');
  });

  it("Quick match shows a waiting state and an offer of the computer", async () => {
    const { status, html } = await get("/play/quick");
    expect(status).toBe(200);
    expect(html).toContain('data-testid="quick-status"');
    expect(html).toContain('data-testid="computer-offer"');
  });

  it("Game has every hook the browser checks need", async () => {
    const { status, html } = await get("/g/ABC234");
    expect(status).toBe(200);
    const hooks = ["drop", "shield-toggle", "round-number", "timer", "opponent-status", "my-shield", "opponent-shield", "result-line", "game-code", "copy-link"];
    for (let c = 0; c < 7; c++) hooks.push(`column-${c}`);
    for (const hook of hooks) expect(html).toContain(`data-testid="${hook}"`);
    expect(html).toContain('data-testid="cell-0-0"');
    expect(html).toContain('data-testid="cell-6-5"');
  });

  it("every screen sets the viewport and the UK English language", async () => {
    for (const path of ["/", "/leaderboard", "/account", "/play/quick", "/g/ABC234"]) {
      const { html } = await get(path);
      expect(html).toContain('name="viewport"');
      expect(html).toContain('lang="en-GB"');
    }
  });

  it("every script a screen loads is served", async () => {
    for (const script of ["game.js", "home.js", "quick.js", "leaderboard.js", "account.js"]) {
      const { status, type } = await get(`/static/${script}`);
      expect(status).toBe(200);
      expect(type).toMatch(/javascript/);
    }
  });

  it("an unknown path is a 404, not a blank page", async () => {
    expect((await get("/no/such/page")).status).toBe(404);
  });
});
