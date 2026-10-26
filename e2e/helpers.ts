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
  options: { touch?: boolean; tutorial?: "seen" | "new"; reducedMotion?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const touch = options.touch ?? viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    extraHTTPHeaders: { "fly-client-ip": fakeAddress() },
  });
  const page = await context.newPage();
  // The tutorial opens by itself for a new visitor (R47) and would cover every other check, so
  // by default each check starts as a player who has already finished it, through the real
  // endpoint. The tutorial checks ask for "new".
  if ((options.tutorial ?? "seen") === "seen") {
    await page.request.post("/api/tutorial", { data: { result: "finished" } });
  }
  return { context, page };
}

// Chooses a column on the board (U10 to U13): tapping or clicking the column is the whole choice.
export async function chooseColumn(page: Page, column: number): Promise<void> {
  await page.locator(testid(`column-${column}`)).click();
}

// Waits until the round counter shows `round`.
export async function waitForRound(page: Page, round: number): Promise<void> {
  await page.waitForFunction(
    (n) => document.querySelector('[data-testid="round-number"]')?.textContent === String(n),
    round,
    { timeout: 6_000 },
  );
}

export const testid = (id: string) => `[data-testid="${id}"]`;

// The screens in docs/design.md's table. /g/<code> is made fresh by the caller.
export const STATIC_SCREENS = ["/", "/play/quick", "/leaderboard", "/account", "/readme/"];

export async function makeGameCode(page: Page): Promise<string> {
  const res = await page.request.post("/api/games");
  return (await res.json()).code as string;
}
