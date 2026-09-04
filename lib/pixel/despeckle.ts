/**
 * Rubs the bright specks off a built sheet.
 *
 * Sources come from lossy files, so a hard edge arrives with a scatter of
 * pale pixels around it. Shrunk to 48 pixels and snapped to sixteen colours
 * they survive as lone white dots — dirt on the sprite. Worse in motion than
 * in a still: the noise falls differently in every frame, so the dots crawl
 * as the character walks.
 *
 * Only a **pale pixel with no pale neighbour** is taken out. That distinction
 * is the whole point:
 *
 *   - Whites that belong — a shirt, a pair of trainers, a chicken's chest —
 *     come in clumps, so each one has a pale neighbour and stays.
 *   - Dark detail stays regardless. At this size an eye is one or two pixels
 *     and reads as a lone outlier by every measure; going after outliers in
 *     general would rub the face off.
 */

import type { Bitmap } from "./png";

const SOLID = 128;

/**
 * Scrapes the pale rim off a silhouette.
 *
 * The other half of the same problem, and the half that shows. Where the
 * source's lossy edge runs along the whole outline the pale pixels are a
 * connected run, not lone dots, so each has pale company and `despeckle`
 * rightly leaves it: what it sees is a pale area, which is usually a shirt.
 * The tell is not loneliness but *position* — this pallor sits on the
 * boundary, against the transparency.
 *
 * What separates that rim from a white object which happens to reach the
 * edge — a trainer, a cuff — is **thickness**. The rim is one pixel: step
 * inwards and you are on the body. A trainer is not: step inwards and it is
 * still white. So a pale boundary pixel goes only if the pixel behind it,
 * away from the transparency, is not itself pale, and it takes that pixel's
 * colour when it does.
 *
 * Counting pale neighbours instead does not work, and it is worth saying why:
 * along a rim each pixel's neighbours *are* pale — the rim runs beside itself
 * — so a majority test protects the whole thing.
 */
export function deFringe(
  image: Bitmap,
  frameWidth: number,
  frameHeight: number,
  { minLuma = 175 }: DespeckleOptions = {},
): Bitmap {
  const { width, height, data } = image;
  const out = new Uint8Array(data);

  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3];

  for (let frameY = 0; frameY < height; frameY += frameHeight) {
    for (let frameX = 0; frameX < width; frameX += frameWidth) {
      const right = Math.min(frameX + frameWidth, width);
      const bottom = Math.min(frameY + frameHeight, height);

      for (let y = frameY; y < bottom; y++) {
        for (let x = frameX; x < right; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < SOLID) continue;
          if (luma(data, i) <= minLuma) continue;

          // For every side that faces transparency, look at what lies behind.
          // One side with body behind it is enough: at the end of a rim the
          // pixel alongside is more rim, and letting that veto the removal
          // left the ends of every rim in place.
          let behind: number | null = null;
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            // Outside the frame is the edge of the world, not space.
            if (nx < frameX || ny < frameY || nx >= right || ny >= bottom) continue;
            if (alphaAt(nx, ny) >= SOLID) continue; // not a boundary this way
            const bx = x - dx;
            const by = y - dy;
            if (bx < frameX || by < frameY || bx >= right || by >= bottom) continue;
            if (alphaAt(bx, by) < SOLID) continue; // one pixel thick: leave it be
            const b = (by * width + bx) * 4;
            if (luma(data, b) <= minLuma && behind === null) behind = b;
          }

          // Pale behind on every side: a thick pale thing, its own edge. Keep it.
          if (behind === null) continue;

          out[i] = data[behind];
          out[i + 1] = data[behind + 1];
          out[i + 2] = data[behind + 2];
          out[i + 3] = 255;
        }
      }
    }
  }

  return { width, height, data: out };
}

/** Rec. 601 luma, as elsewhere: green reads brightest, blue least. */
function luma(data: Uint8Array, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

export interface DespeckleOptions {
  /**
   * What counts as pale. A pale pixel with no pale neighbour is a speck.
   *
   * One threshold for both tests, deliberately. Letting a merely mid-tone
   * neighbour count as company keeps most specks, since a speck sits on the
   * artwork and the artwork is rarely dark. Nor does the single threshold
   * notch the edge of a shaded white: what replaces a speck is the commonest
   * colour beside it, so where the neighbours are themselves nearly pale the
   * change is invisible.
   */
  minLuma?: number;
}

/**
 * Return a copy with lone bright pixels replaced by the commonest colour
 * around them.
 *
 * Judged against the original throughout, so a run of specks cannot cascade:
 * each is decided by what was there, not by what the pass has just written.
 * Frames are handled separately — neighbours are only sought inside the same
 * frame, since the pixel across a frame's edge belongs to another pose.
 */
export function despeckle(
  image: Bitmap,
  frameWidth: number,
  frameHeight: number,
  { minLuma = 190 }: DespeckleOptions = {},
): Bitmap {
  const { width, height, data } = image;
  const out = new Uint8Array(data);

  for (let frameY = 0; frameY < height; frameY += frameHeight) {
    for (let frameX = 0; frameX < width; frameX += frameWidth) {
      const right = Math.min(frameX + frameWidth, width);
      const bottom = Math.min(frameY + frameHeight, height);

      for (let y = frameY; y < bottom; y++) {
        for (let x = frameX; x < right; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < SOLID) continue;
          const mine = luma(data, i);
          if (mine <= minLuma) continue;

          // Opaque neighbours within this frame, as colour keys.
          const neighbours: number[] = [];
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < frameX || ny < frameY || nx >= right || ny >= bottom) continue;
            const n = (ny * width + nx) * 4;
            if (data[n + 3] < SOLID) continue;
            neighbours.push(n);
          }
          if (neighbours.length === 0) continue;

          // Company: one pale neighbour means it is part of something pale.
          if (neighbours.some((n) => luma(data, n) > minLuma)) continue;

          // A speck. Take the commonest colour around it.
          const tally = new Map<string, { count: number; at: number }>();
          for (const n of neighbours) {
            const key = `${data[n]},${data[n + 1]},${data[n + 2]}`;
            const seen = tally.get(key);
            if (seen) seen.count += 1;
            else tally.set(key, { count: 1, at: n });
          }
          let best = { count: 0, at: neighbours[0] };
          for (const entry of tally.values()) if (entry.count > best.count) best = entry;

          out[i] = data[best.at];
          out[i + 1] = data[best.at + 1];
          out[i + 2] = data[best.at + 2];
          out[i + 3] = 255;
        }
      }
    }
  }

  return { width, height, data: out };
}
