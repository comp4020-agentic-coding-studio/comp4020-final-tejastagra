// The account page (/account, docs/design/account.md U114 to U122, rules R28 to R31 and R86 to R91). One card, and every form is a
// popup (popups.md), so nothing moves. Errors come from the server and are shown as given, under the field they belong to.
// Passwords are only ever sent to the server, never kept or logged here.
import { avatar } from "./arcade.ts";
import { $ } from "./common.ts";
import { dialogButton, openDialog, openFrom, type Dialog } from "./dialog.ts";

interface Me {
  displayName: string;
  nickname: string;
  kind: "guest" | "account";
}

const message = $("account-message");
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string): void {
  clearTimeout(fadeTimer);
  message.textContent = text;
  if (text) fadeTimer = setTimeout(() => (message.textContent = ""), 4000);
}

async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach the server. Check your connection." } };
  }
}
const post = (path: string, body: unknown) => call("POST", path, body);
const field = (d: Dialog, name: string) => (d.form.elements.namedItem(name) as HTMLInputElement).value;

let me: Me | null = null;

async function refresh(): Promise<void> {
  const res = await call("GET", "/api/me");
  me = res.data?.player ?? null;
  if (res.data?.mustChange && !document.querySelector('[data-testid="must-change-dialog"]')) mustChangeDialog();
  const guest = me?.kind === "guest";
  const account = me?.kind === "account";
  $("account-nickname").textContent = me ? me.nickname : "You have not chosen a name yet";
  const fresh = avatar(me?.displayName ?? "guest");
  fresh.dataset.testid = "account-avatar";
  $("account-avatar").replaceWith(fresh);
  $("account-username").hidden = !account;
  $("account-username").textContent = account ? `@${me!.displayName}` : "";
  $("account-status").textContent = account ? "Logged in" : guest ? "Guest" : "";
  $("edit-nickname").hidden = !me;
  $("edit-nickname").querySelector("span")!.textContent = account ? "Edit nickname" : "Edit";
  $("account-hint").hidden = !guest && !!me;
  for (const [id, show] of [["open-signup", !account], ["open-signin", !account], ["open-password", account], ["signout", account]] as const) $(id).hidden = !show;
  await showRecord();
}

// ---- Your record: stats and history (R90, R91) ----
const ago = (ms: number): string => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return unit(Math.floor(s / 60), "minute");
  if (s < 86400) return unit(Math.floor(s / 3600), "hour");
  return unit(Math.floor(s / 86400), "day");
};

// U118 (changed 31 October 2026): a stat card with no games shows a dash in place of each number, never its own
// "No games yet" text; that message appears once, under both cards (showRecord).
function fillStats(id: string, r: { played: number; wins: number; losses: number; draws: number; winRate: number | null }): void {
  const card = $(id);
  card.querySelector(".record-none")?.replaceWith(document.createElement("dl"));
  const list = card.querySelector("dl")!;
  list.replaceChildren();
  const dash = "—";
  for (const [label, value] of [["Played", r.played], ["Won", r.wins], ["Lost", r.losses], ["Drawn", r.draws], ["Win rate", `${r.winRate}%`]] as const) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = r.played === 0 ? dash : String(value);
    row.append(dt, dd);
    list.append(row);
  }
}

async function showRecord(): Promise<void> {
  const res = await call("GET", "/api/me/history");
  const list = $("history-list");
  const empty = $("record-empty");
  if (!res.ok) {
    // Q10: a record that could not be loaded says so. It never claims "No games yet", which would be untrue.
    for (const id of ["stats-people", "stats-computer"]) $(id).hidden = true;
    empty.hidden = true;
    list.replaceChildren();
    const failed = document.createElement("li");
    failed.className = "record-error";
    failed.textContent = res.status === 403 || res.status === 401 ? "" : "Could not load your record. Try again.";
    if (failed.textContent) list.append(failed);
    return;
  }
  for (const id of ["stats-people", "stats-computer"]) $(id).hidden = false;
  const data = res.data;
  fillStats("stats-people", data.stats.people);
  fillStats("stats-computer", data.stats.computer);
  list.replaceChildren();
  // U118 (changed 31 October 2026): with no finished games, both stat cards show dashes and one message appears once,
  // under them, never inside a stat card and never repeated in the history list.
  empty.hidden = data.history.length !== 0;
  if (data.history.length === 0) return;
  for (const g of data.history as Array<{ opponent: string; result: string; rounds: number; endedAt: number }>) {
    const li = document.createElement("li");
    li.className = "row history-row";
    if (g.result === "Abandoned") li.dataset.abandoned = "true";
    const who = document.createElement("span");
    who.className = "row-name";
    who.textContent = g.opponent; // textContent, so a nickname cannot inject markup
    const result = document.createElement("span");
    result.className = "history-result";
    result.textContent = g.result;
    const detail = document.createElement("span");
    detail.className = "history-detail";
    detail.textContent = `${g.rounds} ${g.rounds === 1 ? "round" : "rounds"}, ${ago(g.endedAt)}`;
    li.append(avatar(g.opponent), who, result, detail);
    list.append(li);
  }
}

// ---- The popups (popups.md) ----
function nicknameDialog(): void {
  const d = openDialog({
    testid: "nickname-dialog",
    title: "Your nickname",
    onSubmit: async (dialog) => {
      const r = await post("/api/guest", { nickname: field(dialog, "nickname").trim() });
      if (!r.ok) return dialog.error("nickname", r.data.error ?? "Could not save the nickname.");
      dialog.close();
      await refresh();
    },
  });
  d.field("Nickname", "nickname", { value: me?.nickname ?? "", maxlength: 16, autocomplete: "nickname" });
  d.actions(dialogButton("Save", "blue", "nickname-save", { type: "submit" }), dialogButton("Cancel", "red", "dialog-cancel", { onClick: () => d.close() }));
}

function signUpDialog(): void {
  const d = openDialog({
    testid: "signup-dialog",
    title: "Save my progress",
    onSubmit: async (dialog) => {
      const r = await post("/api/account/signup", { username: field(dialog, "username"), password: field(dialog, "password") });
      if (!r.ok) return dialog.error(/username/i.test(r.data.error ?? "") ? "username" : "password", r.data.error ?? "Could not create the account.");
      dialog.close();
      say("Account created. Your games and wins are kept.");
      await refresh();
    },
  });
  d.field("Username", "username", { maxlength: 20, autocomplete: "username" });
  d.field("Password", "password", { type: "password", autocomplete: "new-password", hint: "At least 8 characters." });
  d.actions(dialogButton("Save", "red", "signup-save", { type: "submit" }), dialogButton("Cancel", "blue", "dialog-cancel", { onClick: () => d.close() }));
}

function forgotDialog(): Dialog {
  const d = openDialog({ testid: "forgot-dialog", title: "Forgot your password?" });
  d.text("Email game@tejastagra.com with your username and we'll reset it for you.");
  d.actions(dialogButton("Close", "blue", "dialog-cancel", { onClick: () => d.close() }));
  return d;
}

function signInDialog(): Dialog {
  const d = openDialog({
    testid: "signin-dialog",
    title: "Log in",
    onSubmit: async (dialog) => {
      const r = await post("/api/account/signin", { username: field(dialog, "username"), password: field(dialog, "password") });
      if (!r.ok) return dialog.error("password", r.data.error ?? "Could not log in.");
      dialog.close();
      if (r.data.mustChange) {
        mustChangeDialog();
        return;
      }
      say("Logged in.");
      await refresh();
    },
  });
  d.field("Username", "username", { autocomplete: "username" });
  d.field("Password", "password", { type: "password", autocomplete: "current-password" });
  const forgot = document.createElement("button");
  forgot.type = "button";
  forgot.className = "link-button forgot-link";
  forgot.dataset.testid = "forgot-link";
  forgot.textContent = "Forgot your password?";
  forgot.addEventListener("click", () => openFrom(() => void signInDialog(), forgotDialog));
  d.form.append(forgot);
  d.actions(dialogButton("Log in", "blue", "signin-save", { type: "submit" }), dialogButton("Cancel", "red", "dialog-cancel", { onClick: () => d.close() }));
  return d;
}

function passwordDialog(): void {
  const d = openDialog({
    testid: "password-dialog",
    title: "Change password",
    onSubmit: async (dialog) => {
      const r = await post("/api/account/password", { current: field(dialog, "current"), next: field(dialog, "next") });
      if (!r.ok) return dialog.error(r.status === 401 ? "current" : "next", r.data.error ?? "Could not change the password.");
      dialog.close();
      say("Password changed.");
    },
  });
  d.field("Current password", "current", { type: "password", autocomplete: "current-password" });
  d.field("New password", "next", { type: "password", autocomplete: "new-password", hint: "At least 8 characters." });
  d.actions(dialogButton("Change password", "blue", "password-save", { type: "submit" }), dialogButton("Cancel", "red", "dialog-cancel", { onClick: () => d.close() }));
}

// R87: signed in with a temporary password. The popup cannot be closed, skipped or left by Escape: only a new password ends it.
function mustChangeDialog(): void {
  const d = openDialog({
    testid: "must-change-dialog",
    title: "Choose a new password",
    dismissible: false,
    onSubmit: async (dialog) => {
      const r = await post("/api/account/password", { next: field(dialog, "next") });
      if (!r.ok) return dialog.error("next", r.data.error ?? "Could not change the password.");
      dialog.close();
      say("Password changed.");
      await refresh();
    },
  });
  d.text("You signed in with a temporary password. Choose a password of your own to carry on.");
  d.field("New password", "next", { type: "password", autocomplete: "new-password", hint: "At least 8 characters." });
  d.actions(dialogButton("Set password", "red", "must-change-save", { type: "submit" }));
}

$("edit-nickname").addEventListener("click", nicknameDialog);
$("open-signup").addEventListener("click", signUpDialog);
$("open-signin").addEventListener("click", () => void signInDialog());
$("open-password").addEventListener("click", passwordDialog);
$("signout").addEventListener("click", async () => {
  await post("/api/signout", {});
  say("Logged out.");
  await refresh();
});

void refresh();
