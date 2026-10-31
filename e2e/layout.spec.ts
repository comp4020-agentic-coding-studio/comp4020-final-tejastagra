// Browser checks for the layout and polish rules Q1 to Q9 (docs/design/qa-checklist.md): every screen, at 320, 390 and
// 1366 wide. Q10 and Q11 are judged by looking, in /visual-qa. Run with pnpm test:e2e, never in pnpm check.
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { doTutorialStep, makeGameCode, newPlayer, openTutorial, testid, toTutorialStep, waitForStart } from "./helpers.ts";

// A failing check should fail in seconds, not wait a minute for a dialog that is not there.
test.use({ actionTimeout: 5_000 });
expect.configure({ timeout: 5_000 });

const VIEWPORTS = [NARROW, PHONE, LAPTOP];
const FORM_MAX = 480; // Q3: forms and status messages
const LIST_MAX = 560; // Q3: lists
const GAP_MIN = 16; // Q4

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- Measuring helpers, run inside the page ----

// The box of every visible element with a data-testid, so a popup opening can be compared with before.
async function geometry(page: Page, ignore: string[] = []): Promise<Record<string, Box>> {
  return page.evaluate((skip) => {
    const out: Record<string, Box> = {};
    for (const el of document.querySelectorAll<HTMLElement>("[data-testid]")) {
      const id = el.dataset.testid!;
      if (skip.some((s) => el.closest(`[data-testid="${s}"]`))) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Scroll position does not count as movement: measure on the page, not on the screen.
      out[id] = { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
    }
    return out;
  }, ignore);
}

// Q2: a button whose label wraps is taller than one line of its text plus its padding and outline.
async function wrappedButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, a.btn, .btn, [role=button]")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const label = el.textContent?.trim() ?? "";
      if (!label) continue; // an icon-only button has no label to wrap
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      // Count the lines of text actually laid out.
      // Only the words count: an icon beside them is centred on its own and sits a pixel or two off the text's top.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(...[...range.getClientRects()].filter((c) => c.width > 1 && c.height > 1));
      }
      const tops = new Set(rects.map((c) => Math.round(c.top / 4)));
      // A round button is an icon above its label, so only the label's lines are counted, never its height (Q2).
      const roundButton = el.classList.contains("round-item");
      if (tops.size > 1 || (!roundButton && r.height > Math.max(52, line + pad + 6) + 6)) bad.push(`${el.dataset.testid ?? label} (${Math.round(r.height)}px tall, ${tops.size} lines)`);
    }
    return bad;
  });
}

// Q2: a label that fits on one line can still be wider than its button and spill out of it. Every button's text must lie inside the
// button's own box (with its outline), whatever its width.
async function overflowingLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, a.btn, .btn, [role=button], .tab")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 1) continue;
          if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push(`${el.dataset.testid ?? (el.textContent ?? "").trim()} text ${Math.round(r.left)}..${Math.round(r.right)} outside button ${Math.round(box.left)}..${Math.round(box.right)}`);
        }
      }
    }
    return [...new Set(bad)];
  });
}

// Q3: cards (panels and dialogs) within their width limits.
async function wideCards(page: Page, formMax: number, listMax: number): Promise<string[]> {
  return page.evaluate(
    ([form, list]) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".panel, .popup-card, .dialog-card, .share")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (el.closest(".prose")) continue; // the About page is a document, not a card of a few words
        if (el.closest(".tutorial")) continue; // the tutorial card has its own width (U52)
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const isList = el.querySelector(".rows") !== null || el.classList.contains("rows");
        const limit = isList ? list : form;
        if (r.width > limit + 1) bad.push(`${el.dataset.testid ?? el.className} is ${Math.round(r.width)}px (limit ${limit})`);
      }
      for (const el of document.querySelectorAll<HTMLElement>(".rows")) {
        const r = el.getBoundingClientRect();
        if (r.width > list + 1) bad.push(`list ${el.dataset.testid ?? ""} is ${Math.round(r.width)}px (limit ${list})`);
      }
      return bad;
    },
    [formMax, listMax],
  );
}

// Q4: the gap between vertically stacked cards and buttons in the main column.
async function tightGaps(page: Page, min: number): Promise<string[]> {
  return page.evaluate((minGap) => {
    const bad: string[] = [];
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return bad;
    const items = [...main.querySelectorAll<HTMLElement>(".panel, .btn, .stack > *, .round-row, .share, .popup-card, .player-card")]
      .filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0 && !el.closest(".board-wrap") && !el.closest(".tutorial") && !el.closest(".players") && !el.closest(".popup") && !el.closest(".watch-actions") && !el.closest(".popup-actions") && !el.closest(".share-actions") && !el.closest(".dialog-actions");
      })
      // keep only outermost items, so a button inside a card is not compared with its own card
      .filter((el) => !items_contains(el));
    function items_contains(el: HTMLElement): boolean {
      return !!el.parentElement?.closest(".panel, .share, .popup-card, .player-card, .stack, .round-row");
    }
    const boxes = items.map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i].r;
      const b = boxes[i + 1].r;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlapX <= 4) continue; // side by side, not stacked
      const gap = b.top - a.bottom;
      if (gap < minGap - 0.5) bad.push(`${boxes[i].el.dataset.testid ?? boxes[i].el.className} to ${boxes[i + 1].el.dataset.testid ?? boxes[i + 1].el.className}: ${Math.round(gap)}px`);
    }
    return bad;
  }, min);
}

// Q5: every heading shares its left edge with the content directly below it.
async function misalignedHeadings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const h of document.querySelectorAll<HTMLElement>("main h2, main h3")) {
      const s = getComputedStyle(h);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (h.closest(".panel, .popup, .tutorial, .share, .prose")) continue; // a heading inside a card is aligned by the card
      let next = h.nextElementSibling as HTMLElement | null;
      while (next && (getComputedStyle(next).display === "none" || next.getBoundingClientRect().width === 0)) next = next.nextElementSibling as HTMLElement | null;
      if (!next) continue;
      const hr = h.getBoundingClientRect();
      const nr = next.getBoundingClientRect();
      // A centred heading is judged by its centre against the content's centre, a left-aligned one by its left edge.
      const centred = s.textAlign === "center";
      const delta = centred ? Math.abs(hr.left + hr.width / 2 - (nr.left + nr.width / 2)) : Math.abs(hr.left - nr.left);
      if (delta > 4) bad.push(`"${h.textContent?.trim()}" is ${Math.round(delta)}px off its content`);
    }
    return bad;
  });
}

// Q6: the main column is centred.
async function columnOffset(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return 0;
    const vw = document.documentElement.clientWidth;
    // The content column is the union of the visible direct content, so a wide parent with a narrow child still counts the child.
    let left = Infinity;
    let right = -Infinity;
    for (const el of main.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *")) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.display === "none" || r.width === 0 || r.height === 0) continue;
      if (el.classList.contains("bubbles")) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    if (!isFinite(left)) return 0;
    return Math.abs((left + right) / 2 - vw / 2);
  });
}

async function hasExit(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const names = /^(home|cancel|cancel game|leave game|back home)$/i;
    return [...document.querySelectorAll<HTMLElement>("a, button")].some((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && names.test((el.textContent ?? "").trim().replace(/\s+/g, " "));
    });
  });
}

// ---- The screens ----

interface Screen {
  name: string;
  open: (page: Page) => Promise<void>;
  exit: boolean; // Q9: every screen except home has a way to leave
}

const SCREENS: Screen[] = [
  { name: "home", open: async (p) => void (await p.goto("/")), exit: false },
  {
    name: "quick match",
    open: async (p) => {
      // A real ticket would join the shared lobby and pair with another check's player, so the lobby is answered here.
      await p.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
      await p.goto("/play/quick");
    },
    exit: true,
  },
  { name: "leaderboard", open: async (p) => void (await p.goto("/leaderboard")), exit: true },
  { name: "account (guest)", open: async (p) => void (await p.goto("/account")), exit: true },
  { name: "about", open: async (p) => void (await p.goto("/readme/")), exit: true },
  {
    name: "friend waiting",
    open: async (p) => {
      await p.goto(`/g/${await makeGameCode(p)}`);
    },
    exit: true,
  },
  {
    name: "computer game",
    open: async (p) => {
      const code = (await (await p.request.post("/api/computer")).json()).code as string;
      await p.goto(`/g/${code}`);
      await p.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
      await waitForStart(p); // the start countdown has ended (R97)
    },
    exit: true,
  },
  { name: "watching", open: async (p) => void (await p.goto("/watch")), exit: true },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Layout at ${viewport.width} x ${viewport.height}`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name}: Q2 to Q6 and Q9 hold`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        await screen.open(page);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500); // the home screen's pieces pop in one after another (U39)

        expect(await wrappedButtons(page), "Q2 no button label wraps").toEqual([]);
        expect(await overflowingLabels(page), "Q2 every label fits inside its button").toEqual([]);
        expect(await wideCards(page, FORM_MAX, LIST_MAX), "Q3 no card wider than its limit").toEqual([]);
        expect(await tightGaps(page, GAP_MIN), "Q4 at least 16px between stacked cards and buttons").toEqual([]);
        expect(await misalignedHeadings(page), "Q5 headings share their content's left edge").toEqual([]);
        expect(await columnOffset(page), "Q6 the main column is centred within 16px").toBeLessThanOrEqual(16);
        if (screen.exit) expect(await hasExit(page), "Q9 a visible way to leave").toBe(true);
        await context.close();
      });
    }

    test("Q8 a guest never sees Sign out, and never a sign-in form once signed in", async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/account");
      await page.waitForLoadState("networkidle");
      await expect(page.locator(testid("signout")), "a guest sees no Sign out").toBeHidden();
      await context.close();
    });
  });
}

// Q12: on every screen except home, the header bar's Home button is on the first screen when the page loads, without scrolling.
// Q13: on the game screen and the friend waiting screen the board is centred on the page.
test.describe("Q12 Home is always visible and Q13 the board is centred", () => {
  for (const viewport of VIEWPORTS) {
    for (const screen of SCREENS.filter((s) => s.exit)) {
      test(`Q12 ${screen.name}: Home is in the header bar and on screen on load at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        await screen.open(page);
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => window.scrollY), "the page has not been scrolled").toBe(0);
        const home = page.locator(`${testid("topbar")} ${testid("header-home")}`);
        await expect(home).toBeVisible();
        const box = (await home.boundingBox())!;
        expect(box.y, "Home starts inside the viewport").toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, "Home ends inside the viewport").toBeLessThanOrEqual(viewport.height);
        expect(box.x, "Home is on the left").toBeLessThan(viewport.width / 2);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const bar = (await page.locator(testid("topbar")).boundingBox())!;
        const first = await page.evaluate(() => {
          // Nothing visible sits above the header bar except the decorative bubbles.
          const bar = document.querySelector('[data-testid="topbar"]')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>("main *")].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom <= bar.top - 1 && getComputedStyle(el).visibility !== "hidden";
          }).length;
        });
        expect(first, "the header bar is the first thing on the page").toBe(0);
        expect(bar.y).toBeLessThan(24);
        await context.close();
      });
    }

    for (const name of ["friend waiting", "computer game"]) {
      test(`Q13 ${name}: the board's centre is within 16px of the page's centre at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        await SCREENS.find((s) => s.name === name)!.open(page);
        await page.waitForLoadState("networkidle");
        const board = (await page.locator(`${testid("board-wrap")} .board`).boundingBox())!;
        const width = await page.evaluate(() => document.documentElement.clientWidth);
        expect(Math.abs(board.x + board.width / 2 - width / 2), "the board is centred").toBeLessThanOrEqual(16);
        await context.close();
      });
    }
  }
});

// Q1: a popup opens over the page and moves nothing behind it.
test.describe("Q1 popups move nothing", () => {
  for (const viewport of VIEWPORTS) {
    const popups: Array<{ name: string; screen: string; opener: string; dialog: string }> = [
      { name: "nickname", screen: "/", opener: "rename", dialog: "nickname-dialog" },
      { name: "join with a code", screen: "/", opener: "join-toggle", dialog: "code-dialog" },
      { name: "nickname (account)", screen: "/account", opener: "edit-nickname", dialog: "nickname-dialog" },
      { name: "sign up", screen: "/account", opener: "open-signup", dialog: "signup-dialog" },
      { name: "sign in", screen: "/account", opener: "open-signin", dialog: "signin-dialog" },
    ];
    for (const popup of popups) {
      test(`${popup.name} at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        await page.goto(popup.screen);
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready); // the display font swapping in changes a line's height by a pixel: measure after it
        // Measure once the page has stopped settling by itself (a caption that changes length, a list that loads): two readings
        // 250ms apart agree. Under load the page can still be moving when a fixed wait ends, and that is the page, not the popup.
        await page.mouse.move(1, 1); // out of the way of every button before the first reading
        let before = await geometry(page, [popup.dialog]);
        for (let i = 0; i < 40; i++) {
          await page.waitForTimeout(250);
          const again = await geometry(page, [popup.dialog]);
          const same = Object.keys(before).length === Object.keys(again).length && Object.entries(before).every(([id, b]) => again[id] && Math.abs(again[id].y - b.y) < 0.5 && Math.abs(again[id].h - b.h) < 0.5);
          before = again;
          if (same) break;
        }
        await page.locator(testid(popup.opener)).click();
        // A button under a mouse lifts 2px by its hover transform (U8): that is a transform, not a reflow. The pointer is parked in a
        // corner for both readings, so the same hover state is measured before and during.
        await page.mouse.move(1, 1);
        const dialog = page.locator(testid(popup.dialog));
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute("role", "dialog");
        await expect(dialog).toHaveAttribute("aria-modal", "true");
        const during = await geometry(page, [popup.dialog, "dialog-close"]);
        if (process.env.LAYOUT_DEBUG) {
          const moved = Object.keys(before).filter((k) => during[k] && Math.abs(during[k].y - before[k].y) > 0.5).map((k) => `${k} ${Math.round(before[k].y)}->${Math.round(during[k].y)} (h ${Math.round(before[k].h)}->${Math.round(during[k].h)})`);
          console.log(`MOVED ${popup.name}: ${moved.join(" | ")}`);
        }
        for (const [id, box] of Object.entries(before)) {
          const now = during[id];
          if (!now) continue;
          expect(Math.abs(now.x - box.x), `${id} moved sideways`).toBeLessThanOrEqual(1);
          expect(Math.abs(now.y - box.y), `${id} moved down (${popup.name}: was ${Math.round(box.y)}, now ${Math.round(now.y)})`).toBeLessThanOrEqual(1);
          expect(Math.abs(now.w - box.w), `${id} changed width`).toBeLessThanOrEqual(1);
          expect(Math.abs(now.h - box.h), `${id} changed height`).toBeLessThanOrEqual(1);
        }
        expect(await overflowingLabels(page), `${popup.name}: every label fits inside its button`).toEqual([]);
        // The popup itself is centred and within its limit.
        const card = (await dialog.locator(".dialog-card").boundingBox()) ?? (await dialog.boundingBox())!;
        expect(card.width).toBeLessThanOrEqual(FORM_MAX + 1);
        expect(Math.abs(card.x + card.width / 2 - viewport.width / 2), "the popup is centred").toBeLessThanOrEqual(2);
        // It has a close button and Escape closes it.
        const close = (await page.locator(`${testid(popup.dialog)} ${testid("dialog-close")}`).boundingBox())!;
        expect(close.width).toBeGreaterThanOrEqual(44);
        expect(close.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        const after = await geometry(page, [popup.dialog]);
        for (const [id, box] of Object.entries(before)) {
          const now = after[id];
          if (!now) continue;
          expect(Math.abs(now.x - box.x) + Math.abs(now.y - box.y), `${id} is back where it was`).toBeLessThanOrEqual(2);
        }
        await context.close();
      });
    }
  }
});

// Q7 and Q8: the nickname editor opens prefilled, and the account page shows only controls that make sense.
test.describe("Q7 and Q8 forms and controls", () => {
  test("Q7 the nickname editor opens prefilled with the current nickname, on home and on the account page", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    for (const [path, opener] of [["/", "rename"], ["/account", "edit-nickname"]] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.locator(testid(opener)).click();
      await expect(page.locator(`${testid("nickname-dialog")} ${testid("nickname-input")}`)).toHaveValue("Pip Squeak");
      await page.keyboard.press("Escape");
    }
    await context.close();
  });

  test("Q8 a signed-in player sees no sign-in or sign-up control, and a guest sees no Sign out", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await page.goto("/account");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(testid("signout"))).toBeHidden();
    await expect(page.locator(testid("open-signup"))).toBeVisible();
    await expect(page.locator(testid("open-signin"))).toBeVisible();
    const name = `pip${Math.random().toString(36).slice(2, 8)}`;
    const res = await page.request.post("/api/account/signup", { data: { username: name, password: "correct horse battery" } });
    expect(res.ok()).toBe(true);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(testid("signout"))).toBeVisible();
    await expect(page.locator(testid("open-signup"))).toBeHidden();
    await expect(page.locator(testid("open-signin"))).toBeHidden();
    await context.close();
  });
});

// U33 and U33b: the menu buttons with no subtext (changed 29 October 2026), and the popups' own behaviour.
test.describe("Home menu and its popups (U33, U33b)", () => {
  for (const viewport of VIEWPORTS) {
    test(`the menu buttons have no subtext under them and are 16px apart at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/");
      await page.waitForTimeout(500);
      await expect(page.locator(".menu-hint")).toHaveCount(0);
      for (const id of ["hint-play-computer", "hint-play-friend", "hint-quick-match", "hint-join"]) await expect(page.locator(testid(id))).toHaveCount(0);
      const boxes = [];
      for (const id of ["play-computer", "play-friend", "quick-match", "join-toggle"]) boxes.push((await page.locator(testid(id)).boundingBox())!);
      for (let i = 0; i < boxes.length - 1; i++) {
        expect(boxes[i + 1].y - (boxes[i].y + boxes[i].height), "16px between stacked buttons (Q4)").toBeGreaterThanOrEqual(15.5);
        expect(boxes[i + 1].y - (boxes[i].y + boxes[i].height), "and no gap left where a subtext was").toBeLessThanOrEqual(24);
      }
      await context.close();
    });
  }

  test("the code popup rejects a bad code under its field and joins on a good one", async ({ browser }) => {
    const host = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(host.page);
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("join-toggle")).click();
    await page.locator(testid("code-input")).fill("AB1");
    await page.keyboard.press("Enter");
    const dialog = page.locator(testid("code-dialog"));
    await expect(dialog).toContainText("6 letters or numbers");
    await page.locator(testid("code-input")).fill(code.toLowerCase());
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/g/${code}$`));
    await context.close();
    await host.context.close();
  });

  test("the nickname popup saves and closes, the new name on the player card is the confirmation, and Cancel changes nothing", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await page.goto("/");
    await page.locator(testid("rename")).click();
    await page.locator(testid("dialog-cancel")).click();
    await expect(page.locator(testid("nickname-dialog"))).toHaveCount(0);
    await expect(page.locator(testid("player-name"))).toContainText("Pip Squeak");
    await page.locator(testid("rename")).click();
    await page.locator(testid("nickname-input")).fill("Pip Two");
    await page.locator(testid("nickname-save")).click();
    await expect(page.locator(testid("nickname-dialog"))).toHaveCount(0);
    await expect(page.locator(testid("player-name")), "the new name is the confirmation (U32)").toContainText("Pip Two");
    await expect(page.locator("body"), "no Nickname saved. text anywhere").not.toContainText("Nickname saved");
    await context.close();
  });

  test("a nickname that is too short shows its error inside the popup, under the field, and keeps it open", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/");
    await page.locator(testid("rename")).click();
    await page.locator(testid("nickname-input")).fill("x");
    await page.keyboard.press("Enter");
    const error = page.locator(`${testid("nickname-dialog")} .dialog-error:visible`);
    await expect(error).toBeVisible();
    const field = (await page.locator(testid("nickname-input")).boundingBox())!;
    const text = (await error.boundingBox())!;
    expect(text.y, "the error is under its field").toBeGreaterThanOrEqual(field.y + field.height - 1);
    await expect(page.locator(testid("nickname-dialog"))).toBeVisible();
    await context.close();
  });
});

// U96 to U101: the Quick match waiting card.
test.describe("Quick match page (U96 to U101)", () => {
  for (const viewport of VIEWPORTS) {
    test(`one compact centred card with the discs, the words and Cancel under it at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      // Nobody else is waiting: the check's own server has an empty lobby, but a shared app may not, so the ticket is never paired here.
      await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
      await page.goto("/play/quick");
      await expect(page.locator(testid("quick-status"))).toHaveText("Finding you a random opponent");
      await expect(page.locator(testid("quick-hint"))).toHaveText("Quick match pairs you with another person who is looking for a game right now");
      await expect(page.locator(testid("quick-live"))).toHaveText(/^(\d+ people playing now|Be the first to play)$/);
      await expect(page.locator(testid("quick-discs"))).toBeVisible();
      const card = (await page.locator(testid("quick-panel")).boundingBox())!;
      expect(card.width).toBeLessThanOrEqual(FORM_MAX + 1);
      expect(Math.abs(card.x + card.width / 2 - viewport.width / 2), "the card is centred").toBeLessThanOrEqual(2);
      const cancel = (await page.locator(testid("quick-cancel")).boundingBox())!;
      expect(cancel.y - (card.y + card.height), "Cancel is 16px under the card").toBeGreaterThanOrEqual(15.5);
      expect(cancel.y - (card.y + card.height), "and no further than 32px").toBeLessThanOrEqual(32);
      expect(cancel.y + cancel.height, "Cancel is on the first screen").toBeLessThanOrEqual(viewport.height);
      expect(cancel.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator(testid("computer-offer"))).toBeHidden();
      await context.close();
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`U98 nothing on the quick match screen moves by more than 1px when the live count arrives at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
      // Hold the count back until the page has been measured without it, then let it arrive.
      let release: () => void = () => {};
      const held = new Promise<void>((r) => (release = r));
      await page.route("**/api/live", async (route) => {
        await held;
        await route.fulfill({ json: { live: 3 } });
      });
      await page.goto("/play/quick");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(testid("quick-live"))).toHaveText("");
      const before = await geometry(page);
      release();
      await expect(page.locator(testid("quick-live"))).toHaveText("6 people playing now");
      const after = await geometry(page);
      for (const [id, box] of Object.entries(before)) {
        const now = after[id];
        if (!now || id === "quick-live") continue;
        expect(Math.abs(now.y - box.y), `${id} moved down when the count arrived`).toBeLessThanOrEqual(1);
        expect(Math.abs(now.h - box.h), `${id} changed height when the count arrived`).toBeLessThanOrEqual(1);
        expect(Math.abs(now.x - box.x), `${id} moved sideways`).toBeLessThanOrEqual(1);
      }
      await context.close();
    });
  }

  test("after 20 seconds the computer offer appears inside the same card and the cards above it do not move", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
    await page.clock.install();
    await page.goto("/play/quick");
    await expect(page.locator(testid("quick-status"))).toBeVisible();
    const before = (await page.locator(testid("quick-status")).boundingBox())!;
    await page.clock.fastForward(20_500);
    const offer = page.locator(testid("computer-offer"));
    await expect(offer).toBeVisible();
    const card = (await page.locator(testid("quick-panel")).boundingBox())!;
    const inside = (await offer.boundingBox())!;
    expect(inside.y).toBeGreaterThanOrEqual(card.y);
    expect(inside.y + inside.height).toBeLessThanOrEqual(card.y + card.height + 1);
    const after = (await page.locator(testid("quick-status")).boundingBox())!;
    expect(Math.abs(after.y - before.y), "the status line did not move").toBeLessThanOrEqual(1);
    const cancel = (await page.locator(testid("quick-cancel")).boundingBox())!;
    expect(cancel.y + cancel.height, "Cancel is still on the first screen with the offer showing").toBeLessThanOrEqual(PHONE.height);
    await context.close();
  });
});

// U18 and U46: no keyboard hint on the game screen; keyboard play still works; the keys are written once, in How to play.
test.describe("Keyboard hint (U18, U46)", () => {
  test("the game screen has no keyboard hint and the keys still choose a column", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
    await waitForStart(page); // the start countdown has ended (R97)
    await expect(page.locator(testid("keys-hint"))).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/Keys 1 to 7/);
    await page.keyboard.press("4");
    await expect(page.locator(testid("chosen-label"))).toHaveText("Chosen");
    await context.close();
  });
});

// U132 (replacing U102's two full-width rows) and U103 to U105: your power-ups as one row of compact buttons under the timer.
test.describe("Power-up row (U103 to U105, U132)", () => {
  for (const viewport of VIEWPORTS) {
    test(`one centred row of two buttons under the timer, each with its info button, 44px and one line at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      const code = (await (await page.request.post("/api/computer")).json()).code as string;
      await page.goto(`/g/${code}`);
      await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
      await waitForStart(page); // the start countdown has ended (R97)
      const row = (await page.locator(testid("powerups")).boundingBox())!;
      const timer = (await page.locator(testid("timer")).boundingBox())!;
      expect(row.y, "the row is under the timer").toBeGreaterThanOrEqual(timer.y + timer.height - 1);
      expect(Math.abs(row.x + row.width / 2 - (timer.x + timer.width / 2)), "and centred under it").toBeLessThanOrEqual(4);
      const tops: number[] = [];
      for (const [button, info, label] of [
        ["shield-badge", "shield-info", "shield-label"],
        ["earthquake-badge", "earthquake-info", "earthquake-label"],
      ] as const) {
        const b = (await page.locator(testid(button)).boundingBox())!;
        const i = (await page.locator(testid(info)).boundingBox())!;
        tops.push(b.y);
        expect(b.height, `${button} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
        expect(b.width, `${button} is at least 44px wide`).toBeGreaterThanOrEqual(43.5);
        expect(i.width, `${info} is at least 44px wide`).toBeGreaterThanOrEqual(43.5);
        expect(i.height, `${info} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
        expect(Math.abs(i.y - b.y), `${info} sits beside its button`).toBeLessThanOrEqual(4);
        // The visible words are one line: the long label on a laptop, the short one on a phone (U132).
        const shown = page.locator(`${testid(button)} span:visible`).first();
        expect((await shown.boundingBox())!.height, `${button}'s label is one line`).toBeLessThan(26);
        if (viewport.width >= 600) await expect(page.locator(testid(label))).toBeVisible();
      }
      expect(Math.abs(tops[0] - tops[1]), "both buttons are on one row").toBeLessThanOrEqual(2);
      expect(row.x).toBeGreaterThanOrEqual(0);
      expect(row.x + row.width, "the row fits the screen").toBeLessThanOrEqual(viewport.width);
      // The words of U103 are still the state, in the label (laptop) and the accessible name (always).
      await expect(page.locator(testid("shield-label"))).toHaveText("Arm shield");
      await expect(page.locator(testid("earthquake-label"))).toHaveText("Nothing to shake yet");
      // The empty Earthquake button is greyed and disabled, and says why in its popup (U103, U104).
      await expect(page.locator(testid("earthquake-badge"))).toBeDisabled();
      await page.locator(testid("earthquake-info")).click();
      await expect(page.locator(testid("earthquake-help"))).toContainText("Available once the bottom row has a piece.");
      await page.keyboard.press("Escape");
      await context.close();
    });
  }

  test("the opponent's panel shows the same power-ups as small icons with a text label", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
    await waitForStart(page); // the start countdown has ended (R97)
    await expect(page.locator(testid("opponent-shield"))).toHaveText("Shield available");
    await expect(page.locator(testid("opponent-earthquake"))).toHaveText("Earthquake available");
    await expect(page.locator(testid("opponent-shield-state"))).toBeVisible();
    await expect(page.locator(testid("opponent-earthquake-state"))).toBeVisible();
    await context.close();
  });
});

// U106 to U108 and U29: who you are playing, Leave game, Cancel game and the end popup buttons.
test.describe("Heading, leaving and the end popup (U29, U106 to U108, U132, R81)", () => {
  test("a game against the computer says so in the header bar, Home asks before leaving, and Stay changes nothing", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
    await waitForStart(page); // the start countdown has ended (R97)
    await expect(page.locator(testid("opponent-heading"))).toHaveText("Playing the computer");
    await expect(page.locator(`${testid("topbar")} ${testid("opponent-heading")}`)).toHaveText("Playing the computer"); // U132: in the header bar
    await expect(page.locator(`${testid("topbar")} ${testid("round-line")}`)).toHaveText("Round 1");
    await expect(page.locator(testid("leave-game"))).toHaveCount(0); // U132: no separate Leave game button
    const leave = page.locator(testid("header-home"));
    await expect(leave).toBeVisible();
    expect((await leave.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await leave.click();
    const dialog = page.locator(testid("leave-dialog"));
    await expect(dialog).toContainText("Leave this game?");
    await expect(dialog).toContainText("It counts as a forfeit.");
    await page.locator(testid("dialog-cancel")).click();
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toContain(`/g/${code}`);
    await leave.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await context.close();
  });

  test("a game against a person says who with their name and tag, and Leave forfeits: the other player wins and is told", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await one.page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
    await two.page.request.post("/api/guest", { data: { nickname: "Sam Wombat" } });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await expect(one.page.locator(testid("opponent-heading"))).toContainText("Playing with Sam Wombat #");
    await expect(two.page.locator(testid("opponent-heading"))).toContainText("Playing with Pip Squeak #");
    await one.page.locator(testid("header-home")).click() /* U132: Home asks to confirm leaving */;
    await one.page.locator(testid("leave-confirm")).click();
    await one.page.waitForURL(/\/$/);
    await expect(two.page.locator(testid("end-title"))).toHaveText("YOU WIN!", { timeout: 3_000 });
    await expect(two.page.locator(testid("result-line"))).toContainText("Your opponent left the game."); // U29: the reason is under the board
    // The game is over: no timer runs and the opponent is not still "Choosing" (found by /visual-qa, 29 October 2026).
    await expect(two.page.locator(testid("timer"))).toBeHidden();
    await expect(two.page.locator(testid("opponent-status"))).toHaveText("Finished");
    await expect(two.page.locator(testid("end-detail"))).toHaveCount(0); // U29: the popup has its title and buttons only
    await one.context.close();
    await two.context.close();
  });

  test("after a game ends, both power-up rows keep their last words (U103)", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
    await waitForStart(page); // the start countdown has ended (R97)
    await page.locator(testid("header-home")).click() /* U132: Home asks to confirm leaving */;
    await page.locator(testid("leave-confirm")).click();
    await page.waitForURL(/\/$/);
    await context.close();
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    const link = await makeGameCode(one.page);
    await one.page.goto(`/g/${link}`);
    await two.page.goto(`/g/${link}`);
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield");
    await two.page.locator(testid("header-home")).click() /* U132: Home asks to confirm leaving */;
    await two.page.locator(testid("leave-confirm")).click();
    await expect(one.page.locator(testid("end-popup"))).toBeVisible({ timeout: 3_000 });
    await expect(one.page.locator(testid("shield-label"))).toHaveText("Arm shield");
    await expect(one.page.locator(testid("earthquake-label"))).toHaveText("Nothing to shake yet");
    await one.context.close();
    await two.context.close();
  });

  test("the waiting screen has Cancel game and the header bar's Home, and Cancel game goes Home", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto(`/g/${await makeGameCode(page)}`);
    await expect(page.locator(testid("waiting-panel"))).toBeVisible();
    await expect(page.locator(testid("header-home"))).toBeVisible();
    await expect(page.locator(testid("opponent-heading"))).toHaveText(""); // U135: the card says it
    const card = (await page.locator(testid("waiting-panel")).boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - PHONE.width / 2), "the card is centred sideways").toBeLessThanOrEqual(2);
    expect(Math.abs(card.y + card.height / 2 - PHONE.height / 2), "and centred on the screen").toBeLessThanOrEqual(40);
    const share = (await page.locator(testid("share")).boundingBox())!;
    const cancel = (await page.locator(testid("cancel-game")).boundingBox())!;
    expect(cancel.y - (share.y + share.height), "Cancel game is at least 16px under Copy link and Share (Q4)").toBeGreaterThanOrEqual(15.5);
    await page.locator(testid("cancel-game")).click();
    await page.waitForURL(/\/$/);
    await context.close();
  });

  for (const viewport of VIEWPORTS) {
    test(`the end popup's Play again and Home are one line each at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      const code = (await (await page.request.post("/api/computer")).json()).code as string;
      await page.goto(`/g/${code}`);
      await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
      await waitForStart(page); // the start countdown has ended (R97)
      await page.evaluate(() => {
        // Show the popup as the game's end would: only its layout is under test here.
        (document.querySelector('[data-testid="end-popup"]') as HTMLElement).hidden = false;
        document.querySelector('[data-testid="end-title"]')!.textContent = "GAME ABANDONED";
      });
      for (const id of ["play-again", "go-home"]) {
        const b = page.locator(`${testid("end-popup")} ${testid(id)}`);
        const label = (await b.locator("span").boundingBox())!;
        const box = (await b.boundingBox())!;
        expect(label.height, `${id} label is one line`).toBeLessThan(26);
        expect(box.height, `${id} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
        expect(box.x + box.width, `${id} inside the screen`).toBeLessThanOrEqual(viewport.width);
      }
      expect(await wrappedButtons(page), "Q2 no button label wraps").toEqual([]);
      await context.close();
    });
  }
});

// U5a on every page that has a line under the title: the title's chips never reach it, falling or still (reduced motion).
test.describe("The title's chips stay clear of the line under it (U5a)", () => {
  const pages: Array<{ path: string; under: string }> = [
    { path: "/", under: '[data-testid="tagline"]' },
    { path: "/play/quick", under: ".subtitle" },
    { path: "/account", under: ".subtitle" },
    { path: "/leaderboard", under: ".subtitle" },
  ];
  for (const { path, under } of pages) {
    for (const viewport of VIEWPORTS) {
      for (const reduced of [true, false]) {
        test(`${path} at ${viewport.width} x ${viewport.height}, ${reduced ? "reduced motion" : "moving"}`, async ({ browser }) => {
          const { context, page } = await newPlayer(browser, viewport, { reducedMotion: reduced });
          await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(400);
          const line = (await page.locator(under).first().boundingBox())!;
          // The lowest any chip gets: sampled over the whole fall when moving, and its resting place when still.
          let lowest = 0;
          for (let i = 0; i < (reduced ? 1 : 14); i++) {
            const bottoms = await page.locator(".chip").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
            lowest = Math.max(lowest, ...bottoms);
            if (!reduced) await page.waitForTimeout(400);
          }
          expect(lowest, `a chip reached ${Math.round(lowest)} but the line under the title starts at ${Math.round(line.y)}`).toBeLessThanOrEqual(line.y + 2);
          await context.close();
        });
      }
    }
  }
});

// Q11: the tutorial's practice power-up badges are pills with an outline, not bare text (they share a class with the game's rows,
// which are borderless inside their card, and lost their look once).
test("Q11 the tutorial's shield and Earthquake badges are outlined pills", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
  await openTutorial(page);
  await toTutorialStep(page, 7);
  await expect(page.locator(testid("tutorial-title"))).toHaveText("Earthquake");
  const style = await page.locator(testid("tutorial-earthquake")).evaluate((el) => {
    const c = getComputedStyle(el);
    return { border: parseFloat(c.borderTopWidth), radius: parseFloat(c.borderTopLeftRadius), shadow: c.boxShadow };
  });
  expect(style.border, "an outline").toBeGreaterThanOrEqual(2);
  expect(style.radius, "rounded like a pill").toBeGreaterThan(14);
  expect(style.shadow, "a hard shadow").not.toBe("none");
  await context.close();
});

// Found by the phone-tester on 29 October 2026: three phone-width defects the checks above did not reach.
test.describe("Phone width: the watching screen and the game screen's first screen (E4, Q2, Q13, docs/design.md)", () => {
  test("E4 Q13 a link spectator at 320 x 568: no sideways scroll, and the board is centred", async ({ browser }) => {
    const one = await newPlayer(browser, PHONE, { reducedMotion: true });
    const two = await newPlayer(browser, PHONE, { reducedMotion: true });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForStart(one.page);
    const { context, page } = await newPlayer(browser, NARROW, { reducedMotion: true });
    await page.goto(`/g/${code}`); // both seats taken: a spectator of this link game (R36, U92)
    await page.waitForURL(/\/watch\?game=.*via=link/);
    await expect(page.locator(testid("spectator-notice"))).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "no sideways scroll").toBeLessThanOrEqual(0);
    const board = (await page.locator(`${testid("board-wrap")} .board`).boundingBox())!;
    expect(Math.abs(board.x + board.width / 2 - NARROW.width / 2), "the board is centred").toBeLessThanOrEqual(16);
    expect(board.x + board.width, "the whole board is on screen").toBeLessThanOrEqual(NARROW.width);
    for (const c of [one, two, { context }]) await c.context.close();
  });

  for (const viewport of [NARROW, PHONE]) {
    test(`Q2 Watch another game is one line on a live quick match game's watching screen at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      // The watching screen as the server would send it for a quick match game, so no other check's game is needed.
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.routeWebSocket(/\/ws$/, (ws) => {
        ws.onMessage(() =>
          ws.send(JSON.stringify({ type: "spectating", code: "QQQQQQ", kind: "quick", watching: 1, names: { A: "Pip Squeak #4f2a", B: "Sam Wombat #c0de" }, colours: { A: "red", B: "yellow" }, state: { board: [[], [], [], [], [], [], []], round: 3, shieldsLeft: { A: true, B: true }, earthquakesLeft: { A: true, B: true }, rows: 6, status: "playing", winner: null } })),
        );
      });
      await page.goto("/watch");
      const button = page.locator(testid("watch-another"));
      await expect(button).toBeVisible();
      expect(await wrappedButtons(page), "no button label wraps").toEqual([]);
      expect(await overflowingLabels(page), "every label fits inside its button").toEqual([]);
      await context.close();
    });
  }

  test("docs/design.md at 320 x 568 with the widest names, the board, timer, both names and your power-ups are on the first screen", async ({ browser }) => {
    const one = await newPlayer(browser, NARROW, { reducedMotion: true });
    const two = await newPlayer(browser, PHONE, { reducedMotion: true });
    await one.page.request.post("/api/guest", { data: { nickname: "Mmmmmmmmmmmmmmmm" } }); // R28 allows 16: the worst case
    await two.page.request.post("/api/guest", { data: { nickname: "WWWWWWWWWWWWWWWW" } });
    const code = await makeGameCode(one.page);
    await one.page.goto(`/g/${code}`);
    await two.page.goto(`/g/${code}`);
    await waitForStart(one.page);
    for (const id of ["board-wrap", "timer", "name-you", "name-opponent", "shield-badge", "earthquake-badge", "opponent-shield-state"]) {
      const b = (await one.page.locator(testid(id)).boundingBox())!;
      expect(b.y + b.height, `${id} is on the first screen`).toBeLessThanOrEqual(NARROW.height);
    }
    await one.context.close();
    await two.context.close();
  });
});

// Q5, Q12: Home in the header bar lines up with the page's own column on a laptop (found by /visual-qa, 29 October 2026).
test("Q5 Q12 on a laptop the header bar's Home shares the left edge of the page's card, list or About text", async ({ browser }) => {
  const { context, page } = await newPlayer(browser, LAPTOP, { reducedMotion: true });
  await page.route("**/api/quick/**", (route) => route.fulfill({ json: { state: "waiting" } }));
  for (const [path, column] of [["/account", "account-card"], ["/play/quick", "quick-panel"], ["/leaderboard", "leaderboard-column"], ["/readme/", "readme-panel"]] as const) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const home = (await page.locator(testid("header-home")).boundingBox())!;
    const card = (await page.locator(testid(column)).boundingBox())!;
    expect(Math.abs(home.x - card.x), `${path}: Home lines up with ${column}`).toBeLessThanOrEqual(4);
  }
  await context.close();
});

// U29: the end popup's title has room above its buttons, so its shadow never reaches them (found by /visual-qa).
for (const viewport of VIEWPORTS) {
  test(`U29 the end popup title's shadow stays clear of its buttons at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
    const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
    const code = (await (await page.request.post("/api/computer")).json()).code as string;
    await page.goto(`/g/${code}`);
    await waitForStart(page);
    await page.evaluate(() => {
      (document.querySelector('[data-testid="end-popup"]') as HTMLElement).hidden = false;
      document.querySelector('[data-testid="end-title"]')!.textContent = "YOU WIN!";
    });
    const title = (await page.locator(testid("end-title")).boundingBox())!;
    const again = (await page.locator(`${testid("end-popup")} ${testid("play-again")}`).boundingBox())!;
    expect(again.y - (title.y + title.height), "at least 12px between the title and the buttons").toBeGreaterThanOrEqual(12);
    await context.close();
  });
}

// ---- Q15 to Q17 and the home changes of 31 October 2026 (Parts 1 and 2 of the fix list) ----

const FULL_SCREENS = [NARROW, PHONE, LAPTOP];

// Q17, U33, U37: the player card and the four menu buttons are one stack with equal gaps; on a phone they are also one size.
test.describe("Q17 the home stack is evenly spaced", () => {
  for (const viewport of FULL_SCREENS) {
    test(`Q17 gaps between the player card and each menu button are equal within 2px at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const ids = ["player-card", "play-computer", "play-friend", "quick-match", "join-toggle"];
      const boxes: Box[] = [];
      for (const id of ids) {
        const b = (await page.locator(testid(id)).boundingBox())!;
        boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      }
      const gaps = boxes.slice(1).map((b, i) => b.y - (boxes[i].y + boxes[i].h));
      for (const g of gaps) expect(Math.abs(g - gaps[0]), `gaps ${gaps.join(", ")}`).toBeLessThanOrEqual(2);
      expect(gaps[0], "at least 16px (Q4)").toBeGreaterThanOrEqual(15.5);
      for (const b of boxes) expect(Math.abs(b.w - boxes[0].w), "same width as the player card").toBeLessThanOrEqual(1);
      // Q23: the player card is taller than a menu button, with 16px of padding above and below its content.
      expect(boxes[0].h, "the player card is taller than a menu button").toBeGreaterThan(boxes[1].h + 8);
      for (const b of boxes.slice(2)) expect(Math.abs(b.h - boxes[1].h), "the four buttons are one height").toBeLessThanOrEqual(1);
      const pad = await page.locator(testid("player-card")).evaluate((card) => {
        const c = card.getBoundingClientRect();
        const text = card.querySelector<HTMLElement>(".player-text")!.getBoundingClientRect();
        const av = card.querySelector<HTMLElement>(".avatar")!.getBoundingClientRect();
        const top = Math.min(text.top, av.top);
        const bottom = Math.max(text.bottom, av.bottom);
        return { above: top - c.top, below: c.bottom - bottom, avatar: av.width };
      });
      expect(pad.above, "16px above the card's content").toBeGreaterThanOrEqual(15.5);
      expect(pad.below, "16px below the card's content").toBeGreaterThanOrEqual(15.5);
      expect(pad.avatar, "a slightly larger avatar").toBeGreaterThanOrEqual(48);
      await context.close();
    });
  }

  test("U33 no subtext under any menu button on any viewport", async ({ browser }) => {
    for (const viewport of FULL_SCREENS) {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/");
      for (const id of ["play-computer", "play-friend", "quick-match", "join-toggle"]) {
        const b = (await page.locator(testid(id)).boundingBox())!;
        expect(b.height, `${id} at ${viewport.width}`).toBeLessThan(80);
      }
      expect(await page.locator(`${testid("menu")} .btn-sub, ${testid("menu")} small, ${testid("menu")} .sub`).count()).toBe(0);
      await context.close();
    }
  });

  test("U35 U36 U37 on a phone there is no demo board, and on no viewport is there a Top players section", async ({ browser }) => {
    for (const viewport of FULL_SCREENS) {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expect(page.locator(testid("top-players")), `no Top players at ${viewport.width}`).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("Top players");
      if (viewport.width < 600) await expect(page.locator(testid("demo-board")), `no demo board at ${viewport.width}`).toBeHidden();
      await context.close();
    }
  });
});

// ---- Q15 and Q16: nothing scrolls and nothing overlaps the board, on the game screen, in the tutorial and in popups ----

// How far a page, or a popup's card, runs past the screen: zero when everything is on one screen.
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
}

// The boxes of buttons and captions that intersect the board (Q16). The board's own column hit areas are not "on" the board:
// they are the board.
async function overlapsBoard(page: Page, boardSelector: string, within: string): Promise<string[]> {
  return page.evaluate(
    ({ boardSelector, within }) => {
      const board = document.querySelector<HTMLElement>(boardSelector);
      const root = document.querySelector<HTMLElement>(within);
      if (!board || !root) return ["no board"];
      const b = board.getBoundingClientRect();
      const bad: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("button, a.btn, .btn, [role=button], .result, .message, .tutorial-caption, .tutorial-status, .tutorial-hint")) {
        if (board.contains(el)) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const x = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        const y = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        if (x > 1 && y > 1) bad.push(`${el.dataset.testid ?? el.className ?? el.tagName} overlaps the board by ${Math.round(x)} x ${Math.round(y)}`);
      }
      return bad;
    },
    { boardSelector, within },
  );
}

async function openComputerGame(page: Page): Promise<void> {
  const code = (await (await page.request.post("/api/computer")).json()).code as string;
  await page.goto(`/g/${code}`);
  await page.locator(testid("waiting-panel")).waitFor({ state: "hidden" });
  await waitForStart(page); // the start countdown has ended (R97)
}

test.describe("Q15 and Q16 the game screen is one screen with nothing on the board", () => {
  for (const viewport of FULL_SCREENS) {
    test(`Q15 Q16 a computer game does not scroll, and its result line keeps room under it, at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await openComputerGame(page);
      expect.soft(await pageOverflow(page), "Q15 no vertical scrolling").toBe(0);
      expect(await overlapsBoard(page, testid("board-wrap"), "main"), "Q16 nothing overlaps the board").toEqual([]);
      const result = (await page.locator(testid("result-line")).boundingBox())!;
      const message = await page.locator(testid("game-message")).boundingBox();
      const bottom = Math.max(result.y + result.height, message ? message.y + message.height : 0);
      expect(viewport.height - bottom, "U149 the result line is not against the bottom edge").toBeGreaterThanOrEqual(15.5);
      const players = (await page.locator(testid("players")).boundingBox())!;
      const board = (await page.locator(testid("board-wrap")).boundingBox())!;
      const ghostRoom = board.y - (players.y + players.height);
      expect(ghostRoom, "U149 little empty space between the versus bar and the board").toBeLessThanOrEqual(viewport.width < 600 ? 40 : 48);
      // The same after a round, with a result line showing.
      await context.close();
    });
  }
});

test.describe("Q15 Q16 the tutorial: every step fits one screen with nothing on the board", () => {
  for (const viewport of FULL_SCREENS) {
    test(`Q15 Q16 all 11 steps at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await openTutorial(page);
      for (let step = 1; step <= 11; step++) {
        await doTutorialStep(page, step); // acts, then Next shows (after steps 6 and 7 the shield and Earthquake buttons were on screen)
        const where = `step ${step} at ${viewport.width} x ${viewport.height}`;
        const overlay = await page.locator(testid("tutorial")).evaluate((el) => el.scrollHeight - el.clientHeight);
        expect.soft(overlay, `Q15 ${where}: the tutorial does not scroll`).toBeLessThanOrEqual(0);
        const card = await page.locator(`${testid("tutorial")} .tutorial-card`).evaluate((el) => ({ over: el.scrollHeight - el.clientHeight, ...el.getBoundingClientRect().toJSON() }));
        expect.soft(card.over, `Q15 ${where}: the card does not scroll`).toBeLessThanOrEqual(0);
        expect(card.top, `${where}: the card starts on screen`).toBeGreaterThanOrEqual(-0.5);
        expect.soft(card.bottom, `${where}: the card ends on screen`).toBeLessThanOrEqual(viewport.height + 0.5);
        for (const id of ["tutorial-next", "tutorial-skip"]) {
          const b = (await page.locator(testid(id)).boundingBox())!;
          expect.soft(b.y + b.height, `Q15 ${where}: ${id} is on screen`).toBeLessThanOrEqual(viewport.height + 0.5);
          expect(b.height, `${where}: ${id} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
        }
        expect(await overlapsBoard(page, ".tutorial-board .board-wrap", testid("tutorial")), `Q16 ${where}`).toEqual([]);
        const col = (await page.locator(testid("tutorial-column-0")).boundingBox())!;
        expect.soft(col.width, `${where}: the practice columns are at least 44px wide (docs/design.md, U148)`).toBeGreaterThanOrEqual(43.5);
        // Next, Skip and a step's action button are clear of each other (at least 8px apart) and under the board.
        const next = (await page.locator(testid("tutorial-next")).boundingBox())!;
        const skip = (await page.locator(testid("tutorial-skip")).boundingBox())!;
        const board = (await page.locator(".tutorial-board .board-wrap").boundingBox())!;
        expect(next.y, `${where}: Next is below the board`).toBeGreaterThanOrEqual(board.y + board.height - 1);
        const clearY = skip.y - (next.y + next.height); // stacked: space between them
        const clearX = Math.max(skip.x - (next.x + next.width), next.x - (skip.x + skip.width)); // side by side on a short phone
        expect(Math.max(clearY, clearX), `${where}: clear space between Next and Skip`).toBeGreaterThanOrEqual(7.5);
        if (step < 11) await page.locator(testid("tutorial-next")).click();
      }
      await context.close();
    });
  }
});

test.describe("Q15 popups fit one screen", () => {
  for (const viewport of FULL_SCREENS) {
    const popups: Array<{ name: string; screen: string; opener: string; dialog: string; game?: boolean }> = [
      { name: "nickname", screen: "/", opener: "rename", dialog: "nickname-dialog" },
      { name: "join with a code", screen: "/", opener: "join-toggle", dialog: "code-dialog" },
      { name: "sign up", screen: "/account", opener: "open-signup", dialog: "signup-dialog" },
      { name: "sign in", screen: "/account", opener: "open-signin", dialog: "signin-dialog" },
      { name: "shield help", screen: "", opener: "shield-info", dialog: "shield-help", game: true },
      { name: "earthquake help", screen: "", opener: "earthquake-info", dialog: "earthquake-help", game: true },
      { name: "leave", screen: "", opener: "header-home", dialog: "leave-dialog", game: true },
    ];
    for (const popup of popups) {
      test(`Q15 ${popup.name} popup at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        if (popup.game) await openComputerGame(page);
        else await page.goto(popup.screen);
        await page.waitForLoadState("networkidle");
        await page.locator(testid(popup.opener)).click();
        const dialog = page.locator(testid(popup.dialog));
        await expect(dialog).toBeVisible();
        const m = await dialog.evaluate((el) => {
          const card = el.querySelector<HTMLElement>(".dialog-card") ?? el;
          const r = card.getBoundingClientRect();
          return { over: card.scrollHeight - card.clientHeight, top: r.top, bottom: r.bottom, outer: el.scrollHeight - el.clientHeight };
        });
        expect(m.over, "the popup's card does not scroll").toBeLessThanOrEqual(0);
        expect(m.outer, "the popup does not scroll").toBeLessThanOrEqual(0);
        expect(m.top, "the popup starts on screen").toBeGreaterThanOrEqual(-0.5);
        expect(m.bottom, "the popup ends on screen").toBeLessThanOrEqual(viewport.height + 0.5);
        for (const b of await dialog.locator("button").all()) {
          const box = await b.boundingBox();
          if (!box) continue;
          expect(box.y + box.height, "every popup button is on screen").toBeLessThanOrEqual(viewport.height + 0.5);
        }
        await context.close();
      });
    }
  }
});

test("U132 U149 the power-up row's info buttons are whole and on screen at every size", async ({ browser }) => {
  for (const viewport of FULL_SCREENS) {
    const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
    await openComputerGame(page);
    for (const id of ["shield-info", "earthquake-info"]) {
      const b = (await page.locator(testid(id)).boundingBox())!;
      const row = (await page.locator(testid(id === "shield-info" ? "shield-badge" : "earthquake-badge")).boundingBox())!;
      expect(b.x + b.width, `${id} at ${viewport.width}: inside the screen`).toBeLessThanOrEqual(viewport.width);
      expect(b.width, `${id} at ${viewport.width}: whole`).toBeGreaterThanOrEqual(43.5);
      expect(b.x, `${id} sits right of its button`).toBeGreaterThanOrEqual(row.x + row.width - 1);
    }
    const clipped = await page.locator(`${testid("powerups")} .powerup-row`).evaluateAll((rows) => rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length);
    expect(clipped, `no power-up row clips its info button at ${viewport.width}`).toBe(0);
    expect(await pageOverflow(page), `no scrolling at ${viewport.width}`).toBe(0);
    await context.close();
  }
});

// ---- Part A of the second fix list: Q18 popup spacing, Q19 one result, Q20 two-line names (31 October 2026) ----

// A finished game as the server would send it, played into the real page: the end popup with its result.
async function openEndPopup(page: Page, status: "draw" | "won" = "draw"): Promise<void> {
  const state = { board: [[], [], [], [], [], [], []], round: 21, shieldsLeft: { A: true, B: true }, earthquakesLeft: { A: true, B: true }, rows: 4, status, winner: status === "won" ? "B" : null };
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.onMessage((raw) => {
      if (String(raw).includes('"join"')) ws.send(JSON.stringify({ type: "snapshot", you: "A", seatToken: "x", opponentPresent: true, started: true, state, yourName: "Pip Squeak #4f2a", opponentName: "Brave Wombat #a7f3", colours: { A: "red", B: "yellow" }, opponentReady: false }));
    });
  });
  await page.goto("/g/DRAW42");
  await page.locator(testid("end-popup")).waitFor({ state: "visible", timeout: 6_000 });
}

// Q18: the clearances inside one popup card, measured in the page.
async function popupSpacing(page: Page, cardSelector: string): Promise<{ edge: number; between: number; stacked: number; label: number }> {
  return page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel)!;
    const c = card.getBoundingClientRect();
    const own = getComputedStyle(card);
    // The card's own padding plus its border is the space between its edge and its content.
    const edge = Math.min(parseFloat(own.paddingLeft), parseFloat(own.paddingRight), parseFloat(own.paddingTop), parseFloat(own.paddingBottom));
    const buttons = [...card.querySelectorAll<HTMLElement>("button.btn, a.btn")].filter((b) => b.getClientRects().length > 0 && b.getBoundingClientRect().width > 0);
    let between = Infinity;
    let stacked = Infinity;
    let label = Infinity;
    for (let i = 0; i < buttons.length; i++) {
      const a = buttons[i].getBoundingClientRect();
      for (let j = i + 1; j < buttons.length; j++) {
        const b = buttons[j].getBoundingClientRect();
        const sameRow = Math.abs(a.top - b.top) < 4;
        if (sameRow) between = Math.min(between, Math.max(b.left - a.right, a.left - b.right));
        else stacked = Math.min(stacked, Math.max(b.top - a.bottom, a.top - b.bottom));
      }
      // The words and the icon inside the button, against the button's own edge.
      const r = buttons[i].getBoundingClientRect();
      let left = Infinity;
      let right = -Infinity;
      for (const part of buttons[i].querySelectorAll<HTMLElement | SVGElement>("span, svg")) {
        const p = part.getBoundingClientRect();
        if (p.width === 0 || (part instanceof HTMLElement && !part.textContent?.trim())) continue;
        left = Math.min(left, p.left);
        right = Math.max(right, p.right);
      }
      if (isFinite(left)) label = Math.min(label, left - r.left, r.right - right);
    }
    void c;
    return { edge, between, stacked, label };
  }, cardSelector);
}

test.describe("Q18 popups are not cramped", () => {
  for (const viewport of FULL_SCREENS) {
    test(`Q18 the end popup at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await openEndPopup(page);
      const m = await popupSpacing(page, `${testid("end-popup")} .popup-card`);
      expect(m.edge, "16px between the card's edge and its content").toBeGreaterThanOrEqual(15.5);
      expect(m.between, "buttons side by side are at least 16px apart").toBeGreaterThanOrEqual(15.5);
      expect(m.stacked, "stacked buttons are at least 12px apart").toBeGreaterThanOrEqual(11.5);
      expect(m.label, "12px between each label (with its icon) and its button's edge").toBeGreaterThanOrEqual(11.5);
      expect(await overflowingLabels(page), "every label fits inside its button").toEqual([]);
      await context.close();
    });
  }

  for (const viewport of FULL_SCREENS) {
    for (const popup of [
      { name: "nickname", screen: "/", opener: "rename", dialog: "nickname-dialog" },
      { name: "join with a code", screen: "/", opener: "join-toggle", dialog: "code-dialog" },
      { name: "sign up", screen: "/account", opener: "open-signup", dialog: "signup-dialog" },
      { name: "sign in", screen: "/account", opener: "open-signin", dialog: "signin-dialog" },
    ]) {
      test(`Q18 the ${popup.name} popup at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        await page.goto(popup.screen);
        await page.locator(testid(popup.opener)).click();
        await page.locator(testid(popup.dialog)).waitFor();
        const m = await popupSpacing(page, `${testid(popup.dialog)} .dialog-card`);
        expect(m.edge).toBeGreaterThanOrEqual(15.5);
        expect(m.between).toBeGreaterThanOrEqual(15.5);
        expect(m.stacked).toBeGreaterThanOrEqual(11.5);
        expect(m.label).toBeGreaterThanOrEqual(11.5);
        await context.close();
      });
    }
  }
});

test.describe("Q19 the result is shown once", () => {
  for (const viewport of [NARROW, PHONE]) {
    test(`Q19 with the end popup open the result line is not visible at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await openEndPopup(page);
      await expect(page.locator(testid("end-title"))).toHaveText("IT'S A DRAW!");
      await expect(page.locator(testid("result-line"))).toBeHidden();
      await context.close();
    });
  }
});

test.describe("Q20 a name takes at most two lines", () => {
  for (const viewport of [NARROW, PHONE]) {
    test(`Q20 the widest names at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      const state = { board: [[], [], [], [], [], [], []], round: 0, shieldsLeft: { A: true, B: true }, earthquakesLeft: { A: true, B: true }, rows: 6, status: "playing", winner: null };
      await page.routeWebSocket(/\/ws$/, (ws) => {
        ws.onMessage((raw) => {
          if (String(raw).includes('"join"')) ws.send(JSON.stringify({ type: "snapshot", you: "A", seatToken: "x", opponentPresent: true, started: true, state, yourName: "Wmmmmmmmmmmmmmmm #4f2a", opponentName: "Mwwwwwwwwwwwwwww #a7f3", colours: { A: "red", B: "yellow" }, opponentReady: false }));
        });
      });
      await page.goto("/g/NAMES2");
      await page.locator(testid("name-you")).waitFor();
      for (const [name, card] of [["name-you", "panel-you"], ["name-opponent", "panel-opponent"]] as const) {
        const m = await page.locator(testid(name)).evaluate((el) => {
          const line = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
          return { lines: Math.round(el.getBoundingClientRect().height / line), right: el.getBoundingClientRect().right, tag: el.querySelector(".player-tag")?.getBoundingClientRect().right ?? 0 };
        });
        const box = (await page.locator(testid(card)).boundingBox())!;
        expect(m.lines, `${name} is at most two lines`).toBeLessThanOrEqual(2);
        expect(m.right, `${name} stays inside its card`).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(m.tag, `${name}'s tag stays inside its card`).toBeLessThanOrEqual(box.x + box.width + 1);
        await expect(page.locator(`${testid(name)} .player-tag`), `${name}'s tag is shown`).toBeVisible();
      }
      await context.close();
    });
  }
});

// ---- Part B of the second fix list: the keyboard never covers a form (Q21, U91, U92) ----

const FORMS: Array<{ name: string; screen: string; opener: string; dialog: string; first: string; primary: string; signedIn?: boolean }> = [
  { name: "nickname", screen: "/", opener: "rename", dialog: "nickname-dialog", first: "nickname-input", primary: "nickname-save" },
  { name: "join with a code", screen: "/", opener: "join-toggle", dialog: "code-dialog", first: "code-input", primary: "code-join" },
  { name: "save my progress", screen: "/account", opener: "open-signup", dialog: "signup-dialog", first: "username-input", primary: "signup-save" },
  { name: "sign in", screen: "/account", opener: "open-signin", dialog: "signin-dialog", first: "username-input", primary: "signin-save" },
  { name: "change password", screen: "/account", opener: "open-password", dialog: "password-dialog", first: "current-input", primary: "password-save", signedIn: true },
];

test.describe("Q21 the keyboard never covers a form", () => {
  for (const viewport of [NARROW, PHONE]) {
    for (const form of FORMS) {
      test(`Q21 ${form.name} with a 300px-tall visible area at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
        const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
        if (form.signedIn) {
          const name = `kb${Math.random().toString(36).slice(2, 9)}`;
          const r = await page.request.post("/api/account/signup", { data: { username: name, password: "correct horse battery" } });
          expect(r.ok()).toBe(true);
        }
        await page.goto(form.screen);
        await page.waitForLoadState("networkidle");
        await page.locator(testid(form.opener)).click();
        await page.locator(testid(form.dialog)).waitFor();
        await page.locator(testid(form.first)).focus();
        // An open keyboard leaves about 300px: shrink the window, which is what the visual viewport reports (U91).
        await page.setViewportSize({ width: viewport.width, height: 300 });
        await page.waitForTimeout(300);
        for (const id of [form.first, form.primary]) {
          const b = (await page.locator(testid(id)).boundingBox())!;
          expect(b.y, `${id} starts inside the visible area`).toBeGreaterThanOrEqual(-0.5);
          expect(b.y + b.height, `${id} ends inside the visible area (300px)`).toBeLessThanOrEqual(300.5);
        }
        await context.close();
      });
    }
  }
});

test.describe("U92 the keyboard's own keys finish the form", () => {
  test("U92 Enter in the username moves to the password, and Enter in the last field submits", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/account");
    await page.locator(testid("open-signup")).click();
    const username = page.locator(testid("username-input"));
    const password = page.locator(testid("password-input"));
    await expect(username).toHaveAttribute("autocomplete", "username");
    await expect(username).toHaveAttribute("enterkeyhint", "next");
    await expect(password).toHaveAttribute("autocomplete", "new-password");
    await expect(password).toHaveAttribute("enterkeyhint", "go");
    await username.fill(`kb${Math.random().toString(36).slice(2, 9)}`);
    await page.keyboard.press("Enter");
    await expect(password, "Enter moved focus to the password").toBeFocused();
    await expect(page.locator(testid("signup-dialog")), "and did not submit").toBeVisible();
    await password.fill("correct horse battery");
    await page.keyboard.press("Enter");
    await expect(page.locator(testid("signup-dialog")), "Enter in the last field submitted").toBeHidden();
    await context.close();
  });

  test("U92 autocomplete on sign in and change password", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, PHONE, { reducedMotion: true });
    await page.goto("/account");
    await page.locator(testid("open-signin")).click();
    await expect(page.locator(testid("username-input"))).toHaveAttribute("autocomplete", "username");
    await expect(page.locator(testid("password-input"))).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator(testid("password-input"))).toHaveAttribute("enterkeyhint", "go");
    await context.close();
  });
});

// ---- Part C of the second fix list: Q22, U154, U155 (31 October 2026) ----

test.describe("Q22 the versus bar and the header bar on a phone", () => {
  for (const viewport of [NARROW, PHONE]) {
    test(`Q22 U154 U155 no VS badge, Home is an icon, Round is 16px from the edge, nothing wraps past two lines at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      const state = { board: [[], [], [], [], [], [], []], round: 0, shieldsLeft: { A: true, B: true }, earthquakesLeft: { A: true, B: true }, rows: 6, status: "playing", winner: null };
      await page.routeWebSocket(/\/ws$/, (ws) => {
        ws.onMessage((raw) => {
          if (String(raw).includes('"join"')) ws.send(JSON.stringify({ type: "snapshot", you: "A", seatToken: "x", opponentPresent: true, started: true, state, yourName: "Wmmmmmmmmmmmmmmm #4f2a", opponentName: "Mwwwwwwwwwwwwwww #a7f3", colours: { A: "red", B: "yellow" }, opponentReady: false }));
        });
      });
      await page.goto("/g/HDRBAR");
      await page.locator(testid("name-you")).waitFor();
      await expect(page.locator(`${testid("players")} .vs`), "no VS badge on a phone").toBeHidden();
      // Home is only its icon, at least 44px, with "Home" as its accessible name.
      const home = page.locator(testid("header-home"));
      await expect(home).toHaveAttribute("aria-label", "Home");
      const hb = (await home.boundingBox())!;
      expect(hb.width, "Home is at least 44px wide").toBeGreaterThanOrEqual(43.5);
      expect(hb.height).toBeGreaterThanOrEqual(43.5);
      expect(await home.locator("span:visible").count(), "no visible word on Home").toBe(0);
      // Round N is at least 16px from the screen's right edge.
      const round = (await page.locator(testid("round-line")).boundingBox())!;
      expect(viewport.width - (round.x + round.width), "Round is at least 16px from the right edge").toBeGreaterThanOrEqual(15.5);
      // The middle line is one line cut with an ellipsis.
      const title = (await page.locator(testid("opponent-heading")).boundingBox())!;
      expect(title.height, "the heading is one line").toBeLessThan(30);
      expect(title.x + title.width, "the heading stays left of Round").toBeLessThanOrEqual(round.x + 1);
      // The two cards: same size, even gap, nothing overlapping.
      const a = (await page.locator(testid("panel-you")).boundingBox())!;
      const b = (await page.locator(testid("panel-opponent")).boundingBox())!;
      expect(Math.abs(a.width - b.width), "cards are the same width").toBeLessThanOrEqual(2);
      expect(b.x - (a.x + a.width), "a gap between the cards").toBeGreaterThanOrEqual(7.5);
      for (const card of ["panel-you", "panel-opponent"]) {
        const over = await page.locator(testid(card)).evaluate((el) => {
          const c = el.getBoundingClientRect();
          return [...el.querySelectorAll<HTMLElement>(".player-text > *, .avatar")].filter((e) => e.getBoundingClientRect().right > c.right + 1 || e.getBoundingClientRect().bottom > c.bottom + 1).length;
        });
        expect(over, `${card}: nothing sticks out of the card`).toBe(0);
        const status = page.locator(testid(card)).locator(".player-meta");
        expect((await status.boundingBox())!.height, `${card}: one compact status line`).toBeLessThan(32);
      }
      // Names are at most two lines (Q20) and the shield and Earthquake are icons with accessible names, not visible words.
      await expect(page.locator(`${testid("opponent-powerups")} .opp-power-word:visible`), "no visible power-up words").toHaveCount(0);
      await expect(page.locator(testid("opponent-shield"))).toHaveText("Shield available");
      await context.close();
    });
  }

  test("U154 on a laptop the VS badge stays between the cards", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await openComputerGame(page);
    await expect(page.locator(`${testid("players")} .vs`)).toBeVisible();
    await expect(page.locator(testid("header-home"))).toContainText("Home");
    await context.close();
  });
});

test.describe("Q23 the round icons and the laptop balance", () => {
  for (const viewport of FULL_SCREENS) {
    test(`Q23 each round icon's label is at least 8px below its circle and no two labels touch at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const items = await page.locator(`${testid("icon-row")} .round-item`).evaluateAll((els) =>
        els.map((el) => {
          const circle = el.querySelector<HTMLElement>(".round")!.getBoundingClientRect();
          const label = el.querySelector<HTMLElement>(".round")!.nextElementSibling as HTMLElement; // the word under the circle
          const range = document.createRange();
          range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          return { gap: text.top - circle.bottom, left: text.left, right: text.right, top: text.top };
        }),
      );
      for (const [i, item] of items.entries()) expect(item.gap, `label ${i + 1} is 8px under its circle`).toBeGreaterThanOrEqual(7.5);
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (Math.abs(items[i].top - items[j].top) > 4) continue; // not on the same row
          const apart = Math.max(items[j].left - items[i].right, items[i].left - items[j].right);
          expect(apart, `labels ${i + 1} and ${j + 1} do not touch`).toBeGreaterThanOrEqual(2);
        }
      }
      await context.close();
    });
  }

  test("Q23 U38 on a laptop the right-hand column is vertically centred beside the left-hand one", async ({ browser }) => {
    const { context, page } = await newPlayer(browser, LAPTOP, { reducedMotion: true });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const left = (await page.locator(".home-left").boundingBox())!;
    const card = (await page.locator(testid("player-card")).boundingBox())!;
    const row = (await page.locator(testid("icon-row")).boundingBox())!;
    const rightCentre = (card.y + row.y + row.height) / 2;
    const leftCentre = left.y + left.height / 2;
    expect(Math.abs(rightCentre - leftCentre), "the centres of the two columns are within 24px").toBeLessThanOrEqual(24);
    await context.close();
  });

  for (const viewport of [PHONE, LAPTOP]) {
    test(`Q23 U32 saving a nickname shows the new name, no message and moves nothing at ${viewport.width} x ${viewport.height}`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
      await page.request.post("/api/guest", { data: { nickname: "Pip Squeak" } });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await page.mouse.move(1, 1);
      const before = await geometry(page, ["nickname-dialog", "player-name"]);
      await page.locator(testid("rename")).click();
      await page.locator(testid("nickname-input")).fill("Pip Two");
      await page.locator(testid("nickname-save")).click();
      await expect(page.locator(testid("nickname-dialog"))).toHaveCount(0);
      await expect(page.locator(testid("player-name"))).toContainText("Pip Two");
      await expect(page.locator("body")).not.toContainText("Nickname saved");
      await page.mouse.move(1, 1);
      await page.waitForTimeout(400);
      const after = await geometry(page, ["nickname-dialog", "player-name"]);
      for (const [id, box] of Object.entries(before)) {
        const now = after[id];
        if (!now) continue;
        expect(Math.abs(now.y - box.y) + Math.abs(now.h - box.h), `${id} did not move or change height`).toBeLessThanOrEqual(1);
      }
      await context.close();
    });
  }
});
