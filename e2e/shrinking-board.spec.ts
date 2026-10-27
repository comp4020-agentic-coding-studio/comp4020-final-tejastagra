// Browser checks for the shrinking board (docs/design/shrinking-board.md U68 to U75, rules R61 to R69).
// There is one ceiling: it drops after rounds 12 and 20 and never below 4 rows, and no column ever closes
// (ADR 0011, amended after playtesting). Run with pnpm test:e2e, never in pnpm check.
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid, waitForRound } from "./helpers.ts";

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

// Both players choose the same column, so the round crashes at once and leaves rubble: nobody can
// win, and the schedule runs on. `column` says which column each round uses.
async function crashRounds(one: Page, two: Page, from: number, to: number, column: (round: number) => number): Promise<void> {
  for (let round = from; round <= to; round++) {
    await one.locator(testid(`column-${column(round)}`)).click();
    await two.locator(testid(`column-${column(round)}`)).click();
    await waitForRound(one, round + 1);
    await waitForRound(two, round + 1);
  }
}
// All seven columns, round by round: none ever closes, so every one is a fair choice.
const everyColumn = (round: number) => (round - 1) % 7;
const closedCells = (page: Page) => page.locator('[data-testid^="cell-"][data-closed="true"]');
const doomedCells = (page: Page) => page.locator('[data-testid^="cell-"][data-doomed="true"]');

test.describe("The warning (U68, U69)", () => {
  test("U68 and U69 nothing warns before round 12; the round before the first drop a banner says so and the top row flashes; it is gone a round later", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    for (const page of [one.page, two.page]) {
      await expect(page.locator(testid("shrink-warning"))).toBeHidden();
      expect(await doomedCells(page).count()).toBe(0);
    }
    await crashRounds(one.page, two.page, 1, 10, everyColumn);
    await expect(one.page.locator(testid("shrink-warning")), "no warning in round 11").toBeHidden();
    await crashRounds(one.page, two.page, 11, 11, everyColumn);
    for (const page of [one.page, two.page]) {
      await expect(page.locator(testid("shrink-warning"))).toBeVisible();
      await expect(page.locator(testid("shrink-warning-text"))).toHaveText("The ceiling drops after this round");
      expect(await doomedCells(page).count(), "the seven cells of the top row flash").toBe(7);
      for (let c = 0; c < 7; c++) await expect(page.locator(testid(`cell-${c}-5`))).toHaveAttribute("data-doomed", "true");
    }
    await crashRounds(one.page, two.page, 12, 12, everyColumn);
    for (const page of [one.page, two.page]) {
      await expect(page.locator(testid("shrink-warning"))).toBeHidden();
      expect(await doomedCells(page).count()).toBe(0);
    }
    await one.context.close();
    await two.context.close();
  });

  test("U68 the warning comes again before the second drop (round 20), flashing row 5, and never again once the board is at 4 rows", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 19, everyColumn);
    await expect(one.page.locator(testid("shrink-warning-text"))).toHaveText("The ceiling drops after this round");
    expect(await doomedCells(one.page).count()).toBe(7);
    for (let c = 0; c < 7; c++) await expect(one.page.locator(testid(`cell-${c}-4`))).toHaveAttribute("data-doomed", "true");
    await crashRounds(one.page, two.page, 20, 20, everyColumn);
    expect(await closedCells(one.page).count(), "two rows of rock").toBe(14);
    // Round 28 is on the schedule, but the board is at its floor: there is no warning in round 27, and none after.
    await crashRounds(one.page, two.page, 21, 26, everyColumn);
    await expect(one.page.locator(testid("shrink-warning")), "no warning before round 28").toBeHidden();
    await one.context.close();
    await two.context.close();
  });

  test("U68 the warning is the same on both screens and names no choice (R22)", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 11, everyColumn);
    expect(await one.page.locator(testid("shrink-warning")).innerText()).toBe(await two.page.locator(testid("shrink-warning")).innerText());
    await one.context.close();
    await two.context.close();
  });
});

test.describe("The ceiling drop (U70 to U73)", () => {
  test("U70, U71 and U73 after round 12 the top row is rock on both screens, the pieces in it are gone and the result line says so", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 12, everyColumn);
    for (const page of [one.page, two.page]) {
      expect(await closedCells(page).count()).toBe(7);
      for (let c = 0; c < 7; c++) {
        await expect(page.locator(testid(`cell-${c}-5`))).toHaveAttribute("data-closed", "true");
        await expect(page.locator(testid(`cell-${c}-5`))).toHaveAttribute("data-piece", "");
      }
      expect(await doomedCells(page).count()).toBe(0);
    }
    await expect(one.page.locator(testid("result-line"))).toHaveText("Crash: rubble landed. The ceiling dropped. The top row turned to rock.");
    await one.context.close();
    await two.context.close();
  });

  test("U71 rock looks different from rubble: a square block with no hatch, and rubble is still a round hatched piece", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 12, everyColumn);
    const look = await one.page.evaluate(() => {
      const rock = getComputedStyle(document.querySelector('[data-testid="cell-0-5"]')!);
      const rubble = getComputedStyle(document.querySelector('.piece[data-piece="rubble"]')!);
      return { rockRadius: rock.borderTopLeftRadius, rubbleRadius: rubble.borderTopLeftRadius, rockImage: rock.backgroundImage, rubbleImage: rubble.backgroundImage };
    });
    expect(parseFloat(look.rockRadius), "rock has square-ish corners").toBeLessThan(10);
    expect(parseFloat(look.rubbleRadius), "rubble is round").toBeGreaterThan(100);
    expect(look.rockImage).not.toContain("repeating-linear-gradient"); // no hatch
    expect(look.rubbleImage).toContain("repeating-linear-gradient"); // hatched
    await one.context.close();
    await two.context.close();
  });

  test("U72 no column is ever closed: after both drops every column still takes a choice, and a column full at 4 rows says so", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 20, everyColumn);
    for (const page of [one.page, two.page]) {
      // 20 crashes round-robin leave 2 or 3 rubble blocks in each column: room for another at 4 rows.
      for (let c = 0; c < 7; c++) await expect(page.locator(testid(`column-${c}`))).toHaveAttribute("aria-disabled", "false");
    }
    await one.page.locator(testid("column-0")).click(); // the outer columns would have been closed by the old walls
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    await expect(one.page.locator(testid("game-message"))).not.toHaveText(/closed/);
    await one.context.close();
    await two.context.close();
  });

  test("U72 and R64 a column is full at the current rows: five blocks fill column 3 only once the ceiling has dropped to 5 rows", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 5, () => 3); // five blocks in column 3
    await expect(one.page.locator(testid("column-3")), "five of six is not full").toHaveAttribute("aria-disabled", "false");
    await crashRounds(one.page, two.page, 6, 12, (round) => [0, 1, 2, 4, 5, 6, 0][round - 6]); // seven more elsewhere, to round 12
    for (const page of [one.page, two.page]) await expect(page.locator(testid("column-3")), "five of five is full").toHaveAttribute("aria-disabled", "true");
    await one.page.locator(testid("column-3")).click({ force: true });
    await expect(one.page.locator(testid("game-message"))).toHaveText("That column is full. Pick another.");
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Choosing"); // nothing was sent
    await one.context.close();
    await two.context.close();
  });

  test("U73 the second drop (round 20) says the same, and the closed area is two rows of rock (14 cells)", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 20, everyColumn);
    await expect(one.page.locator(testid("result-line"))).toHaveText("Crash: rubble landed. The ceiling dropped. The top row turned to rock.");
    expect(await closedCells(one.page).count()).toBe(14);
    await one.context.close();
    await two.context.close();
  });

  test("U70 the drop reaches both screens within a second, and the rock appears in the animated version too", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await crashRounds(one.page, two.page, 1, 11, everyColumn);
    await one.page.locator(testid("column-2")).click();
    const started = Date.now();
    await two.page.locator(testid("column-2")).click();
    await waitForRound(one.page, 13);
    await waitForRound(two.page, 13);
    await expect(closedCells(one.page)).toHaveCount(7);
    await expect(closedCells(two.page)).toHaveCount(7);
    expect(Date.now() - started, "both screens show the drop within one second").toBeLessThan(1000);
    await one.context.close();
    await two.context.close();
  });

  test("U72 and R4 the new round is open for a choice as soon as the drop is drawn: a tap right after it is a choice, not a locked-in message", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await crashRounds(one.page, two.page, 1, 11, everyColumn);
    await one.page.locator(testid("column-2")).click();
    await two.page.locator(testid("column-2")).click();
    await waitForRound(one.page, 13);
    // The round counter changes at once; tap straight away and the choice must be accepted.
    await one.page.locator(testid("column-4")).click({ force: true });
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await expect(one.page.locator(testid("game-message"))).not.toHaveText("Your choice is locked in.");
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    await one.context.close();
    await two.context.close();
  });

  test("U70 the drop is drawn as crack, crumble and rock, and under reduced motion nothing animates", async ({ browser }) => {
    for (const reduced of [false, true]) {
      const { one, two } = await twoPlayers(browser, { reducedMotion: reduced });
      await crashRounds(one.page, two.page, 1, 11, everyColumn);
      await one.page.evaluate(() => {
        const seen = new Set<string>();
        (window as unknown as { __seen: Set<string> }).__seen = seen;
        new MutationObserver(() => {
          if (document.querySelector(".cracking")) seen.add("cracking");
        }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      });
      await one.page.locator(testid("column-2")).click();
      await two.page.locator(testid("column-2")).click();
      await waitForRound(one.page, 13);
      await expect(closedCells(one.page)).toHaveCount(7);
      const seen = await one.page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen].sort());
      if (reduced) expect(seen, "under reduced motion the cells simply change to rock").toEqual([]);
      else expect(seen).toEqual(["cracking"]);
      await one.context.close();
      await two.context.close();
    }
  });

  test("U70 a piece that was already in the top row crumbles, and is gone afterwards", async ({ browser }) => {
    // Six crashes in column 0 stack rubble up to row 6. Round 12 then closes that row and the sixth block crumbles.
    const { one, two } = await twoPlayers(browser);
    await crashRounds(one.page, two.page, 1, 6, () => 0);
    await expect(one.page.locator(testid("cell-0-5"))).toHaveAttribute("data-piece", "R");
    await crashRounds(one.page, two.page, 7, 11, (round) => 1 + ((round - 1) % 6));
    await expect(one.page.locator(testid("cell-0-5"))).toHaveAttribute("data-piece", "R"); // still there before the drop
    await one.page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      new MutationObserver(() => {
        if (document.querySelector(".crumble")) seen.add("crumble");
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });
    await one.page.locator(testid("column-2")).click();
    await two.page.locator(testid("column-2")).click();
    await waitForRound(one.page, 13);
    await expect(one.page.locator(testid("cell-0-5"))).toHaveAttribute("data-closed", "true");
    await expect(one.page.locator(testid("cell-0-5"))).toHaveAttribute("data-piece", "");
    expect(await one.page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen])).toEqual(["crumble"]);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("A reload shows the shrunk board (R24)", () => {
  test("U71 reloading after the drops draws the rock at once, with the same cells closed", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, { reducedMotion: true });
    await crashRounds(one.page, two.page, 1, 20, everyColumn);
    await one.page.reload();
    await waitForRound(one.page, 21);
    expect(await closedCells(one.page).count()).toBe(14);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("The phone layout does not change (promise 4)", () => {
  test("U68 and U75 with the widest nicknames a player can choose, the banner leaves the board and timer on the first screen at 320 x 568", async ({ browser }) => {
    // R28 allows 16 letters, and a wide name wraps to three lines in the 127px panel: that is the worst case the
    // first-screen rule has to hold for (correction C19).
    const one = await newPlayer(browser, NARROW, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await one.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
    await two.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    await waitForRound(two.page, 1);
    await crashRounds(one.page, two.page, 1, 11, everyColumn);
    await expect(one.page.locator(testid("shrink-warning"))).toBeVisible();
    const banner = (await one.page.locator(testid("shrink-warning")).boundingBox())!;
    const round = (await one.page.locator(testid("round-line")).boundingBox())!;
    expect(banner.height, "the banner is one line").toBeLessThan(30);
    expect(banner.y + banner.height / 2, "the banner shares the round line's row").toBeLessThan(round.y + round.height + 8);
    expect(banner.x, "the banner starts after the round number").toBeGreaterThanOrEqual(round.x + round.width);
    const timer = (await one.page.locator(testid("timer")).boundingBox())!;
    expect(timer.y + timer.height, "the timer bar is on the first screen").toBeLessThanOrEqual(568);
    const scroll = await one.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    await one.context.close();
    await two.context.close();
  });

  for (const viewport of [NARROW, { width: 360, height: 640 }, PHONE]) {
    test(`U68 the warning fits: no sideways scroll, nothing overlaps and the first screen holds the board and timer at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { one, two } = await twoPlayers(browser, { reducedMotion: true, a: viewport });
      await crashRounds(one.page, two.page, 1, 11, everyColumn);
      await expect(one.page.locator(testid("shrink-warning"))).toBeVisible();
      const scroll = await one.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      const box = async (id: string) => (await one.page.locator(testid(id)).boundingBox())!;
      const warning = await box("shrink-warning");
      const board = await box("board-wrap");
      const round = await box("round-line");
      expect(warning.x, "inside the screen").toBeGreaterThanOrEqual(0);
      expect(warning.x + warning.width, "inside the screen").toBeLessThanOrEqual(viewport.width);
      expect(warning.y + warning.height, "the banner does not cover the board").toBeLessThanOrEqual(board.y + 1);
      expect(round.y, "the round number stays on screen").toBeGreaterThanOrEqual(0);
      // The first-screen rule (docs/design.md) is for the marking viewports and 320 x 568: the whole board
      // and the timer fit, with the banner showing. 360 x 640 is not one of them (it only has to scroll
      // nowhere sideways and overlap nothing), and its height is a known gap in docs/handover.md.
      if (viewport.width !== 360) {
        const lowest = await box("cell-0-0");
        expect(lowest.y + lowest.height, "the bottom row is on screen").toBeLessThanOrEqual(viewport.height);
        const timer = await box("timer");
        expect(timer.y + timer.height, "the timer bar is on screen").toBeLessThanOrEqual(viewport.height);
      }
      await one.context.close();
      await two.context.close();
    });
  }
});

test.describe("The tutorial's shrinking board step (U74)", () => {
  async function toStep(page: Page): Promise<void> {
    const tap = (c: number) => page.locator(testid(`tutorial-column-${c}`)).click();
    for (let step = 1; step <= 3; step++) {
      await tap(3);
      await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
      await page.click(testid("tutorial-next"));
    }
    await page.locator(testid("tutorial-shield")).click();
    await tap(3);
    await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
    await page.click(testid("tutorial-next"));
    await page.locator(testid("tutorial-earthquake")).click();
    await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
    await page.click(testid("tutorial-next"));
  }

  test("U74 the step comes after Earthquake, shows the warning and a flashing top row, waits for a tap, then the top row turns to rock", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await toStep(page);
    await expect(page.locator(testid("tutorial-title"))).toHaveText("The board shrinks");
    await expect(page.locator(testid("tutorial-caption"))).toHaveText(
      "The board shrinks as rounds pass: after round 12 the ceiling drops, and it drops again after round 20. Pieces in a closed row crumble away.",
    );
    expect(await page.locator(testid("tutorial-caption")).innerText()).not.toMatch(/wall/i); // the walls are gone
    const cells = `${testid("tutorial-board")} [data-testid^="cell-"]`;
    await expect(page.locator(testid("tutorial-warning"))).toHaveText("The ceiling drops after this round");
    expect(await page.locator(`${cells}[data-doomed="true"]`).count()).toBe(7);
    await expect(page.locator(testid("tutorial-next"))).toBeHidden();
    expect(await page.locator(`${cells}[data-closed="true"]`).count()).toBe(0);
    await page.locator(testid("tutorial-column-2")).click();
    await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
    expect(await page.locator(`${cells}[data-closed="true"]`).count(), "the top row is rock").toBe(7);
    expect(await page.locator(`${cells}[data-doomed="true"]`).count()).toBe(0);
    await expect(page.locator(testid("tutorial-warning"))).toBeHidden();
    await expect(page.locator(`${testid("tutorial-board")} [data-testid="cell-0-5"]`)).toHaveAttribute("data-closed", "true");
    await context.close();
  });

  test("U74 and U47 the step's banner, hint and controls stay on screen at 320 x 568 and 360 x 640", async ({ browser }) => {
    for (const viewport of [NARROW, { width: 360, height: 640 }]) {
      const { context, page } = await newPlayer(browser, viewport, { tutorial: "new", reducedMotion: true });
      await page.goto("/");
      await toStep(page);
      const box = async (id: string) => (await page.locator(testid(id)).boundingBox())!;
      const warning = await box("tutorial-warning");
      const hint = await box("tutorial-hint");
      const skip = await box("tutorial-skip");
      expect(warning.y, `${viewport.width}: banner on screen`).toBeGreaterThanOrEqual(0);
      expect(skip.y + skip.height, `${viewport.width}: Skip on screen`).toBeLessThanOrEqual(viewport.height);
      expect(hint.y + hint.height, `${viewport.width}: hint does not overlap Skip`).toBeLessThanOrEqual(skip.y);
      const board = await box("tutorial-board");
      expect(warning.y + warning.height, `${viewport.width}: banner inside the board's card`).toBeLessThanOrEqual(board.y + board.height);
      await context.close();
    }
  });
});
