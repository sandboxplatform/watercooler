/**
 * The one standard a character sheet has to meet, and the refusal when it
 * does not.
 *
 * Nothing here changes a pixel. A sheet in the format is installed as the
 * file it arrived as; a sheet that is not is **refused**, with every fault
 * measured and set beside what the format asks for. There is no second path:
 * cutting a loose sheet apart, scaling it to a common height, quantising the
 * colours and keying a background out was what this used to do, and every one
 * of those steps is a guess that shows in the sprite. The fix for art that
 * comes out badly is better art, not a longer pipeline.
 *
 * Nothing here calls a model either, so a sheet in the right format works
 * with no API key on the server at all.
 */

import type { Bitmap } from "./png";
import {
  COLUMNS,
  FACINGS,
  FRAME_H,
  FRAME_W,
  FRAMES_PER_DIRECTION,
  SHEET_H,
  SHEET_W,
} from "./compose";

/** Rows 0-2 are all the game reads; a sheet that stops there is complete. */
export const MIN_EXACT_HEIGHT = FRAME_H * 3;

/** Frames the game animates in a row: right, up, left and down, six each. */
export const MIN_EXACT_COLUMNS = FRAMES_PER_DIRECTION * FACINGS.length;

/** The narrowest sheet that can hold them. */
export const MIN_EXACT_WIDTH = MIN_EXACT_COLUMNS * FRAME_W;

/** Frames the game animates altogether: two rows of the above. */
export const ANIMATED_FRAMES = MIN_EXACT_COLUMNS * 2;

/**
 * The widths a delivered sheet may have, in frames.
 *
 * Tight, holding only the frames the game animates, or the pack's own width.
 * Two named widths rather than any multiple of a frame, because width is the
 * one thing that says a sheet really is in this format: the loose
 * illustration grids are 1536 across, which is a whole 32 frames, so a
 * divisibility rule would wave one through to animate from nonsense.
 */
export const EXACT_COLUMNS: readonly number[] = [MIN_EXACT_COLUMNS, COLUMNS];

/** Colour types that carry an alpha channel at all: indexed, grey+alpha, RGBA. */
const ALPHA_TYPES: readonly number[] = [3, 4, 6];

/** How the PNG specification names each colour type, for a refusal worth reading. */
const COLOUR_TYPE_NAMES: Record<number, string> = {
  0: "greyscale, no alpha",
  2: "RGB, no alpha",
  3: "indexed",
  4: "greyscale with alpha",
  6: "RGBA",
};

/**
 * What a sheet has to be for the game to animate it as it came.
 *
 * One of those two widths, and at least the three rows the game reads. Not a
 * whole number of rows: the pack's sheets are 1968 tall, which is twenty and
 * a half of them, and the game floors the count so a part row is ignored.
 *
 * A tight sheet — 1152x288 — is as valid as one of the pack's, and a good
 * deal cheaper to hold in memory. This used to insist on the pack's width
 * alone, because the frame grid was a constant rather than a measurement,
 * which meant padding thirty-two empty columns onto every row with nothing to
 * explain why.
 *
 * Geometry only. A sheet can be exactly this shape and still be unusable
 * because it arrived on a background — see `sheetFaults`, which is what a
 * caller deciding whether to install something should be asking.
 */
export function isExactSheet(image: Bitmap): boolean {
  return EXACT_COLUMNS.includes(image.width / FRAME_W) && image.height >= MIN_EXACT_HEIGHT;
}

/** One thing wrong with a sheet: what was measured, and what is wanted instead. */
export interface SheetFault {
  /** A short handle, for logs and tests. */
  kind: "width" | "height" | "no-alpha-channel" | "nothing-transparent" | "backdrop";
  /** What this sheet actually is. */
  found: string;
  /** What the format asks for. */
  wanted: string;
}

/**
 * Whether a sheet arrives cut out, or on a background that would show.
 *
 * The four corners of a sheet of characters are the corners of four frames,
 * and a frame's corner is empty in every sheet ever drawn to this format —
 * the figure is 42-odd pixels wide in a 48-wide frame and stands at the
 * bottom of it. So four opaque corners means there is something behind the
 * art, and since nothing is keyed out any more, that something gets drawn.
 *
 * **Opaque, not one colour.** This used to require the four corners to agree
 * on a colour within a tolerance, on the theory that a colour four corners
 * share is probably the background. That let two whole classes of sheet
 * through as though they were cut out: a gradient backdrop, and — the one
 * that actually turned up — a sheet exported with the editor's transparency
 * checkerboard baked into the pixels, whose corners were rgb(253,253,253),
 * rgb(254,254,254), rgb(240,240,239) and rgb(236,237,236). Not agreeing on a
 * colour is not evidence of transparency. Being transparent is.
 */
export function hasOpaqueBackdrop(image: Bitmap): boolean {
  const { width: w, height: h, data } = image;
  if (w < 4 || h < 4) return false;
  return [
    [1, 1],
    [w - 2, 1],
    [1, h - 2],
    [w - 2, h - 2],
  ].every(([x, y]) => data[(y * w + x) * 4 + 3] >= 250);
}

/** The colour at each corner, as words, for saying what is behind the art. */
function cornerColours(image: Bitmap): string {
  const { width: w, height: h, data } = image;
  return [
    [1, 1],
    [w - 2, 1],
    [1, h - 2],
    [w - 2, h - 2],
  ]
    .map(([x, y]) => {
      const i = (y * w + x) * 4;
      return `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
    })
    .join(", ");
}

/** How many pixels of a sheet are see-through. */
export function transparentPixels(image: Bitmap): number {
  let clear = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] === 0) clear++;
  return clear;
}

/**
 * Everything wrong with a sheet, or an empty list if it may be installed.
 *
 * Every fault, not the first one: a sheet delivered on the wrong canvas is
 * usually on the wrong background too, and sending somebody back to redraw
 * one thing at a time is how three rounds happen instead of one.
 */
export function sheetFaults(image: Bitmap): SheetFault[] {
  const faults: SheetFault[] = [];
  const columns = image.width / FRAME_W;

  if (!EXACT_COLUMNS.includes(columns)) {
    faults.push({
      kind: "width",
      found: Number.isInteger(columns)
        ? `${image.width}px wide, which is ${columns} frames of ${FRAME_W}`
        : `${image.width}px wide, which is not a whole number of ${FRAME_W}px frames`,
      wanted:
        `${MIN_EXACT_WIDTH} (${MIN_EXACT_COLUMNS} frames: six each of right, up, ` +
        `left and down) or ${SHEET_W} (${COLUMNS}), and nothing between`,
    });
  }

  if (image.height < MIN_EXACT_HEIGHT) {
    faults.push({
      kind: "height",
      found: `${image.height}px tall, which is ${(image.height / FRAME_H).toFixed(2)} rows`,
      wanted: `at least ${MIN_EXACT_HEIGHT} — row 0 blank, row 1 idle, row 2 walk`,
    });
  }

  // Asked in this order because the answers nest: a file with no alpha
  // channel cannot have a transparent pixel, and a file with no transparent
  // pixel has an opaque backdrop by definition. Reporting all three would be
  // three ways of saying the same thing.
  const clear = transparentPixels(image);
  if (image.colourType !== undefined && !ALPHA_TYPES.includes(image.colourType)) {
    faults.push({
      kind: "no-alpha-channel",
      found:
        `a PNG with no alpha channel (colour type ${image.colourType}, ` +
        `${COLOUR_TYPE_NAMES[image.colourType] ?? "unknown"}), so not one of its ` +
        `${image.width * image.height} pixels can be transparent`,
      wanted:
        "colour type 6 (RGBA), or an indexed PNG with a tRNS entry — " +
        "export with transparency switched on",
    });
  } else if (clear === 0) {
    faults.push({
      kind: "nothing-transparent",
      found: `every one of its ${image.width * image.height} pixels opaque`,
      wanted:
        "a transparent background. If the export shows a checkerboard, that " +
        "is the editor drawing transparency for you and it has been saved as " +
        "real pixels — it is not an alpha channel",
    });
  } else if (hasOpaqueBackdrop(image)) {
    faults.push({
      kind: "backdrop",
      found: `all four corners opaque: ${cornerColours(image)}`,
      wanted:
        "a transparent background. Nothing is keyed out, so whatever is " +
        "behind the figures is drawn along with them — and the outlines are " +
        "usually the same colour as the background somebody wants removed",
    });
  }

  return faults;
}

/** Why a sheet is not in the format, in one line. Null when it is. */
export function whyNotExact(image: Bitmap): string | null {
  const faults = sheetFaults(image);
  return faults.length ? faults.map((f) => f.found).join(", and ") : null;
}

/**
 * The refusal, laid out to be read: every fault, then the specification, then
 * what to do about it.
 *
 * Shared by the install script and the upload route so a sheet is turned away
 * with the same words wherever it is offered.
 */
export function describeSheetFaults(faults: SheetFault[], source = "That sheet"): string {
  const lines = [`${source} cannot be installed:`, ""];
  for (const fault of faults) {
    lines.push(`  · it is ${fault.found}`);
    lines.push(`    wanted: ${fault.wanted}`);
  }
  lines.push(
    "",
    "The format:",
    `  ${FRAME_W}x${FRAME_H} frames, ${MIN_EXACT_COLUMNS} columns x 3 rows ` +
      `(${MIN_EXACT_WIDTH}x${MIN_EXACT_HEIGHT}); ${SHEET_W} wide is also taken.`,
    "  Row 0 blank, row 1 idle, row 2 walk.",
    `  Across a row: ${FRAMES_PER_DIRECTION} frames each of ${FACINGS.join(", ")}.`,
    "  Left is drawn, not mirrored. Both cycles loop over their six frames.",
    "  A transparent background.",
    "",
    "Draw over public/characters/Character_Template_48x48.png.",
  );
  return lines.join("\n");
}

/** Where a frame lives, in words a person can act on. */
export function slotName(row: number, column: number): string {
  const kind = row === 1 ? "idle" : "walk";
  const facing = FACINGS[Math.floor(column / FRAMES_PER_DIRECTION)];
  const frame = (column % FRAMES_PER_DIRECTION) + 1;
  return `${kind} ${facing} #${frame}`;
}

/**
 * Every animated slot with nothing drawn in it.
 *
 * The game reads 48 frames — idle and walk, four facings, six frames each —
 * and plays them whether or not anything is there. An empty one shows as the
 * character blinking out of existence for a tenth of a second, which is far
 * harder to diagnose from inside the game than from a list of slot names.
 *
 * Reported rather than refused: a sheet can honestly be delivered a facing at
 * a time, and a half-drawn character is worth looking at in the room.
 */
export function emptySlots(sheet: Bitmap, minOpaquePixels = 40): string[] {
  const empty: string[] = [];
  for (const row of [1, 2]) {
    for (let column = 0; column < FACINGS.length * FRAMES_PER_DIRECTION; column++) {
      let opaque = 0;
      for (let y = 0; y < FRAME_H && opaque < minOpaquePixels; y++) {
        const base = ((row * FRAME_H + y) * sheet.width + column * FRAME_W) * 4;
        for (let x = 0; x < FRAME_W; x++) {
          if (sheet.data[base + x * 4 + 3] > 40) opaque++;
        }
      }
      if (opaque < minOpaquePixels) empty.push(slotName(row, column));
    }
  }
  return empty;
}

/** The shape a delivered sheet has to have, for anyone reporting it. */
export const EXACT_FORMAT = {
  frameWidth: FRAME_W,
  frameHeight: FRAME_H,
  /** The narrowest and shortest sheet the game can animate. */
  minWidth: MIN_EXACT_WIDTH,
  minHeight: MIN_EXACT_HEIGHT,
  minColumns: MIN_EXACT_COLUMNS,
  /** What the pack's own sheets are, and what the shipped cast still is. */
  packWidth: SHEET_W,
  packHeight: SHEET_H,
  framesPerFacing: FRAMES_PER_DIRECTION,
  facings: FACINGS,
  animatedFrames: ANIMATED_FRAMES,
} as const;
