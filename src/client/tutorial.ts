// The first-time tutorial (docs/design/tutorial.md, R47 to R50). It runs on a
// practice board in the browser against a scripted computer. It never opens a
// game on the server, so it can never change the leaderboard (R50): the only
// thing it sends is "finished" or "skipped", which saves with the player (R48).
import { buildBoard, confettiBurst, reducedMotion, shieldIcon, themeNumber } from "./arcade.ts";
import { $ } from "./common.ts";

interface Step {
  title: string;
  caption: string;
  run: (board: ReturnType<typeof buildBoard>, wrap: HTMLElement) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The practice board shows each lesson as a short, scripted scene. Under reduced
// motion the discs simply appear in place (U48), so every step still makes sense.
async function drop(board: ReturnType<typeof buildBoard>, column: number, row: number, piece: "you" | "opponent" | "rubble"): Promise<void> {
  board.place(column, row, piece, piece === "rubble" ? "thud" : "dropping");
  if (!reducedMotion()) await wait(themeNumber("--ms-drop-land"));
}

const STEPS: Step[] = [
  {
    title: "Pick a column",
    caption: "Tap a column to choose it. You can change your mind until the round ends.",
    async run(board) {
      board.clear();
      await wait(themeNumber("--ms-beat") / 3);
      const ghost = document.createElement("span");
      ghost.className = "ghost";
      ghost.dataset.piece = "you";
      ghost.dataset.chosen = "true";
      board.cell(3, 5).append(ghost);
    },
  },
  {
    title: "You both move at once",
    caption: "Your opponent chooses at the same time. Neither of you sees the other's choice until both discs drop.",
    async run(board) {
      board.clear();
      await wait(themeNumber("--ms-beat") / 3);
      await Promise.all([drop(board, 2, 0, "you"), drop(board, 4, 0, "opponent")]);
    },
  },
  {
    title: "Crash!",
    caption: "If you both pick the same column, the discs crash and leave rubble that belongs to nobody. Rubble blocks lines.",
    async run(board) {
      board.clear();
      board.place(2, 0, "you");
      board.place(4, 0, "opponent");
      await wait(themeNumber("--ms-beat") / 3);
      await drop(board, 3, 0, "rubble");
    },
  },
  {
    title: "Your shield",
    caption: "Your shield wins one crash, once per game. Arm it before you choose. Using it spends it, even if there is no crash.",
    async run(board) {
      board.clear();
      board.place(2, 0, "you");
      board.place(4, 0, "opponent");
      await wait(themeNumber("--ms-beat") / 3);
      await drop(board, 3, 0, "you"); // the shielded disc lands where the other would have crashed
    },
  },
  {
    title: "Four in a row wins",
    caption: "Get four of your discs in a row, across, down or diagonally. If you both do it in the same round, it is a draw.",
    async run(board, wrap) {
      board.clear();
      board.place(0, 0, "opponent");
      board.place(6, 0, "opponent");
      for (let c = 1; c <= 3; c++) board.place(c, 0, "you");
      await wait(themeNumber("--ms-beat") / 3);
      await drop(board, 4, 0, "you");
      for (let c = 1; c <= 4; c++) board.cell(c, 0).querySelector(".piece")?.classList.add("win");
      confettiBurst(wrap);
    },
  },
];

let open = false;
let index = 0;
let running = 0; // makes a late scene from an earlier step harmless

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
  index = 0;
  const root = $("tutorial");
  const card = root.querySelector(".tutorial-card") as HTMLElement;
  const titleEl = $("tutorial-title");
  const caption = $("tutorial-caption");
  const host = $("tutorial-board");
  const next = $("tutorial-next");
  const skip = $("tutorial-skip");
  const board = buildBoard();
  const wrap = document.createElement("div");
  wrap.className = "board-wrap";
  wrap.append(board.root);
  host.replaceChildren(wrap);
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
    titleEl.textContent = step.title;
    caption.textContent = step.caption; // an aria-live region, so it is announced (U47)
    const last = index === STEPS.length - 1;
    next.textContent = last ? "Play the computer" : "Next";
    const mine = ++running;
    void step.run(board, wrap).then(() => void mine);
    ($("tutorial-next") as HTMLButtonElement).focus();
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
      if (res.ok) location.href = `/g/${(await res.json()).code}`;
    } catch {
      // stay on the page; the Play the computer button is still there
    }
  }
  function onSkip(): void {
    close("skipped");
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") close("skipped");
  }

  next.addEventListener("click", onNext);
  skip.addEventListener("click", onSkip);
  document.addEventListener("keydown", onKey);
  render();
  void card;
  void shieldIcon;
}

export async function replayTutorial(): Promise<void> {
  await save("replay");
  await showTutorial();
}
