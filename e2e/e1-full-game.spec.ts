// E1: two browser contexts with no shared cookies play a full game through a
// friend link, one at each marking viewport (phone and laptop).
import { expect, test } from "@playwright/test";
import { LAPTOP, PHONE } from "../playwright.config.ts";
import { chooseColumn, newPlayer, testid, waitForRound } from "./helpers.ts";

test("E1 a phone and a laptop play a full game through a friend link", async ({ browser }) => {
  const phone = await newPlayer(browser, PHONE);
  const laptop = await newPlayer(browser, LAPTOP);
  // Two separate contexts: no shared cookies, so these are two different players.
  const phoneId = (await phone.context.cookies()).find((c) => c.name === "rubble_session")?.value;
  const laptopId = (await laptop.context.cookies()).find((c) => c.name === "rubble_session")?.value;
  expect(phoneId).toBeTruthy();
  expect(phoneId).not.toBe(laptopId);

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
    // The opponent has arrived, so the share panel is gone on both.
    await expect(page.locator(testid("waiting-panel"))).toBeHidden();
    // C9: the board really has size, and the whole board and the timer are on screen without scrolling.
    const cell = (await page.locator(testid("cell-0-0")).boundingBox())!;
    expect(cell.width, `${name} cell width`).toBeGreaterThan(20);
    expect(cell.height, `${name} cell height`).toBeGreaterThan(20);
    const viewport = page.viewportSize()!;
    const lowest = (await page.locator(testid("cell-0-0")).boundingBox())!;
    expect(lowest.y + lowest.height, `${name} bottom of the board inside the viewport`).toBeLessThanOrEqual(viewport.height);
    const timer = (await page.locator(testid("timer")).boundingBox())!;
    expect(timer.y, `${name} timer on screen`).toBeGreaterThanOrEqual(0);
  }

  // Phone plays column 1 four times; the laptop alternates columns 2 and 3, so only
  // the phone's player makes four in a row. Both choose each round (promise 2).
  const who = phone.page; // phone is seat A (joined first)
  for (let round = 1; round <= 4; round++) {
    await chooseColumn(phone.page, 0);
    await expect(laptop.page.locator(testid("opponent-status"))).toHaveText("Ready"); // R21: only "Ready", never the column
    await chooseColumn(laptop.page, 1 + (round % 2));
    if (round < 4) {
      await waitForRound(phone.page, round + 1);
      await waitForRound(laptop.page, round + 1);
    }
  }

  // Both screens show the same result at the same moment (promise 2).
  await expect(phone.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 3_000 });
  await expect(laptop.page.locator(testid("end-title"))).toHaveText("SO CLOSE!", { timeout: 3_000 });
  for (const row of [0, 1, 2, 3]) {
    // Each screen marks its own player's pieces "A" and the opponent's "B", so the two screens
    // must show the same cell as mirror images: the phone's piece in every row is the laptop's opposite.
    await expect(who.locator(testid(`cell-0-${row}`))).toHaveAttribute("data-piece", "A");
    await expect(laptop.page.locator(testid(`cell-0-${row}`))).toHaveAttribute("data-piece", "B");
  }
  await phone.context.close();
  await laptop.context.close();
});
