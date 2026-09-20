import { describe, expect, it } from "vitest";
import {
  RIVER,
  WOOD_BEACHES,
  WOOD_CABIN,
  WOOD_TRAILS,
  WOOD_WANDER_SPOTS,
  drawnOver,
  northBank,
  riverBanks,
  riverBed,
  southBank,
} from "./wood";
import { SCENERY, allReachable, propBody, propPicture, worldSolids } from "./scenery";
import { openGround, ROUTE_CELL } from "./route";
import {
  TILE,
  WOOD_ROWS,
  WORLD_COLUMNS,
  WORLD_HEIGHT,
  WORLD_SPAWN,
  WORLD_WIDTH,
  type Rect,
} from "./tenants";

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const inPixels = (r: Rect): Rect => ({
  x: r.x * TILE,
  y: r.y * TILE,
  width: r.width * TILE,
  height: r.height * TILE,
});

/** Where the centreline is at a column, by walking the bends. */
function rowAt(column: number): number {
  for (let i = 1; i < RIVER.length; i++) {
    const a = RIVER[i - 1];
    const b = RIVER[i];
    if (column < Math.min(a.x, b.x) || column > Math.max(a.x, b.x)) continue;
    return a.y + ((b.y - a.y) * (column - a.x)) / (b.x - a.x);
  }
  throw new Error(`the river does not reach column ${column}`);
}

/** How fast the centreline falls between two columns, in rows per column. */
const slope = (from: number, to: number) => (rowAt(to) - rowAt(from)) / (to - from);

describe("the Gold River", () => {
  it("comes in off the top edge and runs the whole width of the map", () => {
    const bed = riverBed();
    expect(bed.some((r) => r.y === 0)).toBe(true);
    for (let column = 0; column < WORLD_COLUMNS; column++) {
      const wet = bed.filter((r) => r.x <= column && r.x + r.width > column);
      // West of where it comes down there is no river, which is the corner
      // of the map the wood is thickest in.
      if (column < 10) continue;
      expect(wet.length, `column ${column}`).toBeGreaterThan(0);
    }
  });

  /**
   * The shape is a soft W and this is what holds it to one: three of these
   * four were lost the first time it was traced, and the river read as a
   * diagonal band with a squiggle on the end. Written as comparisons rather
   * than as coordinates, since the wood's depth is allowed to change and the
   * shape is not.
   */
  describe("keeps its shape", () => {
    it("leans east as it falls, and then turns back west", () => {
      const falling = RIVER.filter((b) => b.y < WOOD_ROWS / 2);
      const bulge = falling.reduce((a, b) => (a.x > b.x ? a : b));
      const turn = falling.slice(falling.indexOf(bulge)).reduce((a, b) => (a.x < b.x ? a : b));
      expect(bulge.x).toBeGreaterThan(RIVER[1].x + 4);
      expect(turn.x).toBeLessThan(bulge.x - 2);
      expect(turn.y).toBeGreaterThan(bulge.y + 4);
      expect(RIVER[RIVER.length - 1].x).toBeGreaterThan(WORLD_COLUMNS);
    });

    it("elbows east about halfway down the wood", () => {
      const elbow = RIVER.find((b, i) => i > 0 && b.x > RIVER[i - 1].x && b.y > WOOD_ROWS / 3)!;
      expect(elbow.y / WOOD_ROWS).toBeGreaterThan(0.4);
      expect(elbow.y / WOOD_ROWS).toBeLessThan(0.6);
    });

    it("runs shallow, then drops steeply, then flattens out", () => {
      const shallow = slope(20, 28);
      const steep = slope(32, 38);
      const flat = slope(44, 54);
      expect(steep).toBeGreaterThan(shallow * 4);
      expect(flat).toBeLessThan(shallow * 2);
    });

    it("dips once more on the way off the map", () => {
      expect(rowAt(WORLD_COLUMNS - 1)).toBeGreaterThan(rowAt(WORLD_COLUMNS - 8) + 0.5);
    });
  });

  /**
   * **The corners are the point, not the line.** Each of the three turns
   * crops a wedge of wood out of the bank on the inside of it, and those
   * wedges are what make the wood a few little places instead of one strip
   * — so they are asserted as angles rather than as slopes, since an angle
   * is exactly what the fit's squash takes away. Twenty degrees is well
   * under what the river turns and well over a bevel.
   */
  describe("turns hard enough to crop the land", () => {
    const turn = (before: [number, number], after: [number, number]) => {
      const a = Math.atan2(slope(...before), 1);
      const b = Math.atan2(slope(...after), 1);
      return Math.abs((b - a) * (180 / Math.PI));
    };

    it("under the elbow, where the limb gives way to the run east", () => {
      const limb = RIVER.filter((b) => b.y > WOOD_ROWS / 4 && b.y < WOOD_ROWS / 2);
      const down = Math.atan2(
        limb[limb.length - 1].y - limb[0].y,
        limb[limb.length - 1].x - limb[0].x,
      );
      const east = Math.atan2(slope(16, 26), 1);
      expect(Math.abs((down - east) * (180 / Math.PI))).toBeGreaterThan(45);
    });

    it("at the head of the drop, where the wood pokes north-east into it", () => {
      expect(turn([20, 28], [32, 37])).toBeGreaterThan(20);
    });

    it("at the foot of the drop, where it pokes back south-west", () => {
      expect(turn([32, 37], [42, 54])).toBeGreaterThan(20);
    });

    /**
     * The elbow's is the one wedge with water on two sides of it, so it is
     * the one that can be counted rather than measured: a column with two
     * runs of river in it has land between them.
     */
    it("leaves a tongue of wood between the limb and the run east", () => {
      const columns = [];
      for (let column = 0; column < WORLD_COLUMNS; column++) {
        const runs = riverBed().filter((r) => r.x <= column && r.x + r.width > column);
        if (runs.length > 1) columns.push(column);
      }
      expect(columns.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("nobody in the river", () => {
  const bed = riverBed().map(inPixels);
  const map = { width: WORLD_WIDTH, height: WORLD_HEIGHT };

  /**
   * The whole of it. Keeping feet out of the water is not the same as
   * keeping a person out of the river — a character is drawn a good way
   * above where they stand — so this asks the question the way the map
   * answers it: every place in the wood the route planner calls open, with
   * the figure that would be drawn there.
   */
  it("leaves nowhere in the wood to stand and be drawn in the water", () => {
    const solids = worldSolids();
    const wet: string[] = [];
    for (let y = ROUTE_CELL / 2; y < WOOD_ROWS * TILE; y += ROUTE_CELL) {
      for (let x = ROUTE_CELL / 2; x < WORLD_WIDTH; x += ROUTE_CELL) {
        const at = { x, y };
        if (!openGround(map, solids, at)) continue;
        if (bed.some((r) => overlaps(drawnOver(at), r))) wet.push(`${x},${y}`);
      }
    }
    expect(wet).toEqual([]);
  });

  it("stands every wanderer's place in the wood clear of the water", () => {
    for (const spot of WOOD_WANDER_SPOTS) {
      const over = bed.find((r) => overlaps(drawnOver(spot), r));
      expect(over, `${spot.x},${spot.y}`).toBeUndefined();
    }
  });

  it("puts every one of them on a trail", () => {
    for (const spot of WOOD_WANDER_SPOTS) {
      const on = WOOD_TRAILS.map(inPixels).find(
        (r) => spot.x >= r.x && spot.x < r.x + r.width && spot.y >= r.y && spot.y < r.y + r.height,
      );
      expect(on, `${spot.x},${spot.y}`).toBeDefined();
    }
  });

  /** The bank is a solid of its own, so it has to be beside the water rather than on it. */
  it("grows the banks out of the water rather than into it", () => {
    for (const bank of riverBanks()) {
      expect(bed.some((r) => overlaps(bank, r))).toBe(true);
    }
    expect(riverBanks()).toHaveLength(riverBed().length);
  });
});

describe("the cabin on the far bank", () => {
  const cabin = { kind: "cabin", ...WOOD_CABIN } as const;

  /**
   * Two rows back from it, which is the whole difference between a house
   * looking at a beach and a house standing in the river: the cabin's
   * picture hangs a row and a half above its feet, so feet on the water's
   * own edge put its porch over the water.
   */
  it("stands on dry land, two rows back from the water", () => {
    const foot = { x: WOOD_CABIN.x / TILE, y: WOOD_CABIN.y / TILE - 0.5 };
    const wet = riverBed().some(
      (r) => foot.x >= r.x && foot.x < r.x + r.width && foot.y >= r.y && foot.y < r.y + r.height,
    );
    expect(wet).toBe(false);
    expect(foot.y).toBe(northBank(Math.floor(foot.x)) - 1.5);
  });

  /** And the beach is what is in between, which is why it moved back. */
  it("looks out over the shingle", () => {
    const column = Math.floor(WOOD_CABIN.x / TILE);
    const beach = WOOD_BEACHES.find((r) => column >= r.x && column < r.x + r.width);
    expect(beach, "no beach below the cabin").toBeDefined();
    expect(beach!.y * TILE).toBeGreaterThan(WOOD_CABIN.y);
  });

  /**
   * On the tongue the first valley leaves, rather than anywhere along the
   * bank: it is the one place the far side comes far enough south to be
   * looked at from the walk, and the reason the valley is there at all.
   */
  it("stands on the tongue of wood the first valley leaves", () => {
    const column = Math.floor(WOOD_CABIN.x / TILE);
    const here = northBank(column);
    expect(here).toBeGreaterThan(northBank(column - 6) + 1);
    expect(here).toBeGreaterThan(northBank(column + 10) + 1);
  });

  /** Nobody crosses the river, so nobody reaches it — which is the point. */
  it("is across the water, so nobody can walk to it", () => {
    const map = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    const at = { x: WOOD_CABIN.x, y: WOOD_CABIN.y - TILE };
    expect(
      allReachable(map, worldSolids(), WORLD_SPAWN, [at]),
      "the far bank should have no way to it",
    ).toBe(false);
  });

  it("is solid, and has no trees drawn over it", () => {
    expect(propBody(cabin)).not.toBeNull();
    const picture = propPicture(cabin);
    for (const prop of SCENERY) {
      if (prop === cabin || prop.kind === "cabin") continue;
      expect(
        overlaps(propPicture(prop), picture),
        `${prop.kind} at ${prop.x},${prop.y} over the cabin`,
      ).toBe(false);
    }
  });
});

describe("the beaches on the far bank", () => {
  /**
   * Which row each one lies on is read off `northBank`, so this is the
   * assertion that keeps them beaches when a bend moves rather than strips
   * of stone in the trees or under the water.
   */
  it("lie on the last dry rows, with the water lapping at them", () => {
    const wet = (column: number, row: number) =>
      riverBed().some((r) => row === r.y && column >= r.x && column < r.x + r.width);
    for (const beach of WOOD_BEACHES)
      for (let column = beach.x; column < beach.x + beach.width; column++) {
        for (let row = beach.y; row < beach.y + beach.height; row++)
          expect(wet(column, row), `beach at ${column},${row} is in the water`).toBe(false);
        const foot = beach.y + beach.height;
        expect(wet(column, foot), `beach at ${column},${foot - 1} is not on the water`).toBe(true);
      }
  });

  /**
   * **A shelf, not a staircase.** The bank steps down a row inside the
   * shoulder's run, and a beach a tile deep left the strip of river between
   * the two levels showing as a notch bitten out of the middle of it. It
   * takes both rows and the river gives them up, so what is asserted is that
   * the shingle reaches every row the bank does across its own run — which
   * is the same thing as the water's edge coming out straight along the foot
   * of it, above.
   */
  it("square off the step where the bank falls inside one", () => {
    expect(
      WOOD_BEACHES.some((r) => r.height > 1),
      "no beach spans a step in the bank",
    ).toBe(true);
    for (const beach of WOOD_BEACHES) {
      const rows = [];
      for (let column = beach.x; column < beach.x + beach.width; column++)
        rows.push(northBank(column));
      expect(new Set(rows).size, `the water's edge staircases under ${beach.x},${beach.y}`).toBe(1);
    }
  });

  /**
   * The far bank, like the cabin: shingle is ground somebody would expect to
   * walk down to the water on, and nothing crosses the water.
   */
  it("are across the river, so nobody can walk onto them", () => {
    const map = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    const spots = WOOD_BEACHES.map((r) => ({
      x: (r.x + r.width / 2) * TILE,
      y: (r.y + 0.5) * TILE,
    }));
    expect(allReachable(map, worldSolids(), WORLD_SPAWN, spots)).toBe(false);
  });

  it("have nothing standing on them", () => {
    for (const prop of SCENERY) {
      const column = Math.floor(prop.x / TILE);
      const row = Math.floor((prop.y - 1) / TILE);
      for (const beach of WOOD_BEACHES)
        expect(
          row >= beach.y &&
            row < beach.y + beach.height &&
            column >= beach.x &&
            column < beach.x + beach.width,
          `${prop.kind} standing on the shingle at ${column},${row}`,
        ).toBe(false);
    }
  });
});

describe("the walk along the bank", () => {
  const bank = WOOD_TRAILS.slice(1);

  it("follows the water down rather than running in one row", () => {
    const rows = bank.map((r) => r.y);
    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(5);
  });

  it("stays beside the river the whole way", () => {
    for (const run of bank) {
      for (let column = run.x; column < run.x + run.width; column++) {
        const dry = southBank(column, 1);
        expect(run.y, `column ${column}`).toBeGreaterThanOrEqual(dry);
        expect(run.y, `column ${column}`).toBeLessThanOrEqual(dry + 2);
      }
    }
  });

  /**
   * Each step shares a row with the next, or the corner between them only
   * touches diagonally and the walk is two walks. `residents.test.ts` would
   * catch it as a spot nobody can reach; this says which corner.
   */
  it("joins up at every step", () => {
    for (let i = 1; i < bank.length; i++) {
      const before = bank[i - 1];
      const after = bank[i];
      expect(after.x, `${JSON.stringify(after)}`).toBe(before.x + before.width);
      expect(Math.abs(after.y - before.y), `${JSON.stringify(after)}`).toBeLessThanOrEqual(1);
    }
  });
});
