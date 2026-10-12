import { describe, expect, it } from "vitest";
import { Pathfinder } from "../Pathfinder";
import { PF_PADDING } from "@/lib/constants";
import { worldWanderSpots } from "@/lib/world/residents";
import { worldSolids } from "@/lib/world/scenery";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@/lib/world/tenants";

/**
 * The route planner at the world map's size: a grid of over a hundred
 * thousand cells and a few thousand solids. It took two seconds to build at
 * this size and gave up on a third of long walks; both are what this holds.
 */

const WIDTH = 8928;
const HEIGHT = 3312;

/**
 * A wood with a lane through it: a lattice of small trunks across the whole
 * map, and a wall down the middle with one gap at the far end, so the only
 * way from the west edge to the east is the long way round.
 */
function forest() {
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (let y = 60; y < HEIGHT - 60; y += 72) {
    for (let x = 60; x < WIDTH - 60; x += 72) {
      if (Math.abs(x - WIDTH / 2) < 100) continue;
      rects.push({ x, y, width: 20, height: 16 });
    }
  }
  // The wall, with its gap at the bottom.
  rects.push({ x: WIDTH / 2 - 24, y: 0, width: 48, height: HEIGHT - 200 });
  return rects;
}

describe("Pathfinder", () => {
  it("builds a map-sized grid quickly and finds a long way round", () => {
    const rects = forest();
    expect(rects.length).toBeGreaterThan(2500);

    const started = performance.now();
    const finder = new Pathfinder(WIDTH, HEIGHT, rects, 8);
    const built = performance.now() - started;

    const path = finder.findPath(40, 40, WIDTH - 40, 40);
    const searched = performance.now() - started - built;

    expect(path).not.toBeNull();
    const last = path![path!.length - 1];
    expect(last).toEqual({ x: WIDTH - 40, y: 40 });
    // It had to go down to the gap in the wall and back up again.
    expect(Math.max(...path!.map((p) => p.y))).toBeGreaterThan(HEIGHT - 200);
    // Generous, for a slow runner; the old build alone was two seconds.
    expect(built).toBeLessThan(250);
    expect(searched).toBeLessThan(1500);
  });

  it("never plans through a solid, with its padding", () => {
    const finder = new Pathfinder(480, 480, [{ x: 200, y: 0, width: 40, height: 400 }], 8);
    const path = finder.findPath(40, 40, 440, 40)!;
    expect(path).not.toBeNull();
    // Every corner is clear of the wall and its padding.
    for (const p of path.slice(1, -1)) {
      expect(p.x < 192 || p.x > 248 || p.y > 408).toBe(true);
    }
  });

  it("blocks a cell only where a rect actually overlaps it", () => {
    // A rect whose edges land on cell boundaries blocks those cells and no
    // more: 32..64 covers columns 2 and 3 of a 16px grid.
    const finder = new Pathfinder(160, 160, [{ x: 32, y: 32, width: 32, height: 32 }]);
    expect(finder.walkable(2, 1)).toBe(true);
    expect(finder.walkable(2, 2)).toBe(false);
    expect(finder.walkable(3, 3)).toBe(false);
    expect(finder.walkable(4, 4)).toBe(true);
    expect(finder.walkable(2, 4)).toBe(true);
  });

  it("snaps a goal inside a solid to the open ground beside it", () => {
    const finder = new Pathfinder(320, 320, [{ x: 144, y: 144, width: 32, height: 32 }]);
    const path = finder.findPath(16, 16, 160, 160)!;
    expect(path).not.toBeNull();
    const last = path[path.length - 1];
    const col = Math.floor(last.x / 16);
    const row = Math.floor(last.y / 16);
    expect(finder.walkable(row, col)).toBe(true);
  });

  it("walks the player between the places on the real world map", () => {
    // The places a resident is sent to are all open ground reachable from
    // each other, so the player should get between any two of them. A third
    // of these used to run out of steps, and the fallback walked into the
    // trees. The padded grid still closes a few gaps in the wood that a body
    // fits through, which is why `OutdoorScene.route` asks a bare one next —
    // and between the two, nothing is left out.
    const padded = new Pathfinder(WORLD_WIDTH, WORLD_HEIGHT, worldSolids(), PF_PADDING);
    const bare = new Pathfinder(WORLD_WIDTH, WORLD_HEIGHT, worldSolids());
    const spots = worldWanderSpots();
    let paddedFailed = 0;
    let failed = 0;
    let asked = 0;
    for (let i = 0; i < spots.length; i += 3) {
      for (let j = i + 1; j < spots.length; j += 7) {
        asked++;
        const [a, b] = [spots[i], spots[j]];
        if (padded.findPath(a.x, a.y, b.x, b.y)) continue;
        paddedFailed++;
        if (!bare.findPath(a.x, a.y, b.x, b.y)) failed++;
      }
    }
    expect(asked).toBeGreaterThan(50);
    expect(paddedFailed / asked).toBeLessThan(0.2);
    expect(failed).toBe(0);
  });

  it("walks as near as it can to a goal there is no way to", () => {
    // A wall right across, with nothing on the far side anybody can reach:
    // the river and its far bank, in small.
    const finder = new Pathfinder(480, 480, [{ x: 0, y: 200, width: 480, height: 40 }], 8);
    expect(finder.findPath(240, 400, 240, 40)).toBeNull();
    const way = finder.findApproach(240, 400, 240, 40)!;
    expect(way.complete).toBe(false);
    // Every step on the near side, and the last one up against the wall.
    for (const p of way.path) expect(p.y).toBeGreaterThan(248);
    const last = way.path[way.path.length - 1];
    expect(last.y).toBeLessThan(272);
    expect(Math.abs(last.x - 240)).toBeLessThanOrEqual(16);
  });

  it("walks to the edge of a solid too deep to find open ground beside the goal", () => {
    const finder = new Pathfinder(960, 960, [{ x: 160, y: 160, width: 640, height: 640 }]);
    const way = finder.findApproach(80, 480, 480, 480)!;
    expect(way.complete).toBe(false);
    const last = way.path[way.path.length - 1];
    expect(finder.walkable(Math.floor(last.y / 16), Math.floor(last.x / 16))).toBe(true);
    // Up against the solid, not somewhere along the way to it.
    const outside = Math.max(160 - last.x, last.x - 800, 160 - last.y, last.y - 800);
    expect(outside).toBeGreaterThan(0);
    expect(outside).toBeLessThanOrEqual(16);
  });

  it("finds a way that opens most of the grid before it gets there", () => {
    // A serpentine: every row of wall has its gap at the other end from the
    // one before, so the way down is the whole of every corridor. Each open
    // cell is pushed by several neighbours, and a cap that counted those
    // copies ran out long before the bottom.
    const size = 160 * 16;
    const rects = [];
    for (let row = 4, flip = false; row < 156; row += 4, flip = !flip) {
      rects.push({ x: flip ? 48 : 0, y: row * 16, width: size - 48, height: 16 });
    }
    const finder = new Pathfinder(size, size, rects);
    const way = finder.findApproach(24, 24, 24, size - 24)!;
    expect(way.complete).toBe(true);
    expect(way.path[way.path.length - 1]).toEqual({ x: 24, y: size - 24 });
  });

  it("gets the player from the foot of the world map to as near the top as there is ground", () => {
    // North of the river is open ground nobody can reach. A tap there from
    // the bottom of the map had no route, and the walker went in a straight
    // line through every building in between.
    const padded = new Pathfinder(WORLD_WIDTH, WORLD_HEIGHT, worldSolids(), PF_PADDING);
    const from = worldWanderSpots().reduce((a, b) => (b.y > a.y ? b : a));
    for (const x of [WORLD_WIDTH * 0.25, WORLD_WIDTH * 0.5]) {
      const way = padded.findApproach(from.x, from.y, x, 8);
      expect(way?.complete).toBe(false);
      const last = way!.path[way!.path.length - 1];
      // Wherever it stops is somewhere the planner can actually walk to.
      expect(padded.findPath(from.x, from.y, last.x, last.y)).not.toBeNull();
    }
  });

  it("returns the same route when asked twice", () => {
    const finder = new Pathfinder(WIDTH, HEIGHT, forest(), 8);
    const a = finder.findPath(100, 3000, 8000, 300);
    const b = finder.findPath(100, 3000, 8000, 300);
    expect(a).toEqual(b);
  });
});
