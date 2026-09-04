import { describe, it, expect } from "vitest";
import { makeAnims, allAnims, SHEET_COLUMNS, FRAME_WIDTH } from "../config/animations";
import { MIN_EXACT_COLUMNS } from "@/lib/pixel/exact";

/**
 * A sheet's grid is measured, not assumed.
 *
 * Phaser numbers frames across a whole sheet, so the first frame of row 1 is
 * index `columns`. That number used to be the constant 56 — the pack's width
 * — which meant a delivered sheet had to be 2688 across whatever it held, and
 * an artist padded thirty-two empty columns onto every row.
 *
 * These are the sums that break if it goes back to a constant. On a tight
 * sheet, walking right is frames 48 to 53; under the old arithmetic the game
 * would have looked for 112 to 117, which do not exist on a three-row sheet
 * of twenty-four columns — the character would simply never animate.
 */

const TIGHT = MIN_EXACT_COLUMNS; // 24
const walkRight = (columns: number) => makeAnims("x", "walk", 2, 10, columns)[0];

describe("frame numbers on a tight sheet", () => {
  it("counts twenty-four columns", () => {
    expect(TIGHT).toBe(24);
    expect(TIGHT * FRAME_WIDTH).toBe(1152);
  });

  it("finds walking on the third row where it actually is", () => {
    expect(walkRight(TIGHT)).toMatchObject({ start: 48, end: 53 });
  });

  /** The bug this replaces, kept as an assertion so it cannot come back. */
  it("would have looked past the end of the sheet at the pack's width", () => {
    const wrong = walkRight(SHEET_COLUMNS);
    expect(wrong.start).toBe(112);
    // A tight sheet holds 24 x 3 frames, numbered 0 to 71.
    expect(wrong.start).toBeGreaterThan(TIGHT * 3 - 1);
  });

  it("still reads the pack's own sheets correctly", () => {
    expect(walkRight(SHEET_COLUMNS)).toMatchObject({ start: 112, end: 117 });
    expect(makeAnims("x", "idle", 1, 8, SHEET_COLUMNS)[0]).toMatchObject({ start: 56, end: 61 });
  });

  it("lays the four facings out in sixes, in order", () => {
    const [right, up, left, down] = makeAnims("x", "idle", 1, 8, TIGHT);
    expect(right).toMatchObject({ key: "x:idle-right", start: 24, end: 29 });
    expect(up).toMatchObject({ key: "x:idle-up", start: 30, end: 35 });
    expect(left).toMatchObject({ key: "x:idle-left", start: 36, end: 41 });
    expect(down).toMatchObject({ key: "x:idle-down", start: 42, end: 47 });
  });

  /** The player's own sheet is animated under bare keys, by the same sums. */
  it("numbers the unprefixed set the same way", () => {
    const anims = allAnims(TIGHT);
    expect(anims.map((a) => a.key)).toEqual([
      "idle-right",
      "idle-up",
      "idle-left",
      "idle-down",
      "walk-right",
      "walk-up",
      "walk-left",
      "walk-down",
    ]);
    expect(anims.find((a) => a.key === "walk-right")).toMatchObject({ start: 48, end: 53 });
  });

  /**
   * Every frame an animation asks for has to be inside a three-row sheet, or
   * the character blinks out on that facing.
   */
  it("keeps every frame it asks for inside a three-row tight sheet", () => {
    const last = TIGHT * 3 - 1;
    for (const anim of [
      ...makeAnims("x", "idle", 1, 8, TIGHT),
      ...makeAnims("x", "walk", 2, 10, TIGHT),
    ]) {
      expect(anim.start, anim.key).toBeGreaterThanOrEqual(0);
      expect(anim.end, anim.key).toBeLessThanOrEqual(last);
    }
  });
});
