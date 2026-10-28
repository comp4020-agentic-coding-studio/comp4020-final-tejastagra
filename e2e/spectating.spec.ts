// Browser checks for spectating (docs/design/spectating.md U76 to U95, rules R70 to R80). Run with
// pnpm test:e2e, never in pnpm check. Only quick match games are listed (R70) and a computer game can never be watched (R71),
// so each check pairs two players through Quick match, or opens a link game, and watches that very game by its code.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { newPlayer, testid, waitForRound } from "./helpers.ts";
import { withQuickQueue } from "./quick-lock.ts";

type Size = { width: number; height: number };

// Two players paired by Quick match, each in their own context. Any waiting ticket from another check is paired off first.
async function quickPair(browser: Browser, sizes: [Size, Size] = [PHONE, LAPTOP], options: { names?: boolean } = {}) {
  // The queue is shared by every check in the run, so the pairing is done while holding the lock (correction C26).
  const { one, two, code } = await withQuickQueue(async () => {
    const drain = await newPlayer(browser, PHONE);
    const first = await (await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
    if (first.state === "waiting") await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`);
    await drain.context.close();
    const one = await newPlayer(browser, sizes[0], { reducedMotion: true });
    const two = await newPlayer(browser, sizes[1], { reducedMotion: true });
    if (options.names) {
      await one.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
      await two.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
    }
    await one.page.request.post(`/api/quick/${crypto.randomUUID()}`);
    const matched = await (await two.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
    return { one, two, code: matched.code as string };
  });
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await waitForRound(one.page, 1);
  await waitForRound(two.page, 1);
  return { one, two, code };
}

// A quick match pair and a spectator at the size under test, watching this very game (other checks have games live too).
async function watching(browser: Browser, size: Size, options: { names?: boolean } = {}) {
  const { one, two, code } = await quickPair(browser, [PHONE, LAPTOP], options);
  const spectator = await newPlayer(browser, size, { reducedMotion: true });
  if (options.names) await spectator.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
  await spectator.page.goto(`/watch?game=${code}`);
  await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
  return { player: one, other: two, spectator, code };
}

// Both players choose, so the round resolves at once, and the spectator sees the next round.
async function playRound(a: Page, b: Page, spectator: Page, round: number, columnA: number, columnB: number): Promise<void> {
  await a.locator(testid(`column-${columnA}`)).click();
  await b.locator(testid(`column-${columnB}`)).click();
  await waitForRound(a, round + 1);
  await expect(spectator.locator(testid("round-number"))).toHaveText(String(round + 1), { timeout: 4_000 });
}

test.describe("The home screen (U76, U77)", () => {
  for (const viewport of [NARROW, PHONE, LAPTOP]) {
    test(`E9 and U76 and U77 the Watch live button is first in the icon row, 44px or more, with its count, at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport);
      await page.goto("/");
      const buttons = page.locator(`${testid("icon-row")} .round-item`);
      await expect(buttons.first()).toHaveAttribute("data-testid", "watch-live");
      const box = (await page.locator(testid("watch-live")).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator(testid("live-count"))).toHaveText(/^(No games live|\d+ live)$/);
      // Every button in the row is on screen, 44px or more, and nothing scrolls sideways.
      for (const b of await buttons.all()) {
        const r = (await b.boundingBox())!;
        expect(r.width).toBeGreaterThanOrEqual(44);
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await context.close();
    });
  }

  test("E9 and U76 the count goes up while a quick match game is live, and says so in words", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    const read = async () => {
      const text = await page.locator(testid("live-count")).innerText();
      return text === "No games live" ? 0 : Number(text.split(" ")[0]);
    };
    await expect.poll(async () => typeof (await read())).toBe("number");
    const before = await read();
    const pair = await quickPair(browser);
    await page.reload(); // the count is asked for when the screen opens
    await expect.poll(read, { timeout: 5_000 }).toBeGreaterThanOrEqual(before + 1);
    await context.close();
    await pair.one.context.close();
    await pair.two.context.close();
  });

  test("E9 and U77 tapping Watch live opens the watching screen", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    await page.locator(testid("watch-live")).click();
    await page.waitForURL(/\/watch$/);
    await expect(page.locator(`${testid("watching-banner")}:visible, ${testid("no-live-games")}:visible`)).toHaveCount(1);
    await context.close();
  });
});

test.describe("The watching screen (U78 to U83)", () => {
  for (const size of [PHONE, LAPTOP]) {
    test(`E9 and U78 and U80 the banner, both names, the board and the count show at ${size.width} x ${size.height}`, async ({ browser }) => {
      const { player, other, spectator } = await watching(browser, size);
      const nameA = await spectator.page.locator(testid("name-a")).innerText();
      const nameB = await spectator.page.locator(testid("name-b")).innerText();
      // U94: the banner names both players by nickname; the tags that tell two guests apart are in the panels.
      const bare = (name: string) => name.replace(/\s#[0-9a-f]{4}$/i, "");
      await expect(spectator.page.locator(testid("watching-banner"))).toHaveText(`Watching ${bare(nameA)} vs ${bare(nameB)}`);
      await expect(spectator.page.locator(testid("watching-count"))).toHaveText("1 watching");
      expect(nameA.length).toBeGreaterThan(2);
      await playRound(player.page, other.page, spectator.page, 1, 3, 5);
      // The spectator's board is the player's board: the computer may have chosen column 4 too (a crash leaves rubble),
      // so compare the two screens cell by cell, mirrored (the player's discs are "A" on their own screen, "A" here).
      const cells = async (page: Page) => page.locator('[data-testid^="cell-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.piece ?? ""));
      const mine = await cells(player.page);
      const theirs = await cells(spectator.page);
      expect(theirs.filter((p) => p !== "").length).toBeGreaterThan(0);
      expect(theirs.map((p) => (p === "A" || p === "B" ? "disc" : p))).toEqual(mine.map((p) => (p === "A" || p === "B" ? "disc" : p)));
      await expect(spectator.page.locator(testid("result-line"))).not.toHaveText("");
      for (const c of [player, other, spectator]) await c.context.close();
    });
  }

  test("E9 and U79 nothing on the watching screen is interactive: no columns, badges, ghost or timer, and only two buttons", async ({ browser }) => {
    const { player, other, spectator } = await watching(browser, PHONE);
    const page = spectator.page;
    for (const id of ["column-0", "column-3", "column-6", "shield-badge", "earthquake-badge", "shield-info", "earthquake-info", "ghost-disc", "timer"]) {
      await expect(page.locator(testid(id)), id).toHaveCount(0);
    }
    expect(await page.locator("[data-column]").count()).toBe(0);
    const controls = await page.locator("button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex='-1'])").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).getClientRects().length > 0).map((e) => (e as HTMLElement).dataset.testid ?? e.tagName).sort(),
    );
    expect(controls, "the only things you can act on").toEqual(["go-home", "watch-another"]);
    // Tapping and hovering the board does nothing: no ghost disc, no highlight, no message, nothing sent.
    const board = (await page.locator(testid("board-wrap")).boundingBox())!;
    await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
    await page.mouse.click(board.x + board.width / 2, board.y + board.height / 2);
    await expect(page.locator(".ghost")).toHaveCount(0);
    await expect(page.locator('.column-glow[data-on="true"]')).toHaveCount(0);
    // Keys do nothing either.
    for (const key of ["1", "4", "s", "e"]) await page.keyboard.press(key);
    await expect(player.page.locator(testid("opponent-status"))).toHaveText("Choosing");
    await expect(player.page.locator(testid("round-number"))).toHaveText("1");
    for (const c of [player, other, spectator]) await c.context.close();
  });

  test("E9 and U79 the player panels never say Choosing or Ready, and show the shield and Earthquake as icons (R72)", async ({ browser }) => {
    const { player, other, spectator } = await watching(browser, PHONE);
    const text = await spectator.page.locator(testid("players")).innerText();
    expect(text).not.toMatch(/choosing|ready|chosen/i);
    for (const id of ["shield-a", "shield-b", "quake-a", "quake-b"]) await expect(spectator.page.locator(testid(id))).toBeVisible();
    // After the player uses their shield it is struck through on the spectator's screen only once the round resolves.
    await player.page.locator(testid("shield-badge")).click();
    await player.page.locator(testid("column-2")).click();
    await expect(spectator.page.locator(testid("shield-a"))).toHaveAttribute("data-shield", "ready"); // not yet: the round is open
    await other.page.locator(testid("column-5")).click();
    await waitForRound(player.page, 2);
    await expect(spectator.page.locator(testid("shield-a"))).toHaveAttribute("data-shield", "used");
    for (const c of [player, other, spectator]) await c.context.close();
  });

  test("E9 and U79 and R72 nothing the spectator sees changes until the round resolves", async ({ browser }) => {
    const { player, other, spectator } = await watching(browser, PHONE);
    const before = await spectator.page.locator(testid("board-wrap")).innerHTML();
    await player.page.locator(testid("column-4")).click(); // chosen; the other player has not chosen yet
    await spectator.page.waitForTimeout(400);
    expect(await spectator.page.locator(testid("board-wrap")).innerHTML()).toBe(before);
    expect(await spectator.page.locator(testid("round-number")).innerText()).toBe("1");
    await other.page.locator(testid("column-5")).click();
    await waitForRound(player.page, 2);
    await expect(spectator.page.locator(testid("round-number"))).toHaveText("2", { timeout: 4_000 });
    for (const c of [player, other, spectator]) await c.context.close();
  });

  test("E9 and U79 the buttons are 44px or more and Home goes home", async ({ browser }) => {
    const { player, other, spectator } = await watching(browser, PHONE);
    for (const id of ["watch-another", "go-home"]) {
      const box = (await spectator.page.locator(`${testid(id)}:visible`).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
    await spectator.page.locator(`${testid("go-home")}:visible`).click();
    await spectator.page.waitForURL(/\/$/);
    for (const c of [player, other, spectator]) await c.context.close();
  });

  test("E9 and U81 with no quick match game live, Watch live says so and offers Quick match and Home", async ({ browser }) => {
    // Whether a quick match game is live depends on what else the shared app has going, so the server's answer is played
    // into the real page, as the server would send it. The server side is W14 in spec/unit-spectating.test.ts.
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.routeWebSocket(/\/ws$/, (ws) => {
      ws.onMessage(() => ws.send(JSON.stringify({ type: "none_live" })));
    });
    await page.goto("/watch");
    const card = page.locator(testid("no-live-games"));
    await expect(card).toBeVisible();
    await expect(card).toContainText("No live games right now");
    await expect(card.getByRole("link", { name: "Quick match" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Home" })).toBeVisible();
    await context.close();
  });

  test("E9 and U92 the third person to open a link becomes a spectator, told why, with Home only", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await one.page.request.post("/api/games")).json()).code as string;
    await one.page.goto(`/g/${code}`);
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    await waitForRound(two.page, 1);
    const three = await newPlayer(browser, NARROW, { reducedMotion: true });
    await three.page.goto(`/g/${code}`);
    await three.page.waitForURL(/\/watch\?game=.*via=link/);
    await expect(three.page.locator(testid("spectator-notice"))).toHaveText("This game already has two players, so you're watching.");
    await expect(three.page.locator(testid("name-a"))).not.toHaveText("Player");
    const notice = (await three.page.locator(testid("spectator-notice")).boundingBox())!;
    expect(notice.height, "the notice is one line at 320 wide").toBeLessThan(30);
    expect(notice.x).toBeGreaterThanOrEqual(0);
    expect(notice.x + notice.width, "inside the screen").toBeLessThanOrEqual(320);
    expect(await three.page.locator(testid("spectator-notice")).evaluate((e) => e.scrollWidth <= e.clientWidth), "not cut off").toBe(true);
    await expect(three.page.locator(testid("watch-another"))).toBeHidden();
    await expect(three.page.locator(`${testid("go-home")}:visible`)).toBeVisible();
    // The players still hold their seats and the spectator cannot choose.
    await expect(three.page.locator(testid("column-3"))).toHaveCount(0);
    await expect(one.page.locator(testid("watcher-count-text"))).toHaveText("1");
    for (const c of [one, two, three]) await c.context.close();
  });

  test("E9 and U84 a second spectator makes it 2 for the player and for the first spectator, and 1 again when they leave", async ({ browser }) => {
    const { player, spectator, code } = await watching(browser, PHONE);
    await expect(player.page.locator(testid("watcher-count-text"))).toHaveText("1");
    expect(await player.page.locator(testid("watcher-count")).evaluate((e) => (e as HTMLElement).textContent!.trim())).toBe("1 watching"); // the accessible name
    const second = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await second.page.goto(`/watch?game=${code}`);
    await expect(second.page.locator(testid("watching-count"))).toHaveText("2 watching");
    await expect(player.page.locator(testid("watcher-count-text"))).toHaveText("2");
    expect(await player.page.locator(testid("watcher-count")).evaluate((e) => (e as HTMLElement).textContent!.trim())).toBe("2 watching");
    await expect(spectator.page.locator(testid("watching-count"))).toHaveText("2 watching");
    await second.context.close();
    await expect(player.page.locator(testid("watcher-count-text"))).toHaveText("1");
    expect(await player.page.locator(testid("watcher-count")).evaluate((e) => (e as HTMLElement).textContent!.trim())).toBe("1 watching");
    await expect(spectator.page.locator(testid("watching-count"))).toHaveText("1 watching");
    await spectator.context.close();
    await expect(player.page.locator(testid("watcher-count"))).toBeHidden(); // everyone has left
    await player.context.close();
  });

  test("E9 and R70 and R71 a link game is never in Watch live, and a computer game cannot be watched even by its code", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const computer = (await (await one.page.request.post("/api/computer")).json()).code as string;
    await one.page.goto(`/g/${computer}`);
    await waitForRound(one.page, 1);
    const ask = async (game: string) => {
      const page = await newPlayer(browser, PHONE, { reducedMotion: true });
      await page.page.goto(`/watch?game=${game}`);
      await expect(page.page.locator(testid("watch-message"))).toHaveText("That game cannot be watched. Try another.");
      const state = { board: await page.page.locator(testid("board-wrap")).innerText(), names: await page.page.locator(testid("name-a")).innerText() };
      await page.context.close();
      return state;
    };
    // The same words and the same empty screen as a code that does not exist.
    expect(await ask(computer)).toEqual(await ask("ZZZZZZ"));
    await expect(one.page.locator(testid("watcher-count"))).toBeHidden();
    await one.context.close();
  });
});

test.describe("Watching to the end of a game (U82)", () => {
  test("E9 and U82 a game won by four in a row shows its result and a count down, and then the spectator moves on by itself", async ({ browser }) => {
    const { one, two, code } = await quickPair(browser);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto(`/watch?game=${code}`); // this very game, so the check below always runs
    await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
    // Player one stacks column 0 and player two plays columns 5 and 6 in turn, so only player one makes four.
    for (let round = 1; round <= 4; round++) {
      await one.page.locator(testid("column-0")).click();
      await two.page.locator(testid(`column-${5 + (round % 2)}`)).click();
      if (round < 4) {
        await waitForRound(one.page, round + 1);
        await waitForRound(two.page, round + 1);
      }
    }
    await expect(one.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 3_000 });
    const card = spectator.page.locator(testid("watch-result"));
    await expect(card).toBeVisible({ timeout: 3_000 });
    await expect(spectator.page.locator(testid("watch-result-title"))).toContainText("wins!");
    await expect(spectator.page.locator(testid("watch-result-next"))).toContainText("Next game in");
    await expect(spectator.page.locator(testid("cell-0-3"))).toHaveAttribute("data-piece", "A"); // the winning four is on the board
    // After 5 seconds the browser asks for another game by itself, and the card goes.
    await expect(card).toBeHidden({ timeout: 9_000 });
    // The answer to "another game" is a live quick match game, or the card that says none is live (R80).
    await expect(spectator.page.locator(`${testid("watching-banner")}:visible, ${testid("no-live-games")}:visible`)).toHaveCount(1);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("E9 and U82 Watch another game moves on at once from a finished game, asks for a new game and the result card goes", async ({ browser }) => {
    const { one, two, code } = await quickPair(browser);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    // Watch the socket's frames from before the page opens, so nothing is missed.
    const frames: Array<{ dir: "sent" | "received"; body: any }> = [];
    spectator.page.on("websocket", (ws) => {
      ws.on("framesent", (f) => frames.push({ dir: "sent", body: JSON.parse(String(f.payload)) }));
      ws.on("framereceived", (f) => frames.push({ dir: "received", body: JSON.parse(String(f.payload)) }));
    });
    await spectator.page.goto(`/watch?game=${code}`);
    await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
    const watched = frames.find((f) => f.dir === "received" && f.body.type === "spectating")!.body.code;
    expect(watched).toBe(code);
    for (let round = 1; round <= 4; round++) {
      await one.page.locator(testid("column-0")).click();
      await two.page.locator(testid(`column-${5 + (round % 2)}`)).click();
      if (round < 4) {
        await waitForRound(one.page, round + 1);
        await waitForRound(two.page, round + 1);
      }
    }
    const card = spectator.page.locator(testid("watch-result"));
    await expect(card).toBeVisible({ timeout: 3_000 });
    const before = frames.length;
    await spectator.page.locator(testid("watch-another")).click(); // at once, without waiting the 5 seconds
    // Moving on sends a new spectate (with no code: a random live game) and brings a new snapshot.
    await expect.poll(() => frames.slice(before).some((f) => f.dir === "sent" && f.body.type === "spectate" && f.body.code === undefined), { timeout: 2_000 }).toBe(true);
    // The answer is another live quick match game, or "none live" when this was the only one (R70, R80).
    await expect.poll(() => frames.slice(before).some((f) => f.dir === "received" && (f.body.type === "spectating" || f.body.type === "none_live")), { timeout: 2_000 }).toBe(true);
    await expect(card).toBeHidden({ timeout: 2_000 });
    // The game that just ended is not offered again (R76).
    const next = frames.slice(before).find((f) => f.dir === "received" && (f.body.type === "spectating" || f.body.type === "none_live"))!.body;
    if (next.type === "spectating") expect(next.code).not.toBe(code);
    for (const c of [one, two, spectator]) await c.context.close();
  });
});

test.describe("A game that stops while watched (U83)", () => {
  test("E9 and U83 when a player leaves and does not return, the spectator is told the game has ended", async ({ browser }) => {
    const { one, two, code } = await quickPair(browser);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto(`/watch?game=${code}`);
    await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
    await two.context.close(); // the second player closes their tab and never returns: a forfeit after the 30 second grace (R27)
    await expect(spectator.page.locator(testid("watch-result-title"))).toHaveText("That game has ended", { timeout: 45_000 });
    await expect(spectator.page.locator(testid("watch-result-next"))).toHaveText("Next game in 5 seconds");
    await expect(spectator.page.locator(testid("result-line"))).toContainText("A player left the game.");
    await one.context.close();
    await spectator.context.close();
  });
});

test.describe("Watching fits the phone (promise 4)", () => {
  test("E9 and U94 with ordinary names at 320 x 568 the banner shows both players on one line, whole, and is not cut off", async ({ browser }) => {
    const { one, two, code } = await quickPair(browser, [PHONE, LAPTOP], {});
    const spectator = await newPlayer(browser, NARROW, { reducedMotion: true });
    await spectator.page.goto(`/watch?game=${code}`);
    await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
    const banner = spectator.page.locator(testid("watching-banner"));
    const text = (await banner.textContent())!; // "Watching" is hidden at 320 but is still in the text that is read out
    const clipped = await banner.evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    expect(text).toMatch(/^Watching .+ vs .+$/);
    expect(await banner.innerText(), "both names show, with no ellipsis").toMatch(/vs\s+\S/);
    expect(await banner.innerText()).not.toContain("\u2026");
    expect(clipped, `the banner "${text}" is cut off`).toBe(false);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("E9, U68, U78, U84 and C20 the tightest case at 320 x 568: the widest nicknames, a spectator and the ceiling warning all showing, and everything still fits", async ({ browser }) => {
    // Round 12 on the watching screen has a round number, the banner, the count and the ceiling warning: the worst case for the
    // status row. A quick match pair resolves each round the moment both choose, so reaching it is quick (correction C20).
    const { one, two, code } = await withQuickQueue(async () => {
      const drain = await newPlayer(browser, PHONE);
      const first = await (await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
      if (first.state === "waiting") await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`);
      await drain.context.close();
      const one = await newPlayer(browser, NARROW, { reducedMotion: true });
      const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
      await one.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
      await two.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
      await one.page.request.post(`/api/quick/${crypto.randomUUID()}`);
      const code = (await (await two.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json()).code as string;
      return { one, two, code };
    });
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    const spectator = await newPlayer(browser, NARROW, { reducedMotion: true });
    await spectator.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
    await spectator.page.goto(`/watch?game=${code}`);
    await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
    for (let round = 1; round <= 11; round++) {
      const column = (round - 1) % 7;
      await one.page.locator(testid(`column-${column}`)).click();
      await two.page.locator(testid(`column-${column}`)).click();
      await waitForRound(one.page, round + 1);
    }
    for (const [name, page] of [["watching", spectator.page], ["player", one.page]] as const) {
      await expect(page.locator(testid("shrink-warning")), name).toBeVisible();
      const wide = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => !e.closest(".bubbles") && e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(e).display !== "none").map((e) => `${e.dataset.testid ?? e.className} ${Math.round(e.getBoundingClientRect().right)}`).slice(0, 8));
      expect(wide, `${name}: sideways`).toEqual([]);
      const box = async (id: string) => (await page.locator(testid(id)).boundingBox())!;
      const items = name === "watching" ? ["round-line", "watching-banner", "watching-count", "shrink-warning"] : ["round-line", "watcher-count", "shrink-warning"];
      for (const id of items) {
        const b = await box(id);
        expect(b.height, `${name}: ${id} is one line`).toBeLessThan(30);
        expect(b.x, `${name}: ${id} inside the screen`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${name}: ${id} inside the board's width`).toBeLessThanOrEqual(316);
      }
      // No two items in the row overlap.
      const boxes = await Promise.all(items.map(box));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const apart = boxes[i].x + boxes[i].width <= boxes[j].x + 1 || boxes[j].x + boxes[j].width <= boxes[i].x + 1 || boxes[i].y + boxes[i].height <= boxes[j].y + 1 || boxes[j].y + boxes[j].height <= boxes[i].y + 1;
          expect(apart, `${name}: ${items[i]} and ${items[j]} do not overlap`).toBe(true);
        }
      }
    }
    for (const id of ["watch-another", "go-home"]) {
      const b = (await spectator.page.locator(`${testid(id)}:visible`).boundingBox())!;
      expect(b.y + b.height, `${id} is on the first screen with everything showing`).toBeLessThanOrEqual(568);
    }
    const timer = (await one.page.locator(testid("timer")).boundingBox())!;
    expect(timer.y + timer.height, "the players' timer bar is on the first screen").toBeLessThanOrEqual(568);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("E9 and U78 and U79 with the widest nicknames at 320 x 568 nothing scrolls sideways, the board and both buttons are on screen and nothing overlaps", async ({ browser }) => {
    const { player, other, spectator } = await watching(browser, NARROW, { names: true });
    const page = spectator.page;
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = async (id: string) => (await page.locator(`${testid(id)}:visible`).boundingBox())!;
    const banner = await box("watching-banner");
    const count = await box("watching-count");
    const round = await box("round-line");
    const board = await box("board-wrap");
    // "Watching <name> vs <name>" has its own line (U94): below the round line and the count, inside the screen, never over them.
    expect(banner.x, "the banner is inside the screen").toBeGreaterThanOrEqual(0);
    expect(banner.x + banner.width, "the banner is inside the screen").toBeLessThanOrEqual(320);
    expect(banner.y, "the banner is below the round line and the count").toBeGreaterThanOrEqual(Math.max(round.y + round.height, count.y + count.height) - 1);
    expect(round.x + round.width, "the round line and the count do not overlap").toBeLessThanOrEqual(count.x + 1);
    expect(banner.y + banner.height, "the banner does not cover the board").toBeLessThanOrEqual(board.y + 1);
    for (const id of ["watch-another", "go-home"]) {
      const b = await box(id);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width, id).toBeLessThanOrEqual(320);
      expect(b.y + b.height, `${id} is on the first screen`).toBeLessThanOrEqual(568);
    }
    const lowest = await box("cell-0-0");
    expect(lowest.y + lowest.height).toBeLessThanOrEqual(568);
    for (const c of [player, other, spectator]) await c.context.close();
  });

  test("E9 and U84 the players' screen at 320 x 568 keeps the watcher count on the round line and the board and timer on the first screen", async ({ browser }) => {
    const { one: player, two: other, code } = await quickPair(browser, [NARROW, PHONE], { names: true });
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto(`/watch?game=${code}`);
    await expect.poll(async () => await player.page.locator(testid("watcher-count")).isVisible(), { timeout: 4_000 }).toBeTruthy();
    const box = async (id: string) => (await player.page.locator(testid(id)).boundingBox())!;
    const round = await box("round-line");
    const count = await box("watcher-count");
    expect(Math.abs(count.y - round.y), "the count is on the round line's row").toBeLessThan(12);
    expect(count.x).toBeGreaterThanOrEqual(round.x + round.width);
    const timer = await box("timer");
    expect(timer.y + timer.height, "the timer bar is on the first screen").toBeLessThanOrEqual(568);
    expect(await player.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const c of [player, other, spectator]) await c.context.close();
  });
});
