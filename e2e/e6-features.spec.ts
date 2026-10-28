// E6: every feature completes at the phone viewport, by tapping and typing like a player.
import { expect, test } from "@playwright/test";
import { PHONE } from "../playwright.config.ts";
import { newPlayer, testid } from "./helpers.ts";

test("E6 play the computer: a game starts at once and a round resolves", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  await page.goto("/");
  await page.tap(testid("play-computer"));
  await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
  await expect(page.locator(testid("round-number"))).toHaveText("1");
  await page.tap(testid("column-3")); // tapping the column is the whole choice (U12)
  await expect(page.locator(testid("round-number"))).toHaveText("2", { timeout: 5_000 });
  await context.close();
});

test("E6 play a friend: the link and code are shown, and a second player joins by code entry", async ({ browser }) => {
  const host = await newPlayer(browser, PHONE);
  await host.page.goto("/");
  await host.page.tap(testid("play-friend"));
  await host.page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
  const code = await host.page.locator(testid("game-code")).innerText();
  await expect(host.page.locator(testid("copy-link"))).toBeVisible();

  const guest = await newPlayer(browser, PHONE);
  await guest.page.goto("/");
  await guest.page.tap(testid("join-toggle")); // opens the code box in place (U33)
  await guest.page.fill(testid("code-input"), code.toLowerCase()); // entry is not case sensitive
  await guest.page.keyboard.press("Enter");
  await guest.page.waitForURL(new RegExp(`/g/${code}$`));
  await expect(guest.page.locator(testid("round-number"))).toHaveText("1");
  await expect(host.page.locator(testid("opponent-status"))).toBeVisible();
  await host.context.close();
  await guest.context.close();
});

test("E6 code entry shows a clear error for a bad code, in view", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  await page.goto("/");
  await page.tap(testid("join-toggle"));
  await page.fill(testid("code-input"), "AB1");
  await page.keyboard.press("Enter");
  const message = page.locator(`${testid("code-dialog")} .dialog-error:visible`); // inside the popup, under its field (U88)
  await expect(message).toContainText("6 letters or numbers");
  const box = (await message.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height); // the message is on the first screen
  await context.close();
});

test("E6 quick match: two phones are paired into one game", async ({ browser }) => {
  // A player left waiting by an earlier run would be paired with the first phone at once.
  // One throwaway ticket either pairs with that waiter or is left waiting itself;
  // in that case a second pairs with it. Either way the lobby ends up empty.
  const drain = await newPlayer(browser, PHONE);
  const first = await (await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
  if (first.state === "waiting") await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`);
  await drain.context.close();

  const one = await newPlayer(browser, PHONE);
  const two = await newPlayer(browser, PHONE);
  await one.page.goto("/");
  await one.page.tap(testid("quick-match"));
  await expect(one.page.locator(testid("quick-status"))).toContainText("Finding you a random opponent");
  await two.page.goto("/");
  await two.page.tap(testid("quick-match"));
  await one.page.waitForURL(/\/g\/[A-Z2-9]{6}$/, { timeout: 8_000 });
  await two.page.waitForURL(/\/g\/[A-Z2-9]{6}$/, { timeout: 8_000 });
  expect(one.page.url()).toBe(two.page.url());
  await one.context.close();
  await two.context.close();
});

test("E6 sign up, sign out and sign in again, with errors visible in the first screen", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  const username = `e6_${Math.random().toString(36).slice(2, 10)}`;
  await page.goto("/account");
  await page.fill(testid("nickname-input"), "Phone Tester");
  await page.tap(`${testid("guest-form")} button`);
  await page.fill(testid("signup-username"), username);
  await page.fill(testid("signup-password"), "short"); // too short: an error, in view (C13)
  await page.tap(`${testid("signup-form")} button`);
  const message = page.locator("#account-message");
  await expect(message).toContainText("at least 8 characters");
  const box = (await message.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
  await page.fill(testid("signup-password"), "a long enough password");
  await page.tap(`${testid("signup-form")} button`);
  await expect(page.locator("#account-who")).toContainText(username);
  await page.tap(testid("signout"));
  await expect(page.locator("#account-who")).toContainText("not chosen a name");
  await page.fill(testid("signin-username"), username);
  await page.fill(testid("signin-password"), "wrong password!");
  await page.tap(`${testid("signin-form")} button`);
  await expect(message).toContainText("do not match");
  await page.fill(testid("signin-password"), "a long enough password");
  await page.tap(`${testid("signin-form")} button`);
  await expect(page.locator("#account-who")).toContainText(username);
  await context.close();
});

test("E6 the leaderboard shows both lists, and /readme/ is readable", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  await page.goto("/leaderboard");
  await expect(page.locator(testid("leaderboard-wins"))).toBeVisible();
  await expect(page.locator(testid("leaderboard-rounds"))).toBeVisible();
  await expect(page.locator(`${testid("leaderboard-wins")} li`).first()).not.toHaveText("Loading...");
  await page.goto("/readme/");
  await expect(page.locator("h1").first()).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await context.close();
});
