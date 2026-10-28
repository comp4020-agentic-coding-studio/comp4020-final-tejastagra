// /visual-qa step 2: a screenshot of every screen and state at every viewport, into reports/visual-qa/ (git-ignored).
// Run through scripts/visual-qa.sh, which starts a throwaway app and sets APP_URL. Each state is one entry in STATES, so
// a screen that is built later is added here in the same commit, and the command (.claude/commands/visual-qa.md) always
// covers what exists. A state that cannot be reached is an error, never silently skipped.
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.APP_URL;
if (!BASE) throw new Error("APP_URL is not set: run this through scripts/visual-qa.sh");

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "laptop", width: 1366, height: 768, touch: false },
  { name: "narrow", width: 320, height: 568, touch: true },
] as const;
type Viewport = (typeof VIEWPORTS)[number];

const testid = (id: string) => `[data-testid="${id}"]`;
const fakeAddress = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function newPlayer(browser: Browser, v: Viewport, options: { tutorial?: boolean; nickname?: string } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: v.width, height: v.height },
    hasTouch: v.touch,
    isMobile: v.touch,
    reducedMotion: "reduce", // so a screenshot never catches an animation half way
    extraHTTPHeaders: { "fly-client-ip": fakeAddress() },
  });
  const page = await context.newPage();
  if (!options.tutorial) await page.request.post("/api/tutorial", { data: { result: "finished" } });
  if (options.nickname) await page.request.post("/api/guest", { data: { nickname: options.nickname } });
  return { context, page };
}

// ---- The states ----

interface State {
  name: string;
  // Gets the page to the state to photograph. It may open further players (a second context) and must close them itself.
  run: (ctx: { browser: Browser; v: Viewport; page: Page; shot: () => Promise<void> }) => Promise<void>;
  tutorial?: boolean; // start as a visitor who has not seen the tutorial
  nickname?: string;
}

const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

async function openGame(page: Page, path = "/api/computer"): Promise<string> {
  const code = (await (await page.request.post(path)).json()).code as string;
  await page.goto(`/g/${code}`);
  return code;
}

async function twoPlayers(browser: Browser, v: Viewport, first: Page) {
  const code = (await (await first.request.post("/api/games")).json()).code as string;
  const second = await newPlayer(browser, v, { nickname: "Sam Wombat" });
  await first.goto(`/g/${code}`);
  await second.page.goto(`/g/${code}`);
  await first.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
  return { code, second };
}

const STATES: State[] = [
  { name: "home", run: async ({ page, shot }) => { await page.goto("/"); await settle(page, 1200); await shot(); } },
  { name: "tutorial-step-1", tutorial: true, run: async ({ page, shot }) => { await page.goto("/"); await page.locator(testid("tutorial")).waitFor(); await settle(page); await shot(); } },
  { name: "quick-match-waiting", run: async ({ page, shot }) => { await page.goto("/play/quick"); await settle(page); await shot(); } },
  { name: "leaderboard", run: async ({ page, shot }) => { await page.goto("/leaderboard"); await settle(page); await shot(); } },
  { name: "account-guest", nickname: "Pip Squeak", run: async ({ page, shot }) => { await page.goto("/account"); await settle(page); await shot(); } },
  {
    name: "account-signed-in",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      const username = `pip${Math.random().toString(36).slice(2, 8)}`;
      await page.request.post("/api/account/signup", { data: { username, password: "correct horse battery" } });
      await page.goto("/account");
      await settle(page);
      await shot();
    },
  },
  { name: "about", run: async ({ page, shot }) => { await page.goto("/readme/"); await settle(page); await shot(); } },
  {
    name: "friend-waiting",
    run: async ({ page, shot }) => {
      const code = (await (await page.request.post("/api/games")).json()).code as string;
      await page.goto(`/g/${code}`);
      await settle(page);
      await shot();
    },
  },
  {
    name: "computer-game",
    run: async ({ page, shot }) => {
      await openGame(page);
      await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
      await settle(page, 1500);
      await shot();
    },
  },
  {
    name: "friend-game",
    nickname: "Pip Squeak",
    run: async ({ browser, v, page, shot }) => {
      const { second } = await twoPlayers(browser, v, page);
      await settle(page, 1500);
      await shot();
      await second.context.close();
    },
  },
  {
    name: "watching",
    run: async ({ browser, v, page, shot }) => {
      const owner = await newPlayer(browser, v, { nickname: "Sam Wombat" });
      const code = await openGame(owner.page);
      await owner.page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
      await page.goto("/watch");
      await settle(page, 1500);
      await shot();
      void code;
      await owner.context.close();
    },
  },
];

// ---- Run ----

const only = process.argv[2]; // a name, to take just one state while fixing it
const browser = await chromium.launch();
const taken: string[] = [];
let failed = 0;
for (const state of STATES) {
  if (only && state.name !== only) continue;
  for (const v of VIEWPORTS) {
    const { context, page } = await newPlayer(browser, v, { tutorial: state.tutorial, nickname: state.nickname });
    const file = `reports/visual-qa/${state.name}--${v.name}.png`;
    try {
      await state.run({ browser, v, page, shot: async () => void (await page.screenshot({ path: file, fullPage: false })) });
      taken.push(file);
    } catch (error) {
      failed++;
      console.error(`FAILED ${state.name} at ${v.name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    }
    await context.close();
  }
}
await browser.close();
console.log(taken.join("\n"));
console.log(`\n${taken.length} screenshots in reports/visual-qa/${failed ? `, ${failed} states could not be reached` : ""}`);
process.exit(failed ? 1 : 0);
