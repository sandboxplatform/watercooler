/**
 * Installs a delivered character sheet into the game.
 *
 *   pnpm tsx scripts/build-character.ts <Name> [--source file.png]
 *
 * Reads  public/characters/examples/<Name>_sprite.png, or --source
 * Writes public/characters/<Name>_48x48.png — then add it to WORKER_SPRITES.
 *
 * **Art is expected to arrive finished.** A sheet in the game's format is
 * used as it came: no scaling, no palette quantising, no speck removal, no
 * synthesised outline. The only things done to it are the two that cannot
 * change how it looks — clearing a flat backdrop if the four corners agree on
 * one, and padding transparent rows below the art so every sheet on disk is
 * the same size. Then it says how many of the forty-eight animated frames are
 * empty, and stops.
 *
 * The format, from lib/pixel/compose.ts — `public/characters/
 * Character_Template_48x48.png` is a sheet of exactly it to draw over:
 *
 *   2688 x 1968, a grid of 48 x 96 frames, 56 columns
 *   row 1  idle, row 2  walk
 *   within a row, six frames each of right, up, left, down
 *   transparent background, or one flat colour throughout
 *
 * A sheet that is not in that format is **refused**, with the measurements
 * and the specification side by side. That refusal is the point of this
 * script. Guessing at a loose sheet — finding the rows, cutting the frames
 * apart, scaling them to a common height, quantising to sixteen colours,
 * scrubbing the compression noise off the result and drawing an outline round
 * what survived — is what this used to do, and every one of those steps is a
 * guess that shows in the sprite. The fix for art that comes out badly is
 * better art, not a longer pipeline.
 *
 * `--loose` runs that older interpretation anyway, for a sheet that cannot be
 * re-delivered. It has no scrubbing and no invented outline, so what it
 * produces looks like what it was given. Prefer re-drawing to the format.
 * `/api/characters/ingest` is the same escape hatch inside the app.
 *
 * Two files per character live in examples/: `<Name>.png` is the profile
 * picture, `<Name>_sprite.png` is the sheet this reads. Taking the sheet by
 * name matters — the profile picture is a portrait on a backdrop, and feeding
 * one to the cutter yields either a row-count error or a single mangled frame.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { decodePng, encodePng } from "../lib/pixel/png";
import { detectBackdrop, keyOutBackdrop } from "../lib/pixel/ingest";
import { EXACT_FORMAT, emptySlots, isExactSheet, normaliseExactSheet } from "../lib/pixel/exact";
import {
  composeSheet,
  FACINGS,
  FRAME_H,
  FRAME_W,
  type Assignment,
  type Facing,
} from "../lib/pixel/compose";
import {
  commonScale,
  cutCells,
  drawScaled,
  palette,
  rowBands,
  snapToPalette,
  spriteCuts,
  type Cell,
} from "../lib/pixel/strip";

/**
 * How tall a standing adult is in their 96px frame, for `--loose` only.
 *
 * Everything is scaled uniformly to this, so a chicken given the human
 * default ends up eye-to-eye with one; `--height` is the override.
 *
 * Note this fixes height only. The width that comes out is whatever the
 * source's proportions give — the pack's cast is chibi, about 42 wide at 66
 * tall, and a realistically proportioned figure at the same height lands
 * nearer 26 and reads as lanky beside them. That is a matter for the drawing,
 * not for the scaler; stretching it sideways would only squash the face.
 */
const CHARACTER_HEIGHT = 72;

const args = process.argv.slice(2);
const option = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!name) throw new Error("usage: build-character.ts <Name> [--source file.png] [--loose]");

const SOURCE = option(
  "--source",
  join(process.cwd(), "public/characters/examples", `${name}_sprite.png`),
);
const OUTPUT = join(process.cwd(), "public/characters", `${name}_48x48.png`);

const raw = decodePng(readFileSync(SOURCE));
console.log(`${name}: ${raw.width}x${raw.height}`);

try {
  const sheet = flags.has("--loose") ? interpret() : asDelivered();
  writeFileSync(OUTPUT, encodePng(sheet));
  console.log(`wrote ${OUTPUT}`);
} catch (err) {
  // A refused sheet is an ordinary outcome of running this, not a crash: the
  // message says what is wrong with the art, and a stack trace over the top
  // of it only makes that harder to read.
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
}

/** The good path: a sheet already in the format, used as it came. */
function asDelivered() {
  if (!isExactSheet(raw)) {
    const { width, height, minHeight, frameWidth, frameHeight } = EXACT_FORMAT;
    throw new Error(
      `${SOURCE} is ${raw.width}x${raw.height}, which is not the game's sheet format.\n` +
        `Expected ${width}x${height} (at least ${minHeight} tall), a grid of ` +
        `${frameWidth}x${frameHeight} frames: row 1 idle, row 2 walk, six frames each of ` +
        `right, up, left, down, on a transparent or flat background.\n` +
        `Draw over public/characters/Character_Template_48x48.png, which is exactly that.\n` +
        `To interpret this sheet as it is instead, pass --loose — but the result is only ` +
        `ever as good as the guesses, so re-delivering the art is the better fix.`,
    );
  }
  const { sheet, backdropRemoved, padded } = normaliseExactSheet(raw);
  if (backdropRemoved) console.log("cleared a flat backdrop");
  if (padded) console.log(`padded to ${EXACT_FORMAT.height} tall`);
  const missing = emptySlots(sheet);
  if (missing.length) {
    // Not a failure: a sheet can be delivered a frame at a time. But the game
    // plays every slot, and an empty one shows as the character blinking out.
    console.warn(`${missing.length} of 48 animated frames are empty: ${missing.join(", ")}`);
  } else {
    console.log("all 48 animated frames are drawn");
  }
  return sheet;
}

/**
 * The fallback: read a loose sheet, cut it up and lay it out.
 *
 * Rows are read top to bottom as the facings given, each holding some idle
 * frames then a walk cycle, with clear gaps between frames. Left is mirrored
 * from right by the composer, so a sheet needs only down, up and right.
 */
function interpret() {
  const facings = option("--rows", "down,up,right").split(",") as Facing[];
  for (const f of facings) if (!FACINGS.includes(f)) throw new Error(`unknown facing "${f}"`);
  const idleCount = Number(option("--idle", "3"));
  const walkCount = Number(option("--walk", "6"));
  const height = Number(option("--height", String(CHARACTER_HEIGHT)));
  if (!Number.isFinite(height) || height < 8 || height > FRAME_H - 2)
    throw new Error(`--height must be between 8 and ${FRAME_H - 2}`);

  const backdrop = detectBackdrop(raw);
  console.log(`backdrop ${backdrop ? `rgb(${backdrop.join(",")})` : "transparent"}`);
  // Tight: a dark outline on a dark backdrop must not be keyed away with it.
  const image = keyOutBackdrop(raw, 12);

  const bands = rowBands(image);
  if (bands.length !== facings.length)
    throw new Error(
      `found ${bands.length} rows but expected ${facings.length} (${facings.join(", ")})`,
    );

  const perRow = idleCount + walkCount;
  const cells: Cell[] = [];
  const assignments: Assignment[] = [];
  bands.forEach((band, r) => {
    const row = cutCells(image, band, spriteCuts(image, band, perRow));
    console.log(`row ${r} (${facings[r]}): ${row.length} frames`);
    if (row.length !== perRow)
      throw new Error(`row ${r} has ${row.length} frames, expected ${perRow}`);
    row.forEach((cell, i) => {
      assignments.push({
        pose: cells.length,
        facing: facings[r],
        kind: i < idleCount ? "idle" : "walk",
      });
      cells.push(cell);
    });
  });

  const colours = palette(image, 16);
  const sharp = snapToPalette(image, colours);
  const scale = commonScale(cells, FRAME_W, FRAME_H, 2, height);
  console.log(`scale ${scale.toFixed(3)}, ${colours.length} colours`);
  console.warn(
    "--loose: this sheet was interpreted, not used as delivered. Cutting, scaling and " +
      "quantising all show in the result; a sheet drawn to the format would not need them.",
  );
  return composeSheet(
    cells.map((cell) => snapToPalette(drawScaled(sharp, cell, scale, FRAME_W, FRAME_H), colours)),
    assignments,
  );
}
