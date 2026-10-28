// The first-time tutorial (docs/design/tutorial.md U41 to U48, rules R47 to R50). It is
// interactive: each step waits for the player to act, and "Next" appears only once the step's
// action is done. It runs on a practice board in the browser against a scripted computer. It never
// opens a game on the server, so it can never change the leaderboard (R50): the only thing it
// sends is "finished" or "skipped", which saves with the player (R48).
import { buildBoard, ceilingAnimation, confettiBurst, earthquakeIcon, markDoomed, quakeAnimation, reducedMotion, themeNumber } from "./arcade.ts";
import { $ } from "./common.ts";

type Piece = "you" | "opponent" | "rubble";

// The practice board and everything the scripted steps use to show a lesson.
interface Stage {
  place(column: number, piece: Piece, animation?: boolean): number;
  reset(): void;
  lock(column: number): void; // the ghost disc lifts and locks above a column (U12)
  clearGhost(): void;
  glow(column: number | null): void;
  // Waits for the player to tap a column. `refuse` may return a hint to say why a tap was not
  // the one the lesson needs; the tap is then ignored and the wait goes on.
  waitTap(refuse?: (column: number) => string | null): Promise<number>;
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
  status(text: string): void;
  hideStatus(): void;
  hint(text: string): void;
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

const STEPS: Step[] = [
  {
    title: "Pick a column",
    caption: "Tap a column to choose it. Once you choose, your choice is locked in.",
    async run(s) {
      s.reset();
      const column = await s.waitTap();
      s.lock(column);
      s.hint("Locked in. You cannot change it now.");
    },
  },
  {
    title: "You both move at once",
    caption: "Your opponent chooses at the same time. Neither of you sees the other's choice until both discs drop.",
    async run(s) {
      s.reset();
      s.hint("Tap a column.");
      const column = await s.waitTap();
      s.lock(column);
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true); // a different column: both discs land
      s.hint("Both discs dropped together.");
    },
  },
  {
    title: "Crash!",
    caption: "If you both pick the same column, the discs crash and leave rubble that belongs to nobody. Rubble blocks lines.",
    async run(s) {
      s.reset();
      s.hint("Tap any column. Your opponent will pick the same one.");
      const column = await s.waitTap();
      s.lock(column);
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "rubble", true); // the scripted computer chose the same column
      s.hint("You both chose the same column: rubble.");
    },
  },
  {
    title: "Power-ups: your shield",
    caption: "Your shield wins one crash per game. Use it when you both need the same column.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2]) s.place(c, "opponent"); // three in a row: the computer needs column 4
      s.place(5, "you");
      s.glow(3);
      s.showShield(true);
      s.hint("Your opponent is about to win in the glowing column. Tap your shield.");
      await s.waitShield();
      s.hint("Shield armed. Now tap the glowing column.");
      const column = await s.waitTap((c) => (!s.armed() ? "Tap your shield first." : c !== 3 ? "Tap the glowing column: your opponent needs it." : null));
      s.lock(column);
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.glow(null);
      s.place(column, "you", true); // your disc lands and blocks the win; theirs is lost
      s.shieldUsed();
      s.hint("Your disc landed. Your opponent's disc was lost.");
    },
  },
  {
    title: "Power-ups: Earthquake",
    caption: "Earthquake uses your turn: the bottom row crumbles away and everything drops down one. Use it to break up a line.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2]) {
        s.place(c, "opponent"); // the computer has three in a row along the bottom and needs the glowing column
        s.place(c, "you");
      }
      s.glow(3);
      s.showQuake(true);
      s.hint("They win next in the glowing column. Tap Earthquake.");
      await s.waitQuake();
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.glow(null);
      await s.shake(); // the bottom row crumbles and everything drops one row
      s.place(3, "opponent", true); // then the computer's disc drops: no line, nothing to win
      s.quakeUsed();
      s.hint("The bottom row crumbled. Their line is gone.");
    },
  },
  {
    title: "The board shrinks",
    caption: "The board shrinks as rounds pass: after round 12 the ceiling drops, and it drops again after round 20. Pieces in a closed row crumble away.",
    async run(s) {
      s.reset();
      s.place(2, "opponent");
      s.place(4, "you");
      s.place(4, "opponent");
      s.warn("The ceiling drops after this round");
      s.hint("Tap a column. Watch the top row.");
      const column = await s.waitTap();
      s.lock(column);
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true);
      await s.pause(themeNumber("--ms-collapse-start"));
      await s.shrink(); // the top row cracks, crumbles and turns to rock
      s.warn(null);
      s.hint("The top row is rock now. Nothing can land there.");
    },
  },
  {
    title: "Four in a row wins",
    caption: "Get four of your discs in a row, across, down or diagonally. If you both do it in the same round, it is a draw.",
    async run(s) {
      s.reset();
      s.showShield(false);
      s.showQuake(false);
      s.warn(null);
      s.place(0, "opponent");
      s.place(0, "opponent");
      s.place(5, "opponent");
      for (const c of [1, 2, 3]) s.place(c, "you");
      s.glow(4);
      s.hint("Tap the glowing column to finish your row.");
      const column = await s.waitTap((c) => (c !== 4 ? "Tap the glowing column to finish your row." : null));
      s.lock(column);
      s.status("Choosing");
      await s.pause(THINK());
      s.status("Ready");
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.glow(null);
      s.place(column, "you", true);
      s.place(6, "opponent", true);
      await s.pause(themeNumber("--ms-drop-land"));
      s.win([[1, 0], [2, 0], [3, 0], [4, 0]]);
      confettiBurst(s.wrap);
      s.hint("Four in a row. You win!");
    },
  },
  {
    title: "Ready to play",
    caption: "You know the rules. On a keyboard, keys 1 to 7 choose a column, S arms your shield and E uses Earthquake.",
    async run(s) {
      s.reset();
      s.showShield(false);
      s.showQuake(false);
      s.warn(null);
      s.hint("");
      s.hideStatus();
    },
  },
];

let open = false;

async function save(result: "finished" | "skipped" | "replay"): Promise<void> {
  try {
    await fetch("/api/tutorial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result }) });
  } catch {
    // The tutorial still closes; it may show again next time, which is harmless.
  }
}

export async function showTutorial(options: { onClose?: () => void } = {}): Promise<void> {
  if (open) return;
  open = true;
  let index = 0;
  let running = 0; // a step that was left (skipped, or finished) can no longer change the screen
  const root = $("tutorial");
  const titleEl = $("tutorial-title");
  const caption = $("tutorial-caption");
  const host = $("tutorial-board");
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

  const status = document.createElement("p");
  status.className = "tutorial-status";
  status.dataset.testid = "tutorial-status";
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
  const hint = document.createElement("p");
  hint.className = "tutorial-hint";
  hint.dataset.testid = "tutorial-hint";
  hint.setAttribute("role", "status");
  host.replaceChildren(status, warning, wrap, shield, quake, hint);

  const heights = new Array<number>(7).fill(0);
  const ghost = document.createElement("span");
  ghost.className = "ghost";
  ghost.dataset.testid = "tutorial-ghost";
  ghost.dataset.chosen = "true";
  ghost.hidden = true;
  let tapWaiter: { refuse?: (c: number) => string | null; resolve: (c: number) => void } | null = null;
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
      board.clear();
      heights.fill(0);
      stage.clearGhost();
      stage.glow(null);
      stage.status("Choosing");
      armed = false;
      locked = false;
      shield.dataset.state = "ready";
      shield.disabled = false;
      shield.setAttribute("aria-pressed", "false");
      shieldLabel.textContent = "Tap to arm shield";
      stage.showShield(false);
      quake.dataset.state = "ready";
      quake.disabled = false;
      quake.setAttribute("aria-pressed", "false");
      quakeLabel.textContent = "Tap to use Earthquake";
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
    status(text) {
      status.hidden = false;
      status.textContent = `Opponent: ${text}`;
    },
    hideStatus() {
      status.hidden = true;
      hint.hidden = true;
    },
    hint(text) {
      hint.textContent = text;
    },
    pause: (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 120) : ms)),
    win(cells) {
      for (const [c, r] of cells) board.cell(c, r).querySelector(".piece")?.classList.add("win");
    },
  };

  buttons.forEach((b, c) => {
    b.addEventListener("click", () => {
      if (!tapWaiter && shieldWaiter && !locked) {
        stage.hint("Tap your shield first.");
        return;
      }
      if (!tapWaiter && quakeWaiter && !locked) {
        stage.hint("Tap Earthquake: it uses your turn.");
        return;
      }
      if (!tapWaiter || locked) return;
      const why = tapWaiter.refuse?.(c) ?? null;
      if (why) {
        stage.hint(why);
        return;
      }
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
    shieldLabel.textContent = armed ? "Shield armed" : "Tap to arm shield";
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

  function close(result: "finished" | "skipped"): void {
    open = false;
    running++;
    root.hidden = true;
    document.body.style.overflow = "";
    void save(result);
    next.removeEventListener("click", onNext);
    skip.removeEventListener("click", onSkip);
    document.removeEventListener("keydown", onKey);
    options.onClose?.();
  }

  function render(): void {
    const step = STEPS[index];
    const last = index === STEPS.length - 1;
    titleEl.textContent = step.title;
    caption.textContent = step.caption; // an aria-live region, so it is announced (U47)
    next.textContent = last ? "Play the computer" : "Next";
    skip.textContent = last ? "Back home" : "Skip";
    hint.hidden = false;
    next.hidden = true; // Next only appears once the step's action is done (U41 to U46)
    tapWaiter = null;
    shieldWaiter = null;
    quakeWaiter = null;
    const mine = ++running;
    void step.run(stage).then(() => {
      if (mine !== running) return;
      next.hidden = false;
      next.focus();
    });
  }

  async function onNext(): Promise<void> {
    if (index < STEPS.length - 1) {
      index++;
      render();
      return;
    }
    close("finished");
    // U46: the last step offers the computer.
    try {
      const res = await fetch("/api/computer", { method: "POST" });
      if (res.ok) {
        const { code } = await res.json();
        try {
          sessionStorage.setItem(`rubble-computer-${code}`, "1");
        } catch {
          // Play again then starts a friend game, which is harmless
        }
        location.href = `/g/${code}`;
      }
    } catch {
      // stay on the page; the Play the computer button is still there
    }
  }
  function onSkip(): void {
    close(index === STEPS.length - 1 ? "finished" : "skipped");
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") close("skipped");
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

export async function replayTutorial(): Promise<void> {
  await save("replay");
  await showTutorial();
}
