// A small, hand-authored seed artwork inserted once on the main branch, so
// a first visitor finds a considered starting mark rather than a truly
// blank page — the user explicitly asked for this, after being told it
// reverses the brief's own "open-ended, no pre-made mural" principle (see
// README.md's "A note on the visual direction" and
// docs/adr/0005-seed-artwork.md). Idempotent: checked by a sentinel row,
// never re-inserted or duplicated on restart, and never touches whatever
// real objects have been added since.
import type { Store } from "./db.ts";

const SEED_SENTINEL_ID = "seed-artwork-v1";

// Hand-plotted, not generated: a simple rising-sun-over-hills motif, drawn
// as a handful of deliberate stroke paths plus one welcoming sticky note.
// Coordinates are relative to each object's own x/y, same shape every
// other stroke object uses (src/server.ts's validateTypedData).
const SEED_STROKES: Array<{ x: number; y: number; points: number[][]; color: string }> = [
  // the horizon line
  {
    x: 40,
    y: 260,
    color: "#5c5247",
    points: [
      [0, 0],
      [60, -4],
      [140, 2],
      [220, -3],
      [300, 0],
      [380, -2],
      [460, 1],
    ],
  },
  // the sun: a hand-drawn circle, not a perfect SVG <circle>
  {
    x: 220,
    y: 120,
    color: "#b5543a",
    points: [
      [40, 0],
      [34, 20],
      [20, 34],
      [0, 40],
      [-20, 34],
      [-34, 20],
      [-40, 0],
      [-34, -20],
      [-20, -34],
      [0, -40],
      [20, -34],
      [34, -20],
      [40, 0],
    ],
  },
  // three hills, left to right
  {
    x: 60,
    y: 260,
    color: "#5c6b3f",
    points: [
      [0, 0],
      [30, -40],
      [60, -10],
      [90, -46],
      [130, 0],
    ],
  },
  {
    x: 220,
    y: 260,
    color: "#5c6b3f",
    points: [
      [0, 0],
      [40, -55],
      [85, -15],
      [140, -60],
      [190, 0],
    ],
  },
  {
    x: 380,
    y: 260,
    color: "#8fa088",
    points: [
      [0, 0],
      [25, -30],
      [55, -8],
      [90, -36],
      [120, 0],
    ],
  },
];

export function ensureSeedArtwork(store: Store): void {
  if (store.getObject("main", SEED_SENTINEL_ID)) return; // already seeded

  const now = Date.now();
  for (const [i, stroke] of SEED_STROKES.entries()) {
    store.createObject({
      id: i === 0 ? SEED_SENTINEL_ID : `seed-artwork-v1-${i}`,
      branch_id: "main",
      type: "stroke",
      x: stroke.x,
      y: stroke.y,
      data: JSON.stringify({ points: stroke.points, color: stroke.color, width: 3 }),
      created_by: "the-wall",
      created_at: now,
      updated_at: now,
    });
  }
  store.createObject({
    id: "seed-artwork-v1-welcome",
    branch_id: "main",
    type: "sticky",
    x: 500,
    y: 160,
    data: JSON.stringify({ text: "start here —", color: "#e6ddc7" }),
    created_by: "the-wall",
    created_at: now,
    updated_at: now,
  });
}
