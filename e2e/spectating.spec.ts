// Browser checks for spectating (docs/design/spectating.md U76 to U84, rules R70 to R80). Run with
// pnpm test:e2e, never in pnpm check. A computer game is watchable, so each check makes one and watches it.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { newPlayer, testid, waitForRound } from "./helpers.ts";

// A player in a game against the computer, and a spectator at the size under test.
async function watching(browser: Browser, size: { width: number; height: number }, options: { reducedMotion?: boolean; names?: boolean } = {}) {
  const player = await newPlayer(browser, PHONE, { reducedMotion: options.reducedMotion });
  const spectator = await newPlayer(browser, size, { reducedMotion: options.reducedMotion });
  if (options.names) {
    await player.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
    await spectator.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
  }
  const res = await player.page.request.post("/api/computer");
  const code = (await res.json()).code as string;
  await player.page.goto(`/g/${code}`);
  await waitForRound(player.page, 1);
  await spectator.page.goto(`/watch?game=${code}`); // this very game: other checks have games live too
  await expect(spectator.page.locator(testid("name-a"))).not.toHaveText("Player");
  return { player, spectator, code };
}

// The computer is the only one who can be the opposite seat, so the human chooses and the round resolves at once.
async function playRound(player: Page, spectator: Page, round: number, column: number): Promise<void> {
  await player.locator(testid(`column-${column}`)).click();
  await waitForRound(player, round + 1);
  await expect(spectator.locator(testid("round-number"))).toHaveText(String(round + 1), { timeout: 4_000 });
}

test.describe("The home screen (U76, U77)", () => {
  for (const viewport of [NARROW, PHONE, LAPTOP]) {
    test(`U76 and U77 the Watch live button is first in the icon row, 44px or more, with its count, at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
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

  test("U76 the count goes up by one while a computer game is live, and says so in words", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    const read = async () => {
      const text = await page.locator(testid("live-count")).innerText();
      return text === "No games live" ? 0 : Number(text.split(" ")[0]);
    };
    await expect.poll(async () => typeof (await read())).toBe("number");
    const before = await read();
    const other = await newPlayer(browser, PHONE);
    const code = (await (await other.page.request.post("/api/computer")).json()).code as string;
    await other.page.goto(`/g/${code}`);
    await waitForRound(other.page, 1);
    await page.reload(); // the count is asked for when the screen opens
    await expect.poll(read, { timeout: 5_000 }).toBeGreaterThanOrEqual(before + 1);
    await context.close();
    await other.context.close();
  });

  test("U77 tapping Watch live opens the watching screen", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE);
    await page.goto("/");
    await page.locator(testid("watch-live")).click();
    await page.waitForURL(/\/watch$/);
    await expect(page.locator(testid("watching-banner"))).toBeVisible();
    await context.close();
  });
});

test.describe("The watching screen (U78 to U83)", () => {
  for (const size of [PHONE, LAPTOP]) {
    test(`U78 and U80 the banner, both names, the board and the count show at ${size.width} x ${size.height}`, async ({ browser }) => {
      const { player, spectator } = await watching(browser, size, { reducedMotion: true });
      await expect(spectator.page.locator(testid("watching-banner"))).toHaveText("Watching live");
      await expect(spectator.page.locator(testid("watching-count"))).toHaveText("1 watching");
      await expect(spectator.page.locator(testid("name-b"))).toHaveText("Computer");
      expect((await spectator.page.locator(testid("name-a")).innerText()).length).toBeGreaterThan(2);
      await playRound(player.page, spectator.page, 1, 3);
      // The spectator's board is the player's board: the computer may have chosen column 4 too (a crash leaves rubble),
      // so compare the two screens cell by cell, mirrored (the player's discs are "A" on their own screen, "A" here).
      const cells = async (page: Page) => page.locator('[data-testid^="cell-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.piece ?? ""));
      const mine = await cells(player.page);
      const theirs = await cells(spectator.page);
      expect(theirs.filter((p) => p !== "").length).toBeGreaterThan(0);
      expect(theirs.map((p) => (p === "A" || p === "B" ? "disc" : p))).toEqual(mine.map((p) => (p === "A" || p === "B" ? "disc" : p)));
      await expect(spectator.page.locator(testid("result-line"))).not.toHaveText("");
      await player.context.close();
      await spectator.context.close();
    });
  }

  test("U79 nothing on the watching screen is interactive: no columns, badges, ghost or timer, and only two buttons", async ({ browser }) => {
    const { player, spectator } = await watching(browser, PHONE, { reducedMotion: true });
    const page = spectator.page;
    for (const id of ["column-0", "column-3", "column-6", "shield-badge", "earthquake-badge", "shield-info", "earthquake-info", "ghost-disc", "timer"]) {
      await expect(page.locator(testid(id)), id).toHaveCount(0);
    }
    expect(await page.locator("[data-column]").count()).toBe(0);
    const controls = await page.locator("button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex='-1'])").evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.testid ?? e.tagName).sort(),
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
    await player.context.close();
    await spectator.context.close();
  });

  test("U79 the player panels never say Choosing or Ready, and show the shield and Earthquake as icons (R72)", async ({ browser }) => {
    const { player, spectator } = await watching(browser, PHONE, { reducedMotion: true });
    const text = await spectator.page.locator(testid("players")).innerText();
    expect(text).not.toMatch(/choosing|ready|chosen/i);
    for (const id of ["shield-a", "shield-b", "quake-a", "quake-b"]) await expect(spectator.page.locator(testid(id))).toBeVisible();
    // After the player uses their shield it is struck through on the spectator's screen only once the round resolves.
    await player.page.locator(testid("shield-badge")).click();
    await player.page.locator(testid("column-2")).click();
    await expect(spectator.page.locator(testid("shield-a"))).toHaveAttribute("data-shield", "ready"); // not yet: the round is open
    await waitForRound(player.page, 2);
    await expect(spectator.page.locator(testid("shield-a"))).toHaveAttribute("data-shield", "used");
    await player.context.close();
    await spectator.context.close();
  });

  test("U79 and R72 nothing the spectator sees changes until the round resolves", async ({ browser }) => {
    const { player, spectator } = await watching(browser, PHONE, { reducedMotion: true });
    const before = await spectator.page.locator(testid("board-wrap")).innerHTML();
    await player.page.locator(testid("column-4")).click(); // chosen; the computer thinks for 1 to 3 seconds (R52)
    await spectator.page.waitForTimeout(400);
    expect(await spectator.page.locator(testid("board-wrap")).innerHTML()).toBe(before);
    expect(await spectator.page.locator(testid("round-number")).innerText()).toBe("1");
    await waitForRound(player.page, 2);
    await expect(spectator.page.locator(testid("round-number"))).toHaveText("2", { timeout: 4_000 });
    await player.context.close();
    await spectator.context.close();
  });

  test("U79 the buttons are 44px or more and Home goes home", async ({ browser }) => {
    const { player, spectator } = await watching(browser, PHONE, { reducedMotion: true });
    for (const id of ["watch-another", "go-home"]) {
      const box = (await spectator.page.locator(testid(id)).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
    await spectator.page.locator(testid("go-home")).click();
    await spectator.page.waitForURL(/\/$/);
    await player.context.close();
    await spectator.context.close();
  });

  test("U81 an exhibition game is labelled, between two computers, and plays by itself", async ({ browser }) => {
    // Other checks may have games live, and a random request would then be placed in one of them. The exhibition game
    // is shown when nothing is live, so ask until one is offered; if the app is busy for the whole wait, say so rather
    // than pass without checking (the unit check W8 covers the rule itself).
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    let seen = false;
    for (let attempt = 0; attempt < 20 && !seen; attempt++) {
      await page.goto("/watch");
      await expect(page.locator(testid("name-a"))).not.toHaveText("Player");
      seen = (await page.locator(testid("watching-banner")).innerText()).startsWith("Exhibition");
      if (!seen) await page.waitForTimeout(1_500);
    }
    test.skip(!seen, "other games were live for the whole wait, so no exhibition game was offered (rule checked by W8)");
    await expect(page.locator(testid("watching-banner"))).toHaveText("Exhibition: Computer vs Computer");
    await expect(page.locator(testid("name-a"))).toHaveText("Computer 1");
    await expect(page.locator(testid("name-b"))).toHaveText("Computer 2");
    await expect(page.locator(testid("round-number"))).not.toHaveText("1", { timeout: 8_000 }); // they play by themselves
    await context.close();
  });

  test("U84 a second spectator makes it 2 for the player and for the first spectator, and 1 again when they leave", async ({ browser }) => {
    const { player, spectator, code } = await watching(browser, PHONE, { reducedMotion: true });
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

  test("U84 and R71 a friend game never shows a count, and asking for it by its code is answered like a game that does not exist", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await one.page.request.post("/api/games")).json()).code as string;
    await one.page.goto(`/g/${code}`);
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await two.page.goto(`/g/${code}`);
    await waitForRound(one.page, 1);
    const ask = async (game: string) => {
      const page = (await newPlayer(browser, PHONE, { reducedMotion: true }));
      await page.page.goto(`/watch?game=${game}`);
      await expect(page.page.locator(testid("watch-message"))).toHaveText("That game cannot be watched. Try another.");
      const state = { board: await page.page.locator(testid("board-wrap")).innerText(), banner: await page.page.locator(testid("watching-banner")).innerText(), names: await page.page.locator(testid("name-a")).innerText() };
      await page.context.close();
      return state;
    };
    // The same words and the same empty screen as a code that does not exist: nothing reveals that it is a game.
    expect(await ask(code)).toEqual(await ask("ZZZZZZ"));
    await expect(one.page.locator(testid("watcher-count"))).toBeHidden();
    await expect(two.page.locator(testid("watcher-count"))).toBeHidden();
    for (const c of [one, two]) await c.context.close();
  });
});

// Two players paired by Quick match (a watchable kind of game, R71), each in their own context.
async function quickPair(browser: Browser) {
  const drain = await newPlayer(browser, PHONE);
  const first = await (await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`)).json();
  if (first.state === "waiting") await drain.page.request.post(`/api/quick/${crypto.randomUUID()}`);
  await drain.context.close();
  const one = await newPlayer(browser, PHONE, { reducedMotion: true });
  const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
  const ticketOne = crypto.randomUUID();
  const ticketTwo = crypto.randomUUID();
  await one.page.request.post(`/api/quick/${ticketOne}`);
  const matched = await (await two.page.request.post(`/api/quick/${ticketTwo}`)).json();
  const code = matched.code as string;
  await one.page.goto(`/g/${code}`);
  await two.page.goto(`/g/${code}`);
  await waitForRound(one.page, 1);
  await waitForRound(two.page, 1);
  return { one, two, code };
}

test.describe("Watching to the end of a game (U82)", () => {
  test("U82 a game won by four in a row shows its result and a count down, and then the spectator moves on by itself", async ({ browser }) => {
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
    await expect(spectator.page.locator(testid("watching-banner"))).toBeVisible();
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("U82 Watch another game moves on at once from a finished game, asks for a new game and the result card goes", async ({ browser }) => {
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
    await expect.poll(() => frames.slice(before).some((f) => f.dir === "received" && f.body.type === "spectating"), { timeout: 2_000 }).toBe(true);
    await expect(card).toBeHidden({ timeout: 2_000 });
    // The game that just ended is not offered again while another is live (R76): the exhibition game, or another live game, is shown.
    const next = frames.slice(before).find((f) => f.dir === "received" && f.body.type === "spectating")!.body;
    expect(next.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(next.state.round, "a game in progress, not the finished one").toBeLessThan(20);
    for (const c of [one, two, spectator]) await c.context.close();
  });
});

test.describe("A game that stops while watched (U83)", () => {
  test("U83 when a player leaves and does not return, the spectator is told the game has ended", async ({ browser }) => {
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
  test("U68, U78, U84 and C20 the tightest case at 320 x 568: the widest nicknames, a spectator and the ceiling warning all showing, and everything still fits", async ({ browser }) => {
    // Round 12 on the watching screen has a round number, the banner, the count and the ceiling warning: the worst case for the
    // status row. A quick match pair resolves each round the moment both choose, so reaching it is quick (correction C20).
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
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name}: sideways`).toBeLessThanOrEqual(0);
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
      const b = (await spectator.page.locator(testid(id)).boundingBox())!;
      expect(b.y + b.height, `${id} is on the first screen with everything showing`).toBeLessThanOrEqual(568);
    }
    const timer = (await one.page.locator(testid("timer")).boundingBox())!;
    expect(timer.y + timer.height, "the players' timer bar is on the first screen").toBeLessThanOrEqual(568);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("U78 and U79 with the widest nicknames at 320 x 568 nothing scrolls sideways, the board and both buttons are on screen and nothing overlaps", async ({ browser }) => {
    const { player, spectator } = await watching(browser, NARROW, { reducedMotion: true, names: true });
    const page = spectator.page;
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = async (id: string) => (await page.locator(testid(id)).boundingBox())!;
    const banner = await box("watching-banner");
    const count = await box("watching-count");
    const round = await box("round-line");
    const board = await box("board-wrap");
    expect(banner.x + banner.width, "the banner and the count do not overlap").toBeLessThanOrEqual(count.x + 1);
    expect(round.x + round.width, "the round line and the banner share one row without overlapping").toBeLessThanOrEqual(banner.x + 1);
    expect(Math.abs(round.y + round.height / 2 - (banner.y + banner.height / 2)), "on the same row").toBeLessThan(10);
    expect(banner.y + banner.height, "the banner does not cover the board").toBeLessThanOrEqual(board.y + 1);
    for (const id of ["watch-another", "go-home"]) {
      const b = await box(id);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width, id).toBeLessThanOrEqual(320);
      expect(b.y + b.height, `${id} is on the first screen`).toBeLessThanOrEqual(568);
    }
    const lowest = await box("cell-0-0");
    expect(lowest.y + lowest.height).toBeLessThanOrEqual(568);
    await player.context.close();
    await spectator.context.close();
  });

  test("U84 the players' screen at 320 x 568 keeps the watcher count on the round line and the board and timer on the first screen", async ({ browser }) => {
    const player = await newPlayer(browser, NARROW, { reducedMotion: true });
    await player.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } });
    const code = (await (await player.page.request.post("/api/computer")).json()).code as string;
    await player.page.goto(`/g/${code}`);
    await waitForRound(player.page, 1);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto("/watch");
    await expect.poll(async () => await player.page.locator(testid("watcher-count")).isVisible(), { timeout: 4_000 }).toBeTruthy();
    const box = async (id: string) => (await player.page.locator(testid(id)).boundingBox())!;
    const round = await box("round-line");
    const count = await box("watcher-count");
    expect(Math.abs(count.y - round.y), "the count is on the round line's row").toBeLessThan(12);
    expect(count.x).toBeGreaterThanOrEqual(round.x + round.width);
    const timer = await box("timer");
    expect(timer.y + timer.height, "the timer bar is on the first screen").toBeLessThanOrEqual(568);
    expect(await player.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await player.context.close();
    await spectator.context.close();
  });
});
