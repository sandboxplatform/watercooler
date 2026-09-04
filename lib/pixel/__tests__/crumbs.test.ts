import { describe, it, expect } from "vitest";
import { dropCrumbs } from "../crumbs";
import type { Bitmap } from "../png";

/** Transparent to begin with, so each test draws only its own figure. */
function blank(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function put(image: Bitmap, x: number, y: number, a = 255) {
  const i = (y * image.width + x) * 4;
  image.data[i] = 100;
  image.data[i + 1] = 90;
  image.data[i + 2] = 80;
  image.data[i + 3] = a;
}

/** A solid rectangle, standing in for the character itself. */
function slab(image: Bitmap, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(image, x, y);
}

function alpha(image: Bitmap, x: number, y: number) {
  return image.data[(y * image.width + x) * 4 + 3];
}

describe("sweeping off the crumbs", () => {
  it("erases a lone detached pixel", () => {
    const image = blank(20, 20);
    slab(image, 2, 2, 8, 8);
    put(image, 15, 15); // floating on its own
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 15, 15)).toBe(0);
  });

  it("leaves the figure entirely alone", () => {
    const image = blank(20, 20);
    slab(image, 2, 2, 8, 8);
    put(image, 15, 15);
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 2, 2)).toBe(255);
    expect(alpha(out, 5, 5)).toBe(255);
    expect(alpha(out, 9, 9)).toBe(255);
  });

  /**
   * The limit that keeps this safe. Several of Steve's walk frames arrive as
   * a 450-pixel piece beside an 800-pixel one; dropping the smaller because
   * it was not the biggest would take his legs off.
   */
  it("keeps a detached piece too big to be a crumb", () => {
    const image = blank(30, 20);
    slab(image, 1, 1, 8, 8); // 64px: the larger piece
    slab(image, 20, 1, 6, 6); // 36px: detached, but a piece of somebody
    const out = dropCrumbs(image, 30, 20);
    expect(alpha(out, 22, 3)).toBe(255);
  });

  it("can be told what counts as a crumb", () => {
    const image = blank(30, 20);
    slab(image, 1, 1, 8, 8);
    slab(image, 20, 1, 6, 6); // 36px
    expect(alpha(dropCrumbs(image, 30, 20, { maxCrumb: 40 }), 22, 3)).toBe(0);
  });

  /**
   * Eight-connected, so a diagonal thread reads as joined to what it trails
   * from. Hair drawn as a stagger of single pixels is hair, not a queue of
   * separate specks.
   */
  it("treats a diagonal thread as attached to the figure", () => {
    const image = blank(20, 20);
    slab(image, 2, 2, 8, 8);
    put(image, 10, 10); // corner-to-corner with the slab
    put(image, 11, 11);
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 10, 10)).toBe(255);
    expect(alpha(out, 11, 11)).toBe(255);
  });

  /** Nothing to compare against means nothing is a crumb. */
  it("never empties a frame that holds only one small thing", () => {
    const image = blank(20, 20);
    put(image, 5, 5);
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 5, 5)).toBe(255);
  });

  /**
   * A sheet is a grid of frames. Were they read as one image, a crumb beside
   * a frame's edge could be judged attached to the pose next door — or the
   * figure in an emptier frame could be swept away as a crumb of a fuller one.
   */
  it("judges each frame on its own", () => {
    const image = blank(40, 20); // two 20x20 frames
    slab(image, 1, 1, 8, 8); // a big figure in the left frame
    put(image, 25, 5); // the whole of the right frame's contents
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 25, 5)).toBe(255);
  });

  it("does not mutate the sheet it was given", () => {
    const image = blank(20, 20);
    slab(image, 2, 2, 8, 8);
    put(image, 15, 15);
    dropCrumbs(image, 20, 20);
    expect(alpha(image, 15, 15)).toBe(255);
  });

  it("ignores pixels too faint to count as drawn", () => {
    const image = blank(20, 20);
    slab(image, 2, 2, 8, 8);
    put(image, 15, 15, 40); // barely there: not a blob at all
    const out = dropCrumbs(image, 20, 20);
    expect(alpha(out, 15, 15)).toBe(40);
  });
});
