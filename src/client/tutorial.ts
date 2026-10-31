// The first-time tutorial (docs/design/tutorial.md U41 to U48, rules R47 to R50). It is
// interactive: each step waits for the player to act, and "Next" appears only once the step's
// action is done. It runs on a practice board in the browser against a scripted computer. It never
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
  // The practice round timer (U140): a bar under the board that drains, and never runs out on its own.
  timer(show: boolean): void;
  hint(text: string): void;
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

// The eleven steps (docs/design/tutorial.md U137 to U147). A step whose `run` waits for the player shows Next only once they
// have acted; a step with nothing to do shows Next at once.
const STEPS: Step[] = [
  {
    title: "The goal",
    caption: "Get four of your discs in a row, across, down or diagonally.",
    async run(s) {
      s.reset();
      s.hideStatus();
      for (const c of [1, 2, 3, 4]) s.place(c, "you");
      s.place(0, "opponent");
      s.place(5, "opponent");
      s.win([[1, 0], [2, 0], [3, 0], [4, 0]]);
      s.hint("Four in a row wins.");
    },
  },
  {
    title: "Pick a column",
    caption: "Tap a column to choose it. Your choice locks in and cannot be changed this round.",
    async run(s) {
      s.reset();
      s.hint("Tap a column.");
      const column = await s.waitTap();
      s.lock(column);
      s.hint("Locked in. You cannot change it now.");
    },
  },
  {
    title: "You both move at once",
    caption: "Your opponent chooses at the same time. Neither of you sees the other's choice, and both discs drop together.",
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
    title: "The round timer",
    caption: "Each round lasts up to 10 seconds, and the bar under the board shows the time left. If you do not choose in time, you miss the round and drop nothing. If both players miss 3 rounds in a row, the game is abandoned.",
    async run(s) {
      s.reset();
      s.timer(true);
      s.hint("Watch the bar drain, then tap a column before it runs out.");
      const column = await s.waitTap();
      s.timer(false);
      s.lock(column);
      await s.pause(THINK() / 3);
      s.clearGhost();
      s.place(column, "you", true);
      s.place(column === 6 ? 5 : column + 1, "opponent", true);
      s.hint("Chosen in time. A missed round drops nothing.");
    },
  },
  {
    title: "Crashes",
    caption: "If you both pick the same column, the discs crash and leave rubble. Rubble blocks lines for both players.",
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
    title: "Your shield",
    caption: "The computer is about to win in the glowing column. Arm your shield, then pick that column. The shield wins one crash, once per game, and is used up even if there is no crash.",
    async run(s) {
      s.reset();
      for (const c of [0, 1, 2]) s.place(c, "opponent"); // three in a row: the computer needs column 4
      s.place(5, "you");
      s.glow(3);
      s.showShield(true);
      s.hint("Tap your shield.");
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
      s.hint("Your disc landed and blocked the win. Your shield is used up.");
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
    title: "The shrinking board",
    caption: "After round 12, and again after round 20, the top row closes. A warning shows the round before. Plan ahead: space runs out.",
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
    title: "Draws",
    caption: "If you both complete a line in the same round, or the board fills up, it is a draw.",
    async run(s) {
      s.reset();
      s.hideStatus();
      for (const c of [0, 1, 2, 3]) s.place(c, "you");
      for (const c of [0, 1, 2, 3]) s.place(c, "opponent");
      s.win([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
      s.hint("Both lines in the same round: a draw.");
    },
  },
  {
    title: "Playing with friends",
    caption: "Play a friend gives you a link and a 6-letter code to send to anyone, anywhere in the world. The first person to open it plays you. If you send it to more people, the second person to open it, and anyone after them, can watch the game live as a spectator.",
    async run(s) {
      s.reset();
      s.hideStatus();
      s.hint("");
      s.picture(true); // you, the first friend as your opponent, the second friend watching (U146)
    },
  },
  {
    title: "Leaving and playing again",
    caption: "Leaving a game counts as a forfeit, so you lose. After a game you can play the same person again with Play again. On a keyboard: keys 1 to 7 pick a column, S arms your shield, E uses Earthquake.",
    async run(s) {
      s.reset();
      s.hideStatus();
      s.hint("");
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

  // U146: three people drawn with shapes: you (a red ring disc), the first friend who plays you (a yellow cross disc), and the second
  // friend who only watches (an eye). No words: the caption says it. Built with DOM calls, never innerHTML.
  const friends = document.createElement("div");
  friends.className = "tutorial-friends";
  friends.dataset.testid = "tutorial-friends";
  friends.hidden = true;
  friends.setAttribute("role", "img");
  friends.setAttribute("aria-label", "You and a friend playing each other, and a second friend watching");
  const person = (role: "you" | "opponent" | "spectator", seed: string): HTMLElement => {
    const wrapPerson = document.createElement("div");
    wrapPerson.className = "friend";
    wrapPerson.dataset.role = role;
    const face = avatar(seed);
    if (role !== "spectator") colourAvatar(face, role === "you" ? "red" : "yellow");
    wrapPerson.append(face);
    if (role === "spectator") {
      const eye = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      eye.setAttribute("viewBox", "0 0 24 24");
      eye.setAttribute("aria-hidden", "true");
      eye.dataset.icon = "eye";
      eye.classList.add("friend-eye");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z");
      eye.append(path);
      wrapPerson.append(eye);
    } else {
      const disc = document.createElement("span");
      disc.className = "piece friend-disc";
      disc.dataset.colour = role === "you" ? "red" : "yellow";
      wrapPerson.append(disc);
    }
    return wrapPerson;
  };
  const link = document.createElement("span");
  link.className = "friend-link";
  link.setAttribute("aria-hidden", "true");
  const players = document.createElement("div");
  players.className = "friend-pair";
  players.append(person("you", "tutorial-you"), link, person("opponent", "tutorial-friend-1"));
  friends.append(players, person("spectator", "tutorial-friend-2"));

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
  const hint = document.createElement("p");
  hint.className = "tutorial-hint";
  hint.dataset.testid = "tutorial-hint";
  hint.setAttribute("role", "status");
  host.replaceChildren(status, warning, wrap, friends, timerBar, shield, quake, hint);

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
      stage.picture(false);
      stage.timer(false);
      status.hidden = false;
      hint.hidden = false;
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
      friends.hidden = !show;
      wrap.hidden = show;
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
    },
    timer(show) {
      clearInterval(timerTick);
      timerBar.hidden = !show;
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

  async function close(result: "finished" | "skipped"): Promise<void> {
    open = false;
    running++;
    stage.timer(false);
    root.hidden = true;
    document.body.style.overflow = "";
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
    skip.textContent = mode === "replay" && last ? "Close" : "Skip";
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

  function onNext(): void {
    if (index < STEPS.length - 1) {
      index++;
      render();
      return;
    }
    void close("finished"); // the last step: the chosen match starts, or From How to play nothing does (U136)
  }
  function onSkip(): void {
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
