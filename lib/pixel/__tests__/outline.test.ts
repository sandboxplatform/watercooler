import { describe, it, expect } from "vitest";
import { addOutline, outlineColour } from "../outline";
import type { Bitmap } from "../png";

/** A blank sheet, so each test draws only the few pixels it cares about. */
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

function block(image: Bitmap, x0: number, y0: number, size: number, colour: number[]) {
  for (let y = y0; y < y0 + size; y++)
    for (let x = x0; x < x0 + size; x++) put(image, x, y, colour);
}

function at(image: Bitmap, x: number, y: number) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

const LINE: [number, number, number] = [10, 20, 30];
const BODY: [number, number, number] = [100, 100, 100];

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
  /**
   * Painted onto the figure, not around it. A sheet cut from a lossy source
   * has a ramp at every edge, and ringing it from outside leaves that ramp
   * showing between the line and the body as light dirt.
   */
  it("paints the figure's outermost ring and leaves its inside alone", () => {
    const image = blank(7, 7);
    block(image, 2, 2, 3, BODY); // a 3x3 figure: ring plus one centre pixel
    const out = addOutline(image, 7, 7, LINE);

    expect(at(out, 2, 2)).toEqual([...LINE, 255]); // corner of the ring
    expect(at(out, 3, 2)).toEqual([...LINE, 255]); // top edge
    expect(at(out, 3, 3)).toEqual([...BODY, 255]); // the inside is untouched
  });

  it("adds nothing to the space around the figure", () => {
    const image = blank(5, 5);
    block(image, 1, 1, 3, BODY);
    const out = addOutline(image, 5, 5, LINE);
    for (const [x, y] of [
      [0, 2],
      [4, 2],
      [2, 0],
      [2, 4],
    ]) {
      expect(at(out, x, y)[3], `${x},${y}`).toBe(0);
    }
  });

  /** The figure does not grow, so it cannot creep across a frame's edge. */
  it("keeps the silhouette exactly the size it was", () => {
    const image = blank(5, 5);
    block(image, 1, 1, 3, BODY);
    const solid = (b: Bitmap) => {
      let n = 0;
      for (let i = 3; i < b.data.length; i += 4) if (b.data[i] >= 128) n += 1;
      return n;
    };
    expect(solid(addOutline(image, 5, 5, LINE))).toBe(solid(image));
  });

  /** Read from the original, or the ring would eat its way inward. */
  it("is exactly one pixel deep", () => {
    const image = blank(9, 9);
    block(image, 2, 2, 5, BODY); // 5x5: ring, then a 3x3 core
    const out = addOutline(image, 9, 9, LINE);
    expect(at(out, 2, 4)).toEqual([...LINE, 255]); // ring
    expect(at(out, 3, 4)).toEqual([...BODY, 255]); // one in: still the body
    expect(at(out, 4, 4)).toEqual([...BODY, 255]); // centre
  });

  /**
   * A sheet is a grid of frames, and the pixel across an edge belongs to
   * another pose. A figure running to that edge is not lined along it — the
   * frame boundary is the edge of the world, not empty space.
   */
  it("does not line a figure along a frame's own edge", () => {
    const image = blank(8, 4); // two 4x4 frames
    put(image, 3, 1, BODY); // last column of the left frame
    put(image, 4, 1, BODY); // first column of the right frame
    const out = addOutline(image, 4, 4, LINE);
    // Each is lined on the sides that face space inside its own frame, and
    // neither is judged by the other.
    expect(at(out, 3, 1)).toEqual([...LINE, 255]);
    expect(at(out, 4, 1)).toEqual([...LINE, 255]);
  });

  it("treats the sheet's own edge as the edge of the world", () => {
    const image = blank(3, 3);
    block(image, 0, 0, 2, BODY); // hard into the corner
    const out = addOutline(image, 3, 3, LINE);
    // The corner pixel faces only its own body and the world's edge, so it
    // is not a boundary and keeps its colour.
    expect(at(out, 0, 0)).toEqual([...BODY, 255]);
    // This one faces space on two sides.
    expect(at(out, 1, 1)).toEqual([...LINE, 255]);
  });
});
