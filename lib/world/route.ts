/**
 * A way across the open ground from one point to another.
 *
 * The world map is big and has buildings and a sea in it, so somebody sent
 * from one side to the other cannot simply be walked at in a straight line.
 * Residents are drawn where the server says and nothing collides them, which
 * means the route is the only thing keeping a wanderer out of the walls: on a
 * straight line from the stores to the campus gate a chicken strolls through
 * two head offices.
 *
 * The grid is the same coarse one `allReachable` checks the map with — cells
 * the size of a person's feet, a cell blocked if any solid touches it — so a
 * route exists here exactly when that says the place is reachable, and the
 * two cannot disagree about the map.
 *
 * What comes back is corners, not cells. A breadth-first search yields a
 * staircase of single steps; walking that literally would have somebody
 * shuffling a foot at a time, so runs going the same way are collapsed into
 * one leg each and the walker gets a handful of long straight lines. The
 * last leg ends on the point actually asked for rather than on a cell centre.
 *
 * Nothing here touches Phaser: the server plans routes, and the tests walk
 * them without a browser.
 */

import type { Rect } from "./tenants";

export interface Point {
  x: number;
  y: number;
}

/** The cell size, matching `allReachable`: about the width of a pair of feet. */
export const ROUTE_CELL = 24;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Corners of a walk from `from` to `to`, or null when there is no way through.
 *
 * Somebody standing inside a solid gets a first leg out of it and the route
 * proper is planned from there. Being in one is not their doing — a prop can
 * be placed over a spot, or a rounding can nudge a foot inside a wall — and
 * refusing to plan from there would leave them stuck for good.
 */
export function routeAcross(
  bounds: { width: number; height: number },
  solids: readonly Rect[],
  from: Point,
  to: Point,
  cell = ROUTE_CELL,
): Point[] | null {
  const cols = Math.ceil(bounds.width / cell);
  const rows = Math.ceil(bounds.height / cell);
  const cellOf = (p: Point) => ({
    cx: Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell))),
    cy: Math.min(rows - 1, Math.max(0, Math.floor(p.y / cell))),
  });

  const goal = cellOf(to);
  const key = (cx: number, cy: number) => cy * cols + cx;

  const blocked = (cx: number, cy: number) => {
    const box = { x: cx * cell, y: cy * cell, width: cell, height: cell };
    return solids.some((s) => overlaps(s, box));
  };

  if (blocked(goal.cx, goal.cy)) return null;

  // Somebody standing in a solid walks out of it first, and the route proper
  // starts from open ground. Being in one is not their doing — a prop can be
  // placed over a spot, or a rounding can nudge a foot inside a wall — and
  // refusing to plan from there would leave them stuck for good.
  const stood = cellOf(from);
  const escape = blocked(stood.cx, stood.cy) ? nearestFree(stood, cols, rows, blocked, key) : stood;
  if (!escape) return null;
  const start = escape;
  const startKey = key(start.cx, start.cy);

  // Breadth-first, so the walk found is as short as the grid allows. `came`
  // doubles as the visited set.
  const came = new Map<number, number>([[startKey, -1]]);
  const queue = [start];
  let head = 0;
  let found = startKey === key(goal.cx, goal.cy);
  while (head < queue.length && !found) {
    const { cx, cy } = queue[head++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = key(nx, ny);
      if (came.has(next) || blocked(nx, ny)) continue;
      came.set(next, key(cx, cy));
      if (next === key(goal.cx, goal.cy)) {
        found = true;
        break;
      }
      queue.push({ cx: nx, cy: ny });
    }
  }
  if (!found) return null;

  // Back from the goal to the start, then the right way round.
  const cellPath: number[] = [];
  for (let at: number | undefined = key(goal.cx, goal.cy); at !== undefined && at !== -1; ) {
    cellPath.push(at);
    at = came.get(at);
  }
  cellPath.reverse();

  // Keep only the cells where the direction changes: everything between two
  // corners is a straight line, and a walker needs the corners.
  const corners: Point[] = [];
  for (let i = 1; i < cellPath.length; i++) {
    const previous = cellPath[i - 1];
    const current = cellPath[i];
    const next = cellPath[i + 1];
    if (next === undefined) break;
    const wasVertical = Math.abs(current - previous) !== 1;
    const isVertical = Math.abs(next - current) !== 1;
    if (wasVertical === isVertical) continue;
    const cx = current % cols;
    corners.push({ x: (cx + 0.5) * cell, y: ((current - cx) / cols + 0.5) * cell });
  }

  // Where they were asked to go, exactly, rather than the middle of its cell.
  corners.push({ x: to.x, y: to.y });

  // Out of the solid first, if they were in one, so the walk to the first
  // corner does not cut back through it.
  if (escape !== stood) {
    corners.unshift({ x: (escape.cx + 0.5) * cell, y: (escape.cy + 0.5) * cell });
  }
  return corners;
}

/**
 * The closest cell not inside a solid, searched outward from a blocked one.
 *
 * Walks the grid without regard for what is solid — the point is to get out
 * of it — and stops at the first cell that is clear. Null when the whole map
 * is solid, which would mean the map was built wrong.
 */
function nearestFree(
  from: { cx: number; cy: number },
  cols: number,
  rows: number,
  blocked: (cx: number, cy: number) => boolean,
  key: (cx: number, cy: number) => number,
): { cx: number; cy: number } | null {
  const seen = new Set<number>([key(from.cx, from.cy)]);
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const { cx, cy } = queue[head++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = key(nx, ny);
      if (seen.has(next)) continue;
      seen.add(next);
      if (!blocked(nx, ny)) return { cx: nx, cy: ny };
      queue.push({ cx: nx, cy: ny });
    }
  }
  return null;
}
