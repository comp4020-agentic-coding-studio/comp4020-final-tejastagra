// The home screen (/), docs/design/home.md U31 to U40. The page shows who the
// player is, starts games and shows the podium; every game, code and result
// comes from the server (R20).
import { avatar, buildBoard, confettiBurst, reducedMotion, themeNumber } from "./arcade.ts";
import { $, currentPlayer } from "./common.ts";
import { dialogButton, openDialog } from "./dialog.ts";
import { beforeFirstMatch, replayTutorial } from "./tutorial.ts";

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const message = $("home-message");

let currentName = ""; // the nickname the popup opens prefilled with (Q7)
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

// R47: the first time a person starts a game in this browser, the tutorial runs first, then the game they chose starts (U136).
$("play-friend").addEventListener("click", () => void beforeFirstMatch(() => start("/api/games")));
$("play-computer").addEventListener("click", () => void beforeFirstMatch(() => start("/api/computer")));
// Quick match never opens the tutorial (R47): its link goes straight to the queue.

// "Join with a code" opens the code popup (U33b): nothing on the screen moves.
function openCodeDialog(): void {
  const dialog = openDialog({
    testid: "code-dialog",
    title: "Join with a code",
    onSubmit: (d) => {
      const code = (d.form.elements.namedItem("code") as HTMLInputElement).value.trim().toUpperCase();
      if (!CODE_PATTERN.test(code)) {
        d.error("code", "A game code is 6 letters or numbers, for example K7QM2X.");
        return;
      }
      d.close();
      void beforeFirstMatch(() => void (location.href = `/g/${code}`)); // R47: joining with a code starts a match
    },
  });
  dialog.field("Game code", "code", { maxlength: 6, capitalize: true });
  dialog.actions(dialogButton("Join", "yellow", "code-join", { type: "submit" }), dialogButton("Cancel", "blue", "dialog-cancel", { onClick: () => dialog.close() }));
}
$("join-toggle").addEventListener("click", openCodeDialog);

// ---- The player card (U32) ----

let currentKind: "guest" | "account" | null = null;

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
  // R31, R107: an account is named by its username alone; a guest's nickname prefills the nickname popup.
  currentName = player?.kind === "guest" ? player.nickname : (player?.displayName ?? "");
  currentKind = player?.kind ?? null;
  $("player-name").textContent = player ? player.displayName : "Guest";
  $("player-kind").textContent = player ? (player.kind === "account" ? "Logged in" : "Guest") : "";
}

async function postRename(endpoint: string, body: Record<string, string>): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, status: res.status, error: (await res.json().catch(() => ({}))).error };
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 0, error: "Could not reach the server. Check your connection." };
  }
}

function nicknameDialog(): void {
  const dialog = openDialog({
    testid: "nickname-dialog",
    title: "Your nickname",
    onSubmit: async (d) => {
      const value = (d.form.elements.namedItem("nickname") as HTMLInputElement).value.trim();
      const r = await postRename("/api/guest", { nickname: value });
      if (!r.ok) return d.error("nickname", r.error ?? "Could not save the nickname.");
      d.close();
      await showPlayer();
    },
  });
  dialog.field("Nickname", "nickname", { value: currentName, maxlength: 16, autocomplete: "nickname" });
  dialog.actions(dialogButton("Save", "blue", "nickname-save", { type: "submit" }), dialogButton("Cancel", "red", "dialog-cancel", { onClick: () => dialog.close() }));
}

// R107: renaming an account's username, with the current password. Unlike a password change, no other session ends.
function usernameDialog(): void {
  const dialog = openDialog({
    testid: "username-dialog",
    title: "Your username",
    onSubmit: async (d) => {
      const username = (d.form.elements.namedItem("username") as HTMLInputElement).value.trim();
      const current = (d.form.elements.namedItem("current") as HTMLInputElement).value;
      const r = await postRename("/api/account/username", { username, current });
      if (!r.ok) return d.error(r.status === 401 ? "current" : "username", r.error ?? "Could not save the username.");
      d.close();
      await showPlayer();
    },
  });
  dialog.field("Username", "username", { value: currentName, maxlength: 20, autocomplete: "username" });
  dialog.field("Current password", "current", { type: "password", autocomplete: "current-password" });
  dialog.actions(dialogButton("Save", "blue", "username-save", { type: "submit" }), dialogButton("Cancel", "red", "dialog-cancel", { onClick: () => dialog.close() }));
}

// The pencil opens the nickname popup for a guest, or the rename popup for a logged-in account (U32, Q7, R107).
$("rename").addEventListener("click", () => (currentKind === "account" ? usernameDialog() : nicknameDialog()));

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

// R47: the tutorial never opens on the home screen by itself; it runs when a match is started. The player card makes sure a
// brand-new visitor has a session before then, so "finished" or "skipped" is saved with them (R48).
void showPlayer();
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
