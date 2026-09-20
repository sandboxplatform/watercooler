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

/**
 * Which cells the solids cover, drawn once and kept.
 *
 * Asking "is this cell blocked?" by testing every solid is the obvious way
 * and it is what this did: a walk across the world map is a flood over some
 * nine thousand cells, each visited from up to four sides, against a hundred
 * and sixteen buildings, props, signs and stretches of sea. Four million
 * rectangle tests, about fifty milliseconds, and the server does nothing
 * else while it happens.
 *
 * That was affordable while one chicken wandered the map. It stopped being
 * affordable when the residents' outdoor haunt became the map too: seven of
 * them can set off within a tick of each other, and half a second of blocked
 * event loop is a room that will not load and a lift that will not move.
 *
 * Painting the rectangles into the grid instead is the same answer for a
 * ten-thousandth of the work — each solid touches a handful of cells, and
 * every question afterwards is one array read. The grid is kept against the
 * list it was drawn from, which never changes while the server runs.
 *
 * Exported for `allReachable`, which asks the same question of the same
 * list and was the last place still asking it the slow way. That mattered
 * little while the map was the town and the solids a hundred-odd
 * rectangles; the map is three times as wide now and the wood alone plants
 * several hundred trees across it, so the sweep went up by both at once.
 */
const grids = new WeakMap<readonly Rect[], Map<string, Uint8Array>>();

export function blockedCells(
  solids: readonly Rect[],
  cols: number,
  rows: number,
  cell: number,
): Uint8Array {
  let shapes = grids.get(solids);
  if (!shapes) grids.set(solids, (shapes = new Map()));
  const shape = `${cols}x${rows}@${cell}`;
  const kept = shapes.get(shape);
  if (kept) return kept;

  const grid = new Uint8Array(cols * rows);
  for (const s of solids) {
    // The same half-open overlap the per-cell test used: a solid whose edge
    // lands exactly on a cell boundary does not block the cell beyond it.
    const x0 = Math.max(0, Math.floor(s.x / cell));
    const x1 = Math.min(cols - 1, Math.ceil((s.x + s.width) / cell) - 1);
    const y0 = Math.max(0, Math.floor(s.y / cell));
    const y1 = Math.min(rows - 1, Math.ceil((s.y + s.height) / cell) - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) grid[cy * cols + cx] = 1;
  }
  shapes.set(shape, grid);
  return grid;
}

/**
 * Which rectangles of a list could cover a point, bucketed once and kept.
 *
 * The grid above answers "is this *cell* blocked", which is a route's
 * question and a coarse one. This answers "is this *point* inside anything",
 * which is the basketball's — it asks it of every solid on the map twice a
 * tick while the ball is low — and it has to be exact, because what comes of
 * a yes is a bounce off that rectangle's own edge rather than off a cell.
 *
 * So it is a bucket index rather than a painted grid: each rectangle is
 * filed under every 96-pixel square it touches, and a point tests only what
 * is filed under its own. Same answers, a fiftieth of the work. It mattered
 * little while "everything solid out of doors" was seven hundred rectangles;
 * the map is three times as wide and the wood and the meadow between them
 * scatter a couple of thousand trees across it.
 *
 * Kept against the list it was built from, like the grid, which is why
 * `worldSolids()` handing back the same array every time is load-bearing
 * twice over.
 */
const BUCKET = 96;
const buckets = new WeakMap<readonly Rect[], Map<number, Rect[]>>();

function bucketed(solids: readonly Rect[]): Map<number, Rect[]> {
  let index = buckets.get(solids);
  if (index) return index;
  index = new Map();
  for (const r of solids) {
    // Inclusive at both ends, which is the test below: a point exactly on a
    // rectangle's far edge is inside it, so that edge's bucket has to hold it.
    const x1 = Math.floor((r.x + r.width) / BUCKET);
    const y1 = Math.floor((r.y + r.height) / BUCKET);
    for (let by = Math.floor(r.y / BUCKET); by <= y1; by++) {
      for (let bx = Math.floor(r.x / BUCKET); bx <= x1; bx++) {
        const key = by * 100_000 + bx;
        const here = index.get(key);
        if (here) here.push(r);
        else index.set(key, [r]);
      }
    }
  }
  buckets.set(solids, index);
  return index;
}

/** Whether a point is inside any of them. Edges count as inside. */
export function coversPoint(solids: readonly Rect[], x: number, y: number): boolean {
  const here = bucketed(solids).get(Math.floor(y / BUCKET) * 100_000 + Math.floor(x / BUCKET));
  if (!here) return false;
  return here.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
}

/**
 * Whether a point is on open ground, asked of the same grid a route is
 * planned against.
 *
 * `routeAcross` already answers this — it returns null for a destination in a
 * wall — and it answers it by flooding the map to get there. Somebody picking
 * somewhere to bolt to tries several in a tick and throws most of them away,
 * so the cheap half of the question is worth having on its own: one array
 * read, against the grid the route would have used, so the two cannot
 * disagree about what is open.
 *
 * Off the map is not open ground either, which saves every caller a clamp.
 */
export function openGround(
  bounds: { width: number; height: number },
  solids: readonly Rect[],
  at: Point,
  cell = ROUTE_CELL,
): boolean {
  if (at.x < 0 || at.y < 0 || at.x >= bounds.width || at.y >= bounds.height) return false;
  const cols = Math.ceil(bounds.width / cell);
  const rows = Math.ceil(bounds.height / cell);
  const cells = blockedCells(solids, cols, rows, cell);
  return cells[Math.floor(at.y / cell) * cols + Math.floor(at.x / cell)] !== 1;
}

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

  const cells = blockedCells(solids, cols, rows, cell);
  const blocked = (cx: number, cy: number) => cells[cy * cols + cx] === 1;

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
