import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { decodePng, type Bitmap } from "../png";
import { FRAME_H, FRAME_W, SHEET_H, SHEET_W } from "../compose";
import {
  ANIMATED_FRAMES,
  describeSheetFaults,
  emptySlots,
  hasOpaqueBackdrop,
  isExactSheet,
  MIN_EXACT_HEIGHT,
  MIN_EXACT_WIDTH,
  sheetFaults,
  slotName,
  transparentPixels,
  whyNotExact,
} from "../exact";

const library = decodePng(
  readFileSync(join(process.cwd(), "public/characters/Premade_Character_48x48_09.png")),
);

/** An empty sheet: the right shape, fully transparent. */
function blankSheet(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height * 4), colourType: 6 };
}

/** The same, flooded with one opaque colour — a sheet on a backdrop. */
function onColour(width: number, height: number, rgb: [number, number, number]): Bitmap {
  const sheet = blankSheet(width, height);
  for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([...rgb, 255], i);
  return sheet;
}

describe("isExactSheet", () => {
  it("accepts one of the pack's own sheets", () => {
    expect(isExactSheet(library)).toBe(true);
  });

  /** The shape this exists for: only the frames the game animates. */
  it("accepts a tight sheet, twenty-four columns by three rows", () => {
    expect(isExactSheet(blankSheet(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT))).toBe(true);
    expect(MIN_EXACT_WIDTH).toBe(1152);
    expect(MIN_EXACT_HEIGHT).toBe(288);
  });

  it("accepts a minimal sheet at the pack's width too", () => {
    expect(isExactSheet(blankSheet(SHEET_W, MIN_EXACT_HEIGHT))).toBe(true);
  });

  /**
   * Width is the one thing that says a sheet really is in this format. The
   * loose illustration grids are 1536 across — a whole 32 frames — so a
   * divisibility rule would wave one through to animate from nonsense.
   */
  it("rejects a width that is neither, even a tidy multiple of a frame", () => {
    expect(1536 % FRAME_W).toBe(0);
    expect(isExactSheet(blankSheet(1536, 1024))).toBe(false);
    expect(isExactSheet(blankSheet(SHEET_W - FRAME_W, SHEET_H))).toBe(false);
    expect(isExactSheet(blankSheet(MIN_EXACT_WIDTH - FRAME_W, MIN_EXACT_HEIGHT))).toBe(false);
  });

  it("rejects a sheet too short to hold the three rows the game reads", () => {
    expect(isExactSheet(blankSheet(SHEET_W, FRAME_H * 2))).toBe(false);
    expect(isExactSheet(blankSheet(MIN_EXACT_WIDTH, FRAME_H * 2))).toBe(false);
  });

  /**
   * And not a whole number of rows: the pack's sheets end on a half one, and
   * the game floors the count so the part row is simply ignored.
   */
  it("does not insist on whole rows", () => {
    expect(SHEET_H % FRAME_H).not.toBe(0);
    expect(isExactSheet(blankSheet(SHEET_W, FRAME_H * 3 + 10))).toBe(true);
  });
});

/**
 * The refusal. `isExactSheet` is geometry alone; this is the question a caller
 * deciding whether to install something should actually be asking, and an
 * empty list is the only thing that means yes.
 */
describe("sheetFaults", () => {
  const kinds = (image: Bitmap) => sheetFaults(image).map((f) => f.kind);

  it("finds nothing wrong with a sheet the game can animate as it came", () => {
    expect(sheetFaults(library)).toEqual([]);
    expect(whyNotExact(library)).toBeNull();
  });

  it("reports every fault at once, not the first one it meets", () => {
    // The shape a loose illustration grid actually arrives in.
    const loose = onColour(1536, 1024, [0, 0, 0]);
    expect(kinds(loose)).toEqual(["width", "nothing-transparent"]);
  });

  it("names both accepted widths, so the answer is in the message", () => {
    const found = sheetFaults(blankSheet(1536, 1024))[0];
    expect(found.kind).toBe("width");
    expect(found.found).toContain("1536px wide");
    expect(found.found).toContain("32 frames");
    expect(found.wanted).toContain("1152");
    expect(found.wanted).toContain("2688");
  });

  it("says how many rows a short sheet actually has", () => {
    const found = sheetFaults(blankSheet(MIN_EXACT_WIDTH, FRAME_H))[0];
    expect(found.kind).toBe("height");
    expect(found.found).toContain("1.00 rows");
    expect(found.wanted).toContain("288");
  });

  /**
   * A PNG with no alpha channel cannot be transparent, whatever colour its
   * background is, and saying so is a far more useful message than telling
   * somebody their background is wrong.
   */
  it("says when the file has no alpha channel at all", () => {
    const rgb = onColour(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT, [255, 255, 255]);
    rgb.colourType = 2;
    const found = sheetFaults(rgb)[0];
    expect(found.kind).toBe("no-alpha-channel");
    expect(found.found).toContain("colour type 2");
    expect(found.wanted).toContain("colour type 6");
  });

  it("takes an indexed sheet with transparency as cut out", () => {
    const indexed = blankSheet(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT);
    indexed.colourType = 3;
    expect(sheetFaults(indexed)).toEqual([]);
  });

  it("spots a sheet delivered on a flat colour", () => {
    expect(kinds(onColour(SHEET_W, SHEET_H, [0, 0, 0]))).toEqual(["nothing-transparent"]);
    expect(hasOpaqueBackdrop(onColour(SHEET_W, SHEET_H, [0, 0, 0]))).toBe(true);
  });

  /**
   * The one that actually turned up, and the one the old check missed.
   *
   * A sheet exported with the editor's transparency checkerboard baked into
   * the pixels: opaque everywhere, and its four corners four different
   * colours. The backdrop test used to require the corners to agree within a
   * tolerance, so this passed as "already cut out" — the sheet would have
   * been installed and drawn with a grey chequer behind every frame.
   */
  it("spots the editor's checkerboard saved as real pixels", () => {
    const sheet = blankSheet(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT);
    const SQUARE = 20; // the delivered one measured 19-20
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        const light = (Math.floor(x / SQUARE) + Math.floor(y / SQUARE)) % 2 === 0;
        const tone = light ? 254 : 241;
        sheet.data.set([tone, tone, tone, 255], (y * sheet.width + x) * 4);
      }
    }
    // The four corners land on different squares, which is exactly what
    // used to save a sheet like this: a rule asking whether they agree on a
    // colour answers no, and reads that as "already cut out".
    const corner = (x: number, y: number) => sheet.data[(y * sheet.width + x) * 4];
    const corners = [
      corner(1, 1),
      corner(sheet.width - 2, 1),
      corner(1, sheet.height - 2),
      corner(sheet.width - 2, sheet.height - 2),
    ];
    expect(new Set(corners).size).toBeGreaterThan(1);
    expect(kinds(sheet)).toEqual(["nothing-transparent"]);
    expect(hasOpaqueBackdrop(sheet)).toBe(true);
  });

  /** Likewise a gradient: not agreeing on a colour is not evidence of transparency. */
  it("spots a graduated backdrop", () => {
    const sheet = blankSheet(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT);
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        const tone = Math.floor((x / sheet.width) * 255);
        sheet.data.set([tone, tone, tone, 255], (y * sheet.width + x) * 4);
      }
    }
    expect(hasOpaqueBackdrop(sheet)).toBe(true);
  });

  /**
   * Transparency somewhere but not in the corners: a figure cut out and then
   * dropped onto a coloured card, which is a real export mistake.
   */
  it("spots a backdrop behind art that is otherwise cut out", () => {
    const sheet = onColour(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT, [30, 30, 60]);
    // Punch a hole in the middle, well away from the corners.
    for (let y = 100; y < 200; y++)
      for (let x = 400; x < 600; x++) sheet.data[(y * sheet.width + x) * 4 + 3] = 0;
    expect(transparentPixels(sheet)).toBe(100 * 200);
    expect(kinds(sheet)).toEqual(["backdrop"]);
    expect(sheetFaults(sheet)[0].found).toContain("rgb(30,30,60)");
  });

  it("says nothing of a sheet that is already cut out", () => {
    expect(hasOpaqueBackdrop(library)).toBe(false);
    expect(transparentPixels(library)).toBeGreaterThan(0);
  });
});

describe("describeSheetFaults", () => {
  const report = describeSheetFaults(sheetFaults(onColour(1536, 1024, [0, 0, 0])), "doc.png");

  it("names the file, every fault, and what was wanted instead", () => {
    expect(report).toContain("doc.png cannot be installed");
    expect(report).toContain("1536px wide");
    expect(report).toContain("every one of its 1572864 pixels opaque");
    expect(report.match(/wanted:/g) ?? []).toHaveLength(2);
  });

  /** The refusal has to be enough to redraw from without asking anything. */
  it("sets out the whole format underneath", () => {
    expect(report).toContain("48x96 frames, 24 columns x 3 rows (1152x288)");
    expect(report).toContain("Row 0 blank, row 1 idle, row 2 walk");
    expect(report).toContain("6 frames each of right, up, left, down");
    expect(report).toContain("Left is drawn, not mirrored");
    expect(report).toContain("transparent background");
    expect(report).toContain("Character_Template_48x48.png");
  });
});

describe("emptySlots", () => {
  it("finds nothing missing on a library sheet", () => {
    expect(emptySlots(library)).toEqual([]);
  });

  it("names every empty animated slot on a blank sheet", () => {
    const empty = emptySlots(blankSheet(SHEET_W, SHEET_H));
    expect(empty).toHaveLength(ANIMATED_FRAMES);
    expect(ANIMATED_FRAMES).toBe(48);
    expect(empty[0]).toBe("idle right #1");
    expect(empty[23]).toBe("idle down #6");
    expect(empty[47]).toBe("walk down #6");
  });

  it("names exactly the slot that was left empty", () => {
    // Both animated rows drawn, then one slot wiped out again.
    const sheet = blankSheet(MIN_EXACT_WIDTH, MIN_EXACT_HEIGHT);
    for (let y = FRAME_H; y < FRAME_H * 3; y++)
      for (let x = 0; x < sheet.width; x++) sheet.data[(y * sheet.width + x) * 4 + 3] = 255;
    const col = 6 + 2; // idle up #3
    for (let y = FRAME_H; y < FRAME_H * 2; y++)
      for (let x = col * FRAME_W; x < (col + 1) * FRAME_W; x++)
        sheet.data[(y * sheet.width + x) * 4 + 3] = 0;
    expect(emptySlots(sheet)).toEqual(["idle up #3"]);
  });

  it("ignores the rows the game never reads", () => {
    const sheet = blankSheet(SHEET_W, SHEET_H);
    for (const row of [1, 2]) {
      for (let y = 0; y < FRAME_H; y++) {
        const start = (row * FRAME_H + y) * SHEET_W * 4;
        for (let x = 0; x < 24 * FRAME_W; x++) sheet.data[start + x * 4 + 3] = 255;
      }
    }
    expect(emptySlots(sheet)).toEqual([]);
  });
});

describe("slotName", () => {
  it("reads the way the layout is documented", () => {
    expect(slotName(1, 0)).toBe("idle right #1");
    expect(slotName(2, 17)).toBe("walk left #6");
  });
});

/**
 * The art we ship, held to the format it is supposed to arrive in.
 *
 * This is the promise that lets the build script do nothing to a sheet but
 * write it out. If one of these ever stops being an exact sheet, the honest
 * answer is to fix that sheet — not to put a pipeline back in front of it.
 */
describe("the shipped sheets", () => {
  const dir = join(process.cwd(), "public/characters");
  const sheets = readdirSync(dir).filter((f) => f.endsWith("_48x48.png"));

  it("is not an empty list, or this suite proves nothing", () => {
    expect(sheets.length).toBeGreaterThan(5);
  });

  for (const file of sheets) {
    describe(file, () => {
      const image = decodePng(readFileSync(join(dir, file)));

      it("would be installed rather than refused", () => {
        expect(sheetFaults(image)).toEqual([]);
        expect(isExactSheet(image)).toBe(true);
      });

      it("has every animated frame drawn", () => {
        expect(emptySlots(image)).toEqual([]);
      });
    });
  }
});
