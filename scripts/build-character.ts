/**
 * Builds a shipped character sheet from a simple generated sprite sheet.
 *
 * The input is the layout the ChatGPT prompt asks for: a flat background,
 * one row per facing, each row holding a few idle frames followed by a walk
 * cycle, with clear gaps between frames. Rows are read top to bottom as the
 * facings given. Left is mirrored from right by the composer, so a sheet
 * needs only down, up and right. See lib/pixel/strip.ts for the cutting.
 *
 *   pnpm tsx scripts/build-character.ts <Name> [--source file.png] [--rows down,up,right] [--idle 3] [--walk 6] [--height 72] [--no-outline] [--no-clean] [--preview out.png]
 *
 * Reads  public/characters/examples/<Name>_sprite.png, or --source
 * Writes public/characters/<Name>_48x48.png — then add it to WORKER_SPRITES.
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
import { addOutline, outlineColour } from "../lib/pixel/outline";
import { deFringe, despeckle } from "../lib/pixel/despeckle";
import { dropCrumbs } from "../lib/pixel/crumbs";
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
 * How tall a standing adult is in their 96px frame, matching the pack's cast.
 *
 * Override with `--height` for anyone who is not a person: everything is
 * scaled uniformly to this, so a chicken given the human default ends up
 * eye-to-eye with one.
 *
 * Note this fixes height only. The width that comes out is whatever the
 * source's proportions give — the pack's cast is chibi, about 42 wide at 66
 * tall, and a realistically proportioned figure at the same height lands
 * nearer 26 and reads as lanky beside them. That is a matter for the drawing,
 * not for the scaler; stretching it sideways would only squash the face.
 */
const CHARACTER_HEIGHT = 72;

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name)
  throw new Error(
    "usage: build-character.ts <Name> [--source file.png] [--rows down,up,right] [--idle 3] [--walk 6]",
  );
const option = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const facings = option("--rows", "down,up,right").split(",") as Facing[];
for (const f of facings) if (!FACINGS.includes(f)) throw new Error(`unknown facing "${f}"`);
const idleCount = Number(option("--idle", "3"));
const walkCount = Number(option("--walk", "6"));
const preview = option("--preview", "");
const height = Number(option("--height", String(CHARACTER_HEIGHT)));
if (!Number.isFinite(height) || height < 8 || height > FRAME_H - 2)
  throw new Error(`--height must be between 8 and ${FRAME_H - 2}`);
/** The pack's cast is drawn with a dark edge; pass --no-outline to go without. */
const outline = !args.includes("--no-outline");
/**
 * The three passes that scrub the lossy source's mess off the built sheet:
 * lone bright specks, the pale rim along the silhouette, and small detached
 * crumbs. `--no-clean` keeps the lot, which is worth a look when a character
 * comes out missing something.
 */
const clean = !args.includes("--no-clean");

const SOURCE = option(
  "--source",
  join(process.cwd(), "public/characters/examples", `${name}_sprite.png`),
);
const OUTPUT = join(process.cwd(), "public/characters", `${name}_48x48.png`);

const raw = decodePng(readFileSync(SOURCE));
const backdrop = detectBackdrop(raw);
console.log(
  `${name}: ${raw.width}x${raw.height}, backdrop ${backdrop ? `rgb(${backdrop.join(",")})` : "transparent"}`,
);
// Tight: a dark outline on a dark backdrop must not be keyed away with it.
const image = keyOutBackdrop(raw, 12);

const bands = rowBands(image);
if (bands.length !== facings.length) {
  throw new Error(
    `found ${bands.length} rows but expected ${facings.length} (${facings.join(", ")})`,
  );
}

const perRow = idleCount + walkCount;
const cells: Cell[] = [];
const assignments: Assignment[] = [];
bands.forEach((band, r) => {
  const cuts = spriteCuts(image, band, perRow);
  const row = cutCells(image, band, cuts);
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
const frames = cells.map((cell) =>
  snapToPalette(drawScaled(sharp, cell, scale, FRAME_W, FRAME_H), colours),
);

const composed = composeSheet(frames, assignments);
// Every scrubbing pass runs before the line, so the line is never drawn
// around the dirt: specks first, then the pale rim, then the crumbs — which
// the outline pass would otherwise mistake for tiny figures and paint the
// darkest colour on the sheet.
const cleaned = clean
  ? dropCrumbs(deFringe(despeckle(composed, FRAME_W, FRAME_H), FRAME_W, FRAME_H), FRAME_W, FRAME_H)
  : composed;
// Last, after the palette snap, so the line is exactly the colour asked for
// rather than the nearest of sixteen. It is one colour more on the sheet.
const sheet = outline ? addOutline(cleaned, FRAME_W, FRAME_H) : cleaned;
if (outline) {
  const [r, g, b] = outlineColour(cleaned);
  console.log(`outlined in rgb(${r},${g},${b})`);
}
writeFileSync(OUTPUT, encodePng(sheet));
console.log(`wrote ${OUTPUT}`);
if (preview) writeFileSync(preview, encodePng(sheet));
