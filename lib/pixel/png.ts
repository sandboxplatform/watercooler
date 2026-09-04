/**
 * A small PNG codec, scoped to exactly what the character pipeline needs.
 *
 * There is no image library in this project, so rather than pull in a
 * dependency that can read every PNG ever written, this reads the kinds we
 * meet and refuses the rest loudly. Everything comes out as RGBA.
 *
 * The kinds we meet: greyscale, RGB, greyscale+alpha and RGBA at 8 bits, and
 * **indexed colour** at 1, 2, 4 or 8 bits. Indexed matters more than it
 * sounds. A palette is the natural way to store pixel art and it is what a
 * pixel-art tool writes when asked for an "8-bit PNG", so refusing it sent
 * the artist back to re-export for no reason — expanding a palette is exact
 * and loses nothing.
 *
 * Note what is *not* decoded here: the picture a person uploads. That is
 * passed to the vision model as base64 and never opened locally, which is why
 * a user can upload a JPEG, a WebP or a screenshot without any of that
 * mattering to this file.
 */

import { deflateSync, inflateSync } from "zlib";

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array;
  /**
   * The PNG colour type the pixels were read from, when they came from a
   * file: 0 greyscale, 2 RGB, 3 indexed, 4 greyscale+alpha, 6 RGBA.
   *
   * Everything here works in RGBA whatever the source, so nothing needs this
   * to draw. It is kept because it is the difference between a sheet that
   * *happens* to have no transparent pixels and one that **cannot** have any:
   * types 0 and 2 carry no alpha channel at all, and telling somebody to
   * export with transparency is a far better message than telling them their
   * background is the wrong colour.
   */
  colourType?: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BYTES_PER_PIXEL = 4;

let crcTable: Int32Array | null = null;

function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** The Paeth predictor, as defined by the PNG specification. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(file: Buffer): Bitmap {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (file[i] !== SIGNATURE[i]) throw new Error("Not a PNG file");
  }

  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const bitDepth = file[24];
  const colourType = file[25];
  const interlace = file[28];

  const channels = CHANNELS[colourType];
  if (!channels || !DEPTHS[colourType]?.includes(bitDepth)) {
    throw new Error(
      `Unsupported PNG: colour type ${colourType} at depth ${bitDepth}. This reads ` +
        `greyscale, RGB, greyscale+alpha and RGBA at 8 bits, and indexed colour at 1, ` +
        `2, 4 or 8 bits — so export as 8-bit indexed or 32-bit RGBA.`,
    );
  }
  if (interlace !== 0) throw new Error("Unsupported PNG: interlaced");

  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let paletteAlpha: Buffer | null = null;
  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") idat.push(body);
    // The palette, three bytes a colour, and beside it an alpha for each of
    // its entries — which is how an indexed sprite is cut out of its
    // background.
    if (type === "PLTE") palette = body;
    if (type === "tRNS") paletteAlpha = body;
    if (type === "IEND") break;
    offset += 12 + length;
  }
  if (idat.length === 0) throw new Error("PNG has no image data");
  if (colourType === INDEXED && !palette) throw new Error("Indexed PNG has no palette");

  const raw = inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  /**
   * What the filter means by "the pixel to the left": whole bytes, and never
   * fewer than one. That floor is what makes a packed scanline work — at four
   * bits a pixel the filter still steps a byte at a time, over two pixels.
   */
  const step = Math.max(1, bitsPerPixel >> 3);
  const data = new Uint8Array(height * stride);

  // Un-filter in place, one scanline at a time. Each line's filter byte says
  // how it was encoded relative to the pixel left of it and the line above.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[src + x];
      const left = x >= step ? data[dst + x - step] : 0;
      const above = y > 0 ? data[up + x] : 0;
      const upLeft = y > 0 && x >= step ? data[up + x - step] : 0;

      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + left;
          break;
        case 2:
          out = value + above;
          break;
        case 3:
          out = value + ((left + above) >> 1);
          break;
        case 4:
          out = value + paeth(left, above, upLeft);
          break;
        default:
          throw new Error(`PNG uses unknown filter ${filter} on row ${y}`);
      }
      data[dst + x] = out & 0xff;
    }
  }

  if (colourType === INDEXED) {
    const opts = { width, height, stride, depth: bitDepth, palette: palette!, paletteAlpha };
    return { width, height, colourType, data: fromPalette(data, opts) };
  }
  return {
    width,
    height,
    colourType,
    data: channels === BYTES_PER_PIXEL ? data : toRgba(data, channels),
  };
}

/** Samples per pixel, by colour type. Indexed has one: the palette index. */
const CHANNELS: Record<number, number | undefined> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Colour type 3: the pixels are palette indices rather than colours. */
const INDEXED = 3;

/**
 * The bit depths each colour type may use, of those this reads.
 *
 * Indexed is the one that goes below 8: a sixteen-colour sprite is often
 * written four bits to a pixel, two pixels a byte.
 */
const DEPTHS: Record<number, readonly number[]> = {
  0: [8],
  2: [8],
  3: [1, 2, 4, 8],
  4: [8],
  6: [8],
};

interface PaletteOptions {
  width: number;
  height: number;
  /** Bytes per scanline, which is fewer than one per pixel below 8 bits. */
  stride: number;
  depth: number;
  /** PLTE: three bytes a colour. */
  palette: Buffer;
  /** tRNS: one alpha a colour, for as many as it names. */
  paletteAlpha: Buffer | null;
}

/**
 * Look every pixel's index up in the palette, giving RGBA.
 *
 * Exact: an index becomes the colour it names and nothing else happens to
 * it. Entries the tRNS chunk does not reach are opaque, which is what the
 * specification says and what a partly-transparent palette means in
 * practice — the cut-out colours come first.
 */
function fromPalette(rows: Uint8Array, o: PaletteOptions): Uint8Array {
  const { width, height, stride, depth, palette, paletteAlpha } = o;
  const out = new Uint8Array(width * height * BYTES_PER_PIXEL);
  const perByte = 8 / depth;
  const mask = (1 << depth) - 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let index: number;
      if (depth === 8) {
        index = rows[y * stride + x];
      } else {
        // Packed most significant bits first, left to right along the row.
        const byte = rows[y * stride + Math.floor(x / perByte)];
        index = (byte >> (8 - depth * ((x % perByte) + 1))) & mask;
      }
      const from = index * 3;
      const to = (y * width + x) * BYTES_PER_PIXEL;
      out[to] = palette[from];
      out[to + 1] = palette[from + 1];
      out[to + 2] = palette[from + 2];
      out[to + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
    }
  }
  return out;
}

/** Widen greyscale, RGB or greyscale+alpha samples to RGBA. */
function toRgba(samples: Uint8Array, channels: number): Uint8Array {
  const pixels = samples.length / channels;
  const out = new Uint8Array(pixels * BYTES_PER_PIXEL);
  for (let i = 0; i < pixels; i++) {
    const s = i * channels;
    const d = i * BYTES_PER_PIXEL;
    if (channels === 3) {
      out[d] = samples[s];
      out[d + 1] = samples[s + 1];
      out[d + 2] = samples[s + 2];
      out[d + 3] = 255;
    } else {
      out[d] = out[d + 1] = out[d + 2] = samples[s];
      out[d + 3] = channels === 2 ? samples[s + 1] : 255;
    }
  }
  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(image: Bitmap): Buffer {
  const { width, height, data } = image;
  const stride = width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    // Filter 0 (none). The sheets are flat pixel art with long runs of one
    // colour, which deflate handles well on its own; predictors buy little
    // here and cost clarity.
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
