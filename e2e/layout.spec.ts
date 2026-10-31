// Browser checks for the layout and polish rules Q1 to Q9 (docs/design/qa-checklist.md): every screen, at 320, 390 and
// 1366 wide. Q10 and Q11 are judged by looking, in /visual-qa. Run with pnpm test:e2e, never in pnpm check.
import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, NARROW, PHONE } from "../playwright.config.ts";
import { makeGameCode, newPlayer, openTutorial, testid, toTutorialStep, waitForStart } from "./helpers.ts";

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

  test("the nickname popup saves, closes and shows the confirmation in the player card, and Cancel changes nothing", async ({ browser }) => {
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
    await expect(page.locator(testid("home-message"))).toHaveText("Nickname saved.");
    await expect(page.locator(testid("player-name"))).toContainText("Pip Two");
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

// Q4: page sections are 32px apart. The "Top players" strip is a section under the icon row, and was crowded against its labels.
test("Q4 the Top players section is at least 32px under the icon row on the home screen, at every width", async ({ browser }) => {
  for (const viewport of VIEWPORTS) {
    const { context, page } = await newPlayer(browser, viewport, { reducedMotion: true });
    await page.route("**/api/leaderboard**", (route) => route.fulfill({ json: { wins: [], rounds: [], you: null } }));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const row = (await page.locator(testid("icon-row")).boundingBox())!;
    const top = (await page.locator(testid("top-players")).boundingBox())!;
    expect(top.y - (row.y + row.height), `at ${viewport.width}: space between the icon row and Top players`).toBeGreaterThanOrEqual(31);
    await context.close();
  }
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
