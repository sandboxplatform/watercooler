import { deflateSync } from "zlib";
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PNG_MAX_PIXELS, PNG_MAX_SIDE, decodePng, encodePng, type Bitmap } from "../png";

const SHEET = join(process.cwd(), "public/characters/Premade_Character_48x48_09.png");

function solid(width: number, height: number, rgba: [number, number, number, number]): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

describe("png codec", () => {
  it("round-trips an image byte for byte", () => {
    const source = solid(7, 5, [12, 240, 33, 255]);
    const back = decodePng(encodePng(source));
    expect(back.width).toBe(7);
    expect(back.height).toBe(5);
    expect(Array.from(back.data)).toEqual(Array.from(source.data));
  });

  it("preserves alpha, including fully transparent pixels", () => {
    const source = solid(3, 3, [10, 20, 30, 0]);
    source.data.set([1, 2, 3, 128], 4 * 4);
    const back = decodePng(encodePng(source));
    expect(Array.from(back.data.slice(0, 4))).toEqual([10, 20, 30, 0]);
    expect(Array.from(back.data.slice(16, 20))).toEqual([1, 2, 3, 128]);
  });

  it("reads a real character sheet at its documented size", () => {
    // Cropped from the pack's 2688x1968 to the 24 columns and three rows the
    // game animates, which is everything in it that is ever drawn.
    const sheet = decodePng(readFileSync(SHEET));
    expect(sheet.width).toBe(1152);
    expect(sheet.height).toBe(288);
    expect(sheet.data.length).toBe(1152 * 288 * 4);
  });

  it("decodes every scanline filter the real sheets use", () => {
    // The library sheets are written by an art tool that uses the adaptive
    // filters; a wrong Paeth or Average implementation shows up as noise
    // rather than an error, so check for structure instead.
    const sheet = decodePng(readFileSync(SHEET));
    let opaque = 0;
    let transparent = 0;
    for (let i = 3; i < sheet.data.length; i += 4) {
      if (sheet.data[i] === 255) opaque++;
      else if (sheet.data[i] === 0) transparent++;
    }
    // A character sheet is mostly empty space around solid sprites, and a
    // mis-filtered decode produces neither.
    expect(transparent).toBeGreaterThan(opaque);
    expect(opaque).toBeGreaterThan(100_000);
    expect(opaque + transparent).toBeGreaterThan(sheet.width * sheet.height * 0.95);
  });

  it("re-encodes a decoded sheet to the same pixels", () => {
    const sheet = decodePng(readFileSync(SHEET));
    const again = decodePng(encodePng(sheet));
    expect(again.data.length).toBe(sheet.data.length);
    // Spot-check rather than compare 21M bytes.
    for (const i of [0, 5_000_003, 10_000_007, sheet.data.length - 4]) {
      expect(again.data[i]).toBe(sheet.data[i]);
    }
  });

  it("refuses a PNG it cannot honestly read", () => {
    const fake = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array(40).fill(0),
    ]);
    fake.writeUInt32BE(4, 16);
    fake.writeUInt32BE(4, 20);
    // Sixteen bits a sample: a real PNG, and not one this reads. Indexed
    // colour used to be the example here, until it turned out to be the
    // format pixel art actually arrives in — see png-indexed.test.ts.
    fake[24] = 16;
    fake[25] = 6;
    expect(() => decodePng(fake)).toThrow(/colour type/i);
  });

  it("rejects something that is not a PNG at all", () => {
    expect(() => decodePng(Buffer.from("hello world"))).toThrow(/Not a PNG/);
  });

  it("reads an RGB export with no alpha channel as fully opaque", () => {
    // Build a 2x1 colour-type-2 PNG by hand: one red pixel, one green.
    const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0]); // filter 0, then RGB RGB
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8; // depth
    ihdr[9] = 2; // RGB
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      return Buffer.concat([len, Buffer.from(type, "ascii"), body, Buffer.alloc(4)]);
    };
    const file = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const image = decodePng(file);
    expect(image.width).toBe(2);
    expect(Array.from(image.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });
});

/**
 * A PNG says how big it is in a header and carries its pixels deflated, so a
 * file of a few kilobytes can claim to be enormous and inflate to gigabytes.
 * Both halves of that are refused before the heap is spent on them.
 */
describe("a decompression bomb", () => {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, "ascii"), body, Buffer.alloc(4)]);
  };
  const png = (width: number, height: number, idat: Buffer) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", idat),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  };
  const tiny = deflateSync(Buffer.alloc(16));

  it("is refused by its header before anything is inflated", () => {
    // A hundred thousand pixels a side would be forty gigabytes of RGBA.
    expect(() => decodePng(png(100_000, 100_000, tiny))).toThrow(/larger than this reads/);
    expect(() => decodePng(png(PNG_MAX_SIDE + 1, 1, tiny))).toThrow(/larger than this reads/);
    // Within each side, but not within the area.
    expect(() => decodePng(png(PNG_MAX_SIDE, PNG_MAX_SIDE, tiny))).toThrow(
      /larger than this reads/,
    );
  });

  it("stops inflating at what the header's size needs", () => {
    // A one-pixel image — five bytes of scanline — whose data inflates to
    // eight megabytes. The ratio, not the size, is what makes it a bomb.
    const bomb = png(1, 1, deflateSync(Buffer.alloc(8 * 1024 * 1024)));
    expect(() => decodePng(bomb)).toThrow(/larger than its header says/);
  });

  it("refuses image data that stops short of the header's size", () => {
    expect(() => decodePng(png(4, 4, deflateSync(Buffer.alloc(5))))).toThrow(/truncated/);
  });

  it("refuses a header that claims no pixels at all", () => {
    expect(() => decodePng(png(0, 4, deflateSync(Buffer.alloc(0))))).toThrow(/no pixels/);
  });

  it("leaves room for the largest honest image in the repository", () => {
    // The tallest tileset a generated map declares, which `preview:map`
    // decodes; the caps sit well above it. Its header is enough.
    const file = readFileSync(join(process.cwd(), "public/tilesets/16_Grocery_store_48x48.png"));
    const width = file.readUInt32BE(16);
    const height = file.readUInt32BE(20);
    expect(Math.max(width, height)).toBeLessThanOrEqual(PNG_MAX_SIDE);
    expect(width * height).toBeLessThanOrEqual(PNG_MAX_PIXELS);
  });
});
