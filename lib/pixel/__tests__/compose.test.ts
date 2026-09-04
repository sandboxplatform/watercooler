import { describe, it, expect } from "vitest";
import {
  FACINGS,
  FRAMES_PER_DIRECTION,
  FRAME_H,
  FRAME_W,
  PORTRAIT_COLUMN,
  PORTRAIT_ROW,
  ROWS,
  SHEET_H,
  SHEET_W,
  sliceFrame,
  COLUMNS,
} from "../compose";
import type { Bitmap } from "../png";

/**
 * The grid, which is now all this module is.
 *
 * These numbers are a contract with three other places at once — the artist
 * drawing a sheet, `makeAnims` working out which frame index a row starts at,
 * and the HUD cutting a portrait out — so changing one of them silently is
 * how a whole cast stops animating.
 */
describe("the sheet's grid", () => {
  it("is 48x96 frames, six to a facing, four facings to a row", () => {
    expect([FRAME_W, FRAME_H]).toEqual([48, 96]);
    expect(FRAMES_PER_DIRECTION).toBe(6);
    expect(FACINGS).toEqual(["right", "up", "left", "down"]);
    expect(FACINGS.length * FRAMES_PER_DIRECTION).toBe(24);
  });

  it("puts idle on row 1 and walk on row 2, leaving row 0 spare", () => {
    expect(ROWS).toEqual({ idle: 1, walk: 2 });
  });

  it("still knows the pack's own shape, which the shipped cast is drawn on", () => {
    expect([COLUMNS, SHEET_W, SHEET_H]).toEqual([56, 2688, 1968]);
  });

  /** The face in the HUD is the first idle frame facing down: row 1, column 18. */
  it("takes a portrait from the first idle frame facing the camera", () => {
    expect(PORTRAIT_ROW).toBe(ROWS.idle);
    expect(PORTRAIT_COLUMN).toBe(FACINGS.indexOf("down") * FRAMES_PER_DIRECTION);
    expect(PORTRAIT_COLUMN).toBe(18);
  });
});

/** A sheet whose every pixel encodes the slot it is in, so a cut is checkable. */
function markedSheet(columns = COLUMNS, rows = 3): Bitmap {
  const width = columns * FRAME_W;
  const height = rows * FRAME_H;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor(x / FRAME_W);
      data[i + 1] = Math.floor(y / FRAME_H);
      data[i + 2] = 7;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("sliceFrame", () => {
  it("cuts the slot that was asked for", () => {
    const frame = sliceFrame(markedSheet(), PORTRAIT_COLUMN, PORTRAIT_ROW);
    expect([frame.width, frame.height]).toEqual([FRAME_W, FRAME_H]);
    for (const [x, y] of [
      [0, 0],
      [FRAME_W - 1, FRAME_H - 1],
      [FRAME_W >> 1, FRAME_H >> 1],
    ] as const) {
      const i = (y * FRAME_W + x) * 4;
      expect([frame.data[i], frame.data[i + 1]], `${x},${y}`).toEqual([
        PORTRAIT_COLUMN,
        PORTRAIT_ROW,
      ]);
    }
  });

  it("cuts the same slot out of a tight sheet as out of a padded one", () => {
    const tight = sliceFrame(markedSheet(24), PORTRAIT_COLUMN, PORTRAIT_ROW);
    const padded = sliceFrame(markedSheet(COLUMNS), PORTRAIT_COLUMN, PORTRAIT_ROW);
    expect(Array.from(tight.data)).toEqual(Array.from(padded.data));
  });

  /**
   * The pack's sheets are 1968 tall, which is twenty rows and half of one,
   * so the last row a caller can ask for is a part row.
   */
  it("returns transparency for the part of a slot past the bottom of the sheet", () => {
    const short = markedSheet(24, 3);
    const frame = sliceFrame(short, 0, 2);
    // Row 2 is the last whole row, so this one is complete.
    expect(frame.data[3]).toBe(255);
    const past = sliceFrame(short, 0, 3);
    expect(Array.from(past.data).every((byte) => byte === 0)).toBe(true);
  });
});
