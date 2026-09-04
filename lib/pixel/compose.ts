/**
 * The grid a character sheet is drawn on, and how to cut one frame back out.
 *
 * The game reads a fixed layout: row 0 spare, row 1 idle, row 2 walk, each of
 * the two animated rows holding right / up / left / down at six frames
 * apiece. Every measurement of that lives here, and lib/pixel/exact.ts holds
 * a delivered sheet to it.
 *
 * This module used to *build* a sheet as well — filling every slot the game
 * looks in from whatever poses a loose sheet happened to supply, mirroring a
 * missing profile, cycling a two-frame walk to six, voting on which way each
 * figure faced. All of it is gone: a sheet is delivered on this grid or it is
 * refused, so nothing needs laying out.
 */

import type { Bitmap } from "./png";

export const FRAME_W = 48;
export const FRAME_H = 96;
export const COLUMNS = 56;
export const FRAMES_PER_DIRECTION = 6;
export const SHEET_W = COLUMNS * FRAME_W;
export const SHEET_H = 1968;

/**
 * The four facings, in the order they run across a row.
 *
 * Left is **drawn**, not mirrored from right. Mirroring it was free and
 * wrong: a character with anything asymmetric — a satchel on one shoulder, a
 * parting, a badge — swaps sides as they turn round.
 */
export const FACINGS = ["right", "up", "left", "down"] as const;
export type Facing = (typeof FACINGS)[number];

/** Which row each pose is on. Row 0 is spare and never read. */
export const ROWS = { idle: 1, walk: 2 } as const;

/** The slot the HUD shows as a character's face: first idle frame, facing down. */
export const PORTRAIT_COLUMN = 18;
export const PORTRAIT_ROW = 1;

/**
 * Copies one slot out of a sheet.
 *
 * The HUD used to show a portrait by setting a
 * whole 2688x1968 sheet as a CSS background and offsetting it — which means
 * every card in a gallery decodes a 21-megapixel image to display 48x96
 * pixels of it. Cutting the frame out once, server-side, is the fix.
 */
export function sliceFrame(sheet: Bitmap, column: number, row: number): Bitmap {
  const out = new Uint8Array(FRAME_W * FRAME_H * 4);
  const x0 = column * FRAME_W;
  const y0 = row * FRAME_H;
  for (let y = 0; y < FRAME_H; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= sheet.height) continue;
    const s = (sy * sheet.width + x0) * 4;
    out.set(sheet.data.subarray(s, s + FRAME_W * 4), y * FRAME_W * 4);
  }
  return { width: FRAME_W, height: FRAME_H, data: out };
}
