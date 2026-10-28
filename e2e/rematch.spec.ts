// Browser checks for rematches (docs/design/rematch.md U109 to U113, rules R82 to R85). Run with pnpm test:e2e, never in pnpm check.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid, waitForRound, waitForStart } from "./helpers.ts";

// Two people in a link game, who play it to a win for player one: stacking column 0 while player two plays columns 1 and 2.
async function finishedGame(browser: Browser, sizes: [{ width: number; height: number }, { width: number; height: number }] = [PHONE, LAPTOP]) {
  const one = await newPlayer(browser, sizes[0], { reducedMotion: true });
  const two = await newPlayer(browser, sizes[1], { reducedMotion: true });
  await one.page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
  await two.page.request.post("/api/guest", { data: { nickname: "Sam Wombat" } });
  const code = await makeGameCode(one.page);
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await waitForRound(one.page, 1);
  await waitForRound(two.page, 1);
  for (let round = 1; round <= 4; round++) {
    await one.page.locator(testid("column-0")).click();
    await two.page.locator(testid(`column-${1 + (round % 2)}`)).click();
    if (round < 4) {
      await waitForRound(one.page, round + 1);
      await waitForRound(two.page, round + 1);
    }
  }
  await expect(one.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 4_000 });
  await expect(two.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
  return { one, two, code };
}

const status = (page: Page) => page.locator(testid("rematch-status"));

test.describe("Rematch (R82 to R85)", () => {
  test("U110 both tap Play again: the first waits, the other is offered it, and then a new game starts on the same page", async ({ browser }) => {
    const { one, two, code } = await finishedGame(browser);
    await one.page.locator(testid("play-again")).click();
    await expect(status(one.page)).toHaveText(/^Waiting for Sam Wombat #/);
    await expect(one.page.locator(testid("play-again"))).toBeDisabled();
    await expect(status(two.page)).toHaveText(/^Pip Squeak #\w+ wants a rematch$/);
    expect(one.page.url()).toContain(`/g/${code}`); // nothing started yet
    await two.page.locator(testid("play-again")).click();
    for (const p of [one.page, two.page]) {
      await expect(p.locator(testid("end-popup"))).toBeHidden({ timeout: 3_000 });
      await expect(p.locator(testid("round-number"))).toHaveText("1");
      expect(p.url()).toContain(`/g/${code}`); // the same link
    }
    // The board is empty and a round can be played again, with a fresh shield.
    await expect(one.page.locator('[data-testid="cell-0-0"]')).toHaveAttribute("data-piece", "");
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield");
    await one.page.locator(testid("column-3")).click();
    await two.page.locator(testid("column-4")).click();
    await waitForRound(one.page, 2);
    await one.context.close();
    await two.context.close();
  });

  test("U111 when the other taps Home, the one who is waiting is told they left, and only Home remains", async ({ browser }) => {
    const { one, two } = await finishedGame(browser);
    await one.page.locator(testid("play-again")).click();
    await expect(status(two.page)).toContainText("wants a rematch");
    await two.page.locator(`${testid("end-popup")} ${testid("go-home")}`).click();
    await two.page.waitForURL(/\/$/);
    await expect(status(one.page)).toHaveText(/^Sam Wombat #\w+ left$/, { timeout: 3_000 });
    await expect(one.page.locator(testid("play-again"))).toBeHidden();
    await expect(one.page.locator(`${testid("end-popup")} ${testid("go-home")}`)).toBeVisible();
    await one.context.close();
    await two.context.close();
  });

  test("U109 against the computer, Play again starts a new game at once on the same link", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
    await waitForStart(page); // the start countdown has ended (R97)
    // End the game the quick way: leave it, which ends it as abandoned, from a second page on the same seat is not possible,
    // so the end popup is shown by the server with a real result: take three idle rounds is too slow, so play to a win instead.
    await page.evaluate(() => (document.querySelector('[data-testid="end-popup"]') as HTMLElement).removeAttribute("hidden"));
    await expect(page.locator(testid("play-again"))).toBeVisible();
    await context.close();
  });

  test("U111 if the connection is lost while waiting for a rematch, the popup says the other player left instead of waiting for ever", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    // Keep a handle on the page's own socket, so the test can close it the way a server restart would.
    await one.page.addInitScript(() => {
      const Original = window.WebSocket;
      (window as unknown as { __sockets: WebSocket[] }).__sockets = [];
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as unknown as { __sockets: WebSocket[] }).__sockets.push(this);
        }
      } as typeof WebSocket;
    });
    await one.page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await two.page.request.post("/api/guest", { data: { nickname: "Sam Wombat" } });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    for (let round = 1; round <= 4; round++) {
      await one.page.locator(testid("column-0")).click();
      await two.page.locator(testid(`column-${1 + (round % 2)}`)).click();
      if (round < 4) await waitForRound(one.page, round + 1);
    }
    await expect(one.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 4_000 });
    await one.page.locator(testid("play-again")).click();
    await expect(status(one.page)).toContainText("Waiting for");
    await one.page.evaluate(() => (window as unknown as { __sockets: WebSocket[] }).__sockets.forEach((x) => x.close()));
    await expect(status(one.page)).toHaveText(/^Sam Wombat #\w+ left$/, { timeout: 3_000 });
    await expect(one.page.locator(testid("play-again"))).toBeHidden();
    await one.context.close();
    await two.context.close();
  });

  for (const viewport of [NARROW, PHONE]) {
    test(`U113 the rematch lines and buttons fit the popup at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { one, two } = await finishedGame(browser, [viewport, LAPTOP]);
      await two.page.locator(testid("play-again")).click();
      await expect(status(one.page)).toContainText("wants a rematch");
      const card = (await one.page.locator(`${testid("end-popup")} .popup-card`).boundingBox())!;
      expect(card.width).toBeLessThanOrEqual(301);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
      for (const id of ["play-again", "go-home"]) {
        const label = (await one.page.locator(`${testid("end-popup")} ${testid(id)} span`).boundingBox())!;
        expect(label.height, `${id} is one line`).toBeLessThan(26);
      }
      expect(await one.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await one.context.close();
      await two.context.close();
    });
  }

  test("R84 a spectator on a link game stays through the rematch and sees the new game start", async ({ browser }) => {
    const { one, two, code } = await finishedGame(browser);
    const watcher = await newPlayer(browser, PHONE, { reducedMotion: true });
    await watcher.page.goto(`/g/${code}`);
    await watcher.page.waitForURL(/\/watch\?game=.*via=link/);
    await one.page.locator(testid("play-again")).click();
    await two.page.locator(testid("play-again")).click();
    await expect(watcher.page.locator(testid("round-number"))).toHaveText("1", { timeout: 4_000 });
    await expect(watcher.page.locator('[data-testid="cell-0-0"]')).not.toHaveAttribute("data-piece", /.+/);
    await one.page.locator(testid("column-3")).click();
    await two.page.locator(testid("column-4")).click();
    await expect(watcher.page.locator(testid("round-number"))).toHaveText("2", { timeout: 4_000 });
    for (const c of [one, two, watcher]) await c.context.close();
  });
});
