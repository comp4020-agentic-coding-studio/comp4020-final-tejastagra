// The game screen (/g/<code>), docs/design/board-interaction.md and motion-and-endings.md.
// Players act on the board itself: tapping a column chooses it, and the choice is final
// for the round (R4, U12, U13). The browser only sends choices and shows what the server
// sends (R20): it never works out a result itself. Discs drop the moment the result
// arrives, with no countdown (U19), so nothing can show a choice early (R22) or hold a
// result back past the one second promise (U23).
import { avatar, buildBoard, collapseAnimation, confettiBurst, earthquakeIcon, isOpen, markDoomed, quakeAnimation, reducedMotion, shieldIcon, themeNumber, type BoardView, type Shape } from "./arcade.ts";
import { collapseDue, shapeAt, type GameState } from "../engine/index.ts";

type Player = "A" | "B";

interface State {
  board: string[][];
  round: number;
  shieldsLeft: Record<Player, boolean>;
  earthquakesLeft: Record<Player, boolean>;
  rows: number; // the open area (R61, R62), as the server sent it
  firstColumn: number;
  lastColumn: number;
  status: "playing" | "won" | "draw";
  winner: Player | null;
}

const ROUND_SECONDS = 10; // R18
const code = location.pathname.split("/").filter(Boolean)[1];
const tokenKey = `rubble-seat-${code}`;

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

let you: Player | null = null;
let seatToken: string | null = null;
let selectedColumn: number | null = null;
let armed = false;
let quakeChosen = false; // Earthquake is this round's choice (U62); final like a column (R4)
let over = false;
let first = true; // the first snapshot only draws the board; later ones may animate
let deadline: number | null = null; // set when a round is open (R51): nothing runs while waiting
let drawn: State | null = null;
let opponentPresent = false;
let opponentChosen = false; // only "chosen or not", never which column (R21)
let locked = false; // the choice for this round is final (R4, U13)
let gotReady = false; // U73: in a collapse round only what is still on the board is described, because a disc that landed in a
// square that closed at once is not in the state the server sent.
function survivors(state: State, fresh: Array<[number, number]>, quaked: boolean): string {
  const parts: string[] = [];
  if (quaked) parts.push("The bottom row crumbled.");
  if (fresh.some(([c, r]) => state.board[c][r] === "R")) parts.push("Crash: rubble landed.");
  const mine = fresh.find(([c, r]) => pieceFor(state.board[c][r], you) === "you");
  const theirs = fresh.find(([c, r]) => pieceFor(state.board[c][r], you) === "opponent");
  if (mine) parts.push(`Your disc landed in column ${mine[0] + 1}.`);
  if (theirs) parts.push(`Your opponent's disc landed in column ${theirs[0] + 1}.`);
  return parts.join(" ");
}

// U73: what closed this round, ceiling first (R63).
function explainShrink(before: Shape, after: Shape): string {
  const ceiling = after.rows < before.rows ? "The ceiling dropped. The top row turned to rock." : "";
  const walls = after.firstColumn > before.firstColumn ? "The walls collapsed. The outer columns turned to rock." : "";
  return [ceiling, walls].filter(Boolean).join(" ");
}

// Draws every closed cell as rock, with no animation: for a board that arrives already shrunk (a reload,
// a late join), so the picture always matches the shape the server sent.
function paintClosed(shape: Shape): void {
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const closed = !isOpen(shape, c, r);
      board.setClosed(c, r, closed);
      if (closed) board.remove(c, r);
    }
  }
}

// U68, U69: the round before a collapse, a banner says what is about to close and the cells that will
// close flash a crack pattern. It comes from the engine's public schedule only: it says nothing about a
// choice, and both players see the same (R22). Hidden once the game is over.
function showWarning(state: State): void {
  const banner = $("shrink-warning");
  const shape = shapeOf(state);
  const due = state.status === "playing" ? collapseDue(state as unknown as GameState) : { ceiling: false, walls: false };
  const text = due.ceiling && due.walls ? "Ceiling and walls close after this round" : due.ceiling ? "The ceiling drops after this round" : due.walls ? "The walls collapse after this round" : "";
  banner.hidden = text === "";
  setText("shrink-warning-text", text);
  markDoomed(board, shape, due, text ? shapeAt(state.round + 1) : null);
}

// "Get ready" shows once, when the game first starts (U55)
let playedComputer = false; // Play again starts the same kind of game

const board: BoardView = buildBoard();
$("board-wrap").prepend(board.root);
board.root.removeAttribute("role"); // the columns group carries the label for this board
board.root.setAttribute("aria-hidden", "true");
const columns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-column]"));
const glows = Array.from(document.querySelectorAll<HTMLElement>(".column-glow"));
const gameRoot = document.querySelector<HTMLElement>('[data-testid="game-screen"]')!;
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
const shapeOf = (state: State | null): Shape => ({ rows: state?.rows ?? 6, firstColumn: state?.firstColumn ?? 0, lastColumn: state?.lastColumn ?? 6 });
const columnClosed = (column: number): boolean => !!drawn && (column < drawn.firstColumn || column > drawn.lastColumn); // R64
const columnFull = (column: number): boolean => (drawn?.board[column]?.length ?? 0) >= (drawn?.rows ?? 6);

// ---- The board's columns: hover, tap, keyboard (U10 to U18) ----
function glow(column: number | null): void {
  glows.forEach((g, c) => (g.dataset.on = String(c === column)));
}

function showGhost(column: number | null, chosen: boolean): void {
  if (column === null || over || columnFull(column) || columnClosed(column) || !you) {
    ghost.hidden = true;
    if (column === null) glow(null);
    return;
  }
  glows[column].append(ghost); // centred above its column, outside the board (U11)
  ghost.hidden = false;
  ghost.dataset.chosen = String(chosen);
  glow(column);
}

function renderChoice(): void {
  columns.forEach((hit, c) => {
    hit.setAttribute("aria-pressed", String(c === selectedColumn));
    hit.setAttribute("aria-disabled", String(over || locked || columnFull(c) || columnClosed(c)));
  });
  const badge = $("shield-badge") as HTMLButtonElement;
  const spent = !!(you && drawn && !drawn.shieldsLeft[you]);
  badge.dataset.state = spent ? "spent" : "ready";
  badge.setAttribute("aria-pressed", String(armed && !spent));
  badge.disabled = spent || over || locked;
  const label = spent ? "Shield used" : over ? "Game over" : armed ? "Shield armed" : "Tap to arm shield";
  setText("shield-label", label);
  badge.setAttribute("aria-label", spent ? "Shield, used" : over ? "Game over" : armed ? "Shield, armed" : "Shield, ready. Tap to arm it");
  const quake = $("earthquake-badge") as HTMLButtonElement;
  const quakeSpent = !!(you && drawn && !drawn.earthquakesLeft[you]);
  const nothingToShake = !!drawn && drawn.board.every((column) => column.length === 0);
  quake.dataset.state = quakeSpent ? "spent" : "ready";
  quake.setAttribute("aria-pressed", String(quakeChosen && !quakeSpent));
  quake.disabled = quakeSpent || nothingToShake || over || locked;
  const quakeLabel = quakeSpent ? "Earthquake used" : quakeChosen ? "Earthquake armed" : nothingToShake ? "Nothing to shake yet" : "Tap to use Earthquake";
  setText("earthquake-label", quakeLabel);
  quake.setAttribute("aria-label", quakeSpent ? "Earthquake, used" : quakeChosen ? "Earthquake, armed" : nothingToShake ? "Earthquake, nothing to shake yet" : "Earthquake, ready. Tap to use it");
  ($("quake-marker") as HTMLElement).hidden = !quakeChosen;
  setText("chosen-label", selectedColumn === null && !quakeChosen ? "" : "Chosen");
  showGhost(selectedColumn, true);
}

// U62: tapping the badge chooses Earthquake for this round, final like a column (R4). It cannot be
// combined with the shield (R53), so an armed shield is put down first and never sent with it.
function chooseQuake(): void {
  if (over || !you || !seatToken || !opponentPresent) return;
  if (locked) {
    say("Your choice is locked in.");
    return;
  }
  if (!drawn || drawn.earthquakesLeft[you] === false || drawn.board.every((column) => column.length === 0)) return;
  armed = false;
  quakeChosen = true;
  locked = true;
  say("");
  socket.send(JSON.stringify({ type: "choose", code, player: you, seatToken, earthquake: true }));
  renderChoice();
  $("result-line").textContent = "Earthquake chosen. Your choice is locked in.";
}

function choose(column: number): void {
  if (over || !you || !seatToken || !opponentPresent) return;
  if (locked) {
    say("Your choice is locked in.");
    return;
  }
  if (columnClosed(column)) {
    // U72: a closed column cannot be chosen; it says so and sends nothing.
    columns[column].classList.remove("shake");
    void columns[column].offsetWidth;
    columns[column].classList.add("shake");
    say("That column is closed. Pick another.", "error");
    return;
  }
  if (columnFull(column)) {
    // U14: a full column cannot be chosen; it shakes and says so, and sends nothing.
    columns[column].classList.remove("shake");
    void columns[column].offsetWidth;
    columns[column].classList.add("shake");
    say("That column is full. Pick another.", "error");
    return;
  }
  selectedColumn = column;
  locked = true; // final for this round (R4, U13)
  say("");
  socket.send(JSON.stringify({ type: "choose", code, player: you, seatToken, column, shield: armed }));
  renderChoice();
  // An aria-live region announces the choice (U18).
  $("result-line").textContent = `Column ${column + 1} chosen${armed ? " with your shield" : ""}. Your choice is locked in.`;
}

columns.forEach((hit, c) => {
  hit.addEventListener("click", () => choose(c));
  hit.addEventListener("mouseenter", () => {
    if (!locked && opponentPresent) showGhost(c, false);
  });
  hit.addEventListener("mouseleave", () => {
    if (!locked) {
      ghost.hidden = true;
      glow(null);
    }
  });
  hit.addEventListener("focus", () => {
    if (!locked && opponentPresent) showGhost(c, false);
  });
});

$("shield-badge").addEventListener("click", () => {
  if (locked || over) return;
  armed = !armed; // the shield flag is sent with the column, once, when the choice is made
  renderChoice();
});

$("earthquake-badge").addEventListener("click", chooseQuake);

$("earthquake-info").addEventListener("click", () => {
  const help = $("earthquake-help");
  help.hidden = !help.hidden;
  $("earthquake-info").setAttribute("aria-expanded", String(!help.hidden));
});

$("shield-info").addEventListener("click", () => {
  const help = $("shield-help");
  help.hidden = !help.hidden;
  $("shield-info").setAttribute("aria-expanded", String(!help.hidden));
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (event.key >= "1" && event.key <= "7") {
    choose(Number(event.key) - 1);
  } else if (event.key === "s" || event.key === "S") {
    ($("shield-badge") as HTMLButtonElement).click();
  } else if (event.key === "e" || event.key === "E") {
    ($("earthquake-badge") as HTMLButtonElement).click();
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

// U66: what an earthquake round says. Who shook is known from whose Earthquake was spent this round.
function explainQuake(state: State, previous: State, fresh: Array<[number, number]>): string {
  const me = you as Player;
  const mine = previous.earthquakesLeft[me] && !state.earthquakesLeft[me];
  const theirs = previous.earthquakesLeft[other(me)] && !state.earthquakesLeft[other(me)];
  if (mine && theirs) return "You both used Earthquake! The bottom row crumbled once.";
  const landed = fresh[0];
  const where = landed ? ` ${mine ? "Your opponent's" : "Your"} disc landed in column ${landed[0] + 1}.` : "";
  return `${mine ? "Earthquake!" : "Your opponent used Earthquake!"} The bottom row crumbled.${where}`;
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

// "Get ready" shows once, over the board, when a game first starts (U55). It is only a greeting:
// it says nothing about any choice, and choices are accepted while it shows.
function getReady(): void {
  if (gotReady) return;
  gotReady = true;
  const el = $("get-ready");
  el.hidden = false;
  setTimeout(() => (el.hidden = true), themeNumber("--ms-get-ready"));
}

let busy = Promise.resolve(); // results are shown one at a time, in order

function showResult(state: State, opponentReady: boolean): void {
  const previous = drawn;
  busy = busy.then(() => reveal(state, opponentReady, previous));
}

async function reveal(state: State, opponentReady: boolean, previous: State | null): Promise<void> {
  const animate = !first && !!previous && state.round > previous.round;
  // R56: an earthquake round is one where someone's Earthquake went from available to used. The
  // browser only shows it: the board it draws is the one the server sent (R20).
  const quaked =
    animate && !!previous && (["A", "B"] as const).some((p) => previous.earthquakesLeft[p] && !state.earthquakesLeft[p]);
  if (quaked && previous) {
    const kind = (cell: string) => pieceFor(cell, you);
    const shifted = previous.board.map((column) => column.slice(1));
    const asKinds = (columns: string[][]) => columns.map((column) => column.map((cell) => kind(cell)));
    await quakeAnimation(board, asKinds(previous.board), asKinds(shifted));
    drawn = { ...previous, board: shifted }; // the board as it stands after the slide, so only new discs drop
  }
  const before = shapeOf(previous);
  const after = shapeOf(state);
  const shrank = !!previous && (after.rows < before.rows || after.firstColumn > before.firstColumn);
  // The collapse is drawn from the board the server sent, with the closed cells removed from the drawing
  // first: pieces the collapse removed never appear (R65).
  const fresh = drawBoard(state, animate);
  drawn = state;
  first = false;

  setText("round-number", String(state.status === "playing" ? state.round + 1 : state.round));
  setText("opponent-status", state.status !== "playing" ? "Finished" : opponentReady ? "Ready" : "Choosing");
  if (you) {
    const mineLeft = state.shieldsLeft[you];
    const theirsLeft = state.shieldsLeft[other(you)];
    setText("opponent-shield", theirsLeft ? "available" : "used");
    setText("my-shield", mineLeft ? "available" : "used");
    const theirQuake = state.earthquakesLeft[other(you)];
    setText("opponent-earthquake", theirQuake ? "Earthquake available" : "Earthquake used");
    const quakeHolder = $("opponent-earthquake-state");
    quakeHolder.dataset.quake = theirQuake ? "ready" : "used";
    quakeHolder.replaceChildren(earthquakeIcon());
    const holder = $("opponent-shield-state");
    holder.dataset.shield = theirsLeft ? "ready" : "used";
    holder.replaceChildren(shieldIcon());
    if (!mineLeft) armed = false;
  }
  syncWaiting(state);

  if (!previous) paintClosed(after); // a board that arrives already shrunk (a reload or a late join) is drawn as it is
  showWarning(state);

  if (animate) {
    if (fresh.some(([c, r]) => state.board[c][r] === "R") && !reducedMotion()) {
      for (const [c] of fresh) for (let r = 0; r < 6; r++) board.cell(c, r).classList.add("shake");
      setTimeout(() => board.root.querySelectorAll(".shake").forEach((n) => n.classList.remove("shake")), themeNumber("--ms-shake"));
    }
    const base = quaked && previous ? explainQuake(state, previous, fresh) : explain(state, fresh);
    $("result-line").textContent = shrank ? `${survivors(state, fresh, quaked)} ${explainShrink(before, after)}`.trim() : base;
  }

  // A new round opens: the choice is unlocked and the timer restarts (R18). With no opponent
  // yet there is no round at all (R51), so no timer runs.
  selectedColumn = null;
  quakeChosen = false;
  locked = false;
  opponentChosen = opponentReady && state.status === "playing"; // after a reload the server says
  ghost.hidden = true;
  glow(null);
  say("");
  startRound(state);
  renderChoice();

  // The collapse (U70) is only drawn: the round is already open for a choice, so a tap during the
  // animation is a real choice against the new open area and is never swallowed (R4, U72). It starts as
  // the discs land, takes --dur-collapse and always ends on exactly what the server sent.
  if (shrank) {
    if (animate && !reducedMotion()) await wait(themeNumber("--ms-collapse-start"));
    await collapseAnimation(board, before, after);
  }

  if (state.status !== "playing") await finish(state);
}

// The timer runs only while a round is open and both players are here (R51, U56).
function startRound(state: State): void {
  deadline = state.status === "playing" && opponentPresent ? Date.now() + ROUND_SECONDS * 1000 : null;
  drawTimer();
}

function syncWaiting(state: State): void {
  // The waiting card shows while the second player has not arrived (U54). There is no timer,
  // round number or opponent status until they do (R51).
  const waiting = !opponentPresent && state.round === 0 && state.status === "playing";
  $("waiting-panel").hidden = !waiting;
  gameRoot.dataset.waiting = String(waiting);
  if (!waiting && state.status === "playing") getReady();
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
  if (!reducedMotion()) await wait(themeNumber("--ms-popup-delay"));
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
      if (typeof message.yourName === "string") setText("name-you", message.yourName);
      if (typeof message.opponentName === "string") setText("name-opponent", message.opponentName);
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
      if (typeof message.name === "string") setText("name-opponent", message.name);
      if (drawn) {
        syncWaiting(drawn);
        startRound(drawn); // round 1 starts now that both are here (R51)
      }
      break;
    case "opponent_ready":
      // The opponent has chosen, which is all this tells us: never their column (R21, R22).
      opponentChosen = true;
      setText("opponent-status", "Ready");
      break;
    case "rejected":
      if (message.reason === "already_chosen") {
        // The server already holds this round's choice (for instance after a reload): it stands (R4).
        locked = true;
        say("Your choice is locked in.");
        renderChoice();
        break;
      }
      say(
        message.reason === "column_full" ? "That column is full. Pick another." : message.reason === "no_shield" ? "You have no shield left." : message.reason === "no_earthquake" ? "You have used your Earthquake." : message.reason === "nothing_to_shake" ? "There is nothing to shake yet." : "That choice was not accepted.",
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

// Share uses the phone's share sheet where there is one; elsewhere it copies the link, so the
// button always works (U54).
$("share").addEventListener("click", () => {
  if (typeof navigator.share === "function") {
    navigator.share({ title: "Rubble", text: `Play me at Rubble. Game code ${code}`, url: location.href }).catch(() => {});
    return;
  }
  const label = $("share");
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => (label.textContent = "Link copied"), () => (label.textContent = "Copy failed"));
  else label.textContent = "Copy failed";
});

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

// ---- The timer bar (U25, U56) ----
// A slim bar that drains over the round. It turns orange at 5 seconds left and red at 3, and is
// hidden once both players have chosen (the round then resolves at once) and while waiting.
function drawTimer(): void {
  const track = $("timer");
  const resolving = deadline === null || (locked && opponentChosen);
  track.hidden = resolving;
  if (resolving) return;
  const leftMs = Math.max(0, (deadline as number) - Date.now());
  const seconds = Math.ceil(leftMs / 1000);
  track.style.setProperty("--left", String(leftMs / (ROUND_SECONDS * 1000)));
  track.setAttribute("aria-valuenow", String(seconds));
  track.dataset.urgency = seconds <= 3 ? "urgent" : seconds <= 5 ? "warn" : "";
}
setInterval(drawTimer, 100);

renderChoice();
