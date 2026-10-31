// Browser checks for docs/design/. Run with pnpm test:e2e, never in pnpm check.
// Screenshot comparisons use reduced motion so animations never make them flaky.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { chooseColumn, doTutorialStep, makeGameCode, newPlayer, openTutorial, testid, toTutorialStep, TUTORIAL_STEPS, waitForRound } from "./helpers.ts";

const SCREENS = ["/", "/play/quick", "/leaderboard", "/account", "/readme/"];

// Two players in one game, each in their own context, so every check can play a real round.
async function twoPlayers(browser: Parameters<typeof newPlayer>[0], a = PHONE, b = LAPTOP) {
  const one = await newPlayer(browser, a);
  const two = await newPlayer(browser, b);
  const code = await makeGameCode(one.page);
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await waitForRound(one.page, 1);
  await waitForRound(two.page, 1);
  await expect(one.page.locator(testid("waiting-panel"))).toBeHidden();
  return { one, two, code };
}

test.describe("Play on the board", () => {
  test("U12 and U13 tapping a column chooses it for good: the ghost disc locks in and a second tap changes nothing (R4)", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await chooseColumn(one.page, 2);
    await expect(one.page.locator(testid("column-2"))).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await expect(one.page.locator(testid("ghost-disc"))).toBeVisible();
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    // Locked: every column and the shield badge are off, and another tap says so and sends nothing.
    await expect(one.page.locator(testid("shield-badge"))).toBeDisabled();
    await one.page.locator(testid("column-5")).click({ force: true });
    await expect(one.page.locator(testid("game-message"))).toHaveText("Your choice is locked in.");
    await expect(one.page.locator(testid("column-5"))).toHaveAttribute("aria-pressed", "false");
    await expect(one.page.locator(testid("column-2"))).toHaveAttribute("aria-pressed", "true");
    await chooseColumn(two.page, 2);
    await waitForRound(one.page, 2);
    // The first choice is the one that counted: the crash is in column 2, and column 5 is empty.
    await expect(one.page.locator(testid("cell-2-0"))).toHaveAttribute("data-piece", "R");
    await expect(one.page.locator(testid("cell-5-0"))).toHaveAttribute("data-piece", "");
    // The next round opens unlocked.
    await expect(one.page.locator(testid("column-4"))).toHaveAttribute("aria-disabled", "false");
    await one.context.close();
    await two.context.close();
  });

  test("U11 hovering a column on a laptop shows the ghost disc; on a phone nothing depends on hover", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await two.page.locator(testid("column-4")).hover();
    await expect(two.page.locator(testid("ghost-disc"))).toBeVisible();
    await two.page.locator(testid("column-1")).hover();
    const ghost = (await two.page.locator(testid("ghost-disc")).boundingBox())!;
    const hole = (await two.page.locator(testid("cell-1-5")).boundingBox())!;
    const board = (await two.page.locator(testid("board-wrap")).boundingBox())!;
    expect(Math.abs(ghost.x + ghost.width / 2 - (hole.x + hole.width / 2)), "centred above its column").toBeLessThan(2);
    expect(ghost.y + ghost.height, "outside the board, above it").toBeLessThanOrEqual(board.y + 1);
    // The phone has no hover and still plays: a tap chooses.
    await chooseColumn(one.page, 3);
    await expect(one.page.locator(testid("column-3"))).toHaveAttribute("aria-pressed", "true");
    await one.context.close();
    await two.context.close();
  });

  test("U14 tapping a full column shakes it and shows the message, and sends no choice", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    // A always chooses column 0 and B always chooses column 6, so each column fills with one player's
    // discs and nobody can make four in a row sideways. A's column-0 stack would be four in a column,
    // so B blocks it by taking turns: B drops in column 0 on the third round, which crashes A's disc there.
    // Instead of relying on that, put rubble in column 0 directly: both choose it, which crashes and
    // leaves a rubble block each time, and six crashes fill the column without a winner.
    for (let i = 0; i < 6; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 0);
      await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("column-0"))).toHaveAttribute("aria-disabled", "true");
    await one.page.locator(testid("column-0")).click({ force: true });
    await expect(one.page.locator(testid("game-message"))).toContainText("That column is full");
    await expect(one.page.locator(testid("column-0"))).toHaveClass(/shake/);
    // Nothing was sent: the opponent's panel still says Choosing, not Ready.
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Choosing");
    await one.context.close();
    await two.context.close();
  });

  test("U15 every column hit area is at least 44px wide at 320px", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, NARROW);
    await page.goto(`/g/${await makeGameCode(page)}`);
    for (let c = 0; c < 7; c++) expect((await page.locator(testid(`column-${c}`)).boundingBox())!.width).toBeGreaterThanOrEqual(43.5);
    await context.close();
  });

  test("U16 and U17 the shield badge arms and disarms, shows as spent after use, and the opponent only sees whether it is spent", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    const badge = one.page.locator(testid("shield-badge"));
    await expect(badge).toHaveAttribute("aria-pressed", "false");
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield");
    await badge.click();
    await expect(badge).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Shield armed");
    // R22 and U17: arming sends the opponent nothing they can see, not even a change in their panel.
    await expect(two.page.locator(testid("opponent-shield"))).toHaveText("Shield available");
    await badge.click();
    await expect(badge).toHaveAttribute("aria-pressed", "false");
    await badge.click(); // armed again, then used in a round
    await chooseColumn(one.page, 3);
    await chooseColumn(two.page, 3);
    await waitForRound(one.page, 2);
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Shield used");
    await expect(two.page.locator(testid("opponent-shield"))).toHaveText("Shield used"); // it is spent now, which is public (R20)
    await one.context.close();
    await two.context.close();
  });

  test("U18 keys 1 to 7 and S play a round without a mouse", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser, LAPTOP, LAPTOP);
    await one.page.keyboard.press("s");
    await expect(one.page.locator(testid("shield-badge"))).toHaveAttribute("aria-pressed", "true");
    await one.page.keyboard.press("3");
    await expect(one.page.locator(testid("column-2"))).toHaveAttribute("aria-pressed", "true");
    await two.page.keyboard.press("5");
    await waitForRound(one.page, 2);
    await expect(one.page.locator(testid("cell-2-0"))).toHaveAttribute("data-piece", "A");
    await expect(one.page.locator(testid("result-line"))).not.toHaveText(""); // announced in a live region
    await one.context.close();
    await two.context.close();
  });
});

test.describe("Motion and endings", () => {
  test("U23 both screens show the round result within 1 second of the second choice, with animations on", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await chooseColumn(one.page, 1);
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    const startedAt = Date.now();
    await chooseColumn(two.page, 4);
    // The disc is visible in its cell, landed, on both screens.
    await Promise.all(
      [one.page, two.page].map((page) =>
        page.waitForFunction(() => document.querySelector('[data-testid="cell-1-0"]')?.getAttribute("data-piece") !== "", null, { timeout: 2_000 }),
      ),
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await one.context.close();
    await two.context.close();
  });

  test("U27 and U28 the win and lose popups appear with the right title on each player's screen", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 4_000 });
    await expect(two.page.locator(testid("end-title"))).toHaveText("SO CLOSE!", { timeout: 4_000 });
    await expect(one.page.locator(testid("end-popup"))).toBeVisible();
    // U27a: the popup is centred over the board, and the four winning discs glow behind it.
    const popup = (await one.page.locator(testid("end-popup") + " .popup-card").boundingBox())!;
    const board = (await one.page.locator(testid("board-wrap")).boundingBox())!;
    expect(Math.abs(popup.x + popup.width / 2 - (board.x + board.width / 2)), "popup centred over the board, sideways").toBeLessThan(4);
    expect(popup.y, "popup inside the board").toBeGreaterThanOrEqual(board.y);
    expect(popup.y + popup.height, "popup inside the board").toBeLessThanOrEqual(board.y + board.height);
    expect(await one.page.locator(".piece.win").count()).toBe(4);
    await one.context.close();
    await two.context.close();
  });

  test("U29 and R82 Play again is a rematch on the same link, and Home returns to the home screen", async ({ browser }) => {
    const { one, two, code } = await twoPlayers(browser);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
    // R82 and R84: Play again is a rematch with the same people on the same link, and starts only when both have asked.
    await one.page.click(testid("play-again"));
    await expect(one.page.locator(testid("rematch-status"))).toContainText("Waiting for");
    expect(one.page.url()).toContain(`/g/${code}`);
    await two.page.click(testid("play-again"));
    await expect(one.page.locator(testid("end-popup"))).toBeHidden({ timeout: 3_000 });
    await expect(one.page.locator(testid("round-number"))).toHaveText("1");
    expect(one.page.url()).toContain(`/g/${code}`);
    await two.page.goto("/");
    await two.page.waitForURL((url) => url.pathname === "/");
    await expect(two.page.locator(testid("home-screen"))).toBeVisible();
    await two.page.waitForURL((url) => url.pathname === "/");
    await expect(two.page.locator(testid("home-screen"))).toBeVisible();
    await one.context.close();
    await two.context.close();
  });

  test("U30 with reduced motion on, the popup still appears and nothing animates", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
    expect(await one.page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => `${(a.effect as KeyframeEffect).target?.className} ${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty}`)), "no running animation").toEqual([]);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("Home", () => {
  test("U31 to U36 the home screen shows the title, player card, four menu buttons, the round icon row and the demo board", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    await page.goto("/");
    await expect(page.locator(testid("tagline"))).toHaveText("Four in a row, with a twist.");
    await expect(page.locator(testid("player-card"))).toBeVisible();
    await expect(page.locator(testid("player-name"))).not.toHaveText("Choosing a name...");
    for (const id of ["play-computer", "play-friend", "quick-match", "join-toggle"]) await expect(page.locator(testid(id))).toBeVisible();
    for (const id of ["open-leaderboard", "how-to-play", "open-account", "open-about"]) await expect(page.locator(testid(id))).toBeVisible();
    await expect(page.locator(testid("top-players")), "U35: no Top players on the home screen").toHaveCount(0);
    await expect(page.locator(testid("demo-board") + " .board")).toBeVisible();
    await context.close();
  });

  test("U33b Join with a code opens the code popup and joins the game", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE);
    const code = await makeGameCode(host.page);
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    await expect(page.locator(testid("code-input"))).toHaveCount(0);
    await page.tap(testid("join-toggle"));
    await expect(page.locator(testid("code-input"))).toBeVisible();
    await page.fill(testid("code-input"), code);
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/g/${code}$`));
    await host.context.close();
    await context.close();
  });

  test("U33 a first-time visitor has a generated nickname and can start a computer game in one tap", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new" });
    await page.goto("/");
    await expect(page.locator(testid("player-name"))).toHaveText(/^[A-Z][a-z]+ [A-Z][a-z]+ #[0-9a-f]{4}$/);
    await page.tap(testid("play-computer"));
    await page.tap(testid("tutorial-skip")); // R47: the tutorial runs before the first match; skipping starts it
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(page.locator(testid("round-number"))).toHaveText("1");
    await context.close();
  });

  test("U37 and U38 the phone layout is one column with no demo board; the laptop splits in two halves, nothing stretched", async ({ browser }) => {
    const phone = await newPlayer(browser, PHONE);
    await phone.page.goto("/");
    const menu = (await phone.page.locator(testid("menu")).boundingBox())!;
    await expect(phone.page.locator(testid("demo-board")), "phone: no demo board (U36, changed 31 October 2026)").toBeHidden();
    expect(menu.y + menu.height, "phone: the whole menu is on the first screen").toBeLessThan(PHONE.height + 200);

    const laptop = await newPlayer(browser, LAPTOP);
    await laptop.page.goto("/");
    const stack = (await laptop.page.locator(testid("menu")).boundingBox())!;
    const board = (await laptop.page.locator(testid("demo-board")).boundingBox())!;
    expect(stack.width, "laptop: menu buttons at most 420px wide (U8a)").toBeLessThanOrEqual(421);
    expect(board.x + board.width, "laptop: the demo board is the left half").toBeLessThan(stack.x);
    const title = (await laptop.page.locator(".title").boundingBox())!;
    const halves = (await laptop.page.locator(".home-left").boundingBox())!;
    expect(title.x + title.width, "the title is in the left half").toBeLessThanOrEqual(halves.x + halves.width + 1);
    const scroll = await laptop.page.evaluate(() => ({ w: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    expect(scroll.w).toBeLessThanOrEqual(scroll.c);
    // Nothing stretches across the full width: every button is within its capped stack.
    for (const id of ["play-computer", "play-friend", "quick-match", "join-toggle"]) {
      expect((await laptop.page.locator(testid(id)).boundingBox())!.width).toBeLessThanOrEqual(421);
    }
    await phone.context.close();
    await laptop.context.close();
  });
});

// The tutorial's steps (docs/design/tutorial.md U137 to U147). When it opens is checked in e2e/tutorial.spec.ts (R47, U136).
test.describe("Tutorial", () => {
  test("U136 to U147 eleven steps in order, each with Step N of 11 and Skip; an action step shows Next only once it is done", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    const titles: string[] = [];
    for (let step = 1; step <= 11; step++) {
      titles.push(await page.locator(testid("tutorial-title")).innerText());
      await expect(page.locator(testid("tutorial-progress"))).toHaveText(`Step ${step} of 11`);
      expect((await page.locator(testid("tutorial-caption")).innerText()).length).toBeGreaterThan(20);
      await expect(page.locator(testid("tutorial-skip"))).toBeVisible();
      if (step >= 2 && step <= 8) await expect(page.locator(testid("tutorial-next")), `step ${step}: no Next before acting`).toBeHidden();
      await doTutorialStep(page, step);
      if (step < 11) await page.click(testid("tutorial-next"));
    }
    expect(titles).toEqual(TUTORIAL_STEPS);
    // From How to play, the last step starts nothing (U136).
    await expect(page.locator(testid("tutorial-next"))).toHaveText("Done");
    await expect(page.locator(testid("tutorial-skip"))).toHaveText("Close");
    await page.click(testid("tutorial-next"));
    await expect(page.locator(testid("tutorial"))).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/");
    await context.close();
  });

  test("U137 the goal shows four discs in a row, and U145 a draw shows both lines", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    expect(await page.locator(`${testid("tutorial-board")} .piece.win`).count(), "four glowing discs").toBe(4);
    await expect(page.locator(testid("tutorial-caption"))).toHaveText("Get four of your discs in a row, across, down or diagonally.");
    await toTutorialStep(page, 9);
    await expect(page.locator(testid("tutorial-title"))).toHaveText("Draws");
    expect(await page.locator(`${testid("tutorial-board")} .piece.win`).count(), "both lines glow").toBe(8);
    await context.close();
  });

  test("U138 step 2: tapping a column locks the ghost disc in, and a second tap changes nothing", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await openTutorial(page);
    await toTutorialStep(page, 2);
    await expect(page.locator(testid("tutorial-ghost"))).toBeHidden();
    await page.locator(testid("tutorial-column-2")).click();
    await expect(page.locator(testid("tutorial-ghost"))).toBeVisible();
    await expect(page.locator(testid("tutorial-hint"))).toContainText("Locked in");
    const first = (await page.locator(testid("tutorial-ghost")).boundingBox())!;
    await page.locator(testid("tutorial-column-5")).click({ force: true });
    const second = (await page.locator(testid("tutorial-ghost")).boundingBox())!;
    expect(second.x).toBeCloseTo(first.x, 0);
    await context.close();
  });

  test("U139 U140 U141 both discs drop together; the timer step shows a draining bar; the same column leaves rubble", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    await toTutorialStep(page, 3);
    await doTutorialStep(page, 3);
    const pieces = await page.locator(`${testid("tutorial-board")} [data-testid^="cell-"][data-piece="A"], ${testid("tutorial-board")} [data-testid^="cell-"][data-piece="B"]`).count();
    expect(pieces, "step 3: two discs landed").toBe(2);
    await page.click(testid("tutorial-next"));
    await expect(page.locator(testid("tutorial-title"))).toHaveText("The round timer");
    await expect(page.locator(testid("tutorial-caption"))).toContainText("10 seconds");
    await expect(page.locator(testid("tutorial-caption"))).toContainText("3 rounds in a row");
    await expect(page.locator(testid("tutorial-timer"))).toBeVisible();
    await doTutorialStep(page, 4);
    await expect(page.locator(testid("tutorial-timer"))).toBeHidden();
    await page.click(testid("tutorial-next"));
    await doTutorialStep(page, 5);
    expect(await page.locator(`${testid("tutorial-board")} [data-piece="R"]`).count(), "step 5: rubble landed").toBe(1);
    await context.close();
  });

  test("U142 the shield step: the badge must be tapped first, and the disc blocks the computer's win", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    await toTutorialStep(page, 6);
    await expect(page.locator(testid("tutorial-title"))).toHaveText("Your shield");
    await expect(page.locator(testid("tutorial-caption"))).toContainText("once per game, and is used up even if there is no crash");
    const badge = page.locator(testid("tutorial-shield"));
    await expect(badge).toContainText("Arm shield");
    await page.locator(testid("tutorial-column-3")).click();
    await expect(page.locator(testid("tutorial-hint"))).toContainText("Tap your shield first");
    await expect(page.locator(testid("tutorial-next"))).toBeHidden();
    await badge.click();
    await expect(badge).toContainText("Shield armed");
    await page.locator(testid("tutorial-column-0")).click();
    await expect(page.locator(testid("tutorial-hint"))).toContainText("glowing column");
    await page.locator(testid("tutorial-column-3")).click();
    await expect(page.locator(testid("tutorial-next"))).toBeVisible({ timeout: 8_000 });
    await expect(page.locator(`${testid("tutorial-board")} [data-testid="cell-3-0"]`)).toHaveAttribute("data-piece", "A");
    expect(await page.locator(`${testid("tutorial-board")} [data-piece="B"]`).count(), "the computer got no fourth disc").toBe(3);
    await expect(badge).toContainText("Shield used");
    await context.close();
  });

  test("U146 and U147 playing with friends, then leaving and playing again with the keyboard keys written once", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    await toTutorialStep(page, 10);
    await expect(page.locator(testid("tutorial-caption"))).toContainText("6-letter code");
    await expect(page.locator(testid("tutorial-caption"))).toContainText("Anyone after the first watches");
    await expect(page.locator(testid("tutorial-caption"))).toContainText("Quick match pairs you with a random person");
    await page.click(testid("tutorial-next"));
    await expect(page.locator(testid("tutorial-caption"))).toHaveText("Leaving a game counts as a forfeit, so you lose. After a game you can play the same person again with Play again. On a keyboard: keys 1 to 7 pick a column, S arms your shield, E uses Earthquake.");
    await context.close();
  });

  test("U137 to U147 no disc sits stuck in the top hole of the practice board at any step", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    for (let step = 1; step <= 11; step++) {
      expect(await page.locator(`${testid("tutorial-board")} [data-testid$="-5"] .piece`).count(), `step ${step} before acting: nothing in the top row`).toBe(0);
      await doTutorialStep(page, step);
      if (step < 11) await page.click(testid("tutorial-next"));
    }
    await context.close();
  });

  test("R49 Skip ends it at any step and How to play replays it from the start", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await openTutorial(page);
    await toTutorialStep(page, 3);
    await page.click(testid("tutorial-skip")); // at step 3, before acting
    await expect(page.locator(testid("tutorial"))).toBeHidden();
    expect(new URL(page.url()).pathname, "How to play starts nothing").toBe("/");
    await page.click(testid("how-to-play"));
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    await expect(page.locator(testid("tutorial-title"))).toHaveText("The goal"); // from the start
    await context.close();
  });

  test("R50 a tutorial run opens no game on the server, so it cannot change the leaderboard", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new" });
    const calls: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (/^\/api\/(games|computer|quick)/.test(url.pathname)) calls.push(`${req.method()} ${url.pathname}`);
    });
    page.on("websocket", (ws) => calls.push(`websocket ${ws.url()}`));
    await openTutorial(page); // from How to play, so finishing it starts no match either
    for (let step = 1; step <= 11; step++) {
      await doTutorialStep(page, step);
      if (step < 11) await page.click(testid("tutorial-next"));
    }
    await page.click(testid("tutorial-next")); // Done
    expect(calls, "no game was opened during the tutorial").toEqual([]);
    // Other checks finish games while this one runs, so the whole list is not compared (it is
    // global and shared): this player's own name must be on neither list (correction C18).
    const me = (await (await page.request.get("/api/me")).json()).player.displayName as string;
    const board = (await (await page.request.get("/api/leaderboard?limit=1000")).json()) as { wins: Array<{ name: string }>; rounds: Array<{ name: string }>; you: { wins: number; bestRounds: number | null } | null };
    for (const list of [board.wins, board.rounds]) expect(list.map((row) => row.name)).not.toContain(me);
    expect(board.you).toMatchObject({ wins: 0, bestRounds: null }); // R92: and the player's own line agrees: no wins, no best
    await context.close();
  });
});

test.describe("Waiting and the share panel", () => {
  test("the waiting panel shows the code until the opponent arrives, and Copy link works", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE);
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("waiting-panel"))).toBeVisible();
    await expect(host.page.locator(testid("game-code"))).toHaveText(code);
    await expect(host.page.locator(testid("copy-link"))).toBeVisible();
    const guest = await newPlayer(browser, LAPTOP);
    await guest.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("waiting-panel"))).toBeHidden({ timeout: 3_000 });
    await host.context.close();
    await guest.context.close();
  });
});

test.describe("Look and feel", () => {
  test("U3a the bubbles sit behind every screen's content and never take a tap", async ({ browser }) => {
    for (const viewport of [PHONE, LAPTOP]) {
      const { context, page } = await newPlayer(browser, viewport);
      await page.goto("/");
      const layers = await page.evaluate(() => {
        const bubbles = getComputedStyle(document.querySelector(".bubbles")!);
        const main = getComputedStyle(document.querySelector("main")!);
        return { bubbleZ: Number(bubbles.zIndex), mainZ: Number(main.zIndex), pointer: bubbles.pointerEvents, count: document.querySelectorAll(".bubble").length };
      });
      expect(layers.bubbleZ).toBeLessThan(layers.mainZ);
      expect(layers.pointer).toBe("none");
      expect(layers.count).toBe(viewport.width < 600 ? 7 : 12);
      await context.close();
    }
  });

  test("U8a menu buttons are never wider than 420px, on any screen", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    for (const path of ["/", "/play/quick", "/leaderboard", "/account"]) {
      await page.goto(path);
      const widths = await page.evaluate(() => [...document.querySelectorAll(".stack .btn")].map((b) => Math.round(b.getBoundingClientRect().width)));
      for (const w of widths) expect(w, `${path} button width`).toBeLessThanOrEqual(421);
    }
    await context.close();
  });

  test("U5a the title's chips stay clear of the tagline and the cracks stay within the letters", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    const title = (await page.locator(".title").boundingBox())!;
    const cracks = (await page.locator(".title-cracks").boundingBox())!;
    expect(cracks.x).toBeGreaterThanOrEqual(title.x - 1);
    expect(cracks.x + cracks.width).toBeLessThanOrEqual(title.x + title.width + 1);
    const tagline = (await page.locator(testid("tagline")).boundingBox())!;
    for (const chip of await page.locator(".chip").all()) {
      // sample the whole fall: a chip must never be inside the tagline's box
      for (let i = 0; i < 12; i++) {
        const box = await chip.boundingBox();
        if (box) {
          const inside = box.y + box.height > tagline.y + 2 && box.y < tagline.y + tagline.height - 2 && box.x + box.width > tagline.x && box.x < tagline.x + tagline.width;
          expect(inside, "a chip crossed the tagline").toBe(false);
        }
        await page.waitForTimeout(450);
      }
    }
    await context.close();
  });

  test("U49 and U50 no page links to /style-preview, and the live app answers it only in development", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    for (const path of SCREENS) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.content(), path).not.toContain("style-preview");
    }
    await context.close();
  });
});

test.describe("Contrast", () => {
  async function axeViolations(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    return results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }

  for (const [name, viewport] of [["phone", PHONE], ["laptop", LAPTOP]] as const) {
    test(`every screen has no axe-core accessibility or contrast violations at ${name}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      for (const path of SCREENS) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await axeViolations(page), `${path} at ${name}`).toEqual([]);
      }
      const code = await makeGameCode(page);
      await page.goto(`/g/${code}`);
      await page.waitForLoadState("networkidle");
      expect(await axeViolations(page), `game waiting at ${name}`).toEqual([]);
      await context.close();
    });
  }

  test("the game screen and its end popup have no axe violations in play", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      if (i === 0) expect(await axeViolations(one.page), "game, a column chosen").toEqual([]);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
    expect(await axeViolations(one.page), "end popup, win").toEqual([]);
    expect(await axeViolations(two.page), "end popup, lose").toEqual([]);
    await one.context.close();
    await two.context.close();
  });

  test("the tutorial and the Home forms have no axe violations", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await openTutorial(page);
    expect(await axeViolations(page), "tutorial open").toEqual([]);
    await page.click(testid("tutorial-skip"));
    await page.click(testid("join-toggle"));
    expect(await axeViolations(page), "home with the code popup open").toEqual([]);
    await page.keyboard.press("Escape");
    await page.click(testid("rename"));
    expect(await axeViolations(page), "home with the nickname popup open").toEqual([]);
    await context.close();
  });
});

test.describe("Board size (design check)", () => {
  test("U7 the board fills the full width on a phone, and on a laptop is at least half the screen height with the whole game column on screen", async ({ browser }) => {
    const phone = await newPlayer(browser, PHONE);
    await phone.page.goto(`/g/${await makeGameCode(phone.page)}`);
    const pb = (await phone.page.locator(".board").boundingBox())!;
    expect(pb.width, "phone: the board fills the width (less the page margins)").toBeGreaterThanOrEqual(PHONE.width - 24);
    const narrow = await newPlayer(browser, NARROW);
    await narrow.page.goto(`/g/${await makeGameCode(narrow.page)}`);
    expect((await narrow.page.locator(".board").boundingBox())!.width).toBeGreaterThanOrEqual(NARROW.width - 24);

    const laptop = await newPlayer(browser, LAPTOP);
    await laptop.page.goto(`/g/${await makeGameCode(laptop.page)}`);
    const lb = (await laptop.page.locator(".board").boundingBox())!;
    // U7 changed 29 October 2026 (U132): the board is as large as fits with the header bar, the versus bar, the timer and the
    // power-up row all on the screen, and never less than half its height.
    expect(lb.height / LAPTOP.height, "laptop: the board is at least half the screen height").toBeGreaterThanOrEqual(0.5);
    expect(lb.y + lb.height, "and it is fully on screen").toBeLessThanOrEqual(LAPTOP.height);
    await phone.context.close();
    await narrow.context.close();
    await laptop.context.close();
  });
});

// Screenshot comparisons: each screen at both viewports, in reduced motion so nothing moves.
// The first run on a machine writes the baselines (e2e/design.spec.ts-snapshots/); later runs compare.
test.describe("Screenshots", () => {
  for (const [name, viewport] of [["phone", PHONE], ["laptop", LAPTOP]] as const) {
    test(`every screen matches its approved screenshot at ${name}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      // Top players and names change as people play, so hide the parts that depend on live data.
      const mask = [page.locator(testid("player-card")), page.locator(testid("leaderboard-wins")), page.locator(testid("leaderboard-rounds")), page.locator(testid("live-count"))]; // the live count is how many games happen to be live (U76)
      // The home and leaderboard screens change height with how many wins the app has recorded, and the right column is
      // centred, so the lists are answered here with a fixed empty one: the picture then never depends on what other
      // checks have played before it.
      await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins: [], rounds: [] } }));
      // /play/quick is left out: it joins the shared lobby, so a player left waiting by another run
      // pairs with this one and the page becomes a game. Its waiting state is checked in E6 and by axe.
      for (const path of SCREENS.filter((p) => p !== "/play/quick")) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveScreenshot(`screen${path.replace(/\//g, "-") || "-home"}-${name}.png`, { mask, maxDiffPixelRatio: 0.02, animations: "disabled" });
      }
      await context.close();
    });
  }
});

// ---- The fix list of 27 October 2026 (docs/design/game-screen.md, ADR 0009) ----
test.describe("Game screen layout and the waiting card", () => {
  for (const [name, viewport] of [["phone", PHONE], ["narrow", NARROW], ["laptop", LAPTOP]] as const) {
    test(`U10 the column highlight matches its column of holes within 2px at ${name}`, async ({ browser }) => {
      const one = await newPlayer(browser, viewport);
      const two = await newPlayer(browser, LAPTOP);
      const code = await makeGameCode(one.page);
      await one.page.goto(`/g/${code}`);
      await two.page.goto(`/g/${code}`);
      await waitForRound(one.page, 1);
      for (let c = 0; c < 7; c++) {
        // Light the column up, as hovering does, then compare it with the holes of that column.
        await one.page.evaluate((col) => document.querySelectorAll<HTMLElement>(".column-glow").forEach((g, i) => (g.dataset.on = String(i === col))), c);
        const glow = (await one.page.locator(testid(`column-glow-${c}`)).boundingBox())!;
        const top = (await one.page.locator(testid(`cell-${c}-5`)).boundingBox())!;
        const bottom = (await one.page.locator(testid(`cell-${c}-0`)).boundingBox())!;
        const board = (await one.page.locator(".board").boundingBox())!;
        expect(Math.abs(glow.x - top.x), `column ${c} left edge`).toBeLessThanOrEqual(2);
        expect(Math.abs(glow.x + glow.width - (top.x + top.width)), `column ${c} right edge`).toBeLessThanOrEqual(2);
        expect(glow.y, `column ${c} starts at the board face, not above it`).toBeGreaterThanOrEqual(board.y);
        expect(glow.y + glow.height, `column ${c} ends at the bottom hole's row, not on the feet`).toBeLessThanOrEqual(board.y + board.height);
        expect(glow.y, `column ${c} top`).toBeLessThanOrEqual(top.y);
        expect(glow.y + glow.height, `column ${c} bottom`).toBeGreaterThanOrEqual(bottom.y + bottom.height - 2);
      }
      await one.context.close();
      await two.context.close();
    });
  }

  for (const [name, viewport] of [["phone", PHONE], ["laptop", LAPTOP]] as const) {
    test(`U132 one centred column: header bar, versus bar, board, timer and power-ups, in that order, at ${name}`, async ({ browser }) => {
      const one = await newPlayer(browser, viewport);
      const two = await newPlayer(browser, LAPTOP);
      const code = await makeGameCode(one.page);
      await one.page.goto(`/g/${code}`);
      await two.page.goto(`/g/${code}`);
      await waitForRound(one.page, 1);
      const box = async (id: string) => (await one.page.locator(testid(id)).boundingBox())!;
      const [bar, players, board, timer, powerups] = await Promise.all(["topbar", "players", "board-wrap", "timer", "powerups"].map(box));
      const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
      for (const [name, b] of [["header bar", bar], ["versus bar", players], ["board", board], ["timer", timer], ["power-ups", powerups]] as const) {
        expect(Math.abs(centre(b) - viewport.width / 2), `${name} is centred on the page`).toBeLessThanOrEqual(16);
      }
      expect(bar.y + bar.height, "the header bar is above the versus bar").toBeLessThanOrEqual(players.y + 1);
      expect(players.y + players.height, "the versus bar is above the board").toBeLessThanOrEqual(board.y + 1);
      expect(board.y + board.height, "the timer is under the board").toBeLessThanOrEqual(timer.y + 1);
      expect(timer.y + timer.height, "the power-ups are under the timer").toBeLessThanOrEqual(powerups.y + 1);
      // The round is on the right of the header bar, and nothing sits beside the board.
      const round = await box("round-line");
      expect(round.y).toBeLessThan(bar.y + bar.height);
      expect(round.x).toBeGreaterThan(viewport.width / 2);
      expect(powerups.y + powerups.height, "the whole column is on the first screen").toBeLessThanOrEqual(viewport.height);
      await one.context.close();
      await two.context.close();
    });
  }

  test("U54 and R51 the waiting card is compact and centred, with no timer, round number or opponent status, and 'Get ready' follows the second player", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE);
    const code = await makeGameCode(host.page);
    await host.page.goto(`/g/${code}`);
    const card = (await host.page.locator(testid("waiting-panel")).boundingBox())!;
    expect(card.width).toBeLessThanOrEqual(480);
    const board = (await host.page.locator(testid("board-wrap")).boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - (board.x + board.width / 2))).toBeLessThanOrEqual(4);
    for (const id of ["copy-link", "share"]) {
      const box = (await host.page.locator(testid(id)).boundingBox())!;
      expect(box.height, `${id} is a normal-sized button`).toBeLessThanOrEqual(64);
      expect(box.height).toBeGreaterThanOrEqual(43.5);
    }
    for (const id of ["timer", "round-line", "players"]) await expect(host.page.locator(testid(id)), `${id} is not shown while waiting`).toBeHidden();
    // Waiting alone, nothing happens: the round number and timer stay hidden past the old timer's length.
    await host.page.waitForTimeout(1_500);
    await expect(host.page.locator(testid("waiting-panel"))).toBeVisible();
    const guest = await newPlayer(browser, LAPTOP);
    await guest.page.goto(`/g/${code}`);
    await expect(host.page.locator(testid("waiting-panel"))).toBeHidden({ timeout: 3_000 });
    await expect(host.page.locator(testid("get-ready"))).toBeVisible();
    await expect(host.page.locator(testid("timer")), "no timer during the start countdown (R97)").toBeHidden();
    await expect(host.page.locator(testid("timer"))).toBeVisible({ timeout: 5_000 }); // round 1 opens after it
    await host.context.close();
    await guest.context.close();
  });

  test("U57 each panel shows the real nickname, and the opponent is named Computer in a computer game", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    const mine = await one.page.locator(testid("name-you")).innerText();
    const theirs = await one.page.locator(testid("name-opponent")).innerText();
    expect(mine).not.toBe("You");
    expect(mine).toMatch(/#[0-9a-f]{4}$/);
    expect(theirs).toBe(await two.page.locator(testid("name-you")).innerText());
    expect(await two.page.locator(testid("name-opponent")).innerText()).toBe(mine);
    await one.context.close();
    await two.context.close();
    const solo = await newPlayer(browser, PHONE);
    await solo.page.goto("/");
    await solo.page.tap(testid("play-computer"));
    await solo.page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(solo.page.locator(testid("name-opponent"))).toHaveText("Computer");
    await solo.context.close();
  });

  test("U25 and U56 the timer is a slim bar that drains, turns orange at 5 seconds and red at 3, and restarts each round", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    const bar = one.page.locator(testid("timer"));
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(16);
    const fill = async () => Number(await bar.evaluate((el) => getComputedStyle(el).getPropertyValue("--left")));
    const early = await fill();
    await one.page.waitForTimeout(700);
    expect(await fill()).toBeLessThan(early);
    await expect(bar).toHaveAttribute("data-urgency", "warn", { timeout: 6_000 });
    await expect(bar).toHaveAttribute("data-urgency", "urgent", { timeout: 4_000 });
    // The round timed out (R18, 10 seconds), so the next round starts with a full bar again.
    await waitForRound(one.page, 2);
    expect(await fill()).toBeGreaterThan(0.8);
    // Both choosing resolves the round at once, so the bar restarts rather than running down.
    await chooseColumn(one.page, 1);
    await chooseColumn(two.page, 3);
    await waitForRound(one.page, 3);
    expect(await fill()).toBeGreaterThan(0.8);
    await one.context.close();
    await two.context.close();
  });

  test("U27a no popup title overflows its popup, at either viewport, for every kind of ending", async ({ browser }) => {
    for (const viewport of [PHONE, NARROW, LAPTOP]) {
      const { context, page } = await newPlayer(browser, viewport);
      await page.goto(`/g/${await makeGameCode(page)}`);
      for (const title of ["GAME ABANDONED", "YOU WIN!", "SO CLOSE!", "IT'S A DRAW!", "GAME OVER"]) {
        const result = await page.evaluate((text) => {
          document.querySelector<HTMLElement>('[data-testid="end-popup"]')!.hidden = false;
          document.querySelector<HTMLElement>('[data-testid="waiting-panel"]')!.hidden = true;
          const el = document.querySelector<HTMLElement>('[data-testid="end-title"]')!;
          el.textContent = text;
          const card = document.querySelector<HTMLElement>(".popup-card")!;
          const t = el.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          return { overflowX: el.scrollWidth > el.clientWidth + 1, inside: t.left >= c.left - 1 && t.right <= c.right + 1, lines: Math.round(t.height / parseFloat(getComputedStyle(el).lineHeight)) };
        }, title);
        expect(result.overflowX, `${title} at ${viewport.width}`).toBe(false);
        expect(result.inside, `${title} inside the popup at ${viewport.width}`).toBe(true);
        expect(result.lines, `${title} on one or two lines at ${viewport.width}`).toBeLessThanOrEqual(2);
      }
      await context.close();
    }
  });

  test("U16 the shield badge says what to do, and the info button opens the explanation", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield");
    await expect(one.page.locator(testid("shield-help"))).toHaveCount(0);
    const info = (await one.page.locator(testid("shield-info")).boundingBox())!;
    expect(info.width).toBeGreaterThanOrEqual(43.5);
    expect(info.height).toBeGreaterThanOrEqual(43.5);
    await one.page.locator(testid("shield-info")).click();
    await expect(one.page.locator(testid("shield-help"))).toContainText("Your shield wins one crash per game.");
    await expect(one.page.locator(testid("shield-help"))).toContainText("to block their winning move or to take yours.");
    await expect(one.page.locator(testid("shield-help"))).toHaveAttribute("role", "dialog");
    await one.page.keyboard.press("Escape");
    await expect(one.page.locator(testid("shield-help"))).toHaveCount(0);
    await one.context.close();
    await two.context.close();
  });

  test("U19 there is no countdown: the disc is placed within a second and no countdown element exists", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    expect(await one.page.locator(testid("countdown")).count()).toBe(0);
    await chooseColumn(one.page, 1);
    const startedAt = Date.now();
    await chooseColumn(two.page, 4);
    await one.page.waitForFunction(() => document.querySelector('[data-testid="cell-1-0"]')?.getAttribute("data-piece") === "A", null, { timeout: 1_000 });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("Forms and lists stay narrow and centred (U60)", () => {
  test("U60 no input or list on any screen is wider than 560px on a laptop, and each is centred", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    for (const path of ["/", "/leaderboard", "/account"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/") {
        await page.click(testid("join-toggle"));
        await page.keyboard.press("Escape");
        await page.click(testid("rename"));
      }
      const wide = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("input, textarea, select, ol.rows, ul.rows, form, .panel.form")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.width > 560.5) found.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.width)}px`);
        }
        return found;
      });
      expect(wide, `${path} has nothing wider than 560px`).toEqual([]);
    }
    await page.goto("/leaderboard");
    // U123: one column, centred, and the tabs, podium and rows share it (the two lists are tabs now, U124).
    const column = (await page.locator(testid("leaderboard-column")).boundingBox())!;
    expect(Math.abs(column.x + column.width / 2 - LAPTOP.width / 2), "leaderboard column centred").toBeLessThanOrEqual(8);
    expect(column.width, "leaderboard column at most 560px").toBeLessThanOrEqual(561);
    await page.goto("/account");
    const card = (await page.locator(testid("account-card")).boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - LAPTOP.width / 2), "account card centred").toBeLessThanOrEqual(8);
    expect(card.width, "account card at most 480px").toBeLessThanOrEqual(481);
    await page.click(testid("edit-nickname"));
    await expect(page.locator(`${testid("nickname-dialog")} ${testid("nickname-save")}`)).toHaveText("Save"); // U115: Save and Cancel
    await context.close();
  });

  test("U35a the round icon row is centred under the buttons", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    await page.goto("/");
    const row = (await page.locator(testid("icon-row")).boundingBox())!;
    const stack = (await page.locator(testid("menu")).boundingBox())!;
    expect(Math.abs(row.x + row.width / 2 - (stack.x + stack.width / 2)), "icon row centred under the buttons").toBeLessThanOrEqual(8);
    await context.close();
  });
});

test.describe("Small screens and the Share fallback", () => {
  test("U54 Share always works: with no Web Share it copies the link", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await page.goto(`/g/${await makeGameCode(page)}`);
    await expect(page.locator(testid("share"))).toBeVisible();
    await page.locator(testid("share")).click();
    await expect(page.locator(testid("share"))).toHaveText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/g/");
    await context.close();
  });

  for (const viewport of [NARROW, { width: 360, height: 640 }]) {
    test(`U136 to U147 the tutorial card never hides its progress, title, Next or Skip at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await openTutorial(page);
      for (let step = 1; step <= 11; step++) {
        await doTutorialStep(page, step);
        const progress = (await page.locator(testid("tutorial-progress")).boundingBox())!;
        expect(progress.y, `step ${step}: progress on screen`).toBeGreaterThanOrEqual(0);
        const box = async (id: string) => (await page.locator(testid(id)).boundingBox())!;
        const title = await box("tutorial-title");
        const skip = await box("tutorial-skip");
        expect(title.y, `step ${step}: title on screen`).toBeGreaterThanOrEqual(0);
        expect(skip.y + skip.height, `step ${step}: Skip on screen`).toBeLessThanOrEqual(viewport.height);
        const next = await box("tutorial-next");
        expect(next.y + next.height, `step ${step}: Next on screen`).toBeLessThanOrEqual(viewport.height);
        // The opponent's status shares the progress line's row on a short screen: their words never overlap (Q5, U136).
        const words = await page.evaluate(() =>
          ["tutorial-progress", "tutorial-status"].map((id) => {
            const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
            if (!el || el.hidden || !el.textContent) return null;
            const r = document.createRange();
            r.selectNodeContents(el);
            const b = r.getBoundingClientRect();
            return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          }),
        );
        const [p, st] = words;
        if (p && st) expect(p.right <= st.left || st.right <= p.left || p.bottom <= st.top || st.bottom <= p.top, `step ${step}: progress and status do not overlap`).toBe(true);
        if (step < 11) await page.click(testid("tutorial-next"));
      }
      await context.close();
    });
  }
});
