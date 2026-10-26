// Shared drawing helpers for the dark arcade look (ADR 0006), used by every
// screen. The browser only draws what the server sends (R20). No colour or
// font value is written here: colours come from var(--...) in public/theme.css.

const SVG = "http://www.w3.org/2000/svg";

// A small, stable hash so an avatar is drawn from a player's id (or name):
// the same player always looks the same, and nothing is uploaded.
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Six backgrounds (--avatar-1 to --avatar-6), three eye styles and three mouths.
export function avatar(seed: string): HTMLElement {
  const h = hash(seed);
  const wrap = document.createElement("span");
  wrap.className = "avatar";
  wrap.style.background = `var(--avatar-${(h % 6) + 1})`;
  const svg = el("svg", { viewBox: "0 0 44 44", "aria-hidden": "true", focusable: "false" });
  const eyes = (h >>> 3) % 3;
  const mouth = (h >>> 5) % 3;
  const ink = (extra: Record<string, string>) => ({ class: "ink", ...extra });
  if (eyes === 0) {
    svg.append(el("circle", ink({ cx: "15", cy: "19", r: "3" })), el("circle", ink({ cx: "29", cy: "19", r: "3" })));
  } else if (eyes === 1) {
    svg.append(el("rect", ink({ x: "11", y: "17", width: "8", height: "4", rx: "2" })), el("rect", ink({ x: "25", y: "17", width: "8", height: "4", rx: "2" })));
  } else {
    svg.append(el("circle", ink({ cx: "15", cy: "19", r: "4" })), el("circle", ink({ cx: "29", cy: "19", r: "2" })));
  }
  if (mouth === 0) svg.append(el("path", ink({ d: "M12 29q10 9 20 0z" })));
  else if (mouth === 1) svg.append(el("rect", ink({ x: "14", y: "29", width: "16", height: "4", rx: "2" })));
  else svg.append(el("circle", ink({ cx: "22", cy: "31", r: "4" })));
  wrap.append(svg);
  return wrap;
}

export function shieldIcon(): SVGElement {
  const svg = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  svg.append(el("path", { d: "M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" }));
  return svg;
}

export type Piece = "you" | "opponent" | "rubble";

export interface BoardView {
  root: HTMLElement;
  cell(column: number, row: number): HTMLElement;
  place(column: number, row: number, piece: Piece, animation?: "dropping" | "thud"): HTMLElement;
  clear(): void;
}

// Builds the 7 by 6 board. Row 0 is the bottom row, so it is drawn last, as in
// docs/design.md; cell test hooks are cell-<column>-<row>.
export function buildBoard(): BoardView {
  const root = document.createElement("div");
  root.className = "board";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "Board, 7 columns by 6 rows");
  const cells: HTMLElement[][] = Array.from({ length: 7 }, () => []);
  for (let row = 5; row >= 0; row--) {
    for (let column = 0; column < 7; column++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.testid = `cell-${column}-${row}`;
      cell.dataset.piece = "";
      cells[column][row] = cell;
      root.append(cell);
    }
  }
  return {
    root,
    cell: (column, row) => cells[column][row],
    place(column, row, piece, animation) {
      const cell = cells[column][row];
      cell.querySelector(".piece")?.remove();
      const node = document.createElement("span");
      node.className = "piece";
      node.dataset.piece = piece;
      cell.dataset.piece = piece === "you" ? "A" : piece === "opponent" ? "B" : "R";
      if (animation && !reducedMotion()) {
        node.classList.add(animation);
        node.style.setProperty("--fall", String(6 - row));
      }
      cell.append(node);
      return node;
    },
    clear() {
      for (const column of cells) {
        for (const cell of column) {
          cell.querySelector(".piece")?.remove();
          cell.dataset.piece = "";
        }
      }
    },
  };
}

// Reads a number from a theme variable (public/theme.css), so pacing and sizes
// live in the theme file and not in scripts. Seconds ("2.4s") become
// milliseconds; plain numbers stay as they are.
export function themeNumber(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (Number.isNaN(value)) throw new Error(`theme variable ${name} is missing`);
  return raw.endsWith("ms") ? value : raw.endsWith("s") ? value * 1000 : value;
}

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function confettiBurst(host: HTMLElement): void {
  if (reducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement("i");
    bit.style.setProperty("--x", `${Math.round((i * 97) % 100)}%`);
    bit.style.setProperty("--delay", `${(((i * 37) % 50) / 50) * (themeNumber("--dur-confetti-spread") / 1000)}s`);
    layer.append(bit);
  }
  host.append(layer);
  setTimeout(() => layer.remove(), themeNumber("--dur-confetti-clear"));
}
