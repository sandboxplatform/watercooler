import { describe, it, expect } from "vitest";
import { addOutline, outlineColour } from "../outline";
import type { Bitmap } from "../png";

/** A blank sheet, so each test can draw the few pixels it cares about. */
function blank(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function put(image: Bitmap, x: number, y: number, [r, g, b]: number[], a = 255) {
  const i = (y * image.width + x) * 4;
  image.data[i] = r;
  image.data[i + 1] = g;
  image.data[i + 2] = b;
  image.data[i + 3] = a;
}

function at(image: Bitmap, x: number, y: number) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

describe("the colour of the line", () => {
  it("comes from the figure's darkest pixel, taken darker", () => {
    const image = blank(3, 1);
    put(image, 0, 0, [200, 100, 100]);
    put(image, 1, 0, [80, 40, 40]); // the darkest
    expect(outlineColour(image)).toEqual([36, 18, 18]);
  });

  it("ignores what is transparent, however dark", () => {
    const image = blank(3, 1);
    put(image, 0, 0, [200, 200, 200]);
    put(image, 1, 0, [0, 0, 0], 0); // invisible, must not be chosen
    expect(outlineColour(image)).toEqual([90, 90, 90]);
  });

  it("never goes fully black, so the line does not vanish on a dark floor", () => {
    const image = blank(1, 1);
    put(image, 0, 0, [0, 0, 0]);
    expect(outlineColour(image)).toEqual([12, 12, 12]);
  });

  it("falls back to a dark tone when nothing is drawn at all", () => {
    expect(outlineColour(blank(2, 2))).toEqual([26, 22, 20]);
  });
});

describe("drawing the line", () => {
  it("puts it in the transparent pixels touching the figure", () => {
    const image = blank(5, 5);
    put(image, 2, 2, [100, 100, 100]);
    const out = addOutline(image, 5, 5, [10, 20, 30]);

    // The four sides are lined...
    for (const [x, y] of [
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
    ]) {
      expect(at(out, x, y), `${x},${y}`).toEqual([10, 20, 30, 255]);
    }
    // ...the diagonals are not: a line one pixel thick, not a halo.
    expect(at(out, 1, 1)[3]).toBe(0);
  });

  it("leaves the figure itself untouched", () => {
    const image = blank(3, 3);
    put(image, 1, 1, [123, 45, 67]);
    const out = addOutline(image, 3, 3, [0, 0, 0]);
    expect(at(out, 1, 1)).toEqual([123, 45, 67, 255]);
  });

  /** Neighbours are read from the original, or the line would feed on itself. */
  it("stays one pixel thick", () => {
    const image = blank(7, 7);
    put(image, 3, 3, [100, 100, 100]);
    const out = addOutline(image, 7, 7, [10, 20, 30]);
    expect(at(out, 1, 3)[3]).toBe(0); // two pixels out: still clear
    expect(at(out, 2, 3)[3]).toBe(255); // one pixel out: lined
  });

  /**
   * A sheet is a grid of frames. An outline running past a frame's edge would
   * show up as a stray mark down the side of the frame beside it.
   */
  it("does not spill from one frame into the next", () => {
    const image = blank(8, 4); // two 4x4 frames
    put(image, 3, 1, [100, 100, 100]); // last column of the left frame
    const out = addOutline(image, 4, 4, [10, 20, 30]);
    expect(at(out, 2, 1)).toEqual([10, 20, 30, 255]); // lined within its frame
    expect(at(out, 4, 1)[3]).toBe(0); // the next frame is left alone
  });

  it("clips at the sheet's own edges rather than reading past them", () => {
    const image = blank(3, 3);
    put(image, 0, 0, [100, 100, 100]); // hard against the corner
    const out = addOutline(image, 3, 3, [10, 20, 30]);
    expect(at(out, 1, 0)).toEqual([10, 20, 30, 255]);
    expect(at(out, 0, 1)).toEqual([10, 20, 30, 255]);
  });
});
