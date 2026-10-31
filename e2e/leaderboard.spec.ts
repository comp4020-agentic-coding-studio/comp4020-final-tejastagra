// Browser checks for the leaderboard (docs/design/leaderboard.md U123 to U130, rules R37 to R39 and R92). Run with pnpm test:e2e.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid, waitForRound } from "./helpers.ts";

const VIEWPORTS = [NARROW, PHONE, LAPTOP];

// A board answered with a fixed list, so the page is judged on what it does with data and not on what other checks have played.
async function withBoard(page: Page, wins: Array<{ name: string; value: number }>, rounds: Array<{ name: string; value: number }>, you: { name: string; wins: number; bestRounds: number | null } | null = null) {
  await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins, rounds, you } }));
}
const rows = (n: number, prefix = "Player", from = 1) => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + from} #${(0xa000 + i).toString(16)}`, value: 20 - i }));

test.describe("The leaderboard page (U123 to U130)", () => {
  for (const viewport of VIEWPORTS) {
    test(`one centred column of at most 560px, tabs, a podium and compact rows at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await withBoard(page, rows(8), rows(8).map((r, i) => ({ ...r, value: 4 + i })));
      await page.goto("/leaderboard");
      await expect(page.locator(testid("podium"))).toBeVisible();
      const column = (await page.locator(testid("leaderboard-column")).boundingBox())!;
      expect(column.width).toBeLessThanOrEqual(561);
      expect(Math.abs(column.x + column.width / 2 - viewport.width / 2), "the column is centred").toBeLessThanOrEqual(2);
      // The tabs, the podium and the rows share the column's edges (Q5).
      for (const id of ["tabs", "podium", "leaderboard-wins"]) {
        const b = (await page.locator(testid(id)).boundingBox())!;
        expect(Math.abs(b.x - column.x), `${id} left edge`).toBeLessThanOrEqual(4);
        expect(Math.abs(b.x + b.width - (column.x + column.width)), `${id} right edge`).toBeLessThanOrEqual(4);
      }
      // The podium holds three, the rows the other five, and the first place is the tallest in the middle.
      await expect(page.locator(`${testid("podium")} [data-place]`)).toHaveCount(3);
      await expect(page.locator(`${testid("leaderboard-wins")} li`)).toHaveCount(5);
      const heights = await page.locator(`${testid("podium")} [data-place]`).evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.place, e.getBoundingClientRect().height, e.getBoundingClientRect().left]));
      const byPlace = Object.fromEntries((heights as Array<[string, number, number]>).map(([p, h, x]) => [p, { h, x }]));
      expect(byPlace["1"].h).toBeGreaterThan(byPlace["2"].h);
      expect(byPlace["2"].h).toBeGreaterThan(byPlace["3"].h);
      expect(byPlace["2"].x, "second is on the left").toBeLessThan(byPlace["1"].x);
      expect(byPlace["3"].x, "third is on the right").toBeGreaterThan(byPlace["1"].x);
      // Rows are 12px apart.
      const boxes = await page.locator(`${testid("leaderboard-wins")} li`).evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().top, e.getBoundingClientRect().bottom]));
      for (let i = 1; i < boxes.length; i++) expect(Math.round(boxes[i][0] - boxes[i - 1][1]), `gap between row ${i} and ${i + 1}`).toBe(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await context.close();
    });
  }

  test("LB3 R99 U131b at most 10 players: the podium holds exactly the top 3 and the list runs from 4 to 10", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const requested: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/leaderboard")) requested.push(req.url());
    });
    await withBoard(page, rows(15), rows(15).map((r, i) => ({ ...r, value: 4 + i })));
    await page.goto("/leaderboard");
    await expect(page.locator(`${testid("podium")} [data-place]`)).toHaveCount(3);
    await expect(page.locator(`${testid("leaderboard-wins")} li`)).toHaveCount(7);
    await expect(page.locator(`${testid("leaderboard-wins")} .row-rank`).first()).toHaveText("4");
    await expect(page.locator(`${testid("leaderboard-wins")} .row-rank`).last()).toHaveText("10");
    await expect(page.locator(testid("leaderboard-column"))).not.toContainText("Player 11");
    await page.locator(testid("tab-rounds")).click();
    await expect(page.locator(`${testid("leaderboard-rounds")} li`)).toHaveCount(7);
    expect(requested.every((u) => new URL(u).searchParams.get("limit") === "10"), "the page asks for 10").toBe(true);
    await context.close();
  });

  test("U124 the tabs switch lists, one selected at a time, each at least 44px tall with its label on one line", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, NARROW, { reducedMotion: true });
    await withBoard(page, rows(5, "Win"), rows(5, "Fast").map((r, i) => ({ ...r, value: 4 + i })));
    await page.goto("/leaderboard");
    await expect(page.locator(testid("tab-wins"))).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(testid("tab-rounds"))).toHaveAttribute("aria-selected", "false");
    await expect(page.locator(testid("podium"))).toContainText("Win 1");
    for (const id of ["tab-wins", "tab-rounds"]) {
      const b = (await page.locator(testid(id)).boundingBox())!;
      expect(b.height, `${id} height`).toBeGreaterThanOrEqual(43.5);
      expect((await page.locator(`${testid(id)} span`).boundingBox())!.height, `${id} label is one line`).toBeLessThan(26);
    }
    const before = (await page.locator(testid("tabs")).boundingBox())!;
    await page.locator(testid("tab-rounds")).click();
    await expect(page.locator(testid("tab-rounds"))).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(testid("podium"))).toContainText("Fast 1");
    await expect(page.locator(testid("podium"))).toContainText("4 rounds");
    const after = (await page.locator(testid("tabs")).boundingBox())!;
    expect(Math.abs(after.y - before.y), "switching a tab moves nothing above it").toBeLessThanOrEqual(1);
    await expect(page.locator(testid("leaderboard-wins"))).toBeHidden();
    await expect(page.locator(testid("leaderboard-rounds"))).toBeVisible();
    await context.close();
  });

  test("U125 with fewer than three players only those places are shown, and with none there is no podium", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await withBoard(page, rows(2), []);
    await page.goto("/leaderboard");
    await expect(page.locator(`${testid("podium")} [data-place]`)).toHaveCount(2);
    await expect(page.locator(`${testid("leaderboard-wins")} li`)).toHaveCount(0);
    // With one player, first place is still in the middle of the column (U125).
    await withBoard(page, rows(1), []);
    await page.goto("/leaderboard");
    const column = (await page.locator(testid("leaderboard-column")).boundingBox())!;
    const first = (await page.locator(`${testid("podium")} [data-place="1"]`).boundingBox())!;
    expect(Math.abs(first.x + first.width / 2 - (column.x + column.width / 2)), "alone, first place is centred").toBeLessThanOrEqual(3);
    await context.close();
  });

  test("U128 an empty list explains itself and offers a way to play, and counts only games against people", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await withBoard(page, [], []);
    await page.goto("/leaderboard");
    const empty = page.locator(testid("leaderboard-empty"));
    await expect(empty).toContainText("No wins yet. Only games against other people count, so play a friend or try Quick match.");
    await expect(page.locator(testid("podium"))).toBeHidden();
    for (const id of ["empty-play-friend", "empty-quick-match"]) {
      const b = (await page.locator(testid(id)).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(43.5);
    }
    await page.locator(testid("tab-rounds")).click();
    await expect(empty).toContainText("No wins by four in a row yet.");
    await expect(page.locator(testid("podium"))).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await context.close();
  });

  test("U127 the current player's row is highlighted wherever it is, and Your best always shows under each list", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const list = rows(6);
    await withBoard(page, list, list.map((r, i) => ({ ...r, value: 4 + i })), { name: list[4].name, wins: list[4].value, bestRounds: 8 });
    await page.goto("/leaderboard");
    const mine = page.locator(`${testid("leaderboard-wins")} li[data-you="true"]`);
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(list[4].name);
    await expect(mine).toContainText("You"); // more than colour
    await expect(page.locator(testid("your-best"))).toHaveText(`Your best: ${list[4].value} wins`);
    await page.locator(testid("tab-rounds")).click();
    await expect(page.locator(testid("your-best"))).toHaveText("Your best: 8 rounds");
    // On the podium too.
    await withBoard(page, list, list, { name: list[0].name, wins: 20, bestRounds: null });
    await page.goto("/leaderboard");
    await expect(page.locator(`${testid("podium")} [data-place="1"][data-you="true"]`)).toHaveCount(1);
    await page.locator(testid("tab-rounds")).click();
    await expect(page.locator(testid("your-best"))).toHaveText("Your best: no wins yet");
    await context.close();
  });

  test("U127 a visitor with no player sees an invitation under the list, and nobody is highlighted", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await withBoard(page, rows(4), rows(4), null);
    await page.goto("/leaderboard");
    await expect(page.locator(testid("your-best"))).toHaveText("Your best: play a game to get on the board");
    await expect(page.locator('[data-you="true"]')).toHaveCount(0);
    await context.close();
  });

  test("U129 a list that cannot be loaded says so in words and offers Try again, and the tabs and Home still work", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    let fail = true;
    await page.route("**/api/leaderboard**", (route) => (fail ? route.fulfill({ status: 500, body: "no" }) : route.fulfill({ json: { wins: rows(3), rounds: [], you: null } })));
    await page.goto("/leaderboard");
    await expect(page.locator(testid("leaderboard-error"))).toContainText("Could not load the leaderboard. Try again.");
    await expect(page.locator(testid("header-home"))).toBeVisible(); // Q12: Home is in the header bar
    await page.locator(testid("tab-rounds")).click(); // the tabs still work
    fail = false;
    await page.locator(testid("leaderboard-retry")).click();
    await expect(page.locator(testid("leaderboard-error"))).toBeHidden();
    await context.close();
  });

  test("U123 long names wrap inside their blocks and never widen the page", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, NARROW, { reducedMotion: true });
    const wide = ["WWWWWWWWWWWWWWWW #ffff", "MMMMMMMMMMMMMMMM #eeee", "XXXXXXXXXXXXXXXX #dddd", "WWWWWWWWWWWWWWWW #cccc", "username_of_twenty_c"].map((name, i) => ({ name, value: 9 - i }));
    await withBoard(page, wide, wide);
    await page.goto("/leaderboard");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const column = (await page.locator(testid("leaderboard-column")).boundingBox())!;
    for (const el of await page.locator(`${testid("podium")} *, ${testid("leaderboard-wins")} *`).all()) {
      const b = await el.boundingBox();
      if (!b) continue;
      expect(b.x + b.width, "inside the column").toBeLessThanOrEqual(column.x + column.width + 1);
    }
    await context.close();
  });
});

// Item 25: two real players play a full game, and the winner appears on both lists on the page.
async function finishedGame(browser: Browser) {
  const one = await newPlayer(browser, PHONE, { reducedMotion: true });
  const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
  const name = `Champ${Math.random().toString(36).slice(2, 6)}`;
  await one.page.request.post("/api/guest", { data: { nickname: name } });
  await two.page.request.post("/api/guest", { data: { nickname: "Runner" } });
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
  return { one, two, name };
}

test("item 25: after a full game the winner is on both lists on the page, highlighted, with Your best, and the loser is on neither", async ({ browser }) => {
  const { one, two, name } = await finishedGame(browser);
  await one.page.goto("/leaderboard");
  const mineWins = one.page.locator(`[data-you="true"]`).first();
  await expect(mineWins).toContainText(name);
  await expect(one.page.locator(testid("your-best"))).toHaveText("Your best: 1 win");
  await one.page.locator(testid("tab-rounds")).click();
  await expect(one.page.locator(`[data-you="true"]`).first()).toContainText(name);
  await expect(one.page.locator(testid("your-best"))).toHaveText("Your best: 4 rounds");
  await two.page.goto("/leaderboard");
  await expect(two.page.locator(`[data-you="true"]`)).toHaveCount(0); // the loser is on neither list
  await expect(two.page.locator(testid("your-best"))).toHaveText("Your best: 0 wins");
  await one.context.close();
  await two.context.close();
});
