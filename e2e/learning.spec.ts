// A first-time player takes their seat and does the tutorial while the game waits (R102, ADR 0017, docs/design/game-screen.md U169,
// docs/design/spectating.md U170). Two or three real browsers. Run with pnpm test:e2e.
import { expect, test } from "@playwright/test";
import { LAPTOP, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid } from "./helpers.ts";

test.use({ actionTimeout: 8_000 });

const WORDS = "Your opponent is learning how to play. The game starts when they finish.";

test.describe("R102 the host waits while the opponent does the tutorial", () => {
  test("R102 U169 the host sees the learning message with Cancel game and no share link, then the countdown once the joiner skips", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("waiting-panel"))).toBeVisible();

    const joiner = await newPlayer(browser, LAPTOP, { tutorial: "new", reducedMotion: true });
    await joiner.page.goto(`/g/${code}`);
    await expect(joiner.page.locator(testid("tutorial"))).toBeVisible();

    // While the joiner reads: the learning card, in place of the share link card.
    await expect(host.page.locator(testid("learning-panel"))).toBeVisible({ timeout: 5_000 });
    await expect(host.page.locator(testid("learning-panel"))).toContainText(WORDS);
    await expect(host.page.locator(testid("cancel-learning"))).toBeVisible();
    for (const id of ["waiting-panel", "game-code", "copy-link", "share"]) await expect(host.page.locator(testid(id)), `no ${id} while they learn`).toBeHidden();
    await host.page.waitForTimeout(4_000); // longer than the start countdown, and with no time limit
    await expect(host.page.locator(testid("learning-panel")), "no time limit").toBeVisible();
    await expect(host.page.locator(testid("get-ready")), "no countdown while they learn").toBeHidden();

    // Skipping ends the hold: the card goes and the usual countdown starts on both screens.
    await joiner.page.locator(testid("tutorial-skip")).click();
    await expect(host.page.locator(testid("learning-panel"))).toBeHidden({ timeout: 5_000 });
    await expect(host.page.locator(testid("get-ready"))).toBeVisible({ timeout: 5_000 });
    await expect(joiner.page.locator(testid("get-ready"))).toBeVisible({ timeout: 5_000 });
    await expect(host.page.locator(testid("opponent-heading"))).toContainText("Playing with", { timeout: 8_000 });
    await host.context.close();
    await joiner.context.close();
  });

  test("R102 U170 a spectator who arrives meanwhile sees the same words and no button", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const joiner = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await joiner.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("learning-panel"))).toBeVisible({ timeout: 5_000 });

    const watcher = await newPlayer(browser, PHONE, { reducedMotion: true });
    await watcher.page.goto(`/g/${code}`);
    await watcher.page.waitForURL(/\/watch\?game=/, { timeout: 8_000 });
    const card = watcher.page.locator(testid("watch-learning"));
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card).toContainText(WORDS);
    expect(await card.locator("button").count(), "no button on the spectator's card").toBe(0);

    await joiner.page.locator(testid("tutorial-skip")).click();
    await expect(card, "the card goes when the learner finishes").toBeHidden({ timeout: 5_000 });
    for (const c of [host, joiner, watcher]) await c.context.close();
  });

  test("R102 the seat is the joiner's at once: a third person who opens the link meanwhile is a spectator, never the player", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const joiner = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await joiner.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("learning-panel"))).toBeVisible({ timeout: 5_000 });
    const third = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await third.page.goto(`/g/${code}`);
    await third.page.waitForURL(/\/watch\?game=/, { timeout: 8_000 });
    await expect(third.page.locator(testid("tutorial")), "a spectator never sees the tutorial").toBeHidden();
    for (const c of [host, joiner, third]) await c.context.close();
  });

  test("R102 U169 Cancel game on the learning card ends it, and the learner is told", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const joiner = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await joiner.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("learning-panel"))).toBeVisible({ timeout: 5_000 });
    await host.page.locator(testid("cancel-learning")).click();
    await host.page.waitForURL((url) => url.pathname === "/", { timeout: 5_000 });
    await expect(joiner.page.locator(testid("tutorial")), "the learner's tutorial closes").toBeHidden({ timeout: 5_000 });
    await expect(joiner.page.locator(testid("game-message"))).toContainText("cancelled");
    for (const c of [host, joiner]) await c.context.close();
  });
});
