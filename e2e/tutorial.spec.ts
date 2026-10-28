// When the tutorial opens (R47, R48, docs/design/tutorial.md U136): the first time a player starts any match, before it begins,
// never on the home screen by itself and never twice; finishing or skipping it starts the match they chose. The steps themselves
// are checked in e2e/design.spec.ts. Run with pnpm test:e2e.
import { expect, test, type Page } from "@playwright/test";
import { PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid, toTutorialStep } from "./helpers.ts";

test.use({ actionTimeout: 8_000 });

const tutorial = (page: Page) => page.locator(testid("tutorial"));

// Finishes the tutorial by walking every step and tapping the last button, as a new player would.
async function finish(page: Page): Promise<void> {
  await toTutorialStep(page, 11);
  await expect(page.locator(testid("tutorial-next"))).toHaveText("Start the match");
  await page.locator(testid("tutorial-next")).click();
}

test.describe("R47 the tutorial runs before the first match", () => {
  test("R47 it never opens on the home screen by itself", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await expect(page.locator(testid("player-name"))).not.toHaveText("Choosing a name..."); // the page has asked the server who this is
    await page.waitForTimeout(1_000);
    await expect(tutorial(page)).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1_000);
    await expect(tutorial(page)).toBeHidden();
    await context.close();
  });

  test("R47 Play the computer: it opens before the match, and finishing it starts the computer game", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("play-computer")).click();
    await expect(tutorial(page)).toBeVisible();
    expect(new URL(page.url()).pathname, "no game has started yet").toBe("/");
    await finish(page);
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(page.locator(testid("opponent-heading"))).toHaveText("Playing the computer", { timeout: 6_000 });
    await expect(tutorial(page), "and not again on the game page").toBeHidden();
    await context.close();
  });

  test("R47 Play a friend: skipping it starts the friend game", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("play-friend")).click();
    await expect(tutorial(page)).toBeVisible();
    await toTutorialStep(page, 4);
    await page.locator(testid("tutorial-skip")).click();
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(page.locator(testid("waiting-panel"))).toBeVisible();
    await expect(tutorial(page)).toBeHidden();
    await context.close();
  });

  test("R47 Quick match: it opens before the queue, and skipping it goes to Quick match", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } })); // never paired with another check
    await page.goto("/");
    await page.locator(testid("quick-match")).click();
    await expect(tutorial(page)).toBeVisible();
    expect(new URL(page.url()).pathname, "not in the queue yet").toBe("/");
    await page.locator(testid("tutorial-skip")).click();
    await page.waitForURL(/\/play\/quick$/);
    await expect(page.locator(testid("quick-status"))).toBeVisible();
    await context.close();
  });

  test("R47 Join with a code: it opens after the code is accepted, then the game opens", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("join-toggle")).click();
    await page.locator(testid("code-input")).fill(code);
    await page.keyboard.press("Enter");
    await expect(page.locator(testid("code-dialog"))).toHaveCount(0);
    await expect(tutorial(page)).toBeVisible();
    await page.locator(testid("tutorial-skip")).click();
    await page.waitForURL(new RegExp(`/g/${code}$`));
    await expect(page.locator(testid("get-ready"))).toBeVisible({ timeout: 6_000 }); // seated: the start countdown runs
    await expect(tutorial(page)).toBeHidden();
    await context.close();
    await host.context.close();
  });

  test("R47 R51 opening a friend's link: the tutorial runs before the page joins, so the host's game does not start until it is done", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto(`/g/${code}`);
    await expect(tutorial(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(host.page.locator(testid("waiting-panel")), "nobody has joined while the newcomer reads").toBeVisible();
    await page.locator(testid("tutorial-skip")).click();
    await expect(host.page.locator(testid("waiting-panel"))).toBeHidden({ timeout: 5_000 });
    await expect(page.locator(testid("get-ready"))).toBeVisible({ timeout: 5_000 });
    await context.close();
    await host.context.close();
  });

  test("R48 it is never shown twice: after it is skipped, the next match starts at once, on any device of the same player", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("play-computer")).click();
    await page.locator(testid("tutorial-skip")).click();
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await page.goto("/");
    await page.locator(testid("play-friend")).click();
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(tutorial(page)).toBeHidden();
    // A second page with the same session (another tab): also never shown.
    const other = await context.newPage();
    await other.goto("/");
    await other.locator(testid("play-computer")).click();
    await other.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(tutorial(other)).toBeHidden();
    await context.close();
  });

  test("R49 How to play replays it from home and starts no match", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("how-to-play")).click();
    await expect(tutorial(page)).toBeVisible();
    await expect(page.locator(testid("tutorial-progress"))).toHaveText("Step 1 of 11");
    await toTutorialStep(page, 11);
    await expect(page.locator(testid("tutorial-next"))).toHaveText("Done");
    await page.locator(testid("tutorial-next")).click();
    await expect(tutorial(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/");
    await context.close();
  });
});

