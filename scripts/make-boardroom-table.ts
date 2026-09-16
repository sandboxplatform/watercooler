/**
 * Draws the boardroom table: public/sprites/boardroom_table_240x144.png
 *
 *   pnpm tsx scripts/make-boardroom-table.ts
 *
 * The one piece of furniture on an Operations floor that is not a board on
 * a wall — five tiles of table in the far room at the top, with eight
 * chairs round it and a meeting's worth of paper on it. Generated for the
 * same reason the lift, the games and the help desk counter are: the
 * interiors pack has no boardroom table, and a script keeps the palette in
 * one place and the result reproducible.
 *
 * Five tiles wide and three deep, chairs included, which is what the map
 * makes solid — a chair pushed under a table is no more walkable than the
 * table. Drawn from the same slightly-above view the pack's furniture
 * uses: the top of the table, its near edge lipped, and the chairs at the
 * far side showing their backs.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { encodePng } from "../lib/pixel/png";

const W = 240;
const H = 144;

/**
 * Sampled from the room builder tileset, so this sits with the walls: the
 * navy outline everything in the pack carries, the warm desk wood of the
 * counter downstairs, and the muted blue-grey of the office chairs.
 */
const C = {
  clear: [0, 0, 0, 0],
  outline: [56, 56, 79, 255],
  woodTop: [176, 130, 92, 255],
  woodGrain: [166, 122, 86, 255],
  woodLip: [146, 104, 72, 255],
  woodDark: [118, 84, 58, 255],
  chair: [122, 132, 158, 255],
  chairDark: [98, 106, 132, 255],
  chairLight: [148, 158, 184, 255],
  paper: [236, 232, 218, 255],
  paperShade: [206, 200, 184, 255],
  mug: [188, 92, 78, 255],
  mugDark: [150, 70, 60, 255],
  screen: [64, 94, 122, 255],
  screenGlow: [126, 178, 196, 255],
  amber: [214, 156, 74, 255],
} as const;

const data = new Uint8Array(W * H * 4);
const put = (x: number, y: number, colour: readonly number[]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = colour[0];
  data[i + 1] = colour[1];
  data[i + 2] = colour[2];
  data[i + 3] = colour[3];
};
const rect = (x: number, y: number, w: number, h: number, colour: readonly number[]) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, colour);
};
/** A filled box with the navy line round it, which is how the pack draws. */
const box = (x: number, y: number, w: number, h: number, fill: readonly number[]) => {
  rect(x, y, w, h, C.outline);
  rect(x + 1, y + 1, w - 2, h - 2, fill);
};

// ── The chairs ──────────────────────────────────────────
// Four along the far side and four along the near one, drawn first so the
// table overlaps them: the far chairs show their backs above the table
// edge, the near ones their backs below it.

/** A chair seen from behind: the back, and a hint of the seat under it. */
const chairBack = (cx: number, y: number) => {
  box(cx - 13, y, 26, 18, C.chair);
  rect(cx - 10, y + 3, 20, 3, C.chairLight);
  rect(cx - 10, y + 10, 20, 4, C.chairDark);
  // The post down to the seat.
  rect(cx - 2, y + 18, 4, 5, C.outline);
};

const SEATS = [32, 88, 152, 208];
for (const cx of SEATS) chairBack(cx, 2);
for (const cx of SEATS) chairBack(cx, H - 25);

// ── The table ───────────────────────────────────────────
// The middle band of the picture, so a chair shows above and below it.

const TOP = 30;
const BOTTOM = H - 34;
box(4, TOP, W - 8, BOTTOM - TOP, C.woodTop);
// Grain, in long strokes along the length of it.
for (let y = TOP + 6; y < BOTTOM - 8; y += 7) {
  rect(10 + ((y * 5) % 9), y, W - 28 - ((y * 3) % 11), 1, C.woodGrain);
}
// The near edge, lipped, and the shadow under it: what makes the top read
// as a top rather than as a rectangle painted on the floor.
rect(5, BOTTOM - 8, W - 10, 5, C.woodLip);
rect(5, BOTTOM - 3, W - 10, 2, C.woodDark);
// The far edge catches the light instead.
rect(5, TOP + 1, W - 10, 2, C.woodGrain);

// ── What is on it ───────────────────────────────────────

/** A pad of paper with a line or two on it, at somebody's place. */
const pad = (x: number, y: number) => {
  box(x, y, 22, 16, C.paperShade);
  rect(x + 3, y + 4, 16, 2, C.paper);
  rect(x + 3, y + 8, 16, 2, C.paper);
  rect(x + 3, y + 12, 10, 2, C.paper);
};
pad(20, TOP + 12);
pad(196, TOP + 30);

/** A mug, seen from above and a little to the side. */
const mug = (x: number, y: number) => {
  box(x, y, 11, 10, C.mug);
  rect(x + 2, y + 2, 7, 6, C.mugDark);
  rect(x + 11, y + 3, 3, 4, C.mug);
};
mug(60, TOP + 16);
mug(170, TOP + 40);

// A laptop, open, at the near side: the screen is the lit face.
box(96, TOP + 34, 40, 22, C.chairDark);
rect(99, TOP + 37, 34, 16, C.screen);
for (let row = 0; row < 3; row++) {
  rect(102, TOP + 40 + row * 4, 22 - row * 5, 2, C.screenGlow);
}
box(100, TOP + 20, 32, 14, C.chairLight);

// The papers in the middle, which is what the meeting is about: a fan of
// sheets with an amber folder under them.
box(140, TOP + 10, 26, 18, C.amber);
box(146, TOP + 6, 24, 16, C.paper);
rect(149, TOP + 10, 16, 2, C.paperShade);
rect(149, TOP + 14, 16, 2, C.paperShade);

const out = join(process.cwd(), "public/sprites/boardroom_table_240x144.png");
writeFileSync(out, encodePng({ width: W, height: H, data }));
console.log(`wrote public/sprites/boardroom_table_240x144.png (${W}x${H})`);
