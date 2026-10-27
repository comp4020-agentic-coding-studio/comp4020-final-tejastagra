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
type Kinds = Array<Array<Piece | null>>; // kinds[column][row], null when empty

export interface BoardView {
  root: HTMLElement;
  cell(column: number, row: number): HTMLElement;
  place(column: number, row: number, piece: Piece, animation?: "dropping" | "thud" | "sliding"): HTMLElement;
  remove(column: number, row: number): void;
  // U69, U71: a cell can be doomed (about to close, flashing a crack pattern) or closed (rock).
  setDoomed(column: number, row: number, doomed: boolean): void;
  setClosed(column: number, row: number, closed: boolean): void;
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
        node.style.setProperty("--fall", animation === "sliding" ? "1" : String(6 - row)); // a slide is one row
      }
      cell.append(node);
      return node;
    },
    remove(column, row) {
      cells[column][row].querySelector(".piece")?.remove();
      cells[column][row].dataset.piece = "";
    },
    setDoomed(column, row, doomed) {
      const cell = cells[column][row];
      if (doomed) cell.dataset.doomed = "true";
      else delete cell.dataset.doomed;
    },
    setClosed(column, row, closed) {
      const cell = cells[column][row];
      if (closed) cell.dataset.closed = "true";
      else delete cell.dataset.closed;
    },
    clear() {
      for (const column of cells) {
        for (const cell of column) {
          cell.querySelector(".piece")?.remove();
          cell.dataset.piece = "";
          delete cell.dataset.closed;
          delete cell.dataset.doomed;
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

export function earthquakeIcon(): SVGElement {
  const svg = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  svg.append(
    el("path", {
      d: "M2 3h5.5v7H2zM9.2 3h5.6v7H9.2zM16.5 3H22v7h-5.5zM2 12.5h4.6l2.2 3.4 3.2-3.4 3.2 4.6 2.6-3.6 4.2.2v3.2l-2.6.1-3.6 4.9-3.2-4.5-3.2 3.6-2.6-3.7H2z",
    }),
  );
  return svg;
}

// The earthquake (U65): the board shakes, the bottom row crumbles, then every column slides down one
// row. `shifted` is the board with its bottom row removed. It is only ever drawn after the server's
// result has arrived (R22). Under reduced motion the board simply updates (U30). The caller drops
// any disc afterwards.
export async function quakeAnimation(board: BoardView, before: Kinds, shifted: Kinds): Promise<void> {
  const still = reducedMotion();
  const step = themeNumber("--ms-quake-step");
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, step));
  if (!still) {
    board.root.classList.add("quake-shake");
    await wait();
    board.root.classList.remove("quake-shake");
    for (let c = 0; c < 7; c++) board.cell(c, 0).querySelector(".piece")?.classList.add("crumble");
    if (before.some((column) => column.length > 0)) await wait();
  }
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const kind = shifted[c]?.[r] ?? null;
      if (kind) board.place(c, r, kind, still ? undefined : "sliding");
      else board.remove(c, r);
    }
  }
  if (!still) await wait();
}

// The open area as the server sent it (R61, R62, R64): the rows below `rows`, in the columns from
// `firstColumn` to `lastColumn`. Everything else is closed.
export interface Shape {
  rows: number;
  firstColumn: number;
  lastColumn: number;
}

export const isOpen = (shape: Shape, column: number, row: number): boolean =>
  column >= shape.firstColumn && column <= shape.lastColumn && row < shape.rows;

// U69: marks the cells that will close after this round (the top open row for a ceiling drop, the
// outer open columns for a wall collapse). Both players see the same, because the schedule is public (R22).
export function markDoomed(board: BoardView, shape: Shape, due: { ceiling: boolean; walls: boolean }, next: Shape | null): void {
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const open = isOpen(shape, c, r);
      const willClose = open && next !== null && ((due.ceiling && r >= next.rows) || (due.walls && (c < next.firstColumn || c > next.lastColumn)));
      board.setDoomed(c, r, willClose);
    }
  }
}

// U70, U71: cells outside the new open area crack, crumble and turn to rock. `before` is what was
// drawn, so only cells that were open and now are not animate; under reduced motion they simply change.
export async function collapseAnimation(board: BoardView, before: Shape, after: Shape): Promise<void> {
  const still = reducedMotion();
  const closing: Array<[number, number]> = [];
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      if (isOpen(before, c, r) && !isOpen(after, c, r)) closing.push([c, r]);
    }
  }
  if (!still && closing.length) {
    for (const [c, r] of closing) {
      board.setDoomed(c, r, false);
      board.cell(c, r).querySelector(".piece")?.classList.add("crumble");
      board.cell(c, r).classList.add("cracking");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, themeNumber("--ms-collapse")));
  }
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const closed = !isOpen(after, c, r);
      board.setDoomed(c, r, false);
      board.cell(c, r).classList.remove("cracking");
      if (closed) {
        board.remove(c, r);
        board.setClosed(c, r, true);
      } else {
        board.setClosed(c, r, false);
      }
    }
  }
}
