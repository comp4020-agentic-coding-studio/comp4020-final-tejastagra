// E5: every tap target is at least 44 x 44 CSS px at the phone viewport (and at 320 px).
import { expect, test, type Page } from "@playwright/test";
import { NARROW, PHONE } from "../playwright.config.ts";
import { STATIC_SCREENS, makeGameCode, newPlayer, testid } from "./helpers.ts";

async function tooSmall(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const small: string[] = [];
    document.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [role=button]").forEach((el) => {
      if (el.hidden || getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.width < 43.5 || r.height < 43.5) {
        small.push(`${el.dataset.testid ?? el.id ?? el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return small;
  });
}

for (const [name, viewport] of [["390", PHONE], ["320", NARROW]] as const) {
  test(`E5 every tap target is at least 44 x 44 at ${name} px`, async ({ browser }) => {
    const { context, page } = await newPlayer(browser, viewport);
    const code = await makeGameCode(page);
    for (const path of [...STATIC_SCREENS, `/g/${code}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await tooSmall(page), `${path} at ${name}`).toEqual([]);
    }
    // Screens that show more controls once something has happened: the sign-up form and sign-out,
    // the Quick match computer offer, and the game screen with the share panel.
    await page.goto("/account");
    await page.fill(testid("nickname-input"), "TapTest");
    await page.click(`${testid("guest-form")} button`);
    await expect(page.locator(testid("signup-form"))).toBeVisible();
    expect(await tooSmall(page), `/account after a guest at ${name}`).toEqual([]);
    await context.close();
  });
}

test("E5 and U15 each column of the board is a hit area at least 44 px wide at 320 px, and the shield badge is 44 px tall", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, NARROW);
  await page.goto(`/g/${await makeGameCode(page)}`);
  for (let c = 0; c < 7; c++) {
    const box = (await page.locator(testid(`column-${c}`)).boundingBox())!;
    expect(box.width, `column-${c} width`).toBeGreaterThanOrEqual(43.5);
    expect(box.height, `column-${c} height`).toBeGreaterThanOrEqual(43.5);
  }
  const badge = (await page.locator(testid("shield-badge")).boundingBox())!;
  expect(badge.height).toBeGreaterThanOrEqual(43.5);
  await context.close();
});

test("E5 the tutorial's controls and the Home popups are 44 px at 320 px", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, NARROW, { tutorial: "new" });
  await page.goto("/");
  await expect(page.locator(testid("tutorial"))).toBeVisible();
  expect(await tooSmall(page), "tutorial open").toEqual([]);
  await page.click(testid("tutorial-skip"));
  expect(await tooSmall(page), "Home").toEqual([]);
  await page.click(testid("join-toggle"));
  await expect(page.locator(testid("code-dialog"))).toBeVisible();
  expect(await tooSmall(page), "the code popup open").toEqual([]);
  await page.keyboard.press("Escape");
  await page.click(testid("rename"));
  await expect(page.locator(testid("nickname-dialog"))).toBeVisible();
  expect(await tooSmall(page), "the nickname popup open").toEqual([]);
  await context.close();
});
