/**
 * Measures the figure inside every installed character sheet.
 *
 *   pnpm check:sheets            every public/characters/*_48x48.png
 *   pnpm check:sheets Sara Doc   just those
 *
 * `sheetFaults` in lib/pixel/exact.ts settles whether a sheet is in the
 * *format* — canvas shape, frames drawn, transparent background. It says
 * nothing about the figure inside the frame, because the format is about the
 * grid and the art is about the drawing.
 *
 * That gap is how a whole cast drifts apart. Two sheets arrived on the same
 * day both eight pixels shorter than the five already installed, passed every
 * check, and shipped — a person who reads as shorter than the people standing
 * next to him is not a fault any grid measurement can see. Redrawing ten
 * characters and eyeballing each one against the last is the same mistake with
 * more steps, so this counts it instead.
 *
 * It reports rather than refuses. Deciding what the cast's proportions should
 * be is the artist's call, and this only says whether a sheet matches the one
 * that has been chosen. Once every sheet agrees, STANDARD belongs in
 * `sheetFaults` and the check becomes a refusal like the rest.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { decodePng } from "../lib/pixel/png";
import { EXACT_FORMAT, sheetFaults } from "../lib/pixel/exact";

const { frameWidth: FW, frameHeight: FH } = EXACT_FORMAT;
const DIR = join(process.cwd(), "public/characters");

/**
 * The figure the cast is drawn to, measured over all 48 animated frames.
 *
 * Taken from Steve and Sara, which agree to the pixel. Feet on row 91 is the
 * one number nothing may vary: the game derives a collision body from the
 * bottom of the frame, and a character standing a few pixels up floats.
 */
const STANDARD = { top: 28, bottom: 91, height: 64 };

/** Characters that are deliberately not people, and so not held to it. */
const SHAPES = new Set(["Bud", "Michael"]);

/** Not cast at all: the blank grid an artist starts from. */
const NOT_CAST = new Set(["Character_Template"]);

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The figure's extent across every frame the game animates: rows 1 and 2. */
function figureBox(sheet: ReturnType<typeof decodePng>): Box | null {
  const columns = Math.floor(sheet.width / FW);
  const box: Box = { top: FH, bottom: -1, left: FW, right: -1 };
  for (const row of [1, 2]) {
    for (let c = 0; c < Math.min(24, columns); c++) {
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < FW; x++) {
          const i = ((row * FH + y) * sheet.width + c * FW + x) * 4 + 3;
          if (sheet.data[i] <= 128) continue;
          if (y < box.top) box.top = y;
          if (y > box.bottom) box.bottom = y;
          if (x < box.left) box.left = x;
          if (x > box.right) box.right = x;
        }
      }
    }
  }
  return box.bottom < 0 ? null : box;
}

const names = process.argv.slice(2);
const sheets = names.length
  ? names.map((n) => `${n}_48x48.png`)
  : readdirSync(DIR)
      .filter((f) => f.endsWith("_48x48.png"))
      .filter((f) => !NOT_CAST.has(f.replace("_48x48.png", "")));

let off = 0;
for (const file of sheets.sort()) {
  const name = file.replace("_48x48.png", "");
  const sheet = decodePng(readFileSync(join(DIR, file)));
  const columns = Math.floor(sheet.width / FW);
  const faults = sheetFaults(sheet);
  const box = figureBox(sheet);

  const notes: string[] = [];
  if (faults.length) notes.push(`${faults.length} format fault${faults.length > 1 ? "s" : ""}`);
  if (box && !SHAPES.has(name)) {
    const height = box.bottom - box.top + 1;
    if (box.bottom !== STANDARD.bottom)
      notes.push(`feet on row ${box.bottom}, not ${STANDARD.bottom}`);
    if (height !== STANDARD.height) notes.push(`${height}px tall, not ${STANDARD.height}`);
  }
  if (notes.length) off += 1;

  const shape = `${sheet.width}x${sheet.height}`;
  const rows = box ? `rows ${box.top}-${box.bottom}` : "empty";
  const size = box ? `${box.bottom - box.top + 1}px` : "-";
  console.log(
    `${name.padEnd(9)} ${shape.padEnd(11)} ${String(columns).padStart(2)}c  ` +
      `${rows.padEnd(12)} ${size.padStart(5)}  ` +
      (SHAPES.has(name) ? "not a person" : notes.length ? notes.join(", ") : "matches"),
  );
}

console.log(
  `\n${sheets.length} sheets, ${off} off the standard ` +
    `(figure rows ${STANDARD.top}-${STANDARD.bottom}, ${STANDARD.height}px tall)`,
);
