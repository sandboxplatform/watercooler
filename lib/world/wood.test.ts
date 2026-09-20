import { describe, expect, it } from "vitest";
import {
  RIVER,
  WOOD_BEACHES,
  WOOD_BOULDER,
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
  TOWN_COLUMNS,
  TOWN_LEFT,
  WOOD_ROWS,
  WORLD_COLUMNS,
  WORLD_HEIGHT,
  WORLD_SPAWN,
  WORLD_WIDTH,
  type Rect,
} from "./tenants";
import { HIGHWAY } from "./wilderness";

/**
 * The town's first column.
 *
 * Every column in here is written in the town's own, because the river is:
 * the drawing it was traced off is fitted across the town and nothing else,
 * so a shape asserted in world columns would be an assertion about where the
 * shops happen to stand. See `TOWN` in wood.ts, which is the same number for
 * the same reason.
 */
const TOWN = TOWN_LEFT / TILE;

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

/**
 * The bends over the town: the stretch the drawing traced, which is what
 * "the shape" below means.
 *
 * The tail east of the town climbs back to the top edge, so it puts points
 * high up the map that are nothing to do with the limb coming down — and
 * two of the shape's assertions work by taking the highest or the furthest
 * east of the bends above a given row. Left in, the tail wins both.
 */
const TRACED_BENDS = RIVER.filter((b) => b.x < TOWN + TOWN_COLUMNS);

describe("the Gold River", () => {
  it("comes in off the top edge and runs the town's whole width", () => {
    const bed = riverBed();
    const wetAt = (column: number) => bed.filter((r) => r.x <= column && r.x + r.width > column);
    expect(bed.some((r) => r.y === 0)).toBe(true);
    for (let column = TOWN + 10; column < TOWN + TOWN_COLUMNS; column++) {
      // West of where it comes down there is no river, which is the corner
      // of the town the wood is thickest in.
      expect(wetAt(column).length, `column ${column}`).toBeGreaterThan(0);
    }
    // And **west of the town there is none at all.** The limb comes down out
    // of the north of the town, so the shops' stretch is wood with no water
    // in it — which is what the fit says, and the thing that would quietly
    // stop being true if the river were ever stretched across the map again.
    expect(wetAt(TOWN - 4)).toHaveLength(0);
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
      const falling = TRACED_BENDS.filter((b) => b.y < WOOD_ROWS / 2);
      const bulge = falling.reduce((a, b) => (a.x > b.x ? a : b));
      const turn = falling.slice(falling.indexOf(bulge)).reduce((a, b) => (a.x < b.x ? a : b));
      expect(bulge.x).toBeGreaterThan(RIVER[1].x + 4);
      expect(turn.x).toBeLessThan(bulge.x - 2);
      expect(turn.y).toBeGreaterThan(bulge.y + 4);
    });

    it("elbows east about halfway down the wood", () => {
      const elbow = RIVER.find((b, i) => i > 0 && b.x > RIVER[i - 1].x && b.y > WOOD_ROWS / 3)!;
      expect(elbow.y / WOOD_ROWS).toBeGreaterThan(0.4);
      expect(elbow.y / WOOD_ROWS).toBeLessThan(0.6);
    });

    it("runs shallow, then drops steeply, then flattens out", () => {
      const shallow = slope(TOWN + 20, TOWN + 28);
      const steep = slope(TOWN + 32, TOWN + 38);
      const flat = slope(TOWN + 44, TOWN + 54);
      expect(steep).toBeGreaterThan(shallow * 4);
      expect(flat).toBeLessThan(shallow * 2);
    });

    it("dips once more on the way out of the town", () => {
      expect(rowAt(TOWN + TOWN_COLUMNS - 1)).toBeGreaterThan(rowAt(TOWN + TOWN_COLUMNS - 8) + 0.5);
    });

    /**
     * **And then it turns north, which is what keeps the far bank the far
     * bank.** The highway runs the height of the map four columns in from the
     * east edge; a river carried on east would have to be crossed, and a
     * crossing is a way onto the north side of the water — where the cabin
     * and the marked boulder stand precisely because there is not one. So the
     * water leaves by the edge it came in at, well short of the road.
     */
    it("turns north out of the wilderness and leaves clear of the highway", () => {
      const out = riverBed().filter((r) => r.y === 0);
      // Two runs on the top row: the limb coming down in the north-west of
      // the town, and the tail going back up out in the wilderness.
      expect(out).toHaveLength(2);
      const east = out.reduce((a, b) => (a.x > b.x ? a : b));
      expect(east.x).toBeGreaterThan(TOWN + TOWN_COLUMNS);
      expect(east.x + east.width).toBeLessThan(HIGHWAY.x);
      // Off the map rather than at the edge of it: a river that ends on the
      // last row ends with a blunt end, which is why the first traced point
      // is off the top too.
      expect(RIVER[RIVER.length - 1].y).toBeLessThan(0);
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
      const limb = TRACED_BENDS.filter((b) => b.y > WOOD_ROWS / 4 && b.y < WOOD_ROWS / 2);
      const down = Math.atan2(
        limb[limb.length - 1].y - limb[0].y,
        limb[limb.length - 1].x - limb[0].x,
      );
      const east = Math.atan2(slope(TOWN + 16, TOWN + 26), 1);
      expect(Math.abs((down - east) * (180 / Math.PI))).toBeGreaterThan(45);
    });

    it("at the head of the drop, where the wood pokes north-east into it", () => {
      expect(turn([TOWN + 20, TOWN + 28], [TOWN + 32, TOWN + 37])).toBeGreaterThan(20);
    });

    it("at the foot of the drop, where it pokes back south-west", () => {
      expect(turn([TOWN + 32, TOWN + 37], [TOWN + 42, TOWN + 54])).toBeGreaterThan(20);
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

describe("the boulder in the river", () => {
  const boulder = { kind: "boulder", ...WOOD_BOULDER } as const;
  const tile = { x: Math.floor(WOOD_BOULDER.x / TILE), y: WOOD_BOULDER.y / TILE - 1 };

  /**
   * In the water, which is the one thing about it: a rock with a cross on
   * it standing on the bank is a rock somebody could have walked up to and
   * did not. Both of its numbers come off the shoulder beach, so this is
   * the assertion that keeps it wet when a bend moves the beach.
   */
  it("stands in the river, at the foot of the shoulder beach", () => {
    const wet = riverBed().some((r) => tile.x >= r.x && tile.x < r.x + r.width && tile.y === r.y);
    expect(wet, `(${tile.x}, ${tile.y}) is not river`).toBe(true);
    const beach = WOOD_BEACHES[0];
    expect(tile.y).toBe(beach.y + beach.height);
    expect(tile.x).toBe(beach.x - 1);
  });

  /** Off the corner of the shingle, not under it. */
  it("stands beside the shingle rather than on it", () => {
    for (const beach of WOOD_BEACHES) {
      const on =
        tile.x >= beach.x &&
        tile.x < beach.x + beach.width &&
        tile.y >= beach.y &&
        tile.y < beach.y + beach.height;
      expect(on).toBe(false);
    }
  });

  /** Nothing crosses the water, so nobody reaches it either. */
  it("is across the water, so nobody can walk to it", () => {
    const map = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    expect(
      allReachable(map, worldSolids(), WORLD_SPAWN, [{ x: WOOD_BOULDER.x, y: WOOD_BOULDER.y }]),
      "a rock in the river should have no way to it",
    ).toBe(false);
  });

  /**
   * Solid, and the footprint buys nothing where it stands — the tile is
   * water and water is already solid. What this says is that it has not
   * grown out of its own tile into one somebody walks on.
   */
  it("is solid, and nowhere near anything walkable", () => {
    const body = propBody(boulder);
    expect(body).not.toBeNull();
    const river = riverBed().map(inPixels);
    expect(river.some((r) => overlaps(body!, r))).toBe(true);
    expect(
      river.every(
        (r) => !overlaps(body!, r) || (body!.x >= r.x && body!.x + body!.width <= r.x + r.width),
      ),
    ).toBe(true);
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
