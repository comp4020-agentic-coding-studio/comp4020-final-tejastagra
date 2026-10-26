// E4: every screen in docs/design.md has no sideways scroll at 320 px, 390 px and laptop width.
import { expect, test } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { STATIC_SCREENS, makeGameCode, newPlayer } from "./helpers.ts";

for (const [name, viewport] of [["320", NARROW], ["390", PHONE], ["laptop", LAPTOP]] as const) {
  test(`E4 no sideways scroll on any screen at ${name} px`, async ({ browser }) => {
    const { context, page } = await newPlayer(browser, viewport);
    const code = await makeGameCode(page);
    for (const path of [...STATIC_SCREENS, `/g/${code}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${path} at ${name}`).toBeLessThanOrEqual(clientWidth);
    }
    await context.close();
  });
}
