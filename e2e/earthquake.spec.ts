// Browser checks for the Earthquake power-up (docs/design/earthquake.md U61 to U67, rules R53 to R58).
// Run with pnpm test:e2e, never in pnpm check.
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { chooseColumn, makeGameCode, newPlayer, openTutorial, testid, toTutorialStep, waitForRound } from "./helpers.ts";

async function twoPlayers(browser: Parameters<typeof newPlayer>[0], options: { reducedMotion?: boolean; a?: { width: number; height: number } } = {}) {
  const one = await newPlayer(browser, options.a ?? PHONE, { reducedMotion: options.reducedMotion });
  const two = await newPlayer(browser, LAPTOP, { reducedMotion: options.reducedMotion });
  const code = await makeGameCode(one.page);
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await waitForRound(one.page, 1);
  await waitForRound(two.page, 1);
  await expect(one.page.locator(testid("waiting-panel"))).toBeHidden();
  return { one, two };
}

// Plays round 1 (A in column 0, B in column 3), so there is a bottom row to shake (R55).
async function playOpeningRound(one: Page, two: Page): Promise<void> {
  await chooseColumn(one, 0);
  await chooseColumn(two, 3);
  await waitForRound(one, 2);
  await waitForRound(two, 2);
}

test.describe("Earthquake badge (U61 to U64)", () => {
  test("U61 the two badges are the same height whether or not Earthquake can be used", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true, a: NARROW });
    const height = async (id: string) => (await one.page.locator(testid(id)).boundingBox())!.height;
    expect(await height("earthquake-badge")).toBe(await height("shield-badge"));
    await playOpeningRound(one.page, two.page);
    expect(await height("earthquake-badge")).toBe(await height("shield-badge"));
    expect(await height("earthquake-badge")).toBeGreaterThanOrEqual(44);
    await one.context.close();
    await two.context.close();
  });

  test("U61 and R55 the badge is disabled and says so while the bottom row is empty, then reads Use Earthquake", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    const badge = one.page.locator(testid("earthquake-badge"));
    await expect(badge).toBeVisible();
    await expect(badge).toBeDisabled();
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Nothing to shake yet");
    await playOpeningRound(one.page, two.page);
    await expect(badge).toBeEnabled();
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Use Earthquake");
    const box = (await badge.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await one.context.close();
    await two.context.close();
  });

  test("U62 tapping the badge chooses Earthquake for good: armed, locked, the opponent sees only Ready (R4, R21)", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await playOpeningRound(one.page, two.page);
    await one.page.locator(testid("earthquake-badge")).click();
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Earthquake armed");
    await expect(one.page.locator(testid("earthquake-badge"))).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await expect(one.page.locator(testid("quake-marker"))).toBeVisible();
    await expect(one.page.locator(testid("shield-badge"))).toBeDisabled();
    await expect(one.page.locator(testid("earthquake-badge"))).toBeDisabled();
    await one.page.locator(testid("column-4")).click({ force: true });
    await expect(one.page.locator(testid("game-message"))).toHaveText("Your choice is locked in.");
    // The opponent hears only that A is ready, and sees neither the armed state nor the marker.
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    await expect(two.page.locator(testid("opponent-earthquake"))).toHaveText("Earthquake available");
    await expect(two.page.locator(testid("quake-marker"))).toBeHidden();
    await one.context.close();
    await two.context.close();
  });

  test("R53 and U62 tapping Earthquake puts an armed shield down: they cannot be combined", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await playOpeningRound(one.page, two.page);
    await one.page.locator(testid("shield-badge")).click();
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Shield armed");
    await one.page.locator(testid("earthquake-badge")).click();
    await expect(one.page.locator(testid("shield-badge"))).toHaveAttribute("aria-pressed", "false");
    await chooseColumn(two.page, 5);
    await waitForRound(one.page, 3);
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield"); // the shield was never spent
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Earthquake used");
    await expect(one.page.locator(testid("earthquake-badge"))).toBeDisabled();
    await expect(two.page.locator(testid("opponent-earthquake"))).toHaveText("Earthquake used");
    await one.context.close();
    await two.context.close();
  });

  test("U63 and U104 the info button opens a popup with the explanation, and the opening line only while nothing can be shaken", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await one.page.locator(testid("earthquake-info")).click();
    const help = one.page.locator(testid("earthquake-help"));
    await expect(help).toBeVisible();
    // Nothing is on the board yet, so the popup says when it becomes available first (U104).
    await expect(help).toContainText("Available once the bottom row has a piece.");
    await expect(help).toContainText("Earthquake uses your turn: the bottom row crumbles away and everything drops down one. Lines it creates by itself do not win.");
    expect(((await one.page.locator(testid("earthquake-info")).boundingBox())!).width).toBeGreaterThanOrEqual(44);
    await help.locator(testid("dialog-cancel")).click();
    await expect(help).toHaveCount(0);
    await one.context.close();
    await two.context.close();
  });

  test("U18 the E key uses Earthquake", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await playOpeningRound(one.page, two.page);
    await one.page.keyboard.press("e");
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Earthquake armed");
    await one.context.close();
    await two.context.close();
  });

  for (const viewport of [NARROW, PHONE]) {
    test(`U61 no sideways scroll and the board stays on screen with the Earthquake badge at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { one, two } = await twoPlayers(browser, { reducedMotion: true, a: viewport });
      await playOpeningRound(one.page, two.page);
      const scroll = await one.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      const lowest = (await one.page.locator(testid("cell-0-0")).boundingBox())!;
      expect(lowest.y + lowest.height).toBeLessThanOrEqual(viewport.height);
      for (const id of ["earthquake-badge", "earthquake-info", "shield-badge", "shield-info"]) {
        const box = (await one.page.locator(testid(id)).boundingBox())!;
        expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, `${id} inside the screen`).toBeLessThanOrEqual(viewport.width);
      }
      await one.context.close();
      await two.context.close();
    });
  }
});

test.describe("The earthquake round (U65, U66)", () => {
  test("U65 and U66 the board updates within a second on both screens and the result line explains it", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await playOpeningRound(one.page, two.page);
    await one.page.locator(testid("earthquake-badge")).click();
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    const started = Date.now();
    await chooseColumn(two.page, 5);
    await waitForRound(one.page, 3);
    await waitForRound(two.page, 3);
    expect(Date.now() - started, "both screens show the result within one second").toBeLessThan(1000);
    // The bottom row (A in column 0, B in column 3) is gone; B's disc landed in column 5.
    for (const page of [one.page, two.page]) {
      await expect(page.locator(testid("cell-0-0"))).toHaveAttribute("data-piece", "");
      await expect(page.locator(testid("cell-3-0"))).toHaveAttribute("data-piece", "");
      await expect(page.locator(testid("cell-5-0"))).not.toHaveAttribute("data-piece", "");
    }
    await expect(one.page.locator(testid("result-line"))).toHaveText("Earthquake! The bottom row crumbled. Your opponent's disc landed in column 6.");
    await expect(two.page.locator(testid("result-line"))).toHaveText("Your opponent used Earthquake! The bottom row crumbled. Your disc landed in column 6.");
    await one.context.close();
    await two.context.close();
  });

  test("U65 the animation runs shake, crumble and slide as classes on the board, then the drop", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await playOpeningRound(one.page, two.page);
    // A second round puts pieces above the bottom row, so there is something to slide down.
    await chooseColumn(one.page, 0);
    await chooseColumn(two.page, 3);
    await waitForRound(one.page, 3);
    await waitForRound(two.page, 3);
    await one.page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      new MutationObserver(() => {
        for (const name of ["quake-shake", "crumble", "sliding"]) if (document.querySelector(`.${name}`)) seen.add(name);
        if (document.querySelector(".dropping")) seen.add("dropping");
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });
    await one.page.locator(testid("earthquake-badge")).click();
    await chooseColumn(two.page, 5);
    await waitForRound(one.page, 4);
    await expect.poll(() => one.page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen].sort())).toEqual(["crumble", "dropping", "quake-shake", "sliding"]);
    await one.context.close();
    await two.context.close();
  });

  test("U65 under reduced motion the board simply updates: no shake, crumble, slide or drop classes", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await playOpeningRound(one.page, two.page);
    await one.page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      new MutationObserver(() => {
        for (const name of ["quake-shake", "crumble", "sliding", "dropping", "thud"]) if (document.querySelector(`.${name}`)) seen.add(name);
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });
    await one.page.locator(testid("earthquake-badge")).click();
    await chooseColumn(two.page, 5);
    await waitForRound(one.page, 3);
    await expect(one.page.locator(testid("cell-5-0"))).not.toHaveAttribute("data-piece", "");
    await expect(one.page.locator(testid("cell-0-0"))).toHaveAttribute("data-piece", "");
    expect(await one.page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen])).toEqual([]);
    await one.context.close();
    await two.context.close();
  });

  test("R57 and U66 both players choosing Earthquake shake once and say so", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await playOpeningRound(one.page, two.page);
    await one.page.locator(testid("earthquake-badge")).click();
    await two.page.locator(testid("earthquake-badge")).click();
    await waitForRound(one.page, 3);
    await expect(one.page.locator(testid("result-line"))).toHaveText("You both used Earthquake! The bottom row crumbled once.");
    expect(await one.page.locator('[data-testid^="cell-"][data-piece="A"], [data-testid^="cell-"][data-piece="B"], [data-testid^="cell-"][data-piece="R"]').count()).toBe(0);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("The tutorial's Earthquake step (U67)", () => {
  // The Earthquake step is step 7 of 11 (U143).
  const toEarthquakeStep = (page: Page) => toTutorialStep(page, 7);

  test("U67 the step comes after the shield step, waits for a tap on Earthquake, and breaks the computer's line", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    await toEarthquakeStep(page);
    await expect(page.locator(testid("tutorial-title"))).toHaveText("Earthquake");
    await expect(page.locator(testid("tutorial-caption"))).toHaveText("Earthquake uses your turn: the bottom row crumbles and everything drops down one. Lines it makes by itself do not win. It works once per game, and only when the bottom row has a piece.");
    const badge = page.locator(testid("tutorial-earthquake"));
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Use Earthquake");
    await expect(page.locator(testid("tutorial-next"))).toBeHidden();
    const cells = `${testid("tutorial-board")} [data-testid^="cell-"]`;
    expect(await page.locator(`${cells}[data-piece="B"]`).count(), "the computer starts with three in a row").toBe(3);
    // A column tap does not do the step: it says what is needed.
    await page.locator(testid("tutorial-column-3")).click();
    await expect(page.locator(testid("tutorial-hint"))).toContainText("Tap Earthquake");
    await expect(page.locator(testid("tutorial-next"))).toBeHidden();
    await badge.click();
    await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
    await expect(badge).toContainText("Earthquake used");
    // The bottom row crumbled: the computer's line is gone and only its landing disc is left.
    expect(await page.locator(`${cells}[data-piece="B"]`).count()).toBe(1);
    await expect(page.locator(`${testid("tutorial-board")} .piece.win`)).toHaveCount(0);
    await context.close();
  });

  test("U67 and U47 the step's controls stay on screen at 320 x 568", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, NARROW, { reducedMotion: true });
    await openTutorial(page);
    await toEarthquakeStep(page);
    const badge = (await page.locator(testid("tutorial-earthquake")).boundingBox())!;
    expect(badge.height).toBeGreaterThanOrEqual(44);
    expect(badge.y + badge.height).toBeLessThanOrEqual(NARROW.height);
    const skip = (await page.locator(testid("tutorial-skip")).boundingBox())!;
    expect(skip.y + skip.height).toBeLessThanOrEqual(NARROW.height);
    const hint = (await page.locator(testid("tutorial-hint")).boundingBox())!;
    expect(hint.y + hint.height, "the hint does not overlap Skip").toBeLessThanOrEqual(skip.y);
    await context.close();
  });
});
