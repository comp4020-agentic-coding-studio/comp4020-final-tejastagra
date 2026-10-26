// The game screen (/g/<code>). Board, timer, opponent status, shields, Drop,
// result line (docs/design.md). The browser only sends choices and shows
// what the server sends (R20); it never computes a result itself.
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
let shield = false;
let over = false;
let deadline = Date.now() + ROUND_SECONDS * 1000;

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

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

socket.addEventListener("open", () => {
  const saved = loadSeat();
  socket.send(JSON.stringify({ type: "join", code, ...(saved ?? {}) }));
});

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

function renderChoice(): void {
  document.querySelectorAll<HTMLElement>("[data-column]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.column) === selectedColumn));
  });
  $("shield-toggle").setAttribute("aria-pressed", String(shield));
  $("shield-toggle").textContent = shield ? "Shield on" : "Shield off";
  const canAct = !over && you !== null;
  ($("drop") as HTMLButtonElement).disabled = !canAct || selectedColumn === null;
}

function renderState(state: State, opponentReady: boolean): void {
  for (let column = 0; column < 7; column++) {
    for (let row = 0; row < 6; row++) {
      const piece = state.board[column][row] ?? "";
      const mark = piece === "R" ? "R" : piece === you ? "you" : piece ? "them" : "";
      const cell = $(`cell-${column}-${row}`);
      cell.dataset.piece = piece;
      cell.dataset.mark = mark;
      cell.textContent = mark === "you" ? "○" : mark === "them" ? "×" : "";
      cell.setAttribute("aria-label", mark === "R" ? "Rubble block" : mark === "you" ? "Your disc" : mark === "them" ? "Opponent's disc" : "Empty");
    }
  }
  setText("round-number", String(state.round + 1));
  setText("opponent-status", opponentReady ? "Ready" : "Choosing");
  if (you) {
    setText("my-shield", state.shieldsLeft[you] ? "available" : "used");
    setText("opponent-shield", state.shieldsLeft[you === "A" ? "B" : "A"] ? "available" : "used");
    if (!state.shieldsLeft[you]) shield = false;
  }
  if (state.status !== "playing") {
    over = true;
    setText("result-line", state.status === "draw" ? "Draw. The board is full." : state.winner === you ? "You win." : "You lose.");
    setText("opponent-status", "Finished");
  } else {
    setText("result-line", "");
  }
  // The share panel stays until the first round resolves (the opponent has
  // then clearly arrived or the timer has run); it is hidden after that.
  $("waiting-panel").hidden = state.round > 0 || state.status !== "playing";
  deadline = Date.now() + ROUND_SECONDS * 1000;
  selectedColumn = null;
  renderChoice();
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  switch (message.type) {
    case "snapshot":
      you = message.you;
      seatToken = message.seatToken;
      saveSeat();
      renderState(message.state, message.opponentReady);
      break;
    case "opponent_ready":
      setText("opponent-status", "Ready");
      break;
    case "rejected":
      setText("result-line", message.reason === "column_full" ? "That column is full. Pick another." : message.reason === "no_shield" ? "You have no shield left." : "That choice was not accepted.");
      break;
    case "game_over":
      over = true;
      setText("result-line", message.winner === you ? "You win. Your opponent left." : "You lose. You left the game.");
      renderChoice();
      break;
    case "game_full":
      over = true;
      setText("result-line", "This game already has two players.");
      renderChoice();
      break;
    case "tab_replaced":
      over = true;
      setText("result-line", "This game is open in another tab.");
      renderChoice();
      break;
  }
});

document.querySelectorAll<HTMLElement>("[data-column]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedColumn = Number(button.dataset.column);
    renderChoice();
  });
});

$("shield-toggle").addEventListener("click", () => {
  shield = !shield;
  renderChoice();
});

function drop(): void {
  if (over || !you || !seatToken || selectedColumn === null) return;
  socket.send(JSON.stringify({ type: "choose", code, player: you, seatToken, column: selectedColumn, shield }));
  setText("result-line", `You chose column ${selectedColumn + 1}${shield ? " with your shield" : ""}. You can change it until the round ends.`);
}

$("drop").addEventListener("click", drop);

$("copy-link").addEventListener("click", () => {
  const done = () => ($("copy-link").textContent = "Copied");
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, () => ($("copy-link").textContent = "Copy failed"));
  else $("copy-link").textContent = "Copy failed";
});

if (typeof navigator.share === "function") {
  $("share").hidden = false;
  $("share").addEventListener("click", () => {
    navigator.share({ title: "Rubble", text: `Play me at Rubble. Game code ${code}`, url: location.href }).catch(() => {});
  });
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const focused = document.activeElement as HTMLElement | null;
  if (event.key >= "1" && event.key <= "7") {
    selectedColumn = Number(event.key) - 1;
    renderChoice();
  } else if (event.key === "Enter" && (focused?.tagName !== "BUTTON" || focused.dataset.column !== undefined)) {
    // Enter on a column button selects it and drops; on other buttons it clicks them.
    if (focused?.dataset.column !== undefined) selectedColumn = Number(focused.dataset.column);
    event.preventDefault();
    drop();
  } else if (event.key === "s" || event.key === "S") {
    shield = !shield;
    renderChoice();
  }
});

setInterval(() => {
  setText("timer", String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))));
}, 250);

renderChoice();
