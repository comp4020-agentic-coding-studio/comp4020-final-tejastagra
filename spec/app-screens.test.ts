// App check: every screen in docs/design.md's table is served and carries its test hooks,
// so a broken or missing page fails here before the browser checks in e2e/ (Phase 7).
import { describe, expect, inject, it } from "vitest";

const get = async (path: string) => {
  const res = await fetch(inject("baseUrl") + path);
  return { status: res.status, html: await res.text(), type: res.headers.get("content-type") ?? "" };
};

describe("screens (docs/design.md)", () => {
  it("Home has its modes, player card, code entry, icon row, top players and the demo board (U31 to U36)", async () => {
    const { status, html, type } = await get("/");
    expect(status).toBe(200);
    expect(type).toMatch(/text\/html/);
    for (const hook of [
      "play-computer", "play-friend", "quick-match", "join-toggle", "rename", "player-card",
      "icon-row", "open-leaderboard", "how-to-play", "open-account", "open-about", "top-players", "leaderboard-wins",
      "demo-board", "tutorial", "tutorial-next", "tutorial-skip",
    ]) {
      expect(html, hook).toContain(`data-testid="${hook}"`);
    }
    expect(html).toContain('href="/readme/"');
    expect(html).toContain('href="/leaderboard"');
    expect(html).toContain('href="/account"');
    // U33 and U33b: one line of subtext under each button, and the code and nickname fields are in popups (Q1), not in the page.
    for (const words of ["Practise against the computer", "Send a link to someone you know", "Play a random person online", "Enter a friend&#39;s 6-letter code", "Enter a friend's 6-letter code"].slice(0, 3)) expect(html, words).toContain(words);
    expect(html).toMatch(/Enter a friend(&#39;|')s 6-letter code/);
    expect(html).not.toContain('data-testid="code-input"');
    expect(html).not.toContain('data-testid="nickname-input"');
    expect(html).toContain("Four in a row, with a twist.");
    // U37 (the menu above the demo board on a phone) is about how the page is drawn, not its source
    // order, so it is checked in a real browser (e2e/design.spec.ts).
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
    // U96 to U98: a header, one card with the discs, the line, the subtext and the live count, and Cancel under it.
    expect(html).toContain("Finding you a random opponent");
    expect(html).toContain("Quick match pairs you with another person who is looking for a game right now");
    for (const hook of ["quick-discs", "quick-hint", "quick-live", "quick-cancel"]) expect(html, hook).toContain(`data-testid="${hook}"`);
    expect(html).toContain('class="title"');
  });

  it("Game has every hook the browser checks need, and no column buttons or Drop button (U10 to U18)", async () => {
    const { status, html } = await get("/g/ABC234");
    expect(status).toBe(200);
    const hooks = ["shield-badge", "shield-info", "earthquake-info", "powerups", "get-ready", "round-number", "timer", "name-you", "name-opponent", "opponent-status", "my-shield", "opponent-shield", "result-line", "game-code", "copy-link", "chosen-label", "end-popup", "end-title", "play-again", "go-home"];
    for (let c = 0; c < 7; c++) hooks.push(`column-${c}`);
    for (const hook of hooks) expect(html, hook).toContain(`data-testid="${hook}"`);
    expect(html).not.toContain('data-testid="drop"');
    expect(html).not.toContain('data-testid="shield-toggle"');
    // U104: the help is a popup that is built when the info button is tapped, so the page itself carries no help text.
    expect(html).not.toContain('data-testid="shield-help"');
    expect(html).not.toContain('data-testid="earthquake-help"');
    // U18: no keyboard hint line on the game screen; the keys are in How to play only.
    expect(html).not.toContain("keys-hint");
    expect(html).not.toMatch(/Keys 1 to 7/);
  });

  it("every screen sets the viewport and the UK English language", async () => {
    for (const path of ["/", "/leaderboard", "/account", "/play/quick", "/g/ABC234", "/readme/"]) {
      const { html } = await get(path);
      expect(html).toContain('name="viewport"');
      expect(html).toContain('lang="en-GB"');
    }
  });

  it("every script a screen loads is served", async () => {
    for (const script of ["game.js", "home.js", "quick.js", "leaderboard.js", "account.js", "bubbles.js"]) {
      const { status, type } = await get(`/static/${script}`);
      expect(status).toBe(200);
      expect(type).toMatch(/javascript/);
    }
  });

  it("an unknown path is a 404, not a blank page", async () => {
    expect((await get("/no/such/page")).status).toBe(404);
  });

  it("U49 no page shows preview or developer text to players", async () => {
    for (const path of ["/", "/leaderboard", "/account", "/play/quick", "/g/ABC234", "/readme/"]) {
      const { html } = await get(path);
      // The text a player can read: no scripts, styles or tags, and no attribute values (so a stylesheet link is not "text").
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]*>/g, " ");
      for (const forbidden of ["style preview", "theme.css", "components.css", "var(--", "TODO", "lorem"]) {
        expect(visible.toLowerCase(), `${path} shows "${forbidden}"`).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it("U50 /style-preview exists only in development and no page links to it", async () => {
    for (const path of ["/", "/leaderboard", "/account", "/play/quick", "/g/ABC234", "/readme/"]) {
      expect((await get(path)).html, path).not.toContain("style-preview");
    }
    // The shared check server may or may not run with DEV=1; either way the route matches the mode.
    const dev = (await get("/__dev/version")).status === 200;
    expect((await get("/style-preview")).status).toBe(dev ? 200 : 404);
  });
});
