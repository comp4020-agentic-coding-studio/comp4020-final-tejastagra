// Browser checks for the account page (docs/design/account.md U114 to U122, rules R86 to R91). Run with pnpm test:e2e.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, testid, waitForRound } from "./helpers.ts";

const unique = () => Math.random().toString(36).slice(2, 8);

// The admin's reset, run the way the admin runs it, against the database of the app under test (docs/admin.md).
function adminReset(username: string): string {
  const db = process.env.CHECK_DB_PATH;
  const custom = process.env.CHECK_RESET_COMMAND?.trim();
  if (!db && !custom) throw new Error("Set CHECK_DB_PATH or CHECK_RESET_COMMAND: see spec/CHECKS.md.");
  const [command, ...args] = custom ? custom.split(/\s+/) : ["node", "scripts/admin-reset-password.ts"];
  const out = execFileSync(command, [...args, username], { env: { ...process.env, ...(db && !custom ? { RUBBLE_DB_PATH: db } : {}) }, encoding: "utf8" });
  return out.match(/: (\S{12})\n/)![1];
}

async function signedIn(page: Page, password = "first password here") {
  const username = `acc_${unique()}`;
  await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
  expect((await page.request.post("/api/account/signup", { data: { username, password } })).ok()).toBe(true);
  return { username, password };
}

test.describe("The account page (U114 to U122)", () => {
  test("U115 a guest sees their nickname, Edit, Save my progress, Sign in and the line, and never Sign out or Change password", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await page.goto("/account");
    await expect(page.locator(testid("account-nickname"))).toHaveText("Pip Squeak");
    await expect(page.locator(testid("account-status"))).toHaveText("Guest");
    await expect(page.locator(testid("edit-nickname"))).toHaveText("Edit");
    await expect(page.locator(testid("open-signup"))).toHaveText("Save my progress");
    await expect(page.locator(testid("open-signin"))).toHaveText("Sign in");
    await expect(page.locator(testid("account-hint"))).toHaveText("Save your progress to keep your record on any device.");
    for (const id of ["signout", "open-password"]) await expect(page.locator(testid(id))).toBeHidden();
    await context.close();
  });

  test("U116 a signed-in player sees their nickname, username, Signed in, Edit nickname, Change password and Sign out, and no sign-in controls", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const { username } = await signedIn(page);
    await page.goto("/account");
    await expect(page.locator(testid("account-nickname"))).toHaveText("Pip Squeak");
    await expect(page.locator(testid("account-username"))).toHaveText(`@${username}`);
    await expect(page.locator(testid("account-status"))).toHaveText("Signed in");
    await expect(page.locator(testid("edit-nickname"))).toHaveText("Edit nickname");
    for (const id of ["open-password", "signout"]) await expect(page.locator(testid(id))).toBeVisible();
    for (const id of ["open-signup", "open-signin", "account-hint"]) await expect(page.locator(testid(id))).toBeHidden();
    await context.close();
  });

  test("U120 the sign-in popup's Forgot your password? opens the words to email, sends nothing, and Close goes back", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await page.goto("/account");
    await page.waitForLoadState("networkidle"); // the page's own calls are done
    await page.locator(testid("open-signin")).click();
    const link = page.locator(testid("forgot-link"));
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    const requests: string[] = [];
    page.on("request", (r) => void requests.push(r.url())); // from the tap on the link onwards
    await link.click();
    const dialog = page.locator(testid("forgot-dialog"));
    await expect(dialog).toContainText("Email game@tejastagra.com with your username and we'll reset it for you.");
    await expect(page.locator(testid("signin-dialog"))).toHaveCount(0); // only one popup at a time (U90)
    expect(requests.filter((u) => /\/api\//.test(u))).toEqual([]); // nothing is sent from the app
    await dialog.locator(testid("dialog-cancel")).click();
    await expect(page.locator(testid("signin-dialog"))).toBeVisible(); // back to sign in
    await context.close();
  });

  test("R88 after five wrong passwords the sign-in popup says to try again in a few minutes, under the password field", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const { username } = await signedIn(page, "right password here");
    await page.request.post("/api/signout", { data: {} });
    await page.goto("/account");
    await page.locator(testid("open-signin")).click();
    await page.fill(testid("username-input"), username);
    for (let i = 0; i < 5; i++) {
      await page.fill(testid("password-input"), `wrong password ${i}`);
      await page.locator(testid("signin-save")).click();
      await expect(page.locator(`${testid("signin-dialog")} .dialog-error:visible`)).toContainText("do not match");
    }
    await page.fill(testid("password-input"), "right password here");
    await page.locator(testid("signin-save")).click();
    await expect(page.locator(`${testid("signin-dialog")} .dialog-error:visible`)).toHaveText("Too many attempts. Try again in a few minutes.");
    await context.close();
  });

  test("R87 changing the password: a wrong current password is refused inside the popup, and a right one closes it and works", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const { username, password } = await signedIn(page);
    await page.goto("/account");
    await page.locator(testid("open-password")).click();
    await page.fill(testid("current-input"), "not my password");
    await page.fill(testid("next-input"), "a brand new password");
    await page.locator(testid("password-save")).click();
    await expect(page.locator(`${testid("password-dialog")} .dialog-error:visible`)).toHaveText("That password is not right.");
    await page.fill(testid("current-input"), password);
    await page.locator(testid("password-save")).click();
    await expect(page.locator(testid("password-dialog"))).toHaveCount(0);
    await expect(page.locator(testid("account-message"))).toHaveText("Password changed.");
    const other = await newPlayer(browser, PHONE);
    expect((await other.page.request.post("/api/account/signin", { data: { username, password } })).status()).toBe(401);
    expect((await other.page.request.post("/api/account/signin", { data: { username, password: "a brand new password" } })).ok()).toBe(true);
    await other.context.close();
    await context.close();
  });

  test("U122 a temporary password forces a new one: the popup cannot be closed or skipped, Escape does nothing, and a reload shows it again", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const { username } = await signedIn(page);
    const temporary = adminReset(username);
    const device = await newPlayer(browser, PHONE, { reducedMotion: true });
    await device.page.goto("/account");
    await device.page.locator(testid("open-signin")).click();
    await device.page.fill(testid("username-input"), username);
    await device.page.fill(testid("password-input"), temporary);
    await device.page.locator(testid("signin-save")).click();
    const must = device.page.locator(testid("must-change-dialog"));
    await expect(must).toBeVisible();
    await expect(must.locator(testid("dialog-close"))).toHaveCount(0); // no close button
    await device.page.keyboard.press("Escape");
    await expect(must).toBeVisible();
    await device.page.mouse.click(2, 2); // a tap on the dim
    await expect(must).toBeVisible();
    await device.page.reload();
    await expect(device.page.locator(testid("must-change-dialog"))).toBeVisible();
    await device.page.fill(testid("next-input"), "short");
    await device.page.locator(testid("must-change-save")).click();
    await expect(device.page.locator(`${testid("must-change-dialog")} .dialog-error:visible`)).toContainText("at least 8 characters");
    await device.page.fill(testid("next-input"), "my very own password");
    await device.page.locator(testid("must-change-save")).click();
    await expect(device.page.locator(testid("must-change-dialog"))).toHaveCount(0);
    await expect(device.page.locator(testid("account-status"))).toHaveText("Signed in");
    // the temporary password is spent
    const third = await newPlayer(browser, PHONE);
    expect((await third.page.request.post("/api/account/signin", { data: { username, password: temporary } })).status()).toBe(401);
    await third.context.close();
    await device.context.close();
    await context.close();
  });

  test("U118 a new player's record says No games yet in both cards and in the list", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await page.goto("/account");
    await expect(page.locator(`${testid("stats-people")} .record-none`)).toHaveText("No games yet");
    await expect(page.locator(`${testid("stats-computer")} .record-none`)).toHaveText("No games yet");
    await expect(page.locator(testid("history-list"))).toContainText("No games yet. Play the computer or a friend and they will show up here.");
    await context.close();
  });

  test("U118 and R90 a won game shows in the history and the stats, and a forfeit is a loss for the one who left", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
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
    await one.page.goto("/account");
    const row = one.page.locator(`${testid("history-list")} .history-row`).first();
    await expect(row).toContainText("Sam Wombat #");
    await expect(row).toContainText("Won");
    await expect(row).toContainText("4 rounds");
    await expect(one.page.locator(`${testid("stats-people")} dl`)).toContainText("100%");
    await two.page.goto("/account");
    await expect(two.page.locator(`${testid("history-list")} .history-row`).first()).toContainText("Lost");
    await expect(two.page.locator(`${testid("stats-people")} dl`)).toContainText("0%");
    await one.context.close();
    await two.context.close();
  });

  for (const viewport of [NARROW, PHONE, LAPTOP]) {
    test(`U114 one centred card, no sideways scroll and a way home at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await signedIn(page);
      await page.goto("/account");
      await expect(page.locator(testid("account-card"))).toBeVisible();
      const card = (await page.locator(testid("account-card")).boundingBox())!;
      expect(card.width).toBeLessThanOrEqual(481);
      expect(Math.abs(card.x + card.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
      const record = (await page.locator(testid("history")).boundingBox())!;
      expect(record.y - (card.y + card.height), "32px between the card and the record (Q4)").toBeGreaterThanOrEqual(31);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      for (const id of ["edit-nickname", "open-password", "signout"]) {
        const b = (await page.locator(testid(id)).boundingBox())!;
        expect(b.height, `${id} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
        const label = (await page.locator(`${testid(id)} span`).boundingBox())!;
        expect(label.height, `${id} is one line`).toBeLessThan(26);
      }
      await expect(page.locator(testid("header-home"))).toBeVisible(); // Q12: Home is in the header bar, not at the bottom
      await context.close();
    });
  }
});

test.describe("Long names (U114, U118)", () => {
  for (const viewport of [NARROW, PHONE]) {
    test(`the card and the history hold a 16 letter nickname, a 20 character username and a 16 letter opponent at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const one = await newPlayer(browser, viewport, { reducedMotion: true });
      const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
      await one.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
      await two.page.request.post("/api/guest", { data: { nickname: "XXXXXXXXXXXXXXXX" } });
      const username = `W${"w".repeat(13)}${unique()}`; // 20 characters, and different on every run (a username is unique)
      expect((await one.page.request.post("/api/account/signup", { data: { username, password: "first password here" } })).ok()).toBe(true);
      const code = await makeGameCode(one.page);
      await one.page.goto(`/g/${code}`);
      await two.page.goto(`/g/${code}`);
      await waitForRound(one.page, 1);
      await waitForRound(two.page, 1);
      // One round first: a game with no round played is never recorded (R98).
      await one.page.locator(testid("column-0")).click();
      await two.page.locator(testid("column-1")).click();
      await waitForRound(one.page, 2);
      await one.page.locator(testid("header-home")).click() /* U132: Home asks to confirm leaving */;
      await one.page.locator(testid("leave-confirm")).click();
      await one.page.waitForURL(/\/$/);
      await one.page.goto("/account");
      await expect(one.page.locator(`${testid("history-list")} .history-row`).first()).toContainText("XXXXXXXXXXXXXXXX");
      const card = (await one.page.locator(testid("account-card")).boundingBox())!;
      expect(card.height, "the card is not stretched tall by a long name").toBeLessThan(viewport.width < 400 ? 420 : 340);
      expect(await one.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      for (const id of ["account-nickname", "account-username"]) {
        const b = (await one.page.locator(testid(id)).boundingBox())!;
        expect(b.x + b.width, `${id} inside the card`).toBeLessThanOrEqual(card.x + card.width);
      }
      const row = one.page.locator(`${testid("history-list")} .history-row`).first();
      const result = (await row.locator(".history-result").boundingBox())!;
      const rowBox = (await row.boundingBox())!;
      expect(result.x + result.width, "the result is inside its row").toBeLessThanOrEqual(rowBox.x + rowBox.width);
      await one.context.close();
      await two.context.close();
    });
  }
});
