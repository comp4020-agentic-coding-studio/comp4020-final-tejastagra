// E1: two browser contexts with no shared cookies play a full game through a
// friend link, one at each marking viewport (phone and laptop).
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, PHONE } from "../playwright.config.ts";
import { newPlayer, testid } from "./helpers.ts";

async function choose(page: Page, column: number): Promise<void> {
  await page.click(testid(`column-${column}`));
  await page.click(testid("drop"));
}

async function waitForRound(page: Page, round: number): Promise<void> {
  await expect(page.locator(testid("round-number"))).toHaveText(String(round), { timeout: 5_000 });
}

test("E1 a phone and a laptop play a full game through a friend link", async ({ browser }) => {
  const phone = await newPlayer(browser, PHONE);
  const laptop = await newPlayer(browser, LAPTOP);
  expect((await phone.context.cookies()).length).toBe(0); // no shared cookies

  // The phone starts a game with Play a friend and shares the link.
  await phone.page.goto("/");
  await phone.page.click(testid("play-friend"));
  await phone.page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
  const link = phone.page.url();
  const code = await phone.page.locator(testid("game-code")).innerText();
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

  // The laptop opens that link.
  await laptop.page.goto(link);

  for (const { page, name } of [{ page: phone.page, name: "phone" }, { page: laptop.page, name: "laptop" }]) {
    await waitForRound(page, 1);
    // C9: the board really has size, and Drop is on screen without scrolling.
    const cell = (await page.locator(testid("cell-0-0")).boundingBox())!;
    expect(cell.width, `${name} cell width`).toBeGreaterThan(20);
    expect(cell.height, `${name} cell height`).toBeGreaterThan(20);
    const viewport = page.viewportSize()!;
    const drop = (await page.locator(testid("drop")).boundingBox())!;
    expect(drop.y + drop.height, `${name} Drop inside the viewport`).toBeLessThanOrEqual(viewport.height);
  }

  // Phone plays column 1 four times; the laptop alternates columns 2 and 3, so only
  // the phone's player makes four in a row. Both choose each round (promise 2).
  const who = phone.page; // phone is seat A (joined first)
  for (let round = 1; round <= 4; round++) {
    await choose(phone.page, 0);
    await expect(laptop.page.locator(testid("opponent-status"))).toHaveText("Ready"); // R21: only "Ready", never the column
    await choose(laptop.page, 1 + (round % 2));
    if (round < 4) {
      await waitForRound(phone.page, round + 1);
      await waitForRound(laptop.page, round + 1);
    }
  }

  // Both screens show the same result at the same moment (promise 2).
  await expect(phone.page.locator(testid("result-line"))).toHaveText("You win.", { timeout: 2_000 });
  await expect(laptop.page.locator(testid("result-line"))).toHaveText("You lose.", { timeout: 2_000 });
  for (const row of [0, 1, 2, 3]) {
    await expect(who.locator(testid(`cell-0-${row}`))).toHaveAttribute("data-piece", /^[AB]$/);
    await expect(laptop.page.locator(testid(`cell-0-${row}`))).toHaveAttribute("data-piece", /^[AB]$/);
    expect(await who.locator(testid(`cell-0-${row}`)).getAttribute("data-piece")).toBe(
      await laptop.page.locator(testid(`cell-0-${row}`)).getAttribute("data-piece"),
    );
  }
  await phone.context.close();
  await laptop.context.close();
});
