// /style-preview: every piece of the dark arcade look in one place, with the
// reveal looping, so Tejas can approve it before any real screen is restyled
// (ADR 0006). It is a picture of the style only: it never talks to the game
// server and decides nothing (R20).
import { avatar, buildBoard, confettiBurst, reducedMotion, shieldIcon, themeNumber } from "./arcade.ts";

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

// ---- Player panels ----
function panel(host: HTMLElement, who: "you" | "opponent", name: string, tag: string, seed: string, shield: "ready" | "used" | "glow"): void {
  host.className = `player player-${who}`;
  host.replaceChildren();
  host.append(avatar(seed));
  const text = document.createElement("span");
  text.className = "player-text";
  const nameEl = document.createElement("span");
  nameEl.className = "player-name";
  nameEl.textContent = name;
  const tagEl = document.createElement("span");
  tagEl.className = "player-tag";
  tagEl.textContent = tag ? ` ${String.fromCharCode(35)}${tag}` : "";
  nameEl.append(tagEl);
  const meta = document.createElement("span");
  meta.className = "player-meta";
  const disc = document.createElement("span");
  disc.className = "mini-disc";
  disc.dataset.piece = who;
  const sh = document.createElement("span");
  sh.className = "shield-state";
  sh.dataset.shield = shield;
  sh.append(shieldIcon(), document.createTextNode(shield === "used" ? "Shield used" : "Shield ready"));
  meta.append(disc, sh);
  text.append(nameEl, meta);
  host.append(text);
}

panel($("preview-you"), "you", "You", "", "you-seed", "ready");
panel($("preview-opponent"), "opponent", "Maya", "a7f3", "a7f3c1d2", "ready");

// ---- Leaderboard row avatars ----
for (const [id, seed] of [["av1", "a7f3c1d2"], ["av2", "c3ce77aa"], ["av3", "09bd12ef"]] as const) {
  document.getElementById(id)!.replaceWith(avatar(seed));
}

// ---- Key of pieces ----
const keyHost = $("preview-key");
for (const [piece, label] of [["you", "Your disc: red with a ring"], ["opponent", "Opponent's disc: yellow with a cross"], ["rubble", "Rubble block: grey with a hatch"]] as const) {
  const li = document.createElement("li");
  const disc = document.createElement("span");
  disc.className = "mini-disc";
  disc.dataset.piece = piece;
  li.append(disc, document.createTextNode(label));
  keyHost.append(li);
}

// ---- The looping reveal ----
const board = buildBoard();
$("preview-board").append(board.root);
const countdown = $("preview-countdown");
const result = $("preview-result");
const wrap = $("preview-board");

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Pacing comes from public/theme.css (the --ms-* variables), never from this file.
const ms = {
  step: themeNumber("--ms-count-step"),
  drop: themeNumber("--ms-count-drop"),
  beat: themeNumber("--ms-beat"),
  afterRound: themeNumber("--ms-after-round"),
  afterCrash: themeNumber("--ms-after-crash"),
  winHold: themeNumber("--ms-win-hold"),
  shake: themeNumber("--ms-shake"),
  land: themeNumber("--ms-drop-land"),
};
const instant = reducedMotion();

async function count(): Promise<void> {
  if (instant) return; // no countdown under reduced motion
  for (const word of ["3", "2", "1", "DROP"]) {
    countdown.textContent = word;
    countdown.classList.remove("countdown-pop");
    void countdown.offsetWidth; // restart the animation
    countdown.classList.add("countdown-pop");
    await wait(word === "DROP" ? ms.drop : ms.step);
  }
  countdown.textContent = "";
}

function glowRecent(): void {
  wrap.querySelectorAll(".piece.recent").forEach((n) => n.classList.remove("recent"));
}

async function scene(): Promise<void> {
  board.clear();
  glowRecent();
  result.textContent = "";
  // Some discs already on the board, so the preview looks like a game in progress.
  const start: Array<[number, number, "you" | "opponent"]> = [
    [3, 0, "you"], [3, 1, "opponent"], [2, 0, "opponent"], [4, 0, "you"], [2, 1, "you"], [4, 1, "opponent"],
  ];
  for (const [c, r, p] of start) board.place(c, r, p);
  panel($("preview-you"), "you", "You", "", "you-seed", "ready");
  panel($("preview-opponent"), "opponent", "Maya", "a7f3", "a7f3c1d2", "ready");
  await wait(ms.beat);

  // The server sends a result only when both have chosen. The page shows
  // nothing about the choices before then (R22): the countdown comes first,
  // then the discs and the words describing what happened.
  // Round 1: countdown, then both discs drop together with a bounce.
  result.textContent = "Both players are choosing...";
  await count();
  const a = board.place(2, 2, "you", "dropping");
  const b = board.place(4, 2, "opponent", "dropping");
  a.classList.add("recent");
  b.classList.add("recent");
  result.textContent = "You chose column 3. Maya chose column 5. Both discs landed.";
  await wait(ms.afterRound);

  // Round 2: a crash. The column shakes and the rubble thuds in.
  glowRecent();
  result.textContent = "Both players are choosing...";
  await count();
  result.textContent = "You both chose column 4. Crash: rubble landed.";
  const column = [0, 1, 2].map((r) => board.cell(3, r));
  if (!instant) column.forEach((c) => c.classList.add("shake"));
  board.place(3, 2, "rubble", "thud");
  await wait(instant ? ms.beat : ms.shake);
  column.forEach((c) => c.classList.remove("shake"));
  await wait(ms.afterCrash);

  // Round 3: a shield glows when used.
  result.textContent = "Both players are choosing...";
  await count();
  // The shield glows only now that the round is revealed, never before it.
  result.textContent = "You used your shield and won the crash in column 2.";
  panel($("preview-you"), "you", "You", "", "you-seed", "glow");
  const shielded = board.place(1, 0, "you", "dropping");
  shielded.classList.add("recent");
  await wait(ms.beat);
  panel($("preview-you"), "you", "You", "", "you-seed", "used");
  await wait(ms.beat);

  // Round 4: a win. The four discs are highlighted and confetti bursts.
  glowRecent();
  board.clear();
  for (let r = 0; r < 3; r++) board.place(5, r, "you");
  board.place(6, 0, "opponent");
  board.place(6, 1, "opponent");
  board.place(0, 0, "opponent");
  await wait(ms.beat);
  result.textContent = "Both players are choosing...";
  await count();
  result.textContent = "You win! Four in a row in column 6.";
  const last = board.place(5, 3, "you", "dropping");
  await wait(instant ? 0 : ms.land);
  for (let r = 0; r < 3; r++) board.cell(5, r).querySelector(".piece")?.classList.add("win");
  last.classList.add("win");
  confettiBurst(wrap);
  await wait(ms.winHold);
}

async function loop(): Promise<void> {
  for (;;) await scene();
}
loop();
