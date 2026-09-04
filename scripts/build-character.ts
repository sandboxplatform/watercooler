/**
 * Installs a delivered character sheet into the game.
 *
 *   pnpm tsx scripts/build-character.ts <Name> [--source file.png]
 *
 * Reads  public/characters/examples/<Name>_sprite.png, or --source
 * Writes public/characters/<Name>_48x48.png — then add it to WORKER_SPRITES.
 *
 * **The file you deliver is the file the game loads.** A sheet in the format
 * is *copied*, not decoded and written back, so the installed file is the one
 * that was handed over — palette, colour type and all. Nothing is scaled,
 * quantised, keyed, padded, scrubbed or outlined. Decoding happens only to
 * check the sheet and to count what is missing from it.
 *
 * The format, from lib/pixel/exact.ts:
 *
 *   48 x 96 frames, either 24 columns (1152 wide) or the pack's 56 (2688)
 *   at least 3 rows: row 0 spare, row 1 idle, row 2 walk
 *   within a row, six frames each of right, up, left, down — left is drawn
 *   a transparent background
 *
 * Twenty-four columns is the one to draw: it holds exactly the frames the
 * game animates, and a sixteenth of the texture memory of a padded sheet.
 * The wide shape is accepted because the pack's own cast and everything built
 * before this are that size.
 *
 * A sheet that is not in the format is **refused**, with every fault measured
 * and the specification beside it, and there is no flag that installs it
 * anyway. That refusal is the point of this script. There used to be an
 * escape hatch — `--loose`, which found the rows, cut the frames apart,
 * scaled them to a common height, quantised down to a few dozen colours and
 * laid the result on the grid. Every one of those steps is a guess that shows
 * in the sprite, and having it available meant art that was nearly right got
 * interpreted instead of redrawn. The fix for art that comes out badly is
 * better art, not a longer pipeline.
 *
 * Two files per character live in examples/: `<Name>.png` is the profile
 * picture, `<Name>_sprite.png` is the sheet this reads. Taking the sheet by
 * name matters — the profile picture is a portrait on a backdrop, and it
 * would be refused here with a confusing set of measurements.
 */

import { copyFileSync, readFileSync } from "fs";
import { join } from "path";
import { decodePng } from "../lib/pixel/png";
import {
  ANIMATED_FRAMES,
  EXACT_FORMAT,
  describeSheetFaults,
  emptySlots,
  sheetFaults,
} from "../lib/pixel/exact";

const args = process.argv.slice(2);
const option = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const name = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!name) throw new Error("usage: build-character.ts <Name> [--source file.png]");

const SOURCE = option(
  "--source",
  join(process.cwd(), "public/characters/examples", `${name}_sprite.png`),
);
const OUTPUT = join(process.cwd(), "public/characters", `${name}_48x48.png`);

const raw = decodePng(readFileSync(SOURCE));
console.log(`${name}: ${raw.width}x${raw.height}`);

const faults = sheetFaults(raw);
if (faults.length) {
  // A refused sheet is an ordinary outcome of running this, not a crash: the
  // message says what is wrong with the art, and a stack trace over the top
  // of it only makes that harder to read.
  console.error(`\n${describeSheetFaults(faults, SOURCE)}\n`);
  process.exit(1);
}

const { frameWidth, frameHeight } = EXACT_FORMAT;
const columns = raw.width / frameWidth;
// Floored, because that is what the game does: a part row at the bottom is
// ignored rather than half animated.
const rows = Math.floor(raw.height / frameHeight);
console.log(`${columns} columns x ${rows} rows of ${frameWidth}x${frameHeight}`);

const missing = emptySlots(raw);
if (missing.length) {
  // Not a failure: a sheet can be delivered a facing at a time. But the game
  // plays every slot, and an empty one shows as the character blinking out.
  console.warn(
    `${missing.length} of ${ANIMATED_FRAMES} animated frames are empty: ${missing.join(", ")}`,
  );
} else {
  console.log(`all ${ANIMATED_FRAMES} animated frames are drawn`);
}

// The bytes, not a re-encoding: what lands in public/characters is the file
// that was handed over.
copyFileSync(SOURCE, OUTPUT);
console.log(`wrote ${OUTPUT}`);
