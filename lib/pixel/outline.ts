/**
 * Draws a dark line round a sprite's silhouette.
 *
 * The pack's cast is drawn with one and it is most of what makes them read as
 * pixel art rather than as a photograph someone shrank: at 48 pixels wide a
 * figure needs a hard edge to hold its shape against the floor behind it.
 * Sheets built from illustrations arrive without one.
 *
 * The line is painted **onto** the figure's outermost ring of pixels rather
 * than added around it, and that choice matters more than it sounds. A sheet
 * cut from a lossy source has a ramp at every edge — read across one and it
 * runs 12, 77, 155, 193 into the body. Ringing the figure from outside leaves
 * that ramp between the new line and the body, where the mid-greys read as
 * light dirt against the black: the very speckle the line was meant to tidy.
 * Painting the ring instead consumes the ramp, and costs only the outermost
 * pixel of a figure whose outermost pixel was mush.
 *
 * Applied frame by frame and clipped to each frame's own bounds — a sheet is
 * a grid of them, and a line that ran past an edge would show up as a stray
 * mark down the side of its neighbour.
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
 * Return a copy with every figure's outermost ring painted as its outline.
 *
 * Neighbours are read from the original, so the ring is exactly one pixel
 * deep rather than eating inward on itself.
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
          if (data[i + 3] < SOLID) continue; // empty space stays empty
          // On the ring if any side faces nothing. The frame's own edge is
          // the edge of the world, not space, so a figure running to it is
          // not outlined along that side.
          const onRing =
            (x > frameX && !solidAt(x - 1, y)) ||
            (x < right - 1 && !solidAt(x + 1, y)) ||
            (y > frameY && !solidAt(x, y - 1)) ||
            (y < bottom - 1 && !solidAt(x, y + 1));
          if (!onRing) continue;
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
