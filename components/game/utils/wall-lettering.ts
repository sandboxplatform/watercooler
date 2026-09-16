import * as Phaser from "phaser";
import { TILE, WALL_ROWS } from "@/lib/map/office";

/**
 * Lettering painted on a wall: the building's name, the room's name, the
 * desk's week.
 *
 * Not `utils/signs.ts`, which is the opposite kind of text. A sign floats
 * above the world on a chip with an arrow over it and grows as the camera
 * stands back (`systems/legible`); this is paint, sized to the wall it is
 * on and left alone — see the in-world lettering rule in CLAUDE.md.
 *
 * What is here is the one thing every piece of that paint wants and none of
 * them could work out for itself: where on the wall it goes.
 */

/** How tall the band is, in pixels: a wall stack, cap through base. */
export const WALL_BAND = WALL_ROWS * TILE;

/** The gap between two lines of it, which is the only spacing there is. */
const LINE_GAP = 8;

/**
 * Stack these lines down the middle of the wall whose top row is `wallTop`.
 *
 * Centred rather than hung off a fixed offset, which is what every one of
 * these used to do — a bottom edge at 92 and a top edge at 100, numbers
 * that put the block a good twenty pixels low in a band of a hundred and
 * forty-four. On the corridor wall of an Operations floor, where the paint
 * is the only thing on a long clear stretch, that read as lettering
 * sliding off the bottom of the wall it is on.
 *
 * It has to be measured rather than worked out, because how tall a line
 * lands is the font's business and the second line of a building's name
 * wraps on the longest of them: "Building Supply Warehouse" is two lines
 * where every other name is one, and a block centred on an assumed height
 * is a block centred for one of the two.
 *
 * Every line is given the top-centre origin, so the caller writes the
 * lettering and this writes the layout — a line left on the bottom origin
 * would sit a line-height out and look like a font problem.
 */
export function letterOnWall(
  wallTop: number,
  lines: readonly Phaser.GameObjects.Text[],
  gap = LINE_GAP,
): void {
  const drawn = lines.filter((line) => line.text.length > 0);
  if (drawn.length === 0) return;
  for (const line of drawn) line.setOrigin(0.5, 0);
  const block = drawn.reduce((tall, line) => tall + line.height, 0) + gap * (drawn.length - 1);
  // Whole pixels: this is pixel art, and half a pixel of offset is a row of
  // lettering rendered twice as faintly as the row above it.
  let y = Math.round(wallTop + (WALL_BAND - block) / 2);
  for (const line of drawn) {
    line.setY(y);
    y += line.height + gap;
  }
}
