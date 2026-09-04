/**
 * Draws the lobby's help desk: public/sprites/help_desk_counter_192x96.png
 *
 *   pnpm tsx scripts/make-help-desk.ts
 *
 * Not to be confused with public/sprites/help_desk_144x96.png, which is the
 * board on an Operations floor showing the support queue. This is furniture:
 * a four-tile counter for the Sandbox ERP lobby, with somebody's work all
 * over it — two screens, a phone off its cradle, paper in trays and loose,
 * a mug, a plant that is coping.
 *
 * Generated rather than drawn for the same reason the lift and the games are:
 * the interiors pack has no reception counter, and a script keeps the palette
 * in one place and the result reproducible.
 *
 * Four tiles wide and two tall. The counter front fills the lower half, so
 * whoever is stationed behind it is covered from the waist down — props are
 * drawn at depth 4 and characters below that, which is what makes a counter
 * read as a counter.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { encodePng } from "../lib/pixel/png";

const W = 192;
const H = 96;

/**
 * Sampled from the room builder tileset so this sits with the walls: navy
 * outlines, warm desk wood, the muted blue-grey of the office furniture, and
 * the same amber the swing door uses for trim.
 */
const C = {
  clear: [0, 0, 0, 0],
  outline: [56, 56, 79, 255],
  woodTop: [176, 130, 92, 255],
  woodLip: [146, 104, 72, 255],
  panel: [122, 132, 158, 255],
  panelDark: [98, 106, 132, 255],
  panelLight: [148, 158, 184, 255],
  screen: [64, 94, 122, 255],
  screenGlow: [126, 178, 196, 255],
  screenDark: [44, 66, 88, 255],
  paper: [236, 232, 218, 255],
  paperShade: [206, 200, 184, 255],
  amber: [214, 156, 74, 255],
  mug: [188, 92, 78, 255],
  leaf: [104, 150, 92, 255],
  leafDark: [74, 116, 68, 255],
  soil: [110, 84, 66, 255],
  phone: [70, 74, 96, 255],
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

// ── The counter ─────────────────────────────────────────
// Surface at y=44, front panel below it to the floor. The top half is left
// for what is standing on the desk.

const TOP = 44;
box(0, TOP, W, H - TOP, C.panel);
// The overhanging lip, a little darker, so the top edge reads as an edge.
rect(1, TOP + 1, W - 2, 5, C.woodTop);
rect(1, TOP + 6, W - 2, 2, C.woodLip);
// Panelling: four bays with a shadowed gap between, and a kick plate.
for (let bay = 0; bay < 4; bay++) {
  const x = 6 + bay * 46;
  box(x, TOP + 12, 40, 30, C.panelDark);
  rect(x + 2, TOP + 14, 36, 26, C.panel);
  rect(x + 2, TOP + 14, 36, 2, C.panelLight);
}
rect(1, H - 5, W - 2, 4, C.panelDark);

// ── What is on it ───────────────────────────────────────

/** A screen on a stand, facing away from the viewer. */
const monitor = (x: number, y: number, w: number, h: number) => {
  box(x, y, w, h, C.screenDark);
  rect(x + 2, y + 2, w - 4, h - 4, C.screen);
  // Rows of light, like text on a wall of tickets.
  for (let row = 0; row < Math.floor((h - 6) / 4); row++) {
    const width = w - 8 - ((row * 7) % 11);
    rect(x + 4, y + 4 + row * 4, Math.max(4, width), 2, C.screenGlow);
  }
  // Stand and foot.
  rect(x + Math.floor(w / 2) - 2, y + h, 4, 5, C.outline);
  rect(x + Math.floor(w / 2) - 7, y + h + 5, 14, 2, C.outline);
};

monitor(14, 8, 40, 28);
monitor(62, 12, 32, 24);

/** A tray of paper, and loose sheets beside it. */
const tray = (x: number, y: number) => {
  box(x, y, 30, 12, C.paperShade);
  rect(x + 2, y + 2, 26, 3, C.paper);
  rect(x + 2, y + 6, 26, 3, C.paper);
};
tray(104, 24);
box(140, 20, 22, 16, C.paper);
rect(143, 23, 16, 2, C.paperShade);
rect(143, 27, 16, 2, C.paperShade);
rect(143, 31, 10, 2, C.paperShade);
// A sheet knocked askew, half off the edge.
box(166, 30, 18, 8, C.paper);
rect(168, 33, 12, 2, C.paperShade);

// The phone, handset off the cradle — the desk is busy.
box(98, 8, 18, 12, C.phone);
rect(100, 10, 14, 3, C.panelLight);
box(118, 12, 12, 6, C.phone);

// A mug, and a plant at the far end.
box(58, 30, 9, 8, C.mug);
rect(67, 32, 3, 4, C.mug);
box(172, 8, 14, 12, C.soil);
rect(174, 4, 4, 6, C.leafDark);
rect(178, 2, 4, 8, C.leaf);
rect(182, 5, 3, 5, C.leafDark);

// A stack of folders, amber spines, leaning.
for (let i = 0; i < 3; i++) box(126, 34 - i * 3, 16 - i, 4, C.amber);

const out = join(process.cwd(), "public/sprites/help_desk_counter_192x96.png");
writeFileSync(out, encodePng({ width: W, height: H, data }));
console.log(`wrote ${out} (${W}x${H})`);
