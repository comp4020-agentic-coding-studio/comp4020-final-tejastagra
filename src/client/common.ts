// Small helpers shared by the screens. The browser only shows what the
// server sends (R20); it never decides who a player is or who has won.
export const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

export interface BoardRow {
  name: string;
  value: number;
}

// Rows are built with textContent, never innerHTML, so a nickname cannot inject markup.
export function fillList(list: HTMLElement, rows: BoardRow[], unit: string, empty: string): void {
  list.replaceChildren();
  if (rows.length === 0) {
    const item = document.createElement("li");
    item.textContent = empty;
    list.append(item);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = `${row.name}: ${row.value} ${unit}${row.value === 1 ? "" : "s"}`;
    list.append(item);
  }
}

export async function loadBoard(limit: number): Promise<{ wins: BoardRow[]; rounds: BoardRow[] } | null> {
  try {
    const res = await fetch(`/api/leaderboard?limit=${limit}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function currentPlayer(): Promise<{ displayName: string; kind: "guest" | "account" } | null> {
  try {
    const res = await fetch("/api/me");
    return res.ok ? (await res.json()).player : null;
  } catch {
    return null;
  }
}
