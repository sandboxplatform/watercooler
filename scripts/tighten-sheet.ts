/**
 * Crops a sheet to just the frames the game animates.
 *
 *   pnpm tsx scripts/tighten-sheet.ts <in.png> <out.png>
 *
 * 2688x1968 down to 1152x288 — the same pixels, a sixteenth of the texture.
 * The pack's sheets carry 56 columns of which 24 are drawn and the rest are
 * empty padding, and nothing about the game needs that padding now that a
 * sheet's grid is measured rather than assumed.
 */
import { readFileSync, writeFileSync } from "fs";
import { decodePng, encodePng } from "../lib/pixel/png";
import { FRAME_W } from "../lib/pixel/compose";
import { MIN_EXACT_COLUMNS, MIN_EXACT_HEIGHT, isExactSheet } from "../lib/pixel/exact";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: tighten-sheet.ts <in.png> <out.png>");

const source = decodePng(readFileSync(input));
const width = MIN_EXACT_COLUMNS * FRAME_W;
const height = MIN_EXACT_HEIGHT;
const data = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y++) {
  const from = y * source.width * 4;
  data.set(source.data.subarray(from, from + width * 4), y * width * 4);
}
const tight = { width, height, data };
if (!isExactSheet(tight)) throw new Error("the crop is not in the game's format");
writeFileSync(output, encodePng(tight));
console.log(`${source.width}x${source.height} -> ${width}x${height} (${output})`);
