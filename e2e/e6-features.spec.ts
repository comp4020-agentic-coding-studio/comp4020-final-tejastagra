// E6: every feature completes at the phone viewport, by tapping and typing like a player.
import { expect, test } from "@playwright/test";
import { PHONE } from "../playwright.config.ts";
import { withQuickQueue } from "./quick-lock.ts";
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

test("E6 quick match: two phones are paired into one game", async ({ browser }) => withQuickQueue(async () => {
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
}));

test("E6 sign up, sign out and sign in again, with errors visible in the first screen", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  const username = `e6_${Math.random().toString(36).slice(2, 10)}`;
  await page.request.post("/api/guest", { data: { nickname: "Phone Tester" } });
  await page.goto("/account");
  // The errors are inside the popup, under their field, and in the first screen (U88, C13).
  await page.tap(testid("open-signup"));
  await page.fill(testid("username-input"), username);
  await page.fill(testid("password-input"), "short"); // too short
  await page.tap(testid("signup-save"));
  const error = page.locator(`${testid("signup-dialog")} .dialog-error:visible`);
  await expect(error).toContainText("at least 8 characters");
  const box = (await error.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
  await page.fill(testid("password-input"), "a long enough password");
  await page.tap(testid("signup-save"));
  await expect(page.locator(testid("account-username"))).toHaveText(`@${username}`);
  await expect(page.locator(testid("account-status"))).toHaveText("Signed in");
  await page.tap(testid("signout"));
  await expect(page.locator(testid("open-signin"))).toBeVisible();
  await page.tap(testid("open-signin"));
  await page.fill(testid("username-input"), username);
  await page.fill(testid("password-input"), "wrong password!");
  await page.tap(testid("signin-save"));
  await expect(page.locator(`${testid("signin-dialog")} .dialog-error:visible`)).toContainText("do not match");
  await page.fill(testid("password-input"), "a long enough password");
  await page.tap(testid("signin-save"));
  await expect(page.locator(testid("account-username"))).toHaveText(`@${username}`);
  await context.close();
});

test("E6 the leaderboard shows both lists as tabs, and /readme/ is readable", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE);
  await page.goto("/leaderboard");
  await expect(page.locator(testid("tab-wins"))).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(testid("leaderboard-loading"))).toBeHidden(); // it loaded: a list, or the words that explain an empty one
  await expect(page.locator(`${testid("podium")}, ${testid("leaderboard-empty")}`).locator("visible=true").first()).toBeVisible();
  await page.locator(testid("tab-rounds")).click();
  await expect(page.locator(testid("tab-rounds"))).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`${testid("podium")}, ${testid("leaderboard-empty")}`).locator("visible=true").first()).toBeVisible();
  await page.goto("/readme/");
  await expect(page.locator("h1").first()).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await context.close();
});
