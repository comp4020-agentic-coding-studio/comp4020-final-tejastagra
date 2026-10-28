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

// Two people matched by Quick match, each in their own context, ready to be watched.
async function quickPair(browser: Browser, v: Viewport) {
  const drain = await newPlayer(browser, v);
  const first = await (await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
  if (first.state === "waiting") await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`);
  await drain.context.close();
  const one = await newPlayer(browser, v, { nickname: "Pip Squeak" });
  const two = await newPlayer(browser, v, { nickname: "Sam Wombat" });
  await one.page.request.post(`/api/quick/${crypto.randomUUID()}`);
  const code = ((await (await two.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json()) as { code: string }).code;
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await one.page.locator(testid("round-number")).waitFor();
  return { code, one, two };
}

const STATES: State[] = [
  { name: "home", run: async ({ page, shot }) => { await page.goto("/"); await settle(page, 1200); await shot(); } },
  { name: "tutorial-step-1", tutorial: true, run: async ({ page, shot }) => { await page.goto("/"); await page.locator(testid("tutorial")).waitFor(); await settle(page); await shot(); } },
  {
    name: "quick-match-waiting",
    run: async ({ page, shot }) => {
      await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } })); // never pair with another run's player
      await page.goto("/play/quick");
      await settle(page);
      await shot();
    },
  },
  {
    name: "quick-match-computer-offer",
    run: async ({ page, shot }) => {
      await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
      await page.clock.install();
      await page.goto("/play/quick");
      await page.locator(testid("quick-status")).waitFor();
      await page.clock.fastForward(20_500);
      await page.locator(testid("computer-offer")).waitFor();
      await shot();
    },
  },
  {
    name: "leaderboard-empty",
    run: async ({ page, shot }) => {
      await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins: [], rounds: [], you: null } }));
      await page.goto("/leaderboard");
      await settle(page);
      await shot();
    },
  },
  {
    name: "leaderboard-filled",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      const names = ["Brave Wombat #a7f3", "Quick Otter #b2c1", "Pip Squeak #4f2a", "Calm Falcon #9d10", "Bold Badger #5e77", "Lucky Panda #31ab", "Sneaky Gecko #c0de"];
      const wins = names.map((name, i) => ({ name, value: 14 - i * 2 }));
      const rounds = names.map((name, i) => ({ name, value: 4 + i }));
      await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins, rounds, you: { name: "Pip Squeak #4f2a", wins: 10, bestRounds: 6 } } }));
      await page.goto("/leaderboard");
      await settle(page);
      await shot();
    },
  },
  {
    name: "leaderboard-fewest-rounds",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      const names = ["Brave Wombat #a7f3", "Quick Otter #b2c1", "Pip Squeak #4f2a", "Calm Falcon #9d10"];
      const rounds = names.map((name, i) => ({ name, value: 4 + i }));
      await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins: [], rounds, you: { name: "Pip Squeak #4f2a", wins: 0, bestRounds: 6 } } }));
      await page.goto("/leaderboard");
      await page.locator(testid("tab-rounds")).click();
      await settle(page);
      await shot();
    },
  },
  { name: "account-guest", nickname: "Pip Squeak", run: async ({ page, shot }) => { await page.goto("/account"); await settle(page); await shot(); } },
  {
    name: "account-signed-in",
    nickname: "Pip Squeak",
    run: async ({ browser, v, page, shot }) => {
      const username = `pip${Math.random().toString(36).slice(2, 8)}`;
      await page.request.post("/api/account/signup", { data: { username, password: "correct horse battery" } });
      // A real game against a person, so the record has something in it (R90, R91).
      const { second } = await twoPlayers(browser, v, page);
      await page.locator(testid("leave-game")).click();
      await page.locator(testid("leave-confirm")).click();
      await page.waitForURL(/\/$/);
      await second.context.close();
      await page.goto("/account");
      await settle(page, 900);
      await shot();
    },
  },
  ...(["open-signup:signup-dialog", "open-signin:signin-dialog", "edit-nickname:nickname-dialog"] as const).map((pair): State => {
    const [opener, dialog] = pair.split(":");
    return {
      name: `popup-${dialog}`,
      nickname: "Pip Squeak",
      run: async ({ page, shot }) => {
        await page.goto("/account");
        await page.locator(testid(opener)).click();
        await page.locator(testid(dialog)).waitFor();
        await settle(page, 500);
        await shot();
      },
    };
  }),
  {
    name: "popup-forgot-dialog",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      await page.goto("/account");
      await page.locator(testid("open-signin")).click();
      await page.locator(testid("forgot-link")).click();
      await page.locator(testid("forgot-dialog")).waitFor();
      await settle(page, 500);
      await shot();
    },
  },
  {
    name: "popup-signin-error",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      await page.goto("/account");
      await page.locator(testid("open-signin")).click();
      await page.fill(testid("username-input"), "nobody_here");
      await page.fill(testid("password-input"), "wrong password");
      await page.locator(testid("signin-save")).click();
      await page.locator(`${testid("signin-dialog")} .dialog-error:visible`).waitFor();
      await shot();
    },
  },
  {
    name: "popup-password-dialog",
    nickname: "Pip Squeak",
    run: async ({ page, shot }) => {
      const username = `pip${Math.random().toString(36).slice(2, 8)}`;
      await page.request.post("/api/account/signup", { data: { username, password: "correct horse battery" } });
      await page.goto("/account");
      await page.locator(testid("open-password")).click();
      await page.locator(testid("password-dialog")).waitFor();
      await settle(page, 500);
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
      const { code, one, two } = await quickPair(browser, v);
      await page.goto(`/watch?game=${code}`);
      await page.locator(testid("name-a")).filter({ hasNotText: "Player" }).waitFor();
      await settle(page, 1200);
      await shot();
      await one.context.close();
      await two.context.close();
    },
  },
  {
    name: "watching-none-live",
    run: async ({ page, shot }) => {
      // The server's own "none live" answer, so the state is reachable whatever else the app has live.
      await page.routeWebSocket(/\/ws$/, (ws) => ws.onMessage(() => ws.send(JSON.stringify({ type: "none_live" }))));
      await page.goto("/watch");
      await page.locator(testid("no-live-games")).waitFor();
      await settle(page);
      await shot();
    },
  },
  {
    name: "watching-link-game",
    run: async ({ browser, v, page, shot }) => {
      const { code, second } = await twoPlayers(browser, v, page);
      const watcher = await newPlayer(browser, v, { nickname: "Wren Spectator" });
      await watcher.page.goto(`/g/${code}`);
      await watcher.page.locator(testid("spectator-notice")).waitFor();
      await settle(watcher.page, 1200);
      await watcher.page.screenshot({ path: `reports/visual-qa/watching-link-game--${v.name}.png` });
      await watcher.context.close();
      await second.context.close();
      await shot();
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
