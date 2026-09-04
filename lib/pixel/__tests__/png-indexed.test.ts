import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { deflateSync, crc32 } from "zlib";
import { decodePng } from "../png";

/**
 * Indexed PNGs, which is how pixel art is normally stored.
 *
 * A palette is the natural shape for a sprite: a handful of colours, one
 * index per pixel. It is what a pixel-art tool writes when asked for an
 * "8-bit PNG", and refusing it used to send the artist back to re-export as
 * RGBA for nothing — expanding a palette is exact.
 *
 * These build the files by hand rather than round-tripping through the
 * encoder, because the encoder only writes RGBA. That is the point: nothing
 * in this project *produces* an indexed PNG, so the only way to test reading
 * one is to write the bytes.
 */

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

interface IndexedSpec {
  width: number;
  height: number;
  /** 1, 2, 4 or 8. */
  depth: number;
  /** Colours, three bytes each. */
  palette: number[];
  /** Alpha per palette entry, for as many as it names. */
  alpha?: number[];
  /** One packed scanline per row, without its filter byte. */
  rows: number[][];
  /** Filter byte per row; zero — none — unless said otherwise. */
  filters?: number[];
}

function indexedPng(spec: IndexedSpec): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(spec.width, 0);
  header.writeUInt32BE(spec.height, 4);
  header[8] = spec.depth;
  header[9] = 3; // colour type: indexed
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // not interlaced

  const scanlines = spec.rows.map((row, y) =>
    Buffer.concat([Buffer.from([spec.filters?.[y] ?? 0]), Buffer.from(row)]),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", Buffer.from(spec.palette)),
    ...(spec.alpha ? [chunk("tRNS", Buffer.from(spec.alpha))] : []),
    chunk("IDAT", deflateSync(Buffer.concat(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const RED = [220, 40, 40];
const BLUE = [40, 80, 220];
const at = (img: { width: number; data: Uint8Array }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

describe("reading an indexed PNG", () => {
  it("looks each pixel up in the palette", () => {
    const png = indexedPng({
      width: 2,
      height: 2,
      depth: 8,
      palette: [...RED, ...BLUE],
      rows: [
        [0, 1],
        [1, 0],
      ],
    });
    const img = decodePng(png);
    expect(img.width).toBe(2);
    expect(at(img, 0, 0)).toEqual([...RED, 255]);
    expect(at(img, 1, 0)).toEqual([...BLUE, 255]);
    expect(at(img, 0, 1)).toEqual([...BLUE, 255]);
  });

  /** tRNS is how an indexed sprite is cut out of its background. */
  it("takes each entry's alpha from tRNS, and treats the rest as opaque", () => {
    const png = indexedPng({
      width: 3,
      height: 1,
      depth: 8,
      palette: [0, 0, 0, ...RED, ...BLUE],
      // Only the first two entries are named: index 0 clear, index 1 solid.
      alpha: [0, 255],
      rows: [[0, 1, 2]],
    });
    const img = decodePng(png);
    expect(at(img, 0, 0)[3]).toBe(0);
    expect(at(img, 1, 0)).toEqual([...RED, 255]);
    // Beyond what tRNS names: opaque, as the specification says.
    expect(at(img, 2, 0)).toEqual([...BLUE, 255]);
  });

  /**
   * Below eight bits a scanline is packed, most significant bits first. A
   * sixteen-colour sprite is often written this way, two pixels to a byte.
   */
  it("unpacks four bits a pixel", () => {
    const png = indexedPng({
      width: 4,
      height: 1,
      depth: 4,
      palette: [...RED, ...BLUE, 10, 10, 10, 250, 250, 250],
      // 0x01 -> indices 0,1   0x23 -> indices 2,3
      rows: [[0x01, 0x23]],
    });
    const img = decodePng(png);
    expect(at(img, 0, 0)).toEqual([...RED, 255]);
    expect(at(img, 1, 0)).toEqual([...BLUE, 255]);
    expect(at(img, 2, 0)).toEqual([10, 10, 10, 255]);
    expect(at(img, 3, 0)).toEqual([250, 250, 250, 255]);
  });

  it("unpacks one bit a pixel", () => {
    const png = indexedPng({
      width: 8,
      height: 1,
      depth: 1,
      palette: [...RED, ...BLUE],
      // 0b10010110
      rows: [[0x96]],
    });
    const img = decodePng(png);
    const indices = [1, 0, 0, 1, 0, 1, 1, 0];
    indices.forEach((want, x) => {
      expect(at(img, x, 0), `x=${x}`).toEqual([...(want ? BLUE : RED), 255]);
    });
  });

  /**
   * The filter reaches back a whole byte even when that byte holds two
   * pixels. Getting this wrong reads a packed row as noise.
   */
  it("un-filters a packed row by bytes, not by pixels", () => {
    const png = indexedPng({
      width: 4,
      height: 2,
      depth: 4,
      palette: [...RED, ...BLUE, 10, 10, 10, 250, 250, 250],
      rows: [
        [0x01, 0x23],
        // Filter 2 (Up): each byte is a delta from the row above, so zeroes
        // repeat the row.
        [0x00, 0x00],
      ],
      filters: [0, 2],
    });
    const img = decodePng(png);
    expect(at(img, 0, 1)).toEqual([...RED, 255]);
    expect(at(img, 3, 1)).toEqual([250, 250, 250, 255]);
  });

  it("says so when an indexed file has no palette", () => {
    const png = indexedPng({
      width: 1,
      height: 1,
      depth: 8,
      palette: [...RED],
      rows: [[0]],
    });
    // Strip the PLTE chunk back out.
    const start = png.indexOf(Buffer.from("PLTE", "ascii")) - 4;
    const withoutPalette = Buffer.concat([
      png.subarray(0, start),
      png.subarray(start + 4 + 4 + 3 + 4),
    ]);
    expect(() => decodePng(withoutPalette)).toThrow(/no palette/i);
  });

  it("names what it can read when it meets something else", () => {
    const png = indexedPng({
      width: 1,
      height: 1,
      depth: 8,
      palette: [...RED],
      rows: [[0]],
    });
    png[24] = 16; // a depth no colour type here allows
    expect(() => decodePng(png)).toThrow(/8-bit indexed or 32-bit RGBA/);
  });
});

describe("the sheets people actually deliver", () => {
  /**
   * Doc's sheet, which is where this came from: correct in every dimension
   * and refused outright because it carried a palette.
   *
   * The **installed** sheet, not the source in examples/. The installed file
   * is a build artefact of the pipeline and is what the browser fetches, so
   * its colour type is a fact about this codec's job; the source beside it is
   * somebody's working art, replaced whenever they redraw, and pinning a unit
   * test to that made the suite go red when Doc's was redrawn mid-session.
   */
  it("reads a delivered indexed sheet", () => {
    const file = readFileSync(join(process.cwd(), "public/characters/Doc_48x48.png"));
    expect(file[25]).toBe(3); // indexed, or this test has stopped covering the case
    const img = decodePng(file);
    expect(img.width).toBe(2688);
    expect(img.height).toBe(1968);
    // Delivered on transparency, so the corner is clear rather than keyed.
    expect(img.data[3]).toBe(0);
  });
});
