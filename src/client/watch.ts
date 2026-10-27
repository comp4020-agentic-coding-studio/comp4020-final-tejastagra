// The watching screen (/watch), docs/design/spectating.md U78 to U83. A spectator watches a live game and
// can do nothing to it (R74): this page sends only "spectate" and "leave", and never a choice. It shows what
// the server sends after each round resolves and nothing before (R72), so it has no choice, no timer and no
// "Ready" status to show. The browser decides nothing about a result (R20).
import { avatar, buildBoard, ceilingAnimation, earthquakeIcon, markDoomed, quakeAnimation, reducedMotion, shieldIcon, themeNumber, type BoardView } from "./arcade.ts";
import { ceilingDue, rowsAt, type GameState } from "../engine/index.ts";

type Kind = "quick" | "computer" | "exhibition";
type Names = { A: string | null; B: string | null };

const MOVE_SECONDS = 5; // R76: a result is shown, then the spectator moves to another game
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

const board: BoardView = buildBoard();
$("board-wrap").prepend(board.root);
board.root.removeAttribute("role");
board.root.setAttribute("aria-hidden", "true");

let drawn: GameState | null = null;
let code: string | null = null;
let kind: Kind = "quick";
let moveTimer: ReturnType<typeof setInterval> | undefined;
let busy = Promise.resolve(); // rounds are shown one at a time, in order
// Which seat's discs are drawn as "you" (the first seat) and which as "opponent": seat A uses the ring marker and
// seat B the cross marker, so they differ by shape as well as colour (U78).
const pieceFor = (cell: string): "you" | "opponent" | "rubble" | null => (cell === "R" ? "rubble" : cell === "A" ? "you" : cell === "B" ? "opponent" : null);

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
// /watch?game=CODE watches one particular game (U77); anything else, or a game that cannot be watched, falls back to a random one.
const wantedGame = new URLSearchParams(location.search).get("game")?.toUpperCase();
socket.addEventListener("open", () => socket.send(JSON.stringify(wantedGame && /^[A-Z0-9]{6}$/.test(wantedGame) ? { type: "spectate", code: wantedGame } : { type: "spectate" })));
window.addEventListener("pagehide", () => {
  try {
    socket.send(JSON.stringify({ type: "leave" }));
  } catch {
    // the connection is already gone: the server notices that too
  }
});

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

function watchingText(n: number): string {
  return `${n} watching`;
}

function names(n: Names): void {
  setText("name-a", n.A ?? "Player 1");
  setText("name-b", n.B ?? "Player 2");
  for (const [slot, seed] of [["a", `${code}-A`], ["b", `${code}-B`]] as const) {
    const fresh = avatar(seed);
    fresh.dataset.testid = `avatar-${slot}`;
    $(`avatar-${slot}`).replaceWith(fresh);
  }
}

// Draws a board from scratch: every cell as the server sent it, with no animation (a new game or a mid-game join).
function paint(state: GameState): void {
  board.clear();
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const kindOf = pieceFor(state.board[c][r] ?? "");
      if (kindOf) board.place(c, r, kindOf);
      if (r >= state.rows) {
        board.remove(c, r);
        board.setClosed(c, r, true);
      }
    }
  }
}

function powerUps(state: GameState): void {
  for (const [slot, seat] of [["a", "A"], ["b", "B"]] as const) {
    const shield = $(`shield-${slot}`);
    shield.dataset.shield = state.shieldsLeft[seat] ? "ready" : "used";
    shield.replaceChildren(shieldIcon());
    shield.setAttribute("aria-label", state.shieldsLeft[seat] ? "Shield available" : "Shield used");
    const quake = $(`quake-${slot}`);
    quake.dataset.quake = state.earthquakesLeft[seat] ? "ready" : "used";
    quake.replaceChildren(earthquakeIcon());
    quake.setAttribute("aria-label", state.earthquakesLeft[seat] ? "Earthquake available" : "Earthquake used");
  }
}

function warning(state: GameState): void {
  const due = state.status === "playing" && ceilingDue(state);
  $("shrink-warning").hidden = !due;
  setText("shrink-warning-text", due ? "The ceiling drops after this round" : "");
  markDoomed(board, state.rows, due, rowsAt(state.round + 1));
}

function banner(): void {
  setText("watching-banner", kind === "exhibition" ? "Exhibition: Computer vs Computer" : "Watching live");
}

// What happened this round, in the words of the players' screens but without "you" (U66, U73).
function describe(before: GameState, after: GameState): string {
  const parts: string[] = [];
  const shook = (["A", "B"] as const).filter((p) => before.earthquakesLeft[p] && !after.earthquakesLeft[p]);
  if (shook.length === 2) parts.push("Both players used Earthquake! The bottom row crumbled once.");
  else if (shook.length === 1) parts.push(`${shook[0] === "A" ? name("A") : name("B")} used Earthquake! The bottom row crumbled.`);
  const landed: string[] = [];
  let rubble = false;
  for (let c = 0; c < 7; c++) {
    const was = before.board[c].length;
    for (let r = was; r < after.board[c].length; r++) {
      const cell = after.board[c][r];
      if (cell === "R") rubble = true;
      else if (cell === "A" || cell === "B") landed.push(`${name(cell)}'s disc landed in column ${c + 1}.`);
    }
  }
  if (!shook.length) {
    if (rubble) parts.push("Both chose the same column. Crash: rubble landed.");
    else if (landed.length) parts.push(...landed);
    else if (after.round > before.round) parts.push("Nobody chose in time. No discs landed.");
  } else {
    if (rubble) parts.push("Crash: rubble landed.");
    parts.push(...landed);
  }
  if (after.rows < before.rows) parts.push("The ceiling dropped. The top row turned to rock.");
  return parts.join(" ");
}
let nameOf: Names = { A: null, B: null };
const name = (seat: "A" | "B"): string => nameOf[seat] ?? (seat === "A" ? "Player 1" : "Player 2");

async function show(state: GameState, first: boolean): Promise<void> {
  const previous = drawn;
  drawn = state;
  setText("round-number", String(state.status === "playing" ? state.round + 1 : state.round));
  powerUps(state);
  if (first || !previous) {
    paint(state);
  } else if (state.round > previous.round) {
    const quaked = (["A", "B"] as const).some((p) => previous.earthquakesLeft[p] && !state.earthquakesLeft[p]);
    if (quaked) {
      const asKinds = (columns: string[][]) => columns.map((column) => column.map((cell) => pieceFor(cell)));
      await quakeAnimation(board, asKinds(previous.board), asKinds(previous.board.map((column) => column.slice(1))));
    }
    // Draw the board exactly as the server sent it. A cell that held nothing before this round (once an
    // earthquake's shift of one row is allowed for) is new, and only new pieces drop in.
    const shift = quaked ? 1 : 0;
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 6; r++) {
        const now = state.board[c][r];
        const kindOf = now === undefined ? null : pieceFor(now);
        if (!kindOf) {
          if (r < state.rows) board.remove(c, r);
          continue;
        }
        const isNew = r >= Math.max(0, previous.board[c].length - shift);
        board.place(c, r, kindOf, isNew && !reducedMotion() ? (kindOf === "rubble" ? "thud" : "dropping") : undefined);
        if (isNew) board.cell(c, r).querySelector(".piece")?.classList.add("recent");
      }
    }
    $("result-line").textContent = describe(previous, state);
    if (state.rows < previous.rows) {
      if (!reducedMotion()) await new Promise<void>((resolve) => setTimeout(resolve, themeNumber("--ms-collapse-start")));
      await ceilingAnimation(board, previous.rows, state.rows);
    }
  }
  warning(state);
  if (state.status !== "playing") finished(state);
}

// U82: the result, then a count down from 5, then another game (R76). The browser does the waiting.
function finished(state: GameState): void {
  endCard(state.status === "draw" ? "It's a draw!" : `${name(state.winner as "A" | "B")} wins!`);
}

// A game that ends by a forfeit or abandonment has no final round (R27, R19): the server says so with `ended`.
function endedCard(message: { result: "forfeit" | "abandoned"; winner?: "A" | "B" }): void {
  endCard("That game has ended"); // U83
  setText("result-line", message.result === "forfeit" ? `A player left the game. ${name(message.winner ?? "A")} wins.` : "Both players missed 3 rounds in a row.");
}

function endCard(title: string): void {
  const card = $("watch-result");
  card.hidden = false;
  setText("watch-result-title", title);
  let left = MOVE_SECONDS;
  setText("watch-result-next", `Next game in ${left} seconds`);
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(moveTimer);
      another();
      return;
    }
    setText("watch-result-next", `Next game in ${left} ${left === 1 ? "second" : "seconds"}`);
  }, 1000);
}

function another(): void {
  clearInterval(moveTimer);
  $("watch-result").hidden = true;
  setText("result-line", "");
  setText("watch-message", "");
  socket.send(JSON.stringify({ type: "spectate" }));
}

$("watch-another").addEventListener("click", another);

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  switch (message.type) {
    case "spectating": {
      code = message.code;
      kind = message.kind;
      nameOf = message.names;
      clearInterval(moveTimer);
      $("watch-result").hidden = true;
      drawn = null;
      names(message.names);
      banner();
      setText("watching-count-text", watchingText(message.watching));
      setText("watch-message", "");
      busy = busy.then(() => show(message.state, true));
      break;
    }
    case "round":
      setText("watching-count-text", watchingText(message.watching));
      busy = busy.then(() => show(message.state, false));
      break;
    case "watching":
      setText("watching-count-text", watchingText(message.watching));
      break;
    case "ended":
      busy = busy.then(() => endedCard(message));
      break;
    case "not_watchable":
      // U83: the room is full, or the game stopped. Nothing to show but a message, and the buttons.
      setText("watch-message", message.reason === "room_full" ? "The room is full right now. Try again in a moment." : "That game cannot be watched. Try another.");
      break;
    case "rejected":
      break; // a spectator cannot act (R74): this screen sends nothing that could be rejected
  }
});
