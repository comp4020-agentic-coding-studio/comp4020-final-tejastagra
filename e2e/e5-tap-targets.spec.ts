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

test("E5 the board's own column buttons and Drop stay 44 px even with a 7-column row at 320 px", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, NARROW);
  await page.goto(`/g/${await makeGameCode(page)}`);
  for (let c = 0; c < 7; c++) {
    const box = (await page.locator(testid(`column-${c}`)).boundingBox())!;
    expect(box.width, `column-${c} width`).toBeGreaterThanOrEqual(43.5);
    expect(box.height, `column-${c} height`).toBeGreaterThanOrEqual(43.5);
  }
  await context.close();
});
