import type { Browser, BrowserContext, Page } from "@playwright/test";

// Every context is its own client address, so the per-address limits (CLAUDE.md)
// never lock a run out of its own app, and so two contexts really are two players.
export function fakeAddress(): string {
  const n = () => Math.floor(Math.random() * 250);
  return `10.${n()}.${n()}.${n()}`;
}

export async function newPlayer(
  browser: Browser,
  viewport: { width: number; height: number },
  touch = viewport.width < 600,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: { "fly-client-ip": fakeAddress() },
  });
  return { context, page: await context.newPage() };
}

export const testid = (id: string) => `[data-testid="${id}"]`;

// The screens in docs/design.md's table. /g/<code> is made fresh by the caller.
export const STATIC_SCREENS = ["/", "/play/quick", "/leaderboard", "/account", "/readme/"];

export async function makeGameCode(page: Page): Promise<string> {
  const res = await page.request.post("/api/games");
  return (await res.json()).code as string;
}
