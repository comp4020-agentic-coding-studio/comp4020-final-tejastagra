// Small helpers shared by the screens. The browser only shows what the
// server sends (R20); it never decides who a player is or who has won.
import { avatar } from "./arcade.ts";

export const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

export interface BoardRow {
  name: string;
  value: number;
}

// Leaderboard rows (docs/design/look-and-feel.md): a rank, an avatar, the name with its tag and the
// value. Built with textContent, never innerHTML, so a nickname cannot inject markup.
export function fillList(list: HTMLElement, rows: BoardRow[], unit: string, empty: string): void {
  list.replaceChildren();
  if (rows.length === 0) {
    const item = document.createElement("li");
    item.className = "row";
    item.textContent = empty;
    list.append(item);
    return;
  }
  rows.forEach((row, i) => {
    const item = document.createElement("li");
    item.className = "row";
    const rank = document.createElement("span");
    rank.className = "row-rank";
    rank.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = row.name;
    const value = document.createElement("span");
    value.className = "row-value";
    value.textContent = `${row.value} ${unit}${row.value === 1 ? "" : "s"}`;
    item.append(rank, avatar(row.name), name, value);
    list.append(item);
  });
}

export async function loadBoard(limit: number): Promise<{ wins: BoardRow[]; rounds: BoardRow[] } | null> {
  try {
    const res = await fetch(`/api/leaderboard?limit=${limit}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function currentPlayer(): Promise<{ displayName: string; nickname: string; kind: "guest" | "account" } | null> {
  try {
    const res = await fetch("/api/me");
    return res.ok ? (await res.json()).player : null;
  } catch {
    return null;
  }
}

// U152, Q20: a player's name in a card is the nickname (cut with an ellipsis after two lines), and, when both players share a nickname,
// "(you)" after your own name (R103), kept whole. There is no tag (R31). The element's text is the whole name.
export function setPlayerName(el: HTMLElement, full: string, you = false): void {
  el.replaceChildren();
  const nick = document.createElement("span");
  nick.className = "pn-nick";
  nick.textContent = full;
  el.append(nick);
  if (you) {
    const mark = document.createElement("span");
    mark.className = "pn-you";
    mark.textContent = "(you)";
    el.append(" ", mark);
  }
}

// R103: on a player's own screen, "(you)" follows their name when both players have the same one. Never on a spectator's screen.
export function sameNameMark(yours: string | null | undefined, theirs: string | null | undefined): boolean {
  return !!yours && !!theirs && yours === theirs;
}
