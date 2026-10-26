// The game screen (/g/<code>), docs/design/board-interaction.md and motion-and-endings.md.
// Players act on the board itself: tapping a column chooses it, and tapping another
// changes it until the round resolves (R4, U12, U13). The browser only sends choices
// and shows what the server sends (R20): it never works out a result itself, and the
// countdown starts only when the server's result arrives, so it can never show a
// choice early (R22) or hold a result back past the one second promise (U23).
import { avatar, buildBoard, confettiBurst, reducedMotion, shieldIcon, themeNumber, type BoardView } from "./arcade.ts";

type Player = "A" | "B";

interface State {
  board: string[][];
  round: number;
  shieldsLeft: Record<Player, boolean>;
  status: "playing" | "won" | "draw";
  winner: Player | null;
}

const ROUND_SECONDS = 15;
const code = location.pathname.split("/").filter(Boolean)[1];
const tokenKey = `rubble-seat-${code}`;

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

let you: Player | null = null;
let seatToken: string | null = null;
let selectedColumn: number | null = null;
let armed = false;
let over = false;
let first = true; // the first snapshot only draws the board; later ones may animate
let deadline = Date.now() + ROUND_SECONDS * 1000;
let drawn: State | null = null;
let opponentPresent = false;
let playedComputer = false; // Play again starts the same kind of game

const board: BoardView = buildBoard();
$("board-wrap").prepend(board.root);
board.root.removeAttribute("role"); // the columns group carries the label for this board
board.root.setAttribute("aria-hidden", "true");
const columns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-column]"));
const ghost = document.createElement("span");
ghost.className = "ghost";
ghost.dataset.testid = "ghost-disc";
ghost.dataset.piece = "you";
ghost.hidden = true;

// ---- Saved seat (so a reload takes the seat back, R32) ----
function loadSeat(): { player: Player; seatToken: string } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(tokenKey) ?? "null");
    if (saved && (saved.player === "A" || saved.player === "B") && typeof saved.seatToken === "string") return saved;
  } catch {
    // sessionStorage unavailable or corrupt: join as a new player
  }
  return null;
}

function saveSeat(): void {
  try {
    sessionStorage.setItem(tokenKey, JSON.stringify({ player: you, seatToken }));
  } catch {
    // reconnecting after a reload just will not work
  }
}

try {
  playedComputer = sessionStorage.getItem(`rubble-computer-${code}`) === "1";
} catch {
  playedComputer = false;
}

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
socket.addEventListener("open", () => {
  const saved = loadSeat();
  socket.send(JSON.stringify({ type: "join", code, ...(saved ?? {}) }));
});

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

function say(text: string, kind: "error" | "ok" | "" = ""): void {
  const el = $("game-message");
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const other = (p: Player): Player => (p === "A" ? "B" : "A");
const columnFull = (column: number): boolean => (drawn?.board[column]?.length ?? 0) >= 6;

// ---- The board's columns: hover, tap, keyboard (U10 to U18) ----
function showGhost(column: number | null, chosen: boolean): void {
  if (column === null || over || columnFull(column) || !you) {
    ghost.hidden = true;
    return;
  }
  columns[column].append(ghost);
  ghost.hidden = false;
  ghost.dataset.chosen = String(chosen);
}

function renderChoice(): void {
  columns.forEach((hit, c) => {
    hit.setAttribute("aria-pressed", String(c === selectedColumn));
    hit.setAttribute("aria-disabled", String(over || columnFull(c)));
  });
  const badge = $("shield-badge") as HTMLButtonElement;
  const spent = !!(you && drawn && !drawn.shieldsLeft[you]);
  const finished = over;
  badge.dataset.state = spent ? "spent" : "ready";
  badge.setAttribute("aria-pressed", String(armed && !spent));
  badge.disabled = spent || over;
  setText("shield-label", spent ? "Shield spent" : finished ? "Game over" : armed ? "Shield armed" : "Shield ready");
  badge.setAttribute("aria-label", spent ? "Shield, spent" : finished ? "Game over" : armed ? "Shield, armed" : "Shield, ready");
  setText("chosen-label", selectedColumn === null ? "" : "Chosen");
  showGhost(selectedColumn, true);
}

function choose(column: number): void {
  if (over || !you || !seatToken) return;
  if (columnFull(column)) {
    // U14: a full column cannot be chosen; it shakes and says so, and sends nothing.
    columns[column].classList.remove("shake");
    void columns[column].offsetWidth;
    columns[column].classList.add("shake");
    say("That column is full. Pick another.", "error");
    return;
  }
  selectedColumn = column;
  say("");
  socket.send(JSON.stringify({ type: "choose", code, player: you, seatToken, column, shield: armed }));
  renderChoice();
  // An aria-live region announces the choice (U18).
  $("result-line").textContent = `Column ${column + 1} chosen${armed ? " with your shield" : ""}. You can change it until the round ends.`;
}

columns.forEach((hit, c) => {
  hit.addEventListener("click", () => choose(c));
  hit.addEventListener("mouseenter", () => {
    if (selectedColumn === null) showGhost(c, false);
  });
  hit.addEventListener("mouseleave", () => {
    if (selectedColumn === null) ghost.hidden = true;
  });
  hit.addEventListener("focus", () => {
    if (selectedColumn === null) showGhost(c, false);
  });
});

$("shield-badge").addEventListener("click", () => {
  armed = !armed;
  // Re-send the current choice so the server knows whether the shield is armed (R4).
  if (selectedColumn !== null) choose(selectedColumn);
  else renderChoice();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (event.key >= "1" && event.key <= "7") {
    choose(Number(event.key) - 1);
  } else if (event.key === "s" || event.key === "S") {
    ($("shield-badge") as HTMLButtonElement).click();
  }
});

// ---- Drawing what the server sent ----
function pieceFor(cell: string, p: Player | null): "you" | "opponent" | "rubble" | null {
  if (cell === "R") return "rubble";
  if (cell === "A" || cell === "B") return cell === p ? "you" : "opponent";
  return null;
}

function drawBoard(state: State, animateNew: boolean): Array<[number, number]> {
  const fresh: Array<[number, number]> = [];
  for (let column = 0; column < 7; column++) {
    for (let row = 0; row < 6; row++) {
      const now = state.board[column][row] ?? "";
      const before = drawn?.board[column]?.[row] ?? "";
      if (now === before && (now === "" || board.cell(column, row).dataset.piece === now)) continue;
      const kind = pieceFor(now, you);
      if (!kind) continue;
      const isNew = animateNew && before === "";
      board.place(column, row, kind, isNew ? (kind === "rubble" ? "thud" : "dropping") : undefined);
      if (isNew) {
        fresh.push([column, row]);
        board.cell(column, row).querySelector(".piece")?.classList.add("recent");
      }
    }
  }
  return fresh;
}

function explain(state: State, fresh: Array<[number, number]>): string {
  const rubble = fresh.some(([c, r]) => state.board[c][r] === "R");
  const mine = fresh.find(([c, r]) => pieceFor(state.board[c][r], you) === "you");
  const theirs = fresh.find(([c, r]) => pieceFor(state.board[c][r], you) === "opponent");
  if (rubble) return "You both chose the same column. Crash: rubble landed.";
  if (mine && theirs) return `You chose column ${mine[0] + 1}. Your opponent chose column ${theirs[0] + 1}.`;
  if (mine) return `Your disc landed in column ${mine[0] + 1}. Your opponent missed the round.`;
  if (theirs) return `Your opponent's disc landed in column ${theirs[0] + 1}. You missed the round.`;
  return "Neither of you chose in time. No discs landed.";
}

// The countdown is shown only now that the server's result is here (U19, U23), so it
// can never reveal a choice early. It is 390 ms, then "DROP" while the discs fall.
async function countdown(): Promise<void> {
  if (reducedMotion()) return; // U30: no countdown under reduced motion
  const el = $("countdown");
  const step = themeNumber("--ms-count-step");
  for (const word of ["3", "2", "1"]) {
    el.textContent = word;
    el.classList.remove("countdown-pop");
    void el.offsetWidth;
    el.classList.add("countdown-pop");
    await wait(step);
  }
  el.textContent = "DROP";
  el.classList.remove("countdown-pop");
  void el.offsetWidth;
  el.classList.add("countdown-pop");
}

let busy = Promise.resolve(); // results are shown one at a time, in order

function showResult(state: State, opponentReady: boolean): void {
  const previous = drawn;
  busy = busy.then(() => reveal(state, opponentReady, previous));
}

async function reveal(state: State, opponentReady: boolean, previous: State | null): Promise<void> {
  const animate = !first && !!previous && state.round > previous.round;
  if (animate) await countdown();
  const fresh = drawBoard(state, animate);
  drawn = state;
  first = false;
  if (animate) setTimeout(() => ($("countdown").textContent = ""), themeNumber("--ms-drop-land"));

  setText("round-number", String(state.status === "playing" ? state.round + 1 : state.round));
  setText("opponent-status", state.status !== "playing" ? "Finished" : opponentReady ? "Ready" : "Choosing");
  if (you) {
    const mineLeft = state.shieldsLeft[you];
    const theirsLeft = state.shieldsLeft[other(you)];
    setText("opponent-shield", theirsLeft ? "available" : "used");
    setText("my-shield", mineLeft ? "available" : "used");
    const holder = $("opponent-shield-state");
    holder.dataset.shield = theirsLeft ? "ready" : "used";
    holder.replaceChildren(shieldIcon());
    if (!mineLeft) armed = false;
  }
  syncWaiting(state);

  if (animate) {
    if (fresh.some(([c, r]) => state.board[c][r] === "R") && !reducedMotion()) {
      for (const [c] of fresh) for (let r = 0; r < 6; r++) board.cell(c, r).classList.add("shake");
      setTimeout(() => board.root.querySelectorAll(".shake").forEach((n) => n.classList.remove("shake")), themeNumber("--ms-shake"));
    }
    $("result-line").textContent = explain(state, fresh);
  }

  selectedColumn = null;
  ghost.hidden = true;
  say("");
  deadline = Date.now() + ROUND_SECONDS * 1000;
  renderChoice();

  if (state.status !== "playing") await finish(state);
}

function syncWaiting(state: State): void {
  // The share panel shows while the opponent has not arrived (docs/design.md "Waiting").
  $("waiting-panel").hidden = opponentPresent || state.round > 0 || state.status !== "playing";
}

// ---- The end of the game (U27 to U30) ----
async function finish(state: State): Promise<void> {
  over = true;
  renderChoice();
  const rounds = `${state.round} ${state.round === 1 ? "round" : "rounds"}`;
  if (state.status === "draw") {
    setText("end-title", "IT'S A DRAW!");
    setText("end-detail", `Nobody made four in a row. ${rounds} played.`);
  } else if (state.winner === you) {
    setText("end-title", "YOU WIN!");
    setText("end-detail", `Four in a row in ${rounds}.`);
    highlightLine(state);
    confettiBurst($("board-wrap"));
  } else {
    setText("end-title", "SO CLOSE!");
    setText("end-detail", `Your opponent made four in a row in ${rounds}.`);
    highlightLine(state);
  }
  $("result-line").textContent = $("end-title").textContent;
  // Let the last discs land and the line glow before the popup covers the board.
  if (!reducedMotion()) await wait(themeNumber("--ms-drop-land") * 2);
  popupOpen();
}

function popupOpen(): void {
  $("end-popup").hidden = false;
  ($("play-again") as HTMLElement).focus();
}

function highlightLine(state: State): void {
  const winner = state.winner;
  if (!winner) return;
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < state.board[c].length; r++) {
      if (state.board[c][r] !== winner) continue;
      for (const [dc, dr] of dirs) {
        const run: Array<[number, number]> = [[c, r]];
        for (let k = 1; k < 4 && state.board[c + dc * k]?.[r + dr * k] === winner; k++) run.push([c + dc * k, r + dr * k]);
        if (run.length === 4) {
          for (const [cc, rr] of run) board.cell(cc, rr).querySelector(".piece")?.classList.add("win");
          return;
        }
      }
    }
  }
}

// ---- What the server tells us ----
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  switch (message.type) {
    case "snapshot": {
      const firstTime = you === null;
      you = message.you;
      seatToken = message.seatToken;
      opponentPresent = message.opponentPresent === true;
      saveSeat();
      if (firstTime && you) {
        const mine = avatar(`${code}-${you}`);
        mine.dataset.testid = "avatar-you";
        $("avatar-you").replaceWith(mine);
        const theirs = avatar(`${code}-${other(you)}`);
        theirs.dataset.testid = "avatar-opponent";
        $("avatar-opponent").replaceWith(theirs);
      }
      showResult(message.state, message.opponentReady);
      break;
    }
    case "opponent_joined":
      opponentPresent = true;
      if (drawn) syncWaiting(drawn);
      else $("waiting-panel").hidden = true;
      break;
    case "opponent_ready":
      // The opponent has chosen, which is all this tells us: never their column (R21, R22).
      setText("opponent-status", "Ready");
      break;
    case "rejected":
      say(
        message.reason === "column_full" ? "That column is full. Pick another." : message.reason === "no_shield" ? "You have no shield left." : "That choice was not accepted.",
        "error",
      );
      break;
    case "game_over":
      over = true;
      setText("end-title", message.result === "abandoned" ? "GAME ABANDONED" : message.winner === you ? "YOU WIN!" : "GAME OVER");
      setText(
        "end-detail",
        message.result === "abandoned" ? "Both players missed 3 rounds in a row." : message.winner === you ? "Your opponent left the game." : "You left the game for too long.",
      );
      popupOpen();
      renderChoice();
      break;
    case "game_full":
      over = true;
      say("This game already has two players. Start your own from Home.", "error");
      renderChoice();
      break;
    case "tab_replaced":
      over = true;
      say("This game is open in another tab.", "error");
      renderChoice();
      break;
  }
});

// ---- Waiting panel: copy and share ----
$("copy-link").addEventListener("click", () => {
  const label = $("copy-link");
  const done = () => (label.textContent = "Copied");
  const failed = () => (label.textContent = "Copy failed");
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, failed);
  else failed();
});

if (typeof navigator.share === "function") {
  $("share").hidden = false;
  $("share").addEventListener("click", () => {
    navigator.share({ title: "Rubble", text: `Play me at Rubble. Game code ${code}`, url: location.href }).catch(() => {});
  });
}

$("play-again").addEventListener("click", async () => {
  // Play again starts a fresh game of the same kind: a friend game gets a new link to share,
  // and a game against the computer starts at once.
  try {
    const res = await fetch(playedComputer ? "/api/computer" : "/api/games", { method: "POST" });
    if (!res.ok) {
      say("Could not start a new game. Try again.", "error");
      return;
    }
    const next = (await res.json()).code;
    try {
      if (playedComputer) sessionStorage.setItem(`rubble-computer-${next}`, "1");
    } catch {
      // Play again then starts a friend game, which is harmless
    }
    location.href = `/g/${next}`;
  } catch {
    say("Could not reach the server. Check your connection.", "error");
  }
});

// ---- The timer ring (U25) ----
setInterval(() => {
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const timer = $("timer");
  timer.textContent = String(left);
  timer.dataset.urgency = left <= 5 ? "urgent" : left <= 10 ? "warn" : "";
}, 250);

renderChoice();
