import { describe, it, expect } from "vitest";
import { deFringe } from "../despeckle";
import type { Bitmap } from "../png";

/** Transparent to begin with, so each test draws only its own figure. */
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

/**
 * A column starting at y=1, so row 0 is transparent: a rim needs real space
 * above it to be a boundary. A figure flush against the frame's own edge is
 * a different case — the frame edge is the edge of the world, not space —
 * and no built sprite is flush, since each is scaled with a margin.
 */
function column(image: Bitmap, x: number, top: number[], rest: number[], bottom: number) {
  put(image, x, 1, top);
  for (let y = 2; y <= bottom; y++) put(image, x, y, rest);
}

const BODY = [70, 60, 55];
const PALE = [240, 240, 240];

describe("scraping the pale rim", () => {
  it("takes off a one-pixel pale rim and shows the body through", () => {
    const image = blank(5, 5);
    column(image, 2, PALE, BODY, 4);
    const out = deFringe(image, 5, 5);
    expect(at(out, 2, 1)).toEqual([...BODY, 255]);
  });

  /**
   * The distinction the whole pass rests on: a trainer reaching the edge is
   * pale behind as well, so it is a thick pale thing and stays.
   */
  it("leaves a pale thing whose own edge is at the boundary", () => {
    const image = blank(5, 5);
    column(image, 2, PALE, PALE, 3); // pale two deep and more
    const out = deFringe(image, 5, 5);
    expect(at(out, 2, 1)).toEqual([...PALE, 255]);
  });

  /**
   * Counting pale neighbours cannot tell these apart, because a rim runs
   * beside itself — every pixel of it has pale company.
   */
  it("clears a rim that runs along an edge, not just a single pixel of it", () => {
    const image = blank(7, 5);
    for (const x of [1, 2, 3, 4, 5]) column(image, x, PALE, BODY, 4);
    const out = deFringe(image, 7, 5);
    for (const x of [1, 2, 3, 4, 5]) {
      expect(at(out, x, 1), `x=${x}`).toEqual([...BODY, 255]);
    }
  });

  it("leaves the body alone", () => {
    const image = blank(5, 5);
    column(image, 2, PALE, BODY, 4);
    const out = deFringe(image, 5, 5);
    expect(at(out, 2, 3)).toEqual([...BODY, 255]);
  });

  it("leaves a pale pixel that is nowhere near the boundary", () => {
    const image = blank(5, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) put(image, x, y, BODY);
    put(image, 2, 2, PALE); // hemmed in on all sides
    const out = deFringe(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([...PALE, 255]);
  });

  /** One pixel thick all through: nothing behind it to show, so it stays. */
  it("leaves a figure only one pixel thick rather than erasing it", () => {
    const image = blank(5, 5);
    put(image, 2, 2, PALE);
    const out = deFringe(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([...PALE, 255]);
  });

  it("does not reach into the frame next door for what lies behind", () => {
    const image = blank(8, 4); // two 4x4 frames
    put(image, 3, 1, PALE); // right edge of frame one
    put(image, 4, 1, BODY); // left edge of frame two
    const out = deFringe(image, 4, 4);
    // Behind it, within its own frame, there is nothing: left as it is.
    expect(at(out, 3, 1)).toEqual([...PALE, 255]);
    expect(at(out, 4, 1)).toEqual([...BODY, 255]);
  });
});
