// Player colours and the start countdown in the browser (Q14, U133, U134, R93, R94, R97). Run with pnpm test:e2e.
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, PHONE } from "../playwright.config.ts";
import { chooseColumn, makeGameCode, newPlayer, testid, waitForRound } from "./helpers.ts";

test.use({ actionTimeout: 8_000 });

// The colour and marker each cell is drawn with, read from what is painted: a red disc has a ring, a yellow disc a cross.
async function drawn(page: Page, cell: string): Promise<{ seat: string; colour: string; background: string; marker: string }> {
  return page.locator(testid(cell)).evaluate((el) => {
    const piece = el.querySelector<HTMLElement>(".piece");
    const after = piece ? getComputedStyle(piece, "::after") : null;
    const before = piece ? getComputedStyle(piece, "::before") : null;
    // A ring is a bordered ::after; a cross is a rotated bar in both ::before and ::after.
    const marker = !piece ? "none" : after && after.borderTopWidth !== "0px" && after.content !== "none" ? "ring" : before && before.content !== "none" ? "cross" : "none";
    return { seat: (el as HTMLElement).dataset.piece ?? "", colour: piece?.dataset.colour ?? "", background: piece ? getComputedStyle(piece).backgroundColor : "", marker };
  });
}

test.describe("Q14 players look the same to everyone, and each is told their colour (U133, U134)", () => {
  test("Q14 R94 in a friend game both screens and a spectator's show the same seat in the same colour and marker", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    // U133: each player is told their own colour, and the two colours differ.
    const told = async (page: Page) => {
      await expect(page.locator(testid("get-ready"))).toBeVisible();
      return (await page.locator(testid("you-are")).innerText()).trim();
    };
    const [saysOne, saysTwo] = await Promise.all([told(one.page), told(two.page)]);
    expect(["You are Red", "You are Yellow"]).toContain(saysOne);
    expect(["You are Red", "You are Yellow"]).toContain(saysTwo);
    expect(saysOne, "the two players have different colours").not.toBe(saysTwo);
    // The large disc on the card is the player's own colour, with its marker.
    const bigDisc = await one.page.locator(testid("you-are-disc")).evaluate((el) => (el as HTMLElement).dataset.colour);
    expect(bigDisc).toBe(saysOne === "You are Red" ? "red" : "yellow");
    await expect(one.page.locator(testid("get-ready"))).toBeHidden({ timeout: 5_000 });

    // One round: player one in column 0, player two in column 4.
    await chooseColumn(one.page, 0);
    await chooseColumn(two.page, 4);
    await waitForRound(one.page, 2);
    await waitForRound(two.page, 2);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto(`/g/${code}`); // both seats taken: a spectator (R36)
    await spectator.page.waitForURL(/\/watch\?game=/);
    await expect(spectator.page.locator(testid("cell-0-0"))).toHaveAttribute("data-piece", /^[AB]$/);

    for (const cell of ["cell-0-0", "cell-4-0"]) {
      const seen = await Promise.all([one.page, two.page, spectator.page].map((p) => drawn(p, cell)));
      expect(seen[1], `${cell}: the second player sees the same as the first`).toEqual(seen[0]);
      expect(seen[2], `${cell}: the spectator sees the same as the players`).toEqual(seen[0]);
      expect(seen[0].marker, `${cell}: red has a ring, yellow a cross`).toBe(seen[0].colour === "red" ? "ring" : "cross");
    }
    const mine = await drawn(one.page, "cell-0-0");
    expect(mine.colour, "player one's disc is the colour they were told").toBe(saysOne === "You are Red" ? "red" : "yellow");
    // Each panel wears its player's colour on every screen.
    await expect(one.page.locator(testid("panel-you"))).toHaveAttribute("data-colour", mine.colour);
    await expect(two.page.locator(testid("panel-opponent"))).toHaveAttribute("data-colour", mine.colour);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("R97 U133 the board is locked during the countdown and no timer shows; round 1 opens after it", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await expect(one.page.locator(testid("get-ready"))).toBeVisible();
    await expect(one.page.locator(testid("countdown-number"))).toHaveText(/^[123]$/);
    await expect(one.page.locator(testid("timer"))).toBeHidden();
    await expect(one.page.locator(testid("column-3"))).toHaveAttribute("aria-disabled", "true");
    await one.page.locator(testid("column-3")).click({ force: true }); // a tap during the countdown chooses nothing
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("");
    const shownAt = Date.now();
    await expect(one.page.locator(testid("get-ready"))).toBeHidden({ timeout: 5_000 });
    expect(Date.now() - shownAt, "the countdown lasts about 3 seconds").toBeGreaterThan(1_500);
    await expect(one.page.locator(testid("timer"))).toBeVisible();
    await chooseColumn(one.page, 3);
    await expect(one.page.locator(testid("chosen-label"))).toHaveText("Chosen");
    for (const c of [one, two]) await c.context.close();
  });

  test("R97 U133 a game against the computer counts down too, under reduced motion, with the same words", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await expect(page.locator(testid("get-ready"))).toBeVisible();
    await expect(page.locator(testid("you-are"))).toHaveText(/^You are (Red|Yellow)$/);
    await expect(page.locator(testid("get-ready"))).toBeHidden({ timeout: 5_000 });
    await context.close();
  });
});

// Q22, U153: the avatar wears the player's disc colour and a ring or cross badge, on every screen of one game.
async function avatarLook(page: Page, avatar: string): Promise<{ colour: string; background: string; badge: string }> {
  return page.locator(testid(avatar)).evaluate((el) => {
    const badge = el.querySelector<HTMLElement>(".avatar-badge");
    return { colour: (el as HTMLElement).dataset.colour ?? "", background: getComputedStyle(el).backgroundColor, badge: badge?.dataset.marker ?? "none" };
  });
}

test.describe("Q22 the avatar carries the disc colour and marker (U153)", () => {
  test("Q22 U153 both players' screens and a spectator's show each avatar in its disc colour with a ring or cross badge", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await expect(one.page.locator(testid("get-ready"))).toBeHidden({ timeout: 8_000 });
    await chooseColumn(one.page, 0);
    await chooseColumn(two.page, 4);
    await waitForRound(one.page, 2);
    const spectator = await newPlayer(browser, PHONE, { reducedMotion: true });
    await spectator.page.goto(`/g/${code}`);
    await spectator.page.waitForURL(/\/watch\?game=/);

    const mineOnOne = await avatarLook(one.page, "avatar-you");
    const theirsOnOne = await avatarLook(one.page, "avatar-opponent");
    const mineOnTwo = await avatarLook(two.page, "avatar-opponent"); // player one, seen from player two's screen
    const spectatorA = await avatarLook(spectator.page, "avatar-a");
    const spectatorB = await avatarLook(spectator.page, "avatar-b");
    expect(["red", "yellow"]).toContain(mineOnOne.colour);
    expect(theirsOnOne.colour, "the two players differ").not.toBe(mineOnOne.colour);
    expect(mineOnTwo, "player one looks the same on player two's screen").toEqual(mineOnOne);
    expect([spectatorA, spectatorB], "and on the spectator's screen").toContainEqual(mineOnOne);
    for (const look of [mineOnOne, theirsOnOne]) {
      expect(look.badge, "a ring for red, a cross for yellow").toBe(look.colour === "red" ? "ring" : "cross");
    }
    expect(mineOnOne.background, "the face is a different colour from the other player's").not.toBe(theirsOnOne.background);
    // The face really is the disc's colour: it matches the colour of that player's discs on the board.
    const disc = await one.page.locator(testid("cell-0-0")).evaluate((el) => getComputedStyle(el.querySelector(".piece")!).backgroundColor);
    const youIsAtColumn0 = true; // player one chose column 0, so cell-0-0 is player one's disc
    expect(youIsAtColumn0 && mineOnOne.background, "player one's face is the colour of player one's disc").toBe(disc);
    // No separate colour marker next to the name any more.
    await expect(one.page.locator(`${testid("players")} .mini-disc`)).toHaveCount(0);
    for (const c of [one, two, spectator]) await c.context.close();
  });

  test("Q22 outside a game avatars keep their usual colours and have no badge", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/");
    await expect(page.locator(`${testid("player-card")} .avatar`)).toBeVisible();
    await expect(page.locator(`${testid("player-card")} .avatar-badge`)).toHaveCount(0);
    await context.close();
  });
});
