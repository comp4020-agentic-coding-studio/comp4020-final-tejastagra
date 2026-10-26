// The home screen (/). Play a friend asks the server for a code (R34) and
// goes to /g/<code>; Enter a game code goes to an existing game. The browser
// never makes a code or a game itself (R20).
import { $, currentPlayer, fillList, loadBoard } from "./common.ts";
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const message = document.getElementById("home-message")!;

async function start(endpoint: string): Promise<void> {
  message.textContent = "";
  try {
    const res = await fetch(endpoint, { method: "POST" });
    if (!res.ok) {
      message.textContent = res.status === 429 ? "Too many games started. Try again in a minute." : "Could not start a game. Try again.";
      return;
    }
    const { code } = await res.json();
    location.href = `/g/${code}`;
  } catch {
    message.textContent = "Could not reach the server. Check your connection.";
  }
}

$("play-friend").addEventListener("click", () => start("/api/games"));
$("play-computer").addEventListener("click", () => start("/api/computer"));

document.getElementById("join-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = ($("code-input") as HTMLInputElement).value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    message.textContent = "A game code is 6 letters or numbers, for example K7QM2X.";
    return;
  }
  location.href = `/g/${code}`;
});

const who = document.getElementById("home-who")!;
const nickname = $("nickname-input") as HTMLInputElement;

async function showPlayer(): Promise<void> {
  const player = await currentPlayer();
  who.textContent = player ? `Playing as ${player.displayName}.` : "Choose a nickname to be on the leaderboard. You can still play without one.";
}

document.getElementById("nick-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const res = await fetch("/api/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: nickname.value.trim() }),
    });
    if (!res.ok) message.textContent = (await res.json().catch(() => ({}))).error ?? "Could not save the nickname.";
    else message.textContent = "Nickname saved.";
  } catch {
    message.textContent = "Could not reach the server. Check your connection.";
  }
  await showPlayer();
});

loadBoard(5).then((board) => {
  if (!board) return;
  fillList($("leaderboard-wins"), board.wins, "win", "No wins yet.");
  fillList($("leaderboard-rounds"), board.rounds, "round", "No wins by four in a row yet.");
});
showPlayer();
