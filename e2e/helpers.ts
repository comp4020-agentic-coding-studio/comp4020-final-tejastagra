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
    await context.addInitScript(() => {
      try {
        localStorage.setItem("rubble-tutorial-seen", "1"); // R47: whether it was seen is kept in the browser
      } catch {
        // the server's flag still says it was seen
      }
    });
  }
  return { context, page };
}

// Chooses a column on the board (U10 to U13): tapping or clicking the column is the whole choice.
export async function chooseColumn(page: Page, column: number): Promise<void> {
  await page.locator(testid(`column-${column}`)).click();
}

// Waits until round 1 is open: the start countdown (R97) has ended and the board takes a choice.
export async function waitForStart(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('[data-testid="game-screen"]')?.getAttribute("data-started") === "true", null, { timeout: 8_000 });
}

// Waits until the round counter shows `round`. Round 1 means round 1 is open for choices, after the start countdown (R97).
export async function waitForRound(page: Page, round: number): Promise<void> {
  await page.waitForFunction(
    (n) => document.querySelector('[data-testid="round-number"]')?.textContent === String(n),
    round,
    { timeout: 6_000 },
  );
  if (round === 1) await waitForStart(page);
}

export const testid = (id: string) => `[data-testid="${id}"]`;

// The screens in docs/design.md's table. /g/<code> is made fresh by the caller.
export const STATIC_SCREENS = ["/", "/play/quick", "/leaderboard", "/account", "/readme/"];

export async function makeGameCode(page: Page): Promise<string> {
  const res = await page.request.post("/api/games");
  return (await res.json()).code as string;
}

// The tutorial's eleven steps (docs/design/tutorial.md U137 to U147), by number, and how a player does each one.
export const TUTORIAL_STEPS = ["The goal", "Pick a column", "You both move at once", "The round timer", "Crashes", "Your shield", "Earthquake", "The shrinking board", "Draws", "Playing with friends", "Leaving and playing again"];

// Opens the tutorial from How to play (R49): the tutorial never opens on home by itself any more (R47).
export async function openTutorial(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(testid("how-to-play")).click();
  await page.locator(testid("tutorial")).waitFor({ state: "visible" });
}

// Does the step the player is on, as a player would (by tapping, never by skipping the action), and waits for Next.
export async function doTutorialStep(page: Page, step: number): Promise<void> {
  const tap = (c: number) => page.locator(testid(`tutorial-column-${c}`)).click();
  if ([2, 3, 4, 5].includes(step)) await tap(3);
  if (step === 6) {
    await page.locator(testid("tutorial-shield")).click();
    await tap(3);
  }
  if (step === 7) await page.locator(testid("tutorial-earthquake")).click();
  if (step === 8) await tap(2);
  await page.locator(testid("tutorial-next")).waitFor({ state: "visible", timeout: 8_000 });
}

// Walks from step 1 to `step` (1-based), doing each step on the way.
export async function toTutorialStep(page: Page, step: number): Promise<void> {
  for (let s = 1; s < step; s++) {
    await doTutorialStep(page, s);
    await page.locator(testid("tutorial-next")).click();
  }
}
