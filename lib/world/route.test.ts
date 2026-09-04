import { describe, it, expect } from "vitest";
import { routeAcross, ROUTE_CELL, type Point } from "./route";
import type { Rect } from "./tenants";

const bounds = { width: 20 * ROUTE_CELL, height: 20 * ROUTE_CELL };

/** A cell's middle, which is where a corner lands. */
const middle = (cx: number, cy: number) => ({
  x: (cx + 0.5) * ROUTE_CELL,
  y: (cy + 0.5) * ROUTE_CELL,
});

/** Walks a route the way the simulation does, and says where it went. */
function walk(from: Point, route: Point[], step = 4): Point[] {
  const been: Point[] = [{ ...from }];
  let at = { ...from };
  for (const leg of route) {
    for (let guard = 0; guard < 10_000; guard++) {
      const dx = leg.x - at.x;
      const dy = leg.y - at.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= step) break;
      at = { x: at.x + (dx / distance) * step, y: at.y + (dy / distance) * step };
      been.push({ ...at });
    }
    at = { ...leg };
    been.push({ ...at });
  }
  return been;
}

const inside = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

describe("planning a way across", () => {
  it("goes straight there when nothing is in the way", () => {
    const route = routeAcross(bounds, [], middle(2, 2), middle(9, 2));
    expect(route).not.toBeNull();
    expect(route).toEqual([middle(9, 2)]);
  });

  it("ends exactly where it was asked to, not at the middle of a cell", () => {
    const to = { x: 7 * ROUTE_CELL + 3, y: 2 * ROUTE_CELL + 19 };
    const route = routeAcross(bounds, [], middle(2, 2), to);
    expect(route?.[route.length - 1]).toEqual(to);
  });

  /** The whole reason this exists: a chicken must go round the office. */
  it("goes around a wall rather than through it", () => {
    const wall: Rect = { x: 5 * ROUTE_CELL, y: 0, width: ROUTE_CELL, height: 8 * ROUTE_CELL };
    const route = routeAcross(bounds, [wall], middle(2, 2), middle(9, 2));
    expect(route).not.toBeNull();
    for (const step of walk(middle(2, 2), route!)) {
      expect(inside(step, wall), `${step.x},${step.y}`).toBe(false);
    }
  });

  it("says so when there is no way through at all", () => {
    const wall: Rect = { x: 5 * ROUTE_CELL, y: 0, width: ROUTE_CELL, height: bounds.height };
    expect(routeAcross(bounds, [wall], middle(2, 2), middle(9, 2))).toBeNull();
  });

  it("refuses a destination standing in a solid", () => {
    const block: Rect = { x: 8 * ROUTE_CELL, y: ROUTE_CELL, width: 3 * ROUTE_CELL, height: 60 };
    expect(routeAcross(bounds, [block], middle(2, 2), middle(9, 2))).toBeNull();
  });

  /**
   * Somebody can be stood half inside a prop — placed before it was, or
   * nudged in by a rounding — and must still be able to walk out.
   */
  it("plans a way out from inside a solid", () => {
    const under: Rect = { x: 0, y: 0, width: 4 * ROUTE_CELL, height: 4 * ROUTE_CELL };
    const route = routeAcross(bounds, [under], middle(1, 1), middle(9, 9));
    expect(route).not.toBeNull();
  });

  it("gives corners, not one hop per cell", () => {
    const wall: Rect = { x: 5 * ROUTE_CELL, y: 0, width: ROUTE_CELL, height: 8 * ROUTE_CELL };
    const route = routeAcross(bounds, [wall], middle(2, 2), middle(9, 2));
    // Down the near side, along under the wall, up the far side, then in:
    // a handful of legs, nothing like the twenty-odd cells walked.
    expect(route!.length).toBeLessThanOrEqual(6);
  });

  it("hands back a single leg when it is already there", () => {
    const to = middle(4, 4);
    expect(routeAcross(bounds, [], to, to)).toEqual([to]);
  });

  it("keeps a route inside the bounds it was given", () => {
    const route = routeAcross(bounds, [], middle(0, 0), middle(19, 19));
    for (const leg of route!) {
      expect(leg.x).toBeGreaterThanOrEqual(0);
      expect(leg.y).toBeGreaterThanOrEqual(0);
      expect(leg.x).toBeLessThanOrEqual(bounds.width);
      expect(leg.y).toBeLessThanOrEqual(bounds.height);
    }
  });
});
