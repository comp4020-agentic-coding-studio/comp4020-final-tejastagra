// The first-time tutorial (docs/design/tutorial.md U41 to U48 and U167, rules R47 to R50). It is
// interactive: each step invites the player to act, but "Next" is always there (U167). It runs on a practice board in the browser against a scripted computer. It never
// opens a game on the server, so it can never change the leaderboard (R50): the only thing it
// sends is "finished" or "skipped", which saves with the player (R48).
import { avatar, buildBoard, ceilingAnimation, colourAvatar, confettiBurst, earthquakeIcon, markDoomed, quakeAnimation, reducedMotion, themeNumber } from "./arcade.ts";
import { $ } from "./common.ts";

type Piece = "you" | "opponent" | "rubble";

// The practice board and everything the scripted steps use to show a lesson.
interface Stage {
  place(column: number, piece: Piece, animation?: boolean): number;
  reset(): void;
  lock(column: number): void; // the ghost disc lifts and locks above a column (U12)
  clearGhost(): void;
  glow(column: number | null): void;
  // Waits for the player to tap a column. `refuse` says a tap is not the one the lesson needs;
  // the tap is then ignored and the wait goes on.
  waitTap(refuse?: (column: number) => boolean): Promise<number>;
  // Waits for the player to tap the shield badge.
  waitShield(): Promise<void>;
  armed(): boolean;
  showShield(show: boolean): void;
  shieldUsed(): void;
  // Earthquake (U67): waits for the player to tap its badge, then shakes the practice board.
  waitQuake(): Promise<void>;
  showQuake(show: boolean): void;
  quakeUsed(): void;
  shake(): Promise<void>;
  // The shrinking board (U74): a warning banner and a flashing top row, then the top row turns to rock.
  warn(text: string | null): void;
  shrink(): Promise<void>;
  // The practice round timer (U140): a bar under the board that drains, and never runs out on its own.
  timer(show: boolean): void;
  // U146: a picture in the practice board's place (the friends step), or the board back.
  picture(show: boolean): void;
  pause(ms: number): Promise<void>;
  win(cells: Array<[number, number]>): void;
  wrap: HTMLElement;
}

interface Step {
  title: string;
  caption: string;
  // Runs the step; resolves once the player has done what it asks. The last step has no action.
  run: (s: Stage) => Promise<void>;
}

const THINK = () => themeNumber("--ms-beat");
// The practice board's rows before and after the first ceiling drop (R61, after round 12).
const FULL_ROWS = 6;
const SHRUNK_ROWS = 5;

// The eleven steps (docs/design/tutorial.md U137 to U147). A step's `run` waits for the player's action, but never holds Next back.
const STEPS: Step[] = [
  {
    title: "The goal",
    caption: "Get four of your discs in a row, across, down or diagonally.",
    async run(s) {
      s.reset();
      for (const c of [1, 2, 3, 4]) s.place(c, "you");
      s.place(0, "opponent");
      s.place(5, "opponent");
      s.win([[1, 0], [2, 0], [3, 0], [4, 0]]);
    },
  },
  {
    title: "Pick a column",
    caption: "Tap a column to choose it. Your choice locks in and cannot be changed this round.",
    async run(s) {
      s.reset();
      const column = await s.waitTap();
      s.lock(column);
    },
  },
  {
    title: "You both move at once",
    caption: "Your opponent chooses at the same time. Neither of you sees the other's choice, and both discs drop together.",
    async run(s) {
      s.reset();
      const column = await s.waitTap();
      s.lock(column);
      await s.pause(THINK());
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true); // a different column: both discs land
    },
  },
  {
    title: "The round timer",
    caption: "Each round lasts up to 10 seconds, and the bar under the board shows the time left. If you do not choose in time, you miss the round and drop nothing. If both players miss 3 rounds in a row, the game is abandoned.",
    async run(s) {
      s.reset();
      s.timer(true);
      const column = await s.waitTap();
      s.timer(false);
      s.lock(column);
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true);
    },
  },
  {
    title: "Crashes",
    caption: "If you both pick the same column, the discs crash and leave rubble. Rubble blocks lines for both players.",
    async run(s) {
      s.reset();
      const column = await s.waitTap();
      s.lock(column);
      await s.pause(THINK());
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "rubble", true); // the scripted computer chose the same column
    },
  },
  {
    title: "Your shield",
    caption: "The computer is about to win in the glowing column. Arm your shield, then pick that column. The shield wins one crash, once per game, and is used up even if there is no crash.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2]) s.place(c, "opponent"); // three in a row: the computer needs column 4
      s.place(5, "you");
      s.glow(3);
      s.showShield(true);
      await s.waitShield();
      const column = await s.waitTap((c) => !s.armed() || c !== 3); // only the glowing column counts, and only once armed
      s.lock(column);
      await s.pause(THINK());
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.glow(null);
      s.place(column, "you", true); // your disc lands and blocks the win; theirs is lost
      s.shieldUsed();
    },
  },
  {
    title: "Earthquake",
    caption: "Earthquake uses your turn: the bottom row crumbles and everything drops down one. Lines it makes by itself do not win. It works once per game, and only when the bottom row has a piece.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2]) {
        s.place(c, "opponent"); // the computer has three in a row along the bottom and needs the glowing column
        s.place(c, "you");
      }
      s.glow(3);
      s.showQuake(true);
      await s.waitQuake();
      await s.pause(THINK());
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.glow(null);
      await s.shake(); // the bottom row crumbles and everything drops one row
      s.place(3, "opponent", true); // then the computer's disc drops: no line, nothing to win
      s.quakeUsed();
    },
  },
  {
    title: "The shrinking board",
    caption: "After round 12, and again after round 20, the top row closes. A warning shows the round before. Plan ahead: space runs out.",
    async run(s) {
      s.reset();
      s.place(2, "opponent");
      s.place(4, "you");
      s.place(4, "opponent");
      s.warn("The ceiling drops after this round");
      const column = await s.waitTap();
      s.lock(column);
      await s.pause(THINK());
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true);
      await s.pause(themeNumber("--ms-collapse-start"));
      await s.shrink(); // the top row cracks, crumbles and turns to rock
      s.warn(null);
    },
  },
  {
    title: "Draws",
    caption: "If you both complete a line in the same round, or the board fills up, it is a draw.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2, 3]) s.place(c, "you");
      for (const c of [0, 1, 2, 3]) s.place(c, "opponent");
      s.win([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
    },
  },
  {
    title: "Playing with friends",
    caption: "Play a friend gives you a link and a 6-letter code to send to anyone, anywhere in the world. The first person to open it plays you. If you send it to more people, the second person to open it, and anyone after them, can watch the game live as a spectator.",
    async run(s) {
      s.reset();
      s.picture(true); // you, the first friend as your opponent, the second friend watching (U146)
    },
  },
  {
    title: "Leaving and playing again",
    caption: "Leaving a game counts as a forfeit, so you lose. After a game you can play the same person again with Play again. On a keyboard: keys 1 to 7 pick a column, S arms your shield, E uses Earthquake.",
    async run(s) {
      s.reset();
    },
  },
];

let open = false;
let dismiss: (() => void) | null = null; // closes the open tutorial without saving or starting anything (R102: the game it was for is gone)

// R102: the game this tutorial was for was cancelled, so the tutorial closes at once and nothing is saved or started.
export function dismissTutorial(): void {
  dismiss?.();
}

async function save(result: "finished" | "skipped" | "replay"): Promise<void> {
  try {
    await fetch("/api/tutorial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result }) });
  } catch {
    // The tutorial still closes; it may show again next time, which is harmless.
  }
}

// `mode` "match": shown before the player's first match (R47, U136); the last button starts it, and Skip starts it too.
// `mode` "replay": from How to play (R49); it starts nothing. `onClose` is told how it ended.
export async function showTutorial(options: { mode?: "match" | "replay"; onClose?: (result: "finished" | "skipped") => void } = {}): Promise<void> {
  const mode = options.mode ?? "match";
  if (open) return;
  open = true;
  let index = 0;
  let running = 0; // a step that was left (skipped, or finished) can no longer change the screen
  const root = $("tutorial");
  const titleEl = $("tutorial-title");
  const progress = $("tutorial-progress");
  const caption = $("tutorial-caption");
  const host = $("tutorial-board");
  const lane = $("tutorial-lane");
  const slotHost = $("tutorial-slot");
  const next = $("tutorial-next") as HTMLButtonElement;
  const skip = $("tutorial-skip");

  // ---- The practice board: the same hit areas as the game, with its own hooks ----
  const board = buildBoard();
  const wrap = document.createElement("div");
  wrap.className = "board-wrap";
  const glows = document.createElement("div");
  glows.className = "columns-glow";
  glows.setAttribute("aria-hidden", "true");
  const hits = document.createElement("div");
  hits.className = "columns-hit";
  hits.setAttribute("role", "group");
  hits.setAttribute("aria-label", "Practice board: choose a column");
  const glowCells: HTMLElement[] = [];
  const buttons: HTMLButtonElement[] = [];
  for (let c = 0; c < 7; c++) {
    const g = document.createElement("span");
    g.className = "column-glow";
    glows.append(g);
    glowCells.push(g);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "column-hit";
    b.dataset.testid = `tutorial-column-${c}`;
    b.setAttribute("aria-label", `Column ${c + 1}`);
    hits.append(b);
    buttons.push(b);
  }
  board.root.setAttribute("aria-hidden", "true");
  wrap.append(board.root, glows, hits);

  // U177, U178: the step 10 illustration, drawn with shapes in a panel the board's size and place. From the top: a mock share card (a
  // made-up 6-letter code and a Copy link button that is only a shape), two arrows down to the two players (the red face with its ring
  // disc and the yellow face with its cross disc, joined by a line, "Plays you"), and beside them a dashed box with the eye icon and
  // three smaller faces ("Watch live"). Built with DOM calls, never innerHTML, and never clickable: one picture with one name.
  const friends = document.createElement("div");
  friends.className = "tutorial-friends";
  friends.dataset.testid = "tutorial-friends";
  friends.hidden = true;
  friends.setAttribute("role", "img");
  friends.setAttribute("aria-label", "A share card with a game code and a Copy link button. Two arrows lead to the two players, who play each other, and a group of three watchers who watch live.");
  const el = (tag: string, className: string, text?: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    node.setAttribute("aria-hidden", "true");
    return node;
  };
  const svgNS = "http://www.w3.org/2000/svg";
  const arrow = (): SVGSVGElement => {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("friend-arrow");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M12 3v14M6 12l6 7 6-7");
    svg.append(path);
    return svg;
  };
  const eyeIcon = (): SVGSVGElement => {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.dataset.icon = "eye";
    svg.classList.add("friend-eye");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z");
    svg.append(path);
    return svg;
  };
  const player = (role: "you" | "opponent", seed: string): HTMLElement => {
    const one = el("div", "friend", undefined);
    one.dataset.role = role;
    const face = avatar(seed);
    colourAvatar(face, role === "you" ? "red" : "yellow");
    face.setAttribute("aria-hidden", "true");
    one.append(face);
    return one;
  };
  // 1. The share card: a code and a Copy link button, shapes only.
  const card = el("div", "friend-card");
  card.append(el("span", "friend-code", "K7QM2X"), el("span", "friend-copy", "Copy link"));
  // 2. Two arrows, one to the players and one to the watchers.
  const arrows = el("div", "friend-arrows");
  arrows.append(arrow(), arrow());
  // 3. The two players, joined by a line, with their label.
  const pair = el("div", "friend-players");
  const pairRow = el("div", "friend-pair");
  pairRow.append(player("you", "tutorial-you"), el("span", "friend-link"), player("opponent", "tutorial-friend-1"));
  pair.append(pairRow, el("span", "friend-label", "Plays you"));
  // 4. The watchers: a dashed box with the eye icon, three smaller faces and their label.
  const watchers = el("div", "friend-watchers");
  const group = el("div", "friend-group");
  group.append(eyeIcon());
  for (const seed of ["tutorial-friend-2", "tutorial-friend-3", "tutorial-friend-4"]) {
    const face = avatar(seed);
    face.classList.add("friend-small");
    face.setAttribute("aria-hidden", "true");
    group.append(face);
  }
  watchers.append(group, el("span", "friend-label", "Watch live"));
  const below = el("div", "friend-below");
  below.append(pair, watchers);
  friends.append(card, arrows, below);

  const shield = document.createElement("button");
  shield.type = "button";
  shield.className = "shield-badge tutorial-shield";
  shield.dataset.testid = "tutorial-shield";
  shield.hidden = true;
  shield.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/></svg><span></span>`;
  const shieldLabel = shield.querySelector("span")!;
  const quake = document.createElement("button");
  quake.type = "button";
  quake.className = "shield-badge tutorial-shield tutorial-earthquake";
  quake.dataset.testid = "tutorial-earthquake";
  quake.hidden = true;
  quake.append(earthquakeIcon());
  const quakeLabel = document.createElement("span");
  quake.append(quakeLabel);
  const warning = document.createElement("p");
  warning.className = "shrink-warning tutorial-warning";
  warning.dataset.testid = "tutorial-warning";
  warning.setAttribute("role", "status");
  warning.hidden = true;
  const timerBar = document.createElement("div");
  timerBar.className = "timer-track tutorial-timer";
  timerBar.dataset.testid = "tutorial-timer";
  timerBar.setAttribute("role", "progressbar");
  timerBar.setAttribute("aria-label", "Time left in this practice round");
  timerBar.setAttribute("aria-valuemin", "0");
  timerBar.setAttribute("aria-valuemax", "10");
  timerBar.hidden = true;
  const timerFill = document.createElement("span");
  timerFill.className = "timer-fill";
  timerBar.append(timerFill);
  let timerTick: ReturnType<typeof setInterval> | undefined;
  // U167: the middle area holds only the board (or the friends picture) and what a step needs around it, each in a place reserved
  // for it: the warning banner above, the timer bar and the step's power-up button below. No text sits under the board.
  // They share one slot under the board, because no step shows more than one of them. The slot is its own block under the board.
  slotHost.replaceChildren(warning, timerBar, shield, quake);
  host.replaceChildren(wrap, friends);

  const heights = new Array<number>(7).fill(0);
  const ghost = document.createElement("span");
  ghost.className = "ghost";
  ghost.dataset.testid = "tutorial-ghost";
  ghost.dataset.chosen = "true";
  ghost.hidden = true;
  let tapWaiter: { refuse?: (c: number) => boolean; resolve: (c: number) => void } | null = null;
  let shieldWaiter: (() => void) | null = null;
  let quakeWaiter: (() => void) | null = null;
  let armed = false;
  let locked = false;

  const stage: Stage = {
    wrap,
    place(column, piece, animation = false) {
      const row = heights[column]++;
      board.place(column, row, piece, animation ? (piece === "rubble" ? "thud" : "dropping") : undefined);
      return row;
    },
    reset() {
      // The one place everything a step added is removed (U173): banners, highlighted columns, power-up buttons, timer bars and demo
      // discs. It runs when a step is entered and when it is left, so a step that was left early cannot leave anything behind.
      stage.picture(false);
      stage.timer(false);
      stage.warn(null);
      board.clear();
      board.setSeats(null);
      for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) board.setClosed(c, r, false);
      heights.fill(0);
      stage.clearGhost();
      stage.glow(null);
      armed = false;
      locked = false;
      shield.dataset.state = "ready";
      shield.disabled = false;
      shield.setAttribute("aria-pressed", "false");
      shieldLabel.textContent = "Arm shield";
      stage.showShield(false);
      quake.dataset.state = "ready";
      quake.disabled = false;
      quake.setAttribute("aria-pressed", "false");
      quakeLabel.textContent = "Use Earthquake";
      stage.showQuake(false);
    },
    lock(column) {
      locked = true;
      glowCells[column].append(ghost);
      ghost.hidden = false;
      for (const b of buttons) b.setAttribute("aria-disabled", "true");
    },
    clearGhost() {
      ghost.hidden = true;
      locked = false;
      for (const b of buttons) b.setAttribute("aria-disabled", "false");
    },
    glow(column) {
      glowCells.forEach((g, c) => (g.dataset.on = String(c === column)));
    },
    waitTap(refuse) {
      return new Promise((resolve) => {
        tapWaiter = { refuse, resolve };
      });
    },
    waitShield() {
      return new Promise((resolve) => {
        shieldWaiter = resolve;
      });
    },
    picture(show) {
      // The board keeps its place (hidden, not removed) so it never changes size or position between steps (U167).
      friends.hidden = !show;
      wrap.style.visibility = show ? "hidden" : "";
    },
    warn(text) {
      warning.hidden = text === null;
      warning.textContent = text ?? "";
      // The top row of the practice board flashes while the warning shows (U69).
      markDoomed(board, FULL_ROWS, text !== null, SHRUNK_ROWS);
    },
    async shrink() {
      await ceilingAnimation(board, FULL_ROWS, SHRUNK_ROWS);
      for (let c = 0; c < 7; c++) heights[c] = Math.min(heights[c], SHRUNK_ROWS);
    },
    waitQuake() {
      return new Promise((resolve) => {
        quakeWaiter = resolve;
      });
    },
    showQuake(show) {
      quake.hidden = !show;
    },
    quakeUsed() {
      quake.dataset.state = "spent";
      quake.disabled = true;
      quake.setAttribute("aria-pressed", "false");
      quakeLabel.textContent = "Earthquake used";
    },
    async shake() {
      const kinds = (columns: number): Array<Array<"you" | "opponent" | "rubble" | null>> =>
        Array.from({ length: columns }, (_, c) =>
          Array.from({ length: heights[c] }, (_, r) => {
            const mark = board.cell(c, r).dataset.piece;
            return mark === "A" ? "you" : mark === "B" ? "opponent" : "rubble";
          }),
        );
      const before = kinds(7);
      const shifted = before.map((column) => column.slice(1));
      await quakeAnimation(board, before, shifted);
      for (let c = 0; c < 7; c++) heights[c] = Math.max(0, heights[c] - 1);
    },
    armed: () => armed,
    showShield(show) {
      shield.hidden = !show;
    },
    shieldUsed() {
      shield.dataset.state = "spent";
      shield.disabled = true;
      shield.setAttribute("aria-pressed", "false");
      shieldLabel.textContent = "Shield used";
    },
    timer(show) {
      clearInterval(timerTick);
      timerBar.hidden = !show; // the slot under the board has a fixed size, so showing or hiding it moves nothing (U167)
      if (!show) return;
      // It drains from 10 to 2 seconds and stops there, so the practice round never times out on its own (U140).
      const startedAt = Date.now();
      const draw = () => {
        const left = Math.max(2, 10 - (Date.now() - startedAt) / 1000);
        timerBar.style.setProperty("--left", String(left / 10));
        timerBar.setAttribute("aria-valuenow", String(Math.ceil(left)));
        timerBar.dataset.urgency = left <= 3 ? "urgent" : left <= 5 ? "warn" : "";
      };
      draw();
      timerTick = setInterval(draw, reducedMotion() ? 1000 : 100);
    },
    pause: (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 120) : ms)),
    win(cells) {
      for (const [c, r] of cells) board.cell(c, r).querySelector(".piece")?.classList.add("win");
    },
  };

  buttons.forEach((b, c) => {
    b.addEventListener("click", () => {
      if (!tapWaiter || locked) return;
      if (tapWaiter.refuse?.(c)) return;
      const waiter = tapWaiter;
      tapWaiter = null;
      waiter.resolve(c);
    });
    b.addEventListener("mouseenter", () => {
      if (!tapWaiter || locked) return;
      glowCells[c].append(ghost);
      ghost.dataset.chosen = "false";
      ghost.hidden = false;
    });
    b.addEventListener("mouseleave", () => {
      if (!locked) ghost.hidden = true;
    });
  });
  // A locked ghost always shows as chosen.
  const lock = stage.lock;
  stage.lock = (c) => {
    ghost.dataset.chosen = "true";
    ghost.style.animation = "none";
    void ghost.offsetWidth;
    ghost.style.animation = "";
    lock(c);
  };

  shield.addEventListener("click", () => {
    if (locked || shield.dataset.state === "spent") return;
    armed = !armed;
    shield.setAttribute("aria-pressed", String(armed));
    shieldLabel.textContent = armed ? "Shield armed" : "Arm shield";
    if (armed && shieldWaiter) {
      const done = shieldWaiter;
      shieldWaiter = null;
      done();
    }
  });

  quake.addEventListener("click", () => {
    if (locked || quake.dataset.state === "spent" || !quakeWaiter) return;
    quake.setAttribute("aria-pressed", "true");
    quakeLabel.textContent = "Earthquake armed";
    const done = quakeWaiter;
    quakeWaiter = null;
    done();
  });

  root.hidden = false;
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden"; // Safari scrolls the page itself, not the body: nothing scrolls while it is open (U176)

  // ---- U176, U179, U180: on a phone the tutorial is full screen, and its sizes are worked out here, once, when it opens ----
  // The card is as tall as the visible screen (100svh) and its content block is centred in it. The sizes come in two sets: the large set
  // (17px counter, 32px title, 19px instructions, Next 52px) when the real text still fits the visible height with 44px board columns and
  // a 24px margin above and below, and otherwise the short set (15px, 26px, 17px, Next 48px, the floors). On a short screen the gaps
  // close first, then the board gets smaller (never below seven 44px columns), then the margin shrinks below 24px (to what is left, with
  // the ghost lane kept), and only when even that is too tall does the last resort apply (Next and Skip on one row, smaller text).
  // The instruction area is sized to the longest of the eleven instructions as they really lay out at this width and size. All of this
  // is done on open and on a resize or rotation, never on a step, so the board is the same size and in the same place on every step.
  const phone = window.matchMedia("(max-width: 599px)");
  const BOARD_RATIO = 0.87; // a board is this much taller than it is wide
  const MIN_BOARD = 308; // seven 44px columns with their gaps and padding (docs/design.md)
  const FULL_MARGIN = 24; // the space above and below the content block (U180)
  const NEXT_H = { large: 52, short: 48, tight: 44 } as const;
  function fitToScreen(): void {
    if (!phone.matches) {
      for (const name of ["--tut-gap", "--tut-top", "--tut-board-w", "--tut-margin"]) root.style.removeProperty(name); // a laptop keeps its card exactly as it is
      delete root.dataset.tight;
      delete root.dataset.size;
      return;
    }
    const card = root.querySelector<HTMLElement>(".tutorial-card")!;
    const lane = themeNumber("--ghost-size");
    // The stack for one layout: the height the instruction area needs for the longest instruction, and everything else that has to fit.
    const measure = (set: "large" | "short" | "tight") => {
      if (set === "tight") {
        root.dataset.tight = "true";
        delete root.dataset.size;
      } else {
        delete root.dataset.tight;
        root.dataset.size = set;
      }
      root.style.setProperty("--tut-margin", `${FULL_MARGIN}px`);
      root.style.setProperty("--tut-gap", "1");
      const cs = getComputedStyle(card);
      const innerW = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // The screen's height less the safe areas, which stay clear whatever the margin is.
      const safe = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) - 2 * FULL_MARGIN;
      const area = card.querySelector<HTMLElement>(".tutorial-top")!;
      const areaCs = getComputedStyle(area);
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.className = "tutorial-top";
      probe.style.cssText = `position:absolute;visibility:hidden;height:auto;width:${innerW}px;left:0;top:0;padding:${areaCs.padding}`;
      probe.innerHTML = `<p class="tutorial-progress">Step 10 of 11</p><h2></h2><p class="tutorial-caption"></p>`;
      card.append(probe);
      let top = 0;
      for (const step of STEPS) {
        probe.querySelector("h2")!.textContent = step.title;
        probe.querySelector(".tutorial-caption")!.textContent = step.caption;
        top = Math.max(top, probe.getBoundingClientRect().height);
      }
      probe.remove();
      top = Math.ceil(top);
      const next = NEXT_H[set];
      // Next and Skip are one row in the last resort, two otherwise.
      const buttons = set === "tight" ? 44 + 44 : 44 + next + 44; // the slot, Next, Skip
      // What sits between the parts at gap 1: the lane's 16, the board's 8, the slot's 12, and above Next 24 and between Next and Skip 12
      // (the last resort: Next and Skip are one row, so their 4px goes above the row and nothing sits between them).
      const gaps = set === "tight" ? 16 + 8 + 12 + 4 : 16 + 8 + 12 + 24 + 12;
      const marginFull = set === "tight" ? 4 : FULL_MARGIN;
      return { innerW, top, gaps, buttons, lane, marginFull, height: card.clientHeight - safe, safe };
    };
    const widest = (w: number) => Math.min(w, 316); // the board is never wider than the screen allows
    // Does a set fit with its gaps closed, a board with 44px columns and its full margin above and below?
    const fits = (m: ReturnType<typeof measure>) => m.height >= 2 * m.marginFull + m.top + m.lane + m.buttons + MIN_BOARD * BOARD_RATIO;
    let m = measure("large");
    let set: "large" | "short" | "tight" = "large";
    if (!fits(m)) {
      // The short set: closing the gaps and then the margin is allowed, so ask whether it fits with the margin at its smallest.
      m = measure("short");
      set = "short";
      const nothingLeft = m.height < m.top + m.lane + m.buttons + MIN_BOARD * BOARD_RATIO;
      if (nothingLeft) {
        m = measure("tight");
        set = "tight";
      }
    }
    // Now fit the board, the gaps and the margin into the height, in the order the docs give: gaps, then the board, then the margin.
    const width = widest(m.innerW);
    let boardW = width;
    let gap = 1;
    let margin = m.marginFull;
    const room = m.height - m.top - m.lane - m.buttons; // for the margins, the gaps and the board
    const wanted = 2 * margin + m.gaps + boardW * BOARD_RATIO;
    if (room < wanted) {
      // 1. close the gaps
      gap = Math.max(0, (room - 2 * margin - boardW * BOARD_RATIO) / m.gaps);
      if (gap === 0) {
        // 2. make the board smaller, down to its seven 44px columns
        boardW = Math.max(MIN_BOARD, Math.min(width, (room - 2 * margin) / BOARD_RATIO));
        // 3. then let the margin shrink below its full size, to what is left
        if ((room - 2 * margin) / BOARD_RATIO < MIN_BOARD) margin = Math.max(0, (room - MIN_BOARD * BOARD_RATIO) / 2);
      }
    }
    if (set === "tight") delete root.dataset.size;
    else root.dataset.size = set;
    root.style.setProperty("--tut-top", `${m.top}px`);
    root.style.setProperty("--tut-gap", String(Math.round(gap * 1000) / 1000));
    root.style.setProperty("--tut-margin", `${Math.floor(margin * 10) / 10}px`);
    root.style.setProperty("--tut-board-w", `${Math.floor(boardW)}px`);
  }
  fitToScreen();
  window.addEventListener("resize", fitToScreen);
  const stopFitting = () => window.removeEventListener("resize", fitToScreen);

  dismiss = () => {
    if (!open) return;
    open = false;
    stopFitting();
    running++;
    stage.timer(false);
    root.hidden = true;
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    next.removeEventListener("click", onNext);
    skip.removeEventListener("click", onSkip);
    document.removeEventListener("keydown", onKey);
  };

  async function close(result: "finished" | "skipped"): Promise<void> {
    open = false;
    stopFitting();
    running++;
    stage.timer(false);
    root.hidden = true;
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    next.removeEventListener("click", onNext);
    skip.removeEventListener("click", onSkip);
    document.removeEventListener("keydown", onKey);
    // Saved before the match starts, so it never shows again (R48), even if the next page loads at once.
    if (mode === "match") {
      rememberSeen();
      await save(result);
    }
    options.onClose?.(result);
  }

  function render(): void {
    const step = STEPS[index];
    const last = index === STEPS.length - 1;
    progress.textContent = `Step ${index + 1} of ${STEPS.length}`; // U136
    titleEl.textContent = step.title;
    caption.textContent = step.caption; // an aria-live region, so it is announced (U47)
    next.textContent = last ? (mode === "match" ? "Start the match" : "Done") : "Next";
    skip.textContent = mode === "replay" && last ? "Close" : "Skip tutorial";
    tapWaiter = null;
    shieldWaiter = null;
    quakeWaiter = null;
    const mine = ++running;
    root.dataset.stepDone = "false"; // a hook for the browser checks: the step's lesson has finished animating
    // Next is always there (U167), so a step may still be animating when the player moves on. Once it is left, every call it makes
    // does nothing and never returns, so it can no longer draw on the next step's board.
    const live = new Proxy(stage, {
      get(target, key) {
        const value = target[key as keyof Stage];
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => (mine !== running ? new Promise(() => {}) : (value as (...a: unknown[]) => unknown).apply(target, args));
      },
    });
    void step.run(live).then(() => {
      if (mine === running) root.dataset.stepDone = "true";
    });
  }

  function onNext(): void {
    if (index < STEPS.length - 1) {
      running++; // the step being left can no longer draw
      stage.reset(); // and everything it added is removed before the next one starts (U173)
      index++;
      render();
      return;
    }
    void close("finished"); // the last step: the chosen match starts, or From How to play nothing does (U136)
  }
  function onSkip(): void {
    stage.reset();
    void close(index === STEPS.length - 1 ? "finished" : "skipped");
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") void close("skipped");
    else if (event.key >= "1" && event.key <= "7") buttons[Number(event.key) - 1].click();
    else if (event.key === "s" || event.key === "S") {
      if (!shield.hidden) shield.click();
    } else if (event.key === "e" || event.key === "E") {
      if (!quake.hidden) quake.click();
    }
  }

  next.addEventListener("click", onNext);
  skip.addEventListener("click", onSkip);
  document.addEventListener("keydown", onKey);
  render();
}

// How to play (R49): the tutorial again, starting nothing.
export async function replayTutorial(): Promise<void> {
  await save("replay");
  await showTutorial({ mode: "replay" });
}

// R47: whether it has been seen is kept in this browser, so each new browser shows it once. Where local storage is blocked,
// the server's flag for the player (R48) decides instead.
const SEEN_KEY = "rubble-tutorial-seen";
function rememberSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // the server's flag still says it was seen
  }
}
export async function tutorialDue(): Promise<boolean> {
  try {
    if (localStorage.getItem(SEEN_KEY) === "1") return false; // this browser has seen it
  } catch {
    // local storage is blocked: the account or the guest's own flag decides, below
  }
  // R48: not seen in this browser. The server knows whether this player, or this account on any device, has (an account that has
  // finished a game or has seen it is never offered it), and a brand-new visitor has not.
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return false; // if the server cannot say, the game starts; the tutorial can be played from How to play
    const due = (await res.json()).tutorialDue === true;
    if (!due) rememberSeen(); // an experienced account: this browser need not ask again
    return due;
  } catch {
    return false;
  }
}

// R47, U136: before a game starts, run the tutorial if it is due, then start the game whether it was finished or skipped.
export async function beforeFirstMatch(start: () => void | Promise<void>): Promise<void> {
  if (!(await tutorialDue())) {
    await start();
    return;
  }
  await new Promise<void>((resolve) => void showTutorial({ mode: "match", onClose: () => resolve() }));
  await start();
}

// R100, R47: what a join to this code would become, asked before the tutorial is considered. A person who would watch, or whose
// game has ended, is never shown the tutorial; only someone about to play is. If the server cannot say, they are treated as a
// player so the tutorial is not skipped by a failure (it is skippable at any step).
export async function seatFor(code: string): Promise<"player" | "spectator" | "ended" | "unknown"> {
  try {
    const res = await fetch(`/api/seat?code=${encodeURIComponent(code)}`);
    if (!res.ok) return "player";
    const { role } = await res.json();
    return role === "spectator" || role === "ended" || role === "unknown" ? role : "player";
  } catch {
    return "player";
  }
}
