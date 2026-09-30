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

  it("returns the same route when asked twice", () => {
    const finder = new Pathfinder(WIDTH, HEIGHT, forest(), 8);
    const a = finder.findPath(100, 3000, 8000, 300);
    const b = finder.findPath(100, 3000, 8000, 300);
    expect(a).toEqual(b);
  });
});
