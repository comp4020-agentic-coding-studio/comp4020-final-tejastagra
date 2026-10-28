// The leaderboard screen (/leaderboard, docs/design/leaderboard.md U123 to U130): most wins and fewest rounds as two tabs, a podium
// for the top three, compact rows for the rest, the asking player's row highlighted and "Your best:" under each list. The server
// computes both lists and the asker's own line (R38, R39, R92); this only shows them. Names are set with textContent, never
// innerHTML, so a nickname cannot inject markup.
import { avatar } from "./arcade.ts";
import { $ } from "./common.ts";

interface Row {
  name: string;
  value: number;
}
interface Board {
  wins: Row[];
  rounds: Row[];
  you: { name: string; wins: number; bestRounds: number | null } | null;
}

type Tab = "wins" | "rounds";
let board: Board | null = null;
let tab: Tab = "wins";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const scoreText = (t: Tab, value: number) => (t === "wins" ? plural(value, "win") : plural(value, "round"));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(id: string, visible: boolean): void {
  $(id).hidden = !visible;
}

function render(): void {
  for (const id of ["leaderboard-loading", "podium", "leaderboard-wins", "leaderboard-rounds", "leaderboard-empty", "leaderboard-error"]) show(id, false);
  for (const t of ["wins", "rounds"] as const) $(`tab-${t}`).setAttribute("aria-selected", String(t === tab));
  if (!board) {
    show("leaderboard-error", true);
    $("your-best").textContent = "";
    return;
  }
  const list = tab === "wins" ? board.wins : board.rounds;
  const you = board.you;
  const isYou = (name: string) => !!you && you.name === name; // the whole name and tag (R92)
  if (list.length === 0) {
    $("leaderboard-empty-text").textContent = tab === "wins" ? "No wins yet. Only games against other people count, so play a friend or try Quick match." : "No wins by four in a row yet. Only games against other people count, so play a friend or try Quick match.";
    show("leaderboard-empty", true);
  } else {
    // The podium: first in the middle and tallest, second on the left, third on the right (U125).
    const podium = $("podium");
    podium.replaceChildren();
    for (const place of [2, 1, 3]) {
      const row = list[place - 1];
      if (!row) continue;
      const block = el("div", "podium-place");
      block.dataset.place = String(place);
      if (isYou(row.name)) block.dataset.you = "true";
      const who = el("div", "podium-who");
      who.append(avatar(row.name), el("span", "podium-name", row.name));
      if (isYou(row.name)) who.append(el("span", "you-tag", "You"));
      const step = el("div", "podium-step");
      step.append(el("span", "podium-rank", String(place)), el("span", "podium-score", scoreText(tab, row.value)));
      block.append(who, step);
      podium.append(block);
    }
    show("podium", true);
    // Compact rows from fourth place (U126).
    const rows = $(tab === "wins" ? "leaderboard-wins" : "leaderboard-rounds");
    rows.replaceChildren();
    list.slice(3).forEach((row, i) => {
      const li = el("li", "row board-row");
      if (isYou(row.name)) li.dataset.you = "true";
      const name = el("span", "row-name", row.name);
      if (isYou(row.name)) name.append(el("span", "you-tag", "You"));
      li.append(el("span", "row-rank", String(i + 4)), avatar(row.name), name, el("span", "row-value", scoreText(tab, row.value)));
      rows.append(li);
    });
    show(tab === "wins" ? "leaderboard-wins" : "leaderboard-rounds", rows.children.length > 0);
  }
  // Your best, always shown under the list (U127).
  $("your-best").textContent = !you
    ? "Your best: play a game to get on the board"
    : tab === "wins"
      ? `Your best: ${plural(you.wins, "win")}`
      : you.bestRounds === null
        ? "Your best: no wins yet"
        : `Your best: ${plural(you.bestRounds, "round")}`;
}

async function load(): Promise<void> {
  show("leaderboard-loading", true);
  try {
    const res = await fetch("/api/leaderboard?limit=20");
    board = res.ok ? ((await res.json()) as Board) : null;
  } catch {
    board = null;
  }
  render();
}

for (const t of ["wins", "rounds"] as const) {
  $(`tab-${t}`).addEventListener("click", () => {
    tab = t;
    render();
  });
}
$("leaderboard-retry").addEventListener("click", () => void load());
void load();
