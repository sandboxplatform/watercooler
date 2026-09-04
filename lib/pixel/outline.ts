/**
 * Draws a dark line round a sprite's silhouette.
 *
 * The pack's cast is drawn with one and it is most of what makes them read as
 * pixel art rather than as a photograph someone shrank: at 48 pixels wide a
 * figure needs a hard edge to hold its shape against the floor behind it.
 * Sheets built from illustrations arrive without one.
 *
 * The line is added *outside* the figure, into the transparent pixels around
 * it, so nothing already drawn is painted over. It is applied frame by frame
 * and clipped to each frame's own bounds — a sheet is a grid of them, and an
 * outline that ran past the edge would appear as a stray mark down the side of
 * its neighbour.
 */

import type { Bitmap } from "./png";

/** Opaque enough to count as part of the figure. */
const SOLID = 128;

/**
 * A dark tone drawn from the sprite itself: its own darkest colour, taken
 * darker still. Following the artwork keeps a warm character warm and a cold
 * one cold, where one flat black for everybody reads as a sticker.
 */
export function outlineColour(image: Bitmap): [number, number, number] {
  let darkest: [number, number, number] | null = null;
  let lowest = Infinity;
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] < SOLID) continue;
    const [r, g, b] = [image.data[i], image.data[i + 1], image.data[i + 2]];
    // Rec. 601 luma: green reads brightest to the eye, blue least.
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma < lowest) {
      lowest = luma;
      darkest = [r, g, b];
    }
  }
  if (!darkest) return [26, 22, 20];
  // Not pure black: a little of the figure's own colour left in the line stops
  // it looking cut out, and keeps it from vanishing against a dark floor.
  return darkest.map((c) => Math.max(12, Math.round(c * 0.45))) as [number, number, number];
}

/**
 * Return a copy with a one-pixel outline round every figure on the sheet.
 *
 * Neighbours are read from the original, so the line grows to one pixel and
 * stops rather than feeding on itself.
 */
export function addOutline(
  image: Bitmap,
  frameWidth: number,
  frameHeight: number,
  colour: [number, number, number] = outlineColour(image),
): Bitmap {
  const { width, height, data } = image;
  const out = new Uint8Array(data);
  const [r, g, b] = colour;

  const solidAt = (x: number, y: number) => data[(y * width + x) * 4 + 3] >= SOLID;

  for (let frameY = 0; frameY < height; frameY += frameHeight) {
    for (let frameX = 0; frameX < width; frameX += frameWidth) {
      const right = Math.min(frameX + frameWidth, width);
      const bottom = Math.min(frameY + frameHeight, height);
      for (let y = frameY; y < bottom; y++) {
        for (let x = frameX; x < right; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] >= SOLID) continue; // already part of the figure
          // Only look at neighbours inside this frame.
          const touches =
            (x > frameX && solidAt(x - 1, y)) ||
            (x < right - 1 && solidAt(x + 1, y)) ||
            (y > frameY && solidAt(x, y - 1)) ||
            (y < bottom - 1 && solidAt(x, y + 1));
          if (!touches) continue;
          out[i] = r;
          out[i + 1] = g;
          out[i + 2] = b;
          out[i + 3] = 255;
        }
      }
    }
  }

  return { width, height, data: out };
}
