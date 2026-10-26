// Sign up and sign in (/account, R28 to R31). Errors come from the server and
// are shown as given. Passwords are only ever sent to the server, never kept
// or logged here.
import { $, currentPlayer } from "./common.ts";

const message = document.getElementById("account-message")!;
const who = document.getElementById("account-who")!;

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "Could not reach the server. Check your connection." } };
  }
}

async function refresh(): Promise<void> {
  const player = await currentPlayer();
  who.textContent = player ? `You are ${player.displayName}${player.kind === "account" ? " (account)" : " (guest)"}.` : "You have not chosen a name yet.";
  const canSignUp = !!player && player.kind === "guest";
  $("signup-form").hidden = !canSignUp;
  document.getElementById("keep-heading")!.hidden = !canSignUp;
  $("signout").hidden = !player;
}

function value(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement).value;
}

$("guest-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const r = await post("/api/guest", { nickname: value(event.target as HTMLFormElement, "nickname").trim() });
  message.textContent = r.ok ? "Nickname saved." : r.data.error ?? "Could not save the nickname.";
  await refresh();
});

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const r = await post("/api/account/signup", { username: value(form, "username"), password: value(form, "password") });
  message.textContent = r.ok ? "Account created. Your games and wins are kept." : r.data.error ?? "Could not create the account.";
  if (r.ok) form.reset();
  await refresh();
});

$("signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const r = await post("/api/account/signin", { username: value(form, "username"), password: value(form, "password") });
  message.textContent = r.ok ? "Signed in." : r.data.error ?? "Could not sign in.";
  if (r.ok) form.reset();
  await refresh();
});

$("signout").addEventListener("click", async () => {
  await post("/api/signout", {});
  message.textContent = "Signed out.";
  await refresh();
});

refresh();
