/**
 * Sweeps the loose crumbs off a built sheet's silhouette.
 *
 * The other kind of dirt, and the kind the outline makes worse rather than
 * better. Where a source photograph has wispy edges — hair, a beard, a loose
 * collar — the mush against the backdrop survives keying as a scatter of
 * detached pixels a step or two out from the body. On their own they are
 * faint. Then the outline pass finds them, decides each is a figure with
 * space on all four sides, and paints them the darkest colour on the sheet:
 * what was a grey smudge becomes a spray of hard black flecks.
 *
 * So this runs *before* the line is drawn. What it looks for is not colour
 * but attachment: a blob of a handful of pixels, touching nothing. A real
 * detail at this size is part of the figure — an eye sits inside the face,
 * a shoelace joins the shoe — so nothing worth keeping is floating free.
 *
 * The size limit matters, because "detached" is not by itself enough. A
 * walking pose can genuinely arrive in two pieces: several of Steve's frames
 * hold a 450-pixel half beside an 800-pixel half, and dropping the smaller
 * would take his legs off. Only crumbs go, and the largest piece of every
 * frame stays whatever its size.
 */

import type { Bitmap } from "./png";

const SOLID = 128;

export interface CrumbOptions {
  /**
   * The largest blob, in pixels, still treated as a crumb.
   *
   * Judged against the figure, which fills something like 1,800 pixels of a
   * 48x96 frame: at twenty, a crumb is around one percent of the character
   * and reads as a speck. Anything bigger is a piece of somebody.
   */
  maxCrumb?: number;
}

/**
 * Return a copy with small detached blobs erased.
 *
 * Blobs are found eight-connected, so a diagonal thread of pixels counts as
 * joined to what it trails from — a tendril of hair is part of the hair, not
 * a row of separate specks. Frames are walked one at a time; the pixel across
 * a frame's edge belongs to another pose and cannot be attached to this one.
 */
export function dropCrumbs(
  image: Bitmap,
  frameWidth: number,
  frameHeight: number,
  { maxCrumb = 20 }: CrumbOptions = {},
): Bitmap {
  const { width, height, data } = image;
  const out = new Uint8Array(data);

  for (let frameY = 0; frameY < height; frameY += frameHeight) {
    for (let frameX = 0; frameX < width; frameX += frameWidth) {
      const right = Math.min(frameX + frameWidth, width);
      const bottom = Math.min(frameY + frameHeight, height);

      const seen = new Set<number>();
      const blobs: number[][] = [];

      for (let y = frameY; y < bottom; y++) {
        for (let x = frameX; x < right; x++) {
          const start = y * width + x;
          if (seen.has(start) || data[start * 4 + 3] < SOLID) continue;

          // Flood fill, iteratively: a frame's figure is too big for recursion
          // to be worth the stack.
          const blob: number[] = [];
          const stack = [start];
          seen.add(start);
          while (stack.length) {
            const at = stack.pop() as number;
            blob.push(at);
            const ax = at % width;
            const ay = (at - ax) / width;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = ax + dx;
                const ny = ay + dy;
                if (nx < frameX || ny < frameY || nx >= right || ny >= bottom) continue;
                const next = ny * width + nx;
                if (seen.has(next) || data[next * 4 + 3] < SOLID) continue;
                seen.add(next);
                stack.push(next);
              }
            }
          }
          blobs.push(blob);
        }
      }

      // The biggest piece is the character, however small the frame's figure
      // is: a crumb is only a crumb next to something larger.
      let biggest = 0;
      for (let i = 1; i < blobs.length; i++)
        if (blobs[i].length > blobs[biggest].length) biggest = i;

      blobs.forEach((blob, i) => {
        if (i === biggest || blob.length > maxCrumb) return;
        for (const at of blob) out[at * 4 + 3] = 0;
      });
    }
  }

  return { width, height, data: out };
}
