import { describe, expect, it } from "vitest";
import {
  HIGHWAY,
  HIGHWAY_LANES,
  HIGHWAY_PX,
  SEA,
  WILD_FROM,
  WILD_PLANTING,
  WILD_POND,
  shoreAt,
} from "./wilderness";
import { SCENERY, allReachable, groundTiles, propPicture, worldSolids } from "./scenery";
import { riverBed } from "./wood";
import { WOOD_PLANTING } from "./wood";
import {
  BUILDINGS,
  TILE,
  WOOD_ROWS,
  WORLD_COLUMNS,
  WORLD_HEIGHT,
  WORLD_ROWS,
  WORLD_SPAWN,
  WORLD_WIDTH,
} from "./tenants";

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("the wilderness", () => {
  it("is a third of the map, east of the town, with nothing built in it", () => {
    expect(WILD_FROM).toBeLessThan(WORLD_COLUMNS);
    expect(WORLD_COLUMNS - WILD_FROM).toBeGreaterThan(WORLD_COLUMNS / 4);
    for (const b of BUILDINGS) {
      expect(b.frame.x, b.org.slug).toBeLessThan(WILD_FROM * TILE);
    }
  });

  /**
   * Thinner than the wood, and the difference is the whole point: the wood
   * above the town is a thing you cannot see the far side of, and this is
   * open ground with clumps in it. Walking east out of the car park should
   * read as leaving the town rather than as entering another wood.
   */
  it("is scattered more thinly than the wood", () => {
    const cells = (WORLD_COLUMNS - WILD_FROM) * (WORLD_ROWS - WOOD_ROWS);
    const woodCells = WORLD_COLUMNS * WOOD_ROWS;
    expect(WILD_PLANTING.length / cells).toBeLessThan(WOOD_PLANTING.length / woodCells / 2);
  });

  it("puts the pond somewhere a person can walk to", () => {
    expect(
      allReachable({ width: WORLD_WIDTH, height: WORLD_HEIGHT }, worldSolids(), WORLD_SPAWN, [
        { x: WILD_POND.x, y: WILD_POND.y + TILE },
      ]),
    ).toBe(true);
  });
});

describe("the highway", () => {
  const tiles = groundTiles();

  it("runs the whole height of the map, near the east edge", () => {
    expect(HIGHWAY.y).toBe(0);
    expect(HIGHWAY.y + HIGHWAY.height).toBe(WORLD_ROWS);
    expect(HIGHWAY.x + HIGHWAY.width).toBeLessThan(WORLD_COLUMNS);
    // A verge on the far side too: the camera is clamped to the map, so a
    // road drawn against the edge is a road with one shoulder on screen.
    expect(WORLD_COLUMNS - (HIGHWAY.x + HIGHWAY.width)).toBeGreaterThanOrEqual(2);
  });

  it("is tarmac of its own from top to bottom", () => {
    for (let y = 0; y < WORLD_ROWS; y++)
      for (let x = HIGHWAY.x; x < HIGHWAY.x + HIGHWAY.width; x++) {
        expect(tiles[y][x], `${x},${y}`).toBe("highway");
      }
  });

  /**
   * **Nothing crosses the Gold River**, and a road over it would be a
   * crossing. The river turns north and leaves by the top edge well short of
   * the tarmac, which is what keeps the far bank — the cabin, the boulder,
   * the beaches — the far bank.
   */
  it("never meets the river, so there is no bridge to build", () => {
    for (const run of riverBed()) {
      expect(overlaps(run, HIGHWAY), `river at ${run.x},${run.y}`).toBe(false);
    }
  });

  it("runs off the bottom edge rather than into the sea", () => {
    for (let x = HIGHWAY.x; x < HIGHWAY.x + HIGHWAY.width; x++) expect(shoreAt(x)).toBeNull();
    // And the sea is still the sea everywhere the town can see it.
    expect(shoreAt(0)).not.toBeNull();
    expect(SEA.length).toBeGreaterThan(1);
  });

  it("has nothing drawn over either lane", () => {
    for (const prop of SCENERY) {
      expect(
        overlaps(propPicture(prop), HIGHWAY_PX),
        `${prop.kind} at ${prop.x},${prop.y} over the road`,
      ).toBe(false);
    }
  });

  /**
   * Drive on the right: north in the eastern lane, south in the western one.
   * Two cars passing on the wrong sides of each other is the one thing about
   * a road anybody would notice from the far side of a meadow.
   */
  it("puts the northbound lane east of the southbound one", () => {
    expect(HIGHWAY_LANES.north).toBeGreaterThan(HIGHWAY_LANES.south);
    for (const x of Object.values(HIGHWAY_LANES)) {
      expect(x).toBeGreaterThan(HIGHWAY_PX.x);
      expect(x).toBeLessThan(HIGHWAY_PX.x + HIGHWAY_PX.width);
    }
  });

  /** It is ground, not a wall: you can walk out and stand on it. */
  it("can be walked to", () => {
    expect(
      allReachable({ width: WORLD_WIDTH, height: WORLD_HEIGHT }, worldSolids(), WORLD_SPAWN, [
        { x: HIGHWAY_LANES.south, y: HIGHWAY_PX.height / 2 },
      ]),
    ).toBe(true);
  });
});
