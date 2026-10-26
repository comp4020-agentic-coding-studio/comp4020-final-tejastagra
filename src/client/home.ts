// The home screen (/). Play a friend asks the server for a code (R34) and
// goes to /g/<code>; Enter a game code goes to an existing game. The browser
// never makes a code or a game itself (R20).
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const message = document.getElementById("home-message")!;

$("play-friend").addEventListener("click", async () => {
  message.textContent = "";
  try {
    const res = await fetch("/api/games", { method: "POST" });
    if (!res.ok) {
      message.textContent = res.status === 429 ? "Too many games started. Try again in a minute." : "Could not start a game. Try again.";
      return;
    }
    const { code } = await res.json();
    location.href = `/g/${code}`;
  } catch {
    message.textContent = "Could not reach the server. Check your connection.";
  }
});

document.getElementById("join-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = ($("code-input") as HTMLInputElement).value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    message.textContent = "A game code is 6 letters or numbers, for example K7QM2X.";
    return;
  }
  location.href = `/g/${code}`;
});
