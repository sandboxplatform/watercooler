import { describe, expect, it } from "vitest";
import {
  BEACHES,
  DOCKS,
  PAVED,
  SCENERY,
  TRAILS,
  WORLD_SIGNS,
  everyDoorReachable,
  groundTiles,
  propBody,
  propBounds,
  signBody,
  worldSolids,
  worldWater,
} from "./scenery";
import {
  BUILDINGS,
  DOCK,
  SHORE_ROW,
  TILE,
  WORLD_COLUMNS,
  WORLD_HEIGHT,
  WORLD_ROWS,
  WORLD_SPAWN,
  WORLD_WIDTH,
  buildingFrom,
} from "./tenants";
import { HIGHWAY, shoreAt } from "./wilderness";

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("ground", () => {
  const tiles = groundTiles();

  it("covers the whole map", () => {
    expect(tiles).toHaveLength(WORLD_ROWS);
    for (const row of tiles) expect(row).toHaveLength(WORLD_COLUMNS);
  });

  // A trail counts as unpaved ground here: the one out of the wood comes
  // down to the plaza's top edge, and the town's paving is raised above
  // trodden earth exactly as it is above grass, so that lip is a kerb too.
  it("puts a kerb only where paving meets open ground above it", () => {
    for (let y = 1; y < WORLD_ROWS; y++)
      for (let x = 0; x < WORLD_COLUMNS; x++) {
        if (tiles[y][x] === "kerb") expect(["grass", "trail"]).toContain(tiles[y - 1][x]);
        if (tiles[y][x] === "asphalt") continue;
        const underBuilding = BUILDINGS.some(
          (b) =>
            x * TILE >= b.frame.x &&
            x * TILE < b.frame.x + b.frame.width &&
            (y - 1) * TILE < b.frame.y + b.frame.height &&
            (y - 1) * TILE >= b.frame.y,
        );
        if (tiles[y][x] === "paving" && !underBuilding && tiles[y - 1][x] !== "asphalt")
          expect(tiles[y - 1][x]).not.toBe("grass");
      }
  });

  it("runs a path from every door down to the promenade, without a kerb at the door", () => {
    for (const b of BUILDINGS) {
      const col = Math.floor((b.door.x + b.door.width / 2) / TILE);
      // The door zone straddles the building's last row and the path's first.
      const from = Math.floor((b.door.y + b.door.height - 1) / TILE);
      if (b.art === "world-boat") {
        // The ferry is boarded from the dock, not a path.
        expect(tiles[from][col]).toBe("dock");
        continue;
      }
      expect(tiles[from][col], `${b.org.slug} door`).toBe("paving");
      for (let y = from; y < 18; y++) expect(tiles[y][col]).not.toBe("grass");
    }
    expect(tiles[Math.floor(WORLD_SPAWN.y / TILE)][Math.floor(WORLD_SPAWN.x / TILE)]).not.toBe(
      "grass",
    );
  });
});

describe("props", () => {
  it("stand inside the map", () => {
    const off = SCENERY.filter((p) => {
      const r = propBounds(p);
      return (
        r.x < -TILE ||
        r.y < -TILE ||
        r.x + r.width > WORLD_WIDTH + TILE ||
        r.y + r.height > WORLD_HEIGHT + TILE
      );
    });
    expect(off.map((p) => `${p.kind} at ${p.x},${p.y}`)).toEqual([]);
  });

  /**
   * The two sweeps below collect what is wrong and assert once, rather than
   * asserting per prop per zone. There are a couple of thousand props on the
   * map now and a few dozen zones apiece, and an `expect` inside that is
   * eighty thousand assertions built to say nothing — which is seconds, and
   * which timed out under the suite's own load while passing on its own.
   * What they check has not changed; the report is the same list it was.
   */
  it("keep their feet off the doors, the spawn points and the buildings", () => {
    const keepClear = [
      ...BUILDINGS.map((b) => b.door),
      ...BUILDINGS.map((b) => b.solid),
      ...BUILDINGS.map((b) => ({
        x: b.outside.x - 24,
        y: b.outside.y - 48,
        width: 48,
        height: 60,
      })),
      { x: WORLD_SPAWN.x - 24, y: WORLD_SPAWN.y - 48, width: 48, height: 60 },
    ];
    const inTheWay: string[] = [];
    for (const p of SCENERY) {
      const body = propBody(p);
      if (!body) continue;
      if (keepClear.some((zone) => overlaps(body, zone))) {
        inTheWay.push(`${p.kind} at ${p.x},${p.y}`);
      }
    }
    expect(inTheWay).toEqual([]);
  });

  it("stay off the walkways, apart from the benches and the fountain", () => {
    const paving = [...PAVED, ...DOCKS].map((r) => ({
      x: r.x * TILE,
      y: r.y * TILE,
      width: r.width * TILE,
      height: r.height * TILE,
    }));
    const onTheSlabs: string[] = [];
    for (const p of SCENERY) {
      if (p.kind === "bench" || p.kind === "fountain") continue;
      const body = propBody(p);
      if (!body) continue;
      if (paving.some((tile) => overlaps(body, tile))) {
        onTheSlabs.push(`${p.kind} at ${p.x},${p.y}`);
      }
    }
    expect(onTheSlabs).toEqual([]);
  });

  // Pictures rather than bodies, unlike the walkways above. A trunk beside a
  // trail is nothing to walk into; a canopy over one is a stretch of path
  // somebody walking it disappears behind, since everything out of doors
  // sorts by the bottom of its own picture. `WOOD_PROPS` holds the wood's own
  // scatter to this as it plants it — what this catches is the half of the
  // map placed by hand, where the trail arrived after the props did and three
  // of the plaza's stood in the middle of it.
  it("hang nothing over a trail", () => {
    const paths = TRAILS.map((r) => ({
      x: r.x * TILE,
      y: r.y * TILE,
      width: r.width * TILE,
      height: r.height * TILE,
    }));
    const over = SCENERY.filter((p) => paths.some((r) => overlaps(propBounds(p), r))).map(
      (p) => `${p.kind} at ${p.x},${p.y}`,
    );
    expect(over).toEqual([]);
  });

  // Collected and asserted once rather than asserted per pair: the wood
  // put the cast of props up past four hundred, and a quadratic sweep of
  // `expect` calls is ninety thousand of them, which times the test out on
  // the framework's own overhead rather than on anything it is measuring.
  it("do not stand on each other", () => {
    const bodies = SCENERY.map((p) => ({ p, body: propBody(p) })).filter((b) => b.body);
    const stacked: string[] = [];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (!overlaps(bodies[i].body!, bodies[j].body!)) continue;
        stacked.push(
          `${bodies[i].p.kind} at ${bodies[i].p.x},${bodies[i].p.y}` +
            ` and ${bodies[j].p.kind} at ${bodies[j].p.x},${bodies[j].p.y}`,
        );
      }
    }
    expect(stacked).toEqual([]);
  });

  it("leave every door reachable from the spawn", () => {
    expect(everyDoorReachable()).toBe(true);
  });
});

describe("the beaches", () => {
  const tiles = groundTiles();

  /**
   * The one thing this file can say about them that `wood.test.ts` cannot:
   * that the shingle survives the ground grid, which decides the water
   * first — a beach laid at the bank and then drawn over by the river would
   * pass every test about where it is and still not be on the map.
   */
  it("lay shingle on the bank, with the river at the foot of it", () => {
    expect(BEACHES.length).toBeGreaterThan(0);
    for (const beach of BEACHES)
      for (let x = beach.x; x < beach.x + beach.width; x++) {
        for (let y = beach.y; y < beach.y + beach.height; y++)
          expect(tiles[y][x], `${x},${y}`).toBe("shingle");
        const foot = beach.y + beach.height;
        expect(tiles[foot][x], `${x},${foot}`).toBe("water");
      }
  });
});

describe("the shore", () => {
  const tiles = groundTiles();
  const ferry = buildingFrom("apeiron-media")!;

  /**
   * **The coast is a shape now, not a row.** It was the same straight line
   * the whole width of the map, which was true enough while the map was the
   * town; carried east it would have run the beach out past the wilderness
   * and drowned the foot of the highway — a road that stops at a beach, with
   * the cars on it having nowhere to go. It steps south twice instead and
   * leaves the map before the road does, which is what this asks.
   */
  it("is sea from the coast down, except for the dock", () => {
    for (let x = 0; x < WORLD_COLUMNS; x++) {
      const shore = shoreAt(x);
      for (let y = SHORE_ROW; y < WORLD_ROWS; y++) {
        const onDock = x >= DOCK.x && x < DOCK.x + DOCK.width && y < DOCK.y + DOCK.height;
        if (onDock) {
          expect(tiles[y][x], `${x},${y}`).toBe("dock");
          continue;
        }
        expect(tiles[y][x] === "water", `${x},${y}`).toBe(shore !== null && y >= shore);
      }
      // The land runs right down to the water's edge, wherever that is.
      if (shore !== null) expect(tiles[shore - 1][x], `${x},${shore - 1}`).not.toBe("water");
    }
  });

  it("turns away before the highway, so the road runs off the bottom edge", () => {
    expect(shoreAt(HIGHWAY.x)).toBeNull();
    expect(tiles[WORLD_ROWS - 1][HIGHWAY.x]).toBe("highway");
  });

  it("runs the dock from the south road out over the water", () => {
    expect(tiles[DOCK.y - 1][DOCK.x]).toBe("paving");
    for (let y = DOCK.y; y < DOCK.y + DOCK.height; y++)
      for (let x = DOCK.x; x < DOCK.x + DOCK.width; x++) expect(tiles[y][x]).toBe("dock");
  });

  it("moors the ferry beside the end of the dock, boarded from the dock", () => {
    expect(ferry.art).toBe("world-boat");
    expect(ferry.frame.x).toBe((DOCK.x + DOCK.width) * TILE);
    expect(ferry.entrance).toEqual({ kind: "campus", campus: "apeiron-media" });
    const doorCol = Math.floor((ferry.door.x + ferry.door.width / 2) / TILE);
    const doorRow = Math.floor((ferry.door.y + ferry.door.height - 1) / TILE);
    expect(tiles[doorRow][doorCol]).toBe("dock");
    expect(ferry.arrive).toBe("up");
    // Back on the dock at the shore, out of the boarding zone.
    expect(
      overlaps({ x: ferry.outside.x, y: ferry.outside.y, width: 1, height: 1 }, ferry.door),
    ).toBe(false);
  });

  it("keeps the sea solid everywhere but the dock", () => {
    const water = worldWater();
    expect(water.length).toBeGreaterThan(0);
    for (const body of water) {
      for (const dock of DOCKS)
        expect(
          overlaps(body, {
            x: dock.x * TILE,
            y: dock.y * TILE,
            width: dock.width * TILE,
            height: dock.height * TILE,
          }),
        ).toBe(false);
    }
  });

  it("puts the board at the head of the dock, clear of the planks", () => {
    expect(WORLD_SIGNS.some((s) => /IRELAND/.test(s.text))).toBe(true);
    for (const sign of WORLD_SIGNS)
      for (const dock of DOCKS)
        expect(
          overlaps(signBody(sign), {
            x: dock.x * TILE,
            y: dock.y * TILE,
            width: dock.width * TILE,
            height: dock.height * TILE,
          }),
        ).toBe(false);
  });
});

/**
 * The route planner keeps its grid of blocked cells against this array's
 * identity, and `clearToStand` asks for the list on every step of a walk
 * along the row outside. Both of those are only affordable because the list
 * is the same list every time — it was rebuilt from scratch on each call,
 * the sea swept again for every question asked of it.
 */
describe("what is solid out of doors", () => {
  it("is worked out once and handed back as it is", () => {
    expect(worldSolids()).toBe(worldSolids());
  });
});
