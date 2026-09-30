/**
 * Installs a delivered character sheet into the game.
 *
 *   pnpm tsx scripts/build-character.ts <Name> [--source file.png] [--concept file.png]
 *
 * Reads  art/characters/<Name>_sprite.png, or --source
 * Writes public/characters/<Name>_48x48.png — then add it to WORKER_SPRITES.
 *
 * And the concept sheet, if there is one: art/characters/<Name>.png, or
 * --concept, written out as public/characters/examples/<Name>.webp for the
 * profile card. That one *is* re-encoded, and on purpose: it is a painting
 * at 1536x1024, served whole to every card that opens, and as a PNG it was
 * a megabyte and a half apiece — sixteen of them were half of everything
 * public/ held. WebP at the quality below is a tenth of that and looks the
 * same at the size the card shows it. Nothing reads the PNG afterwards, so
 * it need not be kept once the WebP is written.
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
 * Two files per character are delivered into art/characters/: `<Name>.png`
 * is the profile picture, `<Name>_sprite.png` is the sheet this installs.
 * Taking the sheet by name matters — the profile picture is a portrait on a
 * backdrop, and it would be refused as a sheet with a confusing set of
 * measurements. Neither is served from there: art/ is the delivery, and
 * public/ is what the browser fetches.
 */

import { copyFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
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

const SOURCE = option("--source", join(process.cwd(), "art/characters", `${name}_sprite.png`));
const OUTPUT = join(process.cwd(), "public/characters", `${name}_48x48.png`);
const CONCEPT = option("--concept", join(process.cwd(), "art/characters", `${name}.png`));
const CONCEPT_OUTPUT = join(process.cwd(), "public/characters/examples", `${name}.webp`);

/** Lossy, at a quality nobody can tell from the PNG at a profile card's size. */
const CONCEPT_QUALITY = 85;

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

// No concept sheet is not a failure: a likeness can arrive before the
// painting does, and the profile card says so rather than breaking. But
// lib/world/cast.ts names the WebP, and cast.test.ts looks for it on disk.
if (existsSync(CONCEPT)) {
  sharp(CONCEPT)
    .webp({ quality: CONCEPT_QUALITY, effort: 6 })
    .toFile(CONCEPT_OUTPUT)
    .then(({ size }) => console.log(`wrote ${CONCEPT_OUTPUT} (${Math.round(size / 1024)}KB)`))
    .catch((err: Error) => {
      console.error(`could not write ${CONCEPT_OUTPUT}: ${err.message}`);
      process.exit(1);
    });
} else {
  console.log(`no concept sheet at ${CONCEPT}, so no profile picture written`);
}
