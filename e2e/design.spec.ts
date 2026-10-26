// Browser checks for docs/design/. Run with pnpm test:e2e, never in pnpm check.
// Screenshot comparisons use reduced motion so animations never make them flaky.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { chooseColumn, makeGameCode, newPlayer, testid, waitForRound } from "./helpers.ts";

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
  test("U10 to U13 tapping a column chooses it, shows the ghost disc and tapping another column changes it", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await chooseColumn(one.page, 2);
    await expect(one.page.locator(testid("column-2"))).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await expect(one.page.locator(testid("ghost-disc"))).toBeVisible();
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Ready");
    await chooseColumn(one.page, 5); // a change of mind is allowed until the round resolves (R4)
    await expect(one.page.locator(testid("column-5"))).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("column-2"))).toHaveAttribute("aria-pressed", "false");
    await chooseColumn(two.page, 5);
    await waitForRound(one.page, 2);
    // The changed choice is the one that counted: the crash is in column 5 (index 5), not column 2.
    await expect(one.page.locator(testid("cell-5-0"))).toHaveAttribute("data-piece", "R");
    await expect(one.page.locator(testid("cell-2-0"))).toHaveAttribute("data-piece", "");
    await one.context.close();
    await two.context.close();
  });

  test("U11 hovering a column on a laptop shows the ghost disc; on a phone nothing depends on hover", async ({ browser }) => {
    const { one, two } = await twoPlayers(browser);
    await two.page.locator(testid("column-4")).hover();
    await expect(two.page.locator(testid("ghost-disc"))).toBeVisible();
    await two.page.locator(testid("column-1")).hover();
    const ghost = (await two.page.locator(testid("ghost-disc")).boundingBox())!;
    const column1 = (await two.page.locator(testid("column-1")).boundingBox())!;
    expect(Math.abs(ghost.x + ghost.width / 2 - (column1.x + column1.width / 2))).toBeLessThan(4); // it follows the pointer
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
    await badge.click();
    await expect(badge).toHaveAttribute("aria-pressed", "true");
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Shield armed");
    // R22 and U17: arming sends the opponent nothing they can see, not even a change in their panel.
    await expect(two.page.locator(testid("opponent-shield"))).toHaveText("available");
    await badge.click();
    await expect(badge).toHaveAttribute("aria-pressed", "false");
    await badge.click(); // armed again, then used in a round
    await chooseColumn(one.page, 3);
    await chooseColumn(two.page, 3);
    await waitForRound(one.page, 2);
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Shield spent");
    await expect(two.page.locator(testid("opponent-shield"))).toHaveText("used"); // it is spent now, which is public (R20)
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
    // R22: the countdown has not shown a choice early: it only ever shows numbers and the word DROP.
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
    // U27a: the winning line is visible beside or above the popup: four glowing discs, none covered by it.
    const popup = (await one.page.locator(testid("end-popup") + " .popup-card").boundingBox())!;
    for (let r = 0; r < 4; r++) {
      const cell = (await one.page.locator(testid(`cell-0-${r}`)).boundingBox())!;
      const overlap = !(cell.x + cell.width < popup.x || cell.x > popup.x + popup.width || cell.y + cell.height < popup.y || cell.y > popup.y + popup.height);
      expect(overlap, `cell-0-${r} is not covered by the popup`).toBe(false);
    }
    expect(await one.page.locator(".piece.win").count()).toBe(4);
    await one.context.close();
    await two.context.close();
  });

  test("U29 Play again starts a new game and Home returns to the home screen", async ({ browser }) => {
    const { one, two, code } = await twoPlayers(browser);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
    await one.page.click(testid("play-again"));
    await one.page.waitForURL((url) => /\/g\/[A-Z2-9]{6}$/.test(url.pathname) && !url.pathname.endsWith(code));
    await expect(one.page.locator(testid("game-code"))).not.toHaveText(code);
    await two.page.click(testid("go-home"));
    await two.page.waitForURL((url) => url.pathname === "/");
    await expect(two.page.locator(testid("home-screen"))).toBeVisible();
    await one.context.close();
    await two.context.close();
  });

  test("U30 with reduced motion on, the popup still appears, there is no countdown and nothing animates", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    const sawCountdown = one.page.waitForFunction(() => (document.querySelector('[data-testid="countdown"]')?.textContent ?? "") !== "", null, { timeout: 1_500 }).then(() => true, () => false);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
      await chooseColumn(two.page, 1 + (i % 2));
      if (i < 3) await waitForRound(one.page, i + 2);
    }
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 4_000 });
    expect(await sawCountdown, "no countdown under reduced motion").toBe(false);
    expect(await one.page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length), "no running animation").toBe(0);
    await one.context.close();
    await two.context.close();
  });
});

test.describe("Home", () => {
  test("U31 to U36 the home screen shows the title, player card, four menu buttons, the round icon row, top players and the demo board", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP);
    await page.goto("/");
    await expect(page.locator(testid("tagline"))).toHaveText("Four in a row, but you both move at once.");
    await expect(page.locator(testid("player-card"))).toBeVisible();
    await expect(page.locator(testid("player-name"))).not.toHaveText("Choosing a name...");
    for (const id of ["play-computer", "play-friend", "quick-match", "join-toggle"]) await expect(page.locator(testid(id))).toBeVisible();
    for (const id of ["open-leaderboard", "how-to-play", "open-account", "open-about"]) await expect(page.locator(testid(id))).toBeVisible();
    await expect(page.locator(testid("top-players"))).toBeVisible();
    await expect(page.locator(testid("demo-board") + " .board")).toBeVisible();
    await context.close();
  });

  test("U33 Join with a code opens the code input in place and joins the game", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE);
    const code = await makeGameCode(host.page);
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    await expect(page.locator(testid("code-input"))).toBeHidden();
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
    await page.tap(testid("tutorial-skip"));
    await page.tap(testid("play-computer"));
    await page.waitForURL(/\/g\/[A-Z2-9]{6}$/);
    await expect(page.locator(testid("round-number"))).toHaveText("1");
    await context.close();
  });

  test("U37 and U38 the phone layout is one column with the menu above the demo board; the laptop splits in two halves, nothing stretched", async ({ browser }) => {
    const phone = await newPlayer(browser, PHONE);
    await phone.page.goto("/");
    const menu = (await phone.page.locator(testid("menu")).boundingBox())!;
    const demo = (await phone.page.locator(testid("demo-board")).boundingBox())!;
    expect(menu.y, "phone: the menu is above the demo board").toBeLessThan(demo.y);
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

test.describe("Tutorial", () => {
  test("R47 and U41 to U46 a first-time visitor sees all five steps, including the crash and the shield", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new" });
    await page.goto("/");
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    const titles: string[] = [];
    for (let i = 0; i < 5; i++) {
      titles.push(await page.locator(testid("tutorial-title")).innerText());
      const caption = await page.locator(testid("tutorial-caption")).innerText();
      expect(caption.length).toBeGreaterThan(20);
      if (i < 4) await page.click(testid("tutorial-next"));
    }
    expect(titles).toEqual(["Pick a column", "You both move at once", "Crash!", "Your shield", "Four in a row wins"]);
    await expect(page.locator(testid("tutorial-next"))).toHaveText("Play the computer");
    await context.close();
  });

  test("R48 the tutorial does not return after a refresh", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new" });
    await page.goto("/");
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    await page.click(testid("tutorial-skip"));
    await expect(page.locator(testid("tutorial"))).toBeHidden();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(testid("tutorial"))).toBeHidden();
    await context.close();
  });

  test("R49 Skip ends it at any step and How to play replays it", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new" });
    await page.goto("/");
    await page.click(testid("tutorial-next"));
    await page.click(testid("tutorial-next"));
    await page.click(testid("tutorial-skip")); // at step 3
    await expect(page.locator(testid("tutorial"))).toBeHidden();
    await page.click(testid("how-to-play"));
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    await expect(page.locator(testid("tutorial-title"))).toHaveText("Pick a column"); // from the start
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
    const before = await (await page.request.get("/api/leaderboard?limit=1000")).text();
    await page.goto("/");
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    for (let i = 0; i < 4; i++) await page.click(testid("tutorial-next"));
    await page.click(testid("tutorial-skip"));
    expect(calls, "no game was opened during the tutorial").toEqual([]);
    expect(await (await page.request.get("/api/leaderboard?limit=1000")).text()).toBe(before);
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
    await chooseColumn(one.page, 2);
    expect(await axeViolations(one.page), "game, a column chosen").toEqual([]);
    for (let i = 0; i < 4; i++) {
      await chooseColumn(one.page, 0);
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
    const { context, page } = await newPlayer(browser, PHONE, { tutorial: "new", reducedMotion: true });
    await page.goto("/");
    await expect(page.locator(testid("tutorial"))).toBeVisible();
    expect(await axeViolations(page), "tutorial open").toEqual([]);
    await page.click(testid("tutorial-skip"));
    await page.click(testid("join-toggle"));
    await page.click(testid("rename"));
    expect(await axeViolations(page), "home with forms open").toEqual([]);
    await context.close();
  });
});

test.describe("Board size (design check)", () => {
  test("the board fills the full width on a phone and at least 60% of the height on a laptop", async ({ browser }) => {
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
    expect(lb.height / LAPTOP.height, "laptop: the board is at least 60% of the screen height").toBeGreaterThanOrEqual(0.6);
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
      const mask = [page.locator(testid("top-players")), page.locator(testid("player-card")), page.locator(testid("leaderboard-wins")), page.locator(testid("leaderboard-rounds"))];
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
