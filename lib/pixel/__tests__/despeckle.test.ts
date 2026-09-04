import { describe, it, expect } from "vitest";
import { despeckle } from "../despeckle";
import type { Bitmap } from "../png";

function sheet(width: number, height: number, fill: number[] = [80, 60, 40]): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
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

describe("rubbing off the specks", () => {
  it("takes out a lone white dot and fills it with what surrounds it", () => {
    const image = sheet(5, 5);
    put(image, 2, 2, [255, 255, 255]);
    const out = despeckle(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([80, 60, 40, 255]);
  });

  /** A shirt, a shoe, a chicken's chest: pale things come in company. */
  it("leaves pale areas that have pale neighbours", () => {
    const image = sheet(5, 5);
    put(image, 2, 2, [250, 250, 250]);
    put(image, 3, 2, [250, 250, 250]);
    const out = despeckle(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([250, 250, 250, 255]);
    expect(at(out, 3, 2)).toEqual([250, 250, 250, 255]);
  });

  /**
   * The reason this hunts brightness rather than outliers: at 48 pixels an
   * eye is one dark pixel with nothing like it anywhere near.
   */
  it("never touches dark detail, however lonely", () => {
    const image = sheet(5, 5, [200, 170, 150]); // pale skin
    put(image, 2, 2, [20, 20, 20]); // an eye
    const out = despeckle(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([20, 20, 20, 255]);
  });

  it("takes out a pale pixel whose neighbours are properly dark", () => {
    const image = sheet(5, 5, [70, 60, 55]);
    put(image, 2, 2, [215, 215, 215]);
    const out = despeckle(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([70, 60, 55, 255]);
  });

  /**
   * One threshold for candidate and company alike. A mid-tone neighbour is
   * not company — allowing it kept most specks, since a speck sits on the
   * artwork and the artwork is rarely dark.
   */
  it("does not treat a mid-tone neighbour as pale company", () => {
    const image = sheet(5, 5, [160, 160, 160]);
    put(image, 2, 2, [250, 250, 250]);
    const out = despeckle(image, 5, 5);
    expect(at(out, 2, 2)).toEqual([160, 160, 160, 255]);
  });

  /** Where neighbours are themselves pale, the fill is indistinguishable. */
  it("fills from the neighbours, so removing one is invisible in a pale area", () => {
    const image = sheet(5, 5, [235, 235, 235]);
    put(image, 2, 2, [255, 255, 255]);
    const out = despeckle(image, 5, 5);
    // Kept, in fact — its neighbours are pale, so it has company.
    expect(at(out, 2, 2)).toEqual([255, 255, 255, 255]);
  });

  it("ignores transparent pixels and does not fill from them", () => {
    const image = sheet(3, 3);
    put(image, 1, 1, [255, 255, 255], 0);
    const out = despeckle(image, 3, 3);
    expect(at(out, 1, 1)[3]).toBe(0);
  });

  it("keeps a lone speck that has nothing opaque beside it at all", () => {
    const image = { width: 3, height: 3, data: new Uint8Array(3 * 3 * 4) };
    put(image, 1, 1, [255, 255, 255]);
    const out = despeckle(image, 3, 3);
    expect(at(out, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  /** The pixel across a frame's edge belongs to another pose entirely. */
  it("does not take a neighbour from the frame next door", () => {
    const image = sheet(8, 4); // two 4x4 frames
    // A pale column at the right edge of frame one, pale again at frame two's
    // left edge: were the frames read as one, each would look like company.
    put(image, 3, 1, [255, 255, 255]);
    put(image, 4, 1, [255, 255, 255]);
    const out = despeckle(image, 4, 4);
    expect(at(out, 3, 1)).toEqual([80, 60, 40, 255]);
    expect(at(out, 4, 1)).toEqual([80, 60, 40, 255]);
  });

  /** Decided against the original, so one speck cannot pull the next along. */
  it("judges every pixel by what was there, not by what it has just written", () => {
    const image = sheet(6, 1);
    put(image, 2, 0, [255, 255, 255]);
    put(image, 3, 0, [253, 253, 253]);
    const out = despeckle(image, 6, 1);
    // They are each other's company, so both stay: no cascade either way.
    expect(at(out, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(at(out, 3, 0)).toEqual([253, 253, 253, 255]);
  });

  it("can be told what counts as pale", () => {
    const image = sheet(5, 5, [70, 60, 55]);
    put(image, 2, 2, [140, 140, 140]); // dull, but a speck against this dark
    expect(at(despeckle(image, 5, 5), 2, 2)).toEqual([140, 140, 140, 255]);
    expect(at(despeckle(image, 5, 5, { minLuma: 120 }), 2, 2)).toEqual([70, 60, 55, 255]);
  });
});
