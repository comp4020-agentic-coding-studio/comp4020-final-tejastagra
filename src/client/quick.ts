// Quick match (/play/quick, R35). Joins the Quick match lobby with a random ticket and
// polls until the server pairs this player. After 20 seconds the player is
// offered the computer but may keep waiting. The server decides every pairing.
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const ticket = crypto.randomUUID();
const status = $("quick-status");
const OFFER_AFTER_MS = 20_000;
const LIVE_EVERY_MS = 10_000;
let finished = false;

async function call(method: string): Promise<{ state: string; code?: string } | null> {
  try {
    const res = await fetch(`/api/quick/${ticket}`, { method });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function go(code: string): void {
  finished = true;
  location.href = `/g/${code}`;
}

async function start(): Promise<void> {
  const joined = await call("POST");
  if (!joined) {
    status.textContent = "Could not join Quick match. Try again.";
    return;
  }
  if (joined.state === "matched" && joined.code) return go(joined.code);
  const poll = setInterval(async () => {
    if (finished) return clearInterval(poll);
    const result = await call("GET");
    if (result?.state === "matched" && result.code) {
      clearInterval(poll);
      go(result.code);
    } else if (result?.state === "unknown") {
      clearInterval(poll);
      status.textContent = "You are no longer waiting. Go back and try again.";
    }
  }, 1000);
}

setTimeout(() => {
  if (!finished) $("computer-offer").hidden = false;
}, OFFER_AFTER_MS);

$("computer-offer-play").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/computer", { method: "POST" });
    if (res.ok) {
      finished = true;
      await call("DELETE"); // leave Quick match only once the computer game exists
      location.href = `/g/${(await res.json()).code}`;
      return;
    }
  } catch {
    // fall through to the message below
  }
  status.textContent = "Could not start a game against the computer. You are still waiting.";
});

// Cancel and the header bar's Home (Q12) both leave the queue before going Home (U100).
for (const id of ["quick-cancel", "header-home"]) {
  $(id).addEventListener("click", async () => {
    finished = true;
    await call("DELETE");
    location.href = "/";
  });
}

// The live count (U98): twice the number of live quick match games, asked for now and every 10 seconds while open (R77).
async function showLive(): Promise<void> {
  try {
    const res = await fetch("/api/live");
    if (!res.ok) return;
    const { live } = await res.json();
    if (typeof live !== "number") return;
    $("quick-live").textContent = live === 0 ? "Be the first to play" : `${live * 2} people playing now`;
  } catch {
    // keep the last words
  }
}
void showLive();
setInterval(() => {
  if (!document.hidden && !finished) void showLive();
}, LIVE_EVERY_MS);

// A closed tab simply stops polling; the server drops stale tickets itself.
start();
