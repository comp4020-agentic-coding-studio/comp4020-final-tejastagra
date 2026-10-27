// The home screen (/), docs/design/home.md U31 to U40. The page shows who the
// player is, starts games and shows the podium; every game, code and result
// comes from the server (R20).
import { avatar, buildBoard, confettiBurst, reducedMotion, themeNumber } from "./arcade.ts";
import { $, currentPlayer } from "./common.ts";
import { replayTutorial, showTutorial } from "./tutorial.ts";

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const message = $("home-message");

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

// A confirmation fades after 3 seconds (U35a); an error stays until the next action.
function say(text: string, kind: "error" | "ok" | "" = ""): void {
  clearTimeout(fadeTimer);
  message.textContent = text;
  if (kind) message.dataset.kind = kind;
  else delete message.dataset.kind;
  if (kind === "ok") fadeTimer = setTimeout(() => say(""), themeNumber("--ms-message-fade"));
}

async function start(endpoint: string): Promise<void> {
  say("");
  try {
    const res = await fetch(endpoint, { method: "POST" });
    if (!res.ok) {
      say(res.status === 429 ? "Too many games started. Try again in a minute." : "Could not start a game. Try again.", "error");
      return;
    }
    const { code } = await res.json();
    if (endpoint === "/api/computer") {
      try {
        sessionStorage.setItem(`rubble-computer-${code}`, "1");
      } catch {
        // Play again then starts a friend game, which is harmless
      }
    }
    location.href = `/g/${code}`;
  } catch {
    say("Could not reach the server. Check your connection.", "error");
  }
}

$("play-friend").addEventListener("click", () => start("/api/games"));
$("play-computer").addEventListener("click", () => start("/api/computer"));

// "Join with a code" opens the code box in place (U33).
const joinForm = $("join-form") as HTMLFormElement;
$("join-toggle").addEventListener("click", () => {
  joinForm.hidden = !joinForm.hidden;
  if (!joinForm.hidden) ($("code-input") as HTMLInputElement).focus();
});
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = ($("code-input") as HTMLInputElement).value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    say("A game code is 6 letters or numbers, for example K7QM2X.", "error");
    return;
  }
  location.href = `/g/${code}`;
});

// ---- The player card (U32) ----
const nickForm = $("nick-form") as HTMLFormElement;
const nickInput = $("nickname-input") as HTMLInputElement;

async function showPlayer(): Promise<void> {
  let player = await currentPlayer();
  if (!player) {
    // A first-time visitor gets a generated nickname so they can play at once (R28 note).
    try {
      await fetch("/api/visitor", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } catch {
      // fall through: the card keeps its placeholder
    }
    player = await currentPlayer();
  }
  const fresh = avatar(player?.displayName ?? "guest");
  fresh.dataset.testid = "player-avatar";
  $("player-avatar").replaceWith(fresh);
  $("player-name").textContent = player ? player.displayName : "Guest";
  $("player-kind").textContent = player ? (player.kind === "account" ? "Account" : "Guest") : "";
}

$("rename").addEventListener("click", () => {
  nickForm.hidden = !nickForm.hidden;
  if (!nickForm.hidden) nickInput.focus();
});
nickForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const res = await fetch("/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: nickInput.value.trim() }) });
    if (!res.ok) {
      say((await res.json().catch(() => ({}))).error ?? "Could not save the nickname.", "error");
      return;
    }
    say("Nickname saved.", "ok");
    nickForm.hidden = true;
    await showPlayer();
  } catch {
    say("Could not reach the server. Check your connection.", "error");
  }
});

// ---- Top players (U35) ----
async function showTop(): Promise<void> {
  const list = $("leaderboard-wins");
  try {
    const res = await fetch("/api/leaderboard?limit=3");
    const rows: Array<{ name: string; value: number }> = res.ok ? (await res.json()).wins : [];
    list.replaceChildren();
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "row";
      li.textContent = "No wins yet. Be the first.";
      list.append(li);
      return;
    }
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      li.className = "row";
      const rank = document.createElement("span");
      rank.className = "row-rank";
      rank.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "row-name";
      name.textContent = row.name; // textContent, so a nickname cannot inject markup
      const value = document.createElement("span");
      value.className = "row-value";
      value.textContent = `${row.value} ${row.value === 1 ? "win" : "wins"}`;
      li.append(rank, avatar(row.name), name, value);
      list.append(li);
    });
  } catch {
    list.replaceChildren();
  }
}

// ---- The demo board (U36): the twist without words ----
async function demo(): Promise<void> {
  const board = buildBoard();
  const wrap = $("demo-board-wrap");
  wrap.prepend(board.root);
  const caption = $("demo-caption");
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const beat = themeNumber("--ms-beat");

  if (reducedMotion()) {
    // A still picture of a crash (U36): no loop, no motion.
    for (const [c, r, p] of [[2, 0, "you"], [4, 0, "opponent"], [3, 0, "rubble"]] as const) board.place(c, r, p);
    caption.textContent = "Both players pick the same column and the discs crash into rubble.";
    return;
  }
  for (;;) {
    board.clear();
    caption.textContent = "Both players choose at the same time...";
    await wait(beat);
    board.place(2, 0, "you", "dropping");
    board.place(4, 0, "opponent", "dropping");
    caption.textContent = "Neither can see the other's choice until both discs drop.";
    await wait(themeNumber("--ms-after-round"));
    caption.textContent = "Both players choose the same column...";
    await wait(beat);
    board.place(3, 0, "rubble", "thud");
    caption.textContent = "Crash! The discs leave rubble that blocks lines.";
    await wait(themeNumber("--ms-win-hold") / 2);
    void confettiBurst;
  }
}

// ---- The tutorial (R47, R49) ----
$("how-to-play").addEventListener("click", () => void replayTutorial());

async function maybeTutorial(): Promise<void> {
  try {
    const res = await fetch("/api/me");
    if (res.ok && (await res.json()).tutorialDue) await showTutorial();
  } catch {
    // no tutorial if the server cannot say; the menu still works
  }
}

// The tutorial waits for the player card, so a brand-new visitor already has a session
// when the tutorial saves "finished" or "skipped" (R48).
void showPlayer().then(maybeTutorial);
void showTop();
void demo();

// ---- The live count on "Watch live" (U76, R80) ----
// A number only: how many watchable games are live. It is asked for when the screen opens and every 10 seconds
// while it is open, and never more often (R77). If the server cannot say, the badge keeps its last words.
const LIVE_EVERY_MS = 10_000;
async function showLive(): Promise<void> {
  try {
    const res = await fetch("/api/live");
    if (!res.ok) return;
    const { live } = await res.json();
    if (typeof live !== "number") return;
    const badge = $("live-count");
    badge.textContent = live === 0 ? "No games live" : `${live} live`;
    badge.dataset.live = String(live);
  } catch {
    // keep the last words
  }
}
void showLive();
setInterval(() => {
  if (!document.hidden) void showLive();
}, LIVE_EVERY_MS);
