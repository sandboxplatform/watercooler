/**
 * Measures a delivered sheet before it is installed.
 *
 *   pnpm tsx scripts/check-delivery.ts public/characters/examples/Hunter_sprite.png
 *
 * `pnpm check:sheets` reads the installed cast, which is one step too late:
 * the whole point of measuring is to catch four pixels of drift while the
 * fix is still four pixels of art. Same two checks — `sheetFaults` for the
 * format, and the figure's extent over the 48 animated frames against the
 * standard the cast is drawn to.
 */

import { readFileSync } from "fs";
import { basename } from "path";
import { decodePng } from "../lib/pixel/png";
import { EXACT_FORMAT, describeSheetFaults, sheetFaults } from "../lib/pixel/exact";

const { frameWidth: FW, frameHeight: FH } = EXACT_FORMAT;

/** As scripts/check-sheets.ts: taken from Steve and Sara, which agree to the pixel. */
const STANDARD = { top: 28, bottom: 91, height: 64 };

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/check-delivery.ts <sheet.png>");
  process.exit(2);
}

const sheet = decodePng(readFileSync(file));
const columns = Math.floor(sheet.width / FW);
const faults = sheetFaults(sheet);

/**
 * Two boxes: the whole drawing, and whatever is down at foot height.
 *
 * The height and the baseline are measured against the figure. The feet band
 * is reported and **not** judged: this cannot tell a boot from a coat hem or
 * a hand hanging at the knee, so measuring rows 72-91 against the collision
 * body's x 12-36 flagged all eleven sheets in the cast — Sara, Steve and
 * Yoshi among them, which is where the standard was taken from. A check that
 * fires on everything says nothing. The number is printed because it is
 * worth an eye when a sprite looks like it is standing inside furniture; the
 * collision body itself is a fixed ratio and never measured from the art.
 */
const FEET = { top: 72, bottom: 91 };
// Annotated, because EXACT_FORMAT's dimensions are literal types and these
// are running minima, not the frame size.
const figure: { top: number; bottom: number; left: number; right: number } = {
  top: FH,
  bottom: -1,
  left: FW,
  right: -1,
};
const feet: { left: number; right: number } = { left: FW, right: -1 };
for (const row of [1, 2]) {
  for (let c = 0; c < Math.min(24, columns); c++) {
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const i = ((row * FH + y) * sheet.width + c * FW + x) * 4 + 3;
        if (sheet.data[i] <= 128) continue;
        if (y < figure.top) figure.top = y;
        if (y > figure.bottom) figure.bottom = y;
        if (x < figure.left) figure.left = x;
        if (x > figure.right) figure.right = x;
        if (y >= FEET.top && y <= FEET.bottom) {
          if (x < feet.left) feet.left = x;
          if (x > feet.right) feet.right = x;
        }
      }
    }
  }
}
const box = figure;

console.log(`${basename(file)}  ${sheet.width}x${sheet.height}  ${columns} columns`);
if (faults.length) {
  console.log(describeSheetFaults(faults));
} else {
  console.log("format: in specification");
}

if (box.bottom < 0) {
  console.log("figure: nothing drawn in the animated rows");
  process.exit(1);
}

const height = box.bottom - box.top + 1;
const notes: string[] = [];
if (box.bottom !== STANDARD.bottom) notes.push(`feet on row ${box.bottom}, not ${STANDARD.bottom}`);
if (height !== STANDARD.height) notes.push(`${height}px tall, not ${STANDARD.height}`);
console.log(
  `figure: rows ${box.top}-${box.bottom}, ${height}px tall, x ${box.left}-${box.right}\n` +
    `feet:   x ${feet.right < 0 ? "-" : `${feet.left}-${feet.right}`} over rows ${FEET.top}-${FEET.bottom}\n` +
    (notes.length ? `off the cast: ${notes.join(", ")}` : "matches the cast"),
);
process.exit(faults.length || notes.length ? 1 : 0);
