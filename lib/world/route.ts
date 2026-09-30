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
  const cellOf = (p: Point) =>
    Math.min(rows - 1, Math.max(0, Math.floor(p.y / cell))) * cols +
    Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell)));

  const goal = cellOf(to);
  const cells = blockedCells(solids, cols, rows, cell);
  if (cells[goal] === 1) return null;

  // Somebody standing in a solid walks out of it first, and the route proper
  // starts from open ground. Being in one is not their doing — a prop can be
  // placed over a spot, or a rounding can nudge a foot inside a wall — and
  // refusing to plan from there would leave them stuck for good.
  const stood = cellOf(from);
  const search = searchFor(cols, rows);
  const start = cells[stood] === 1 ? nearestFree(stood, cols, rows, cells, search) : stood;
  if (start < 0) return null;

  // A goal in another part of the map is no way through, and saying so is one
  // array read rather than a flood of everything the start can reach: the far
  // bank of the river is open ground from end to end, and a walk asked for
  // over there used to cost a search of the whole map to find it wanting.
  const regions = regionsOf(cells, cols, rows);
  if (regions[start] !== regions[goal]) return null;

  // Breadth-first, so the walk found is as short as the grid allows. The
  // neighbours are taken in the same order they always were — east, west,
  // south, north — which is what decides between two walks of equal length.
  const { came, seen, queue } = search;
  const stamp = nextStamp(search);
  seen[start] = stamp;
  came[start] = -1;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  let found = start === goal;
  while (head < tail && !found) {
    const at = queue[head++];
    const cx = at % cols;
    const cy = (at - cx) / cols;
    for (let n = 0; n < 4; n++) {
      const nx = cx + DX[n];
      const ny = cy + DY[n];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (seen[next] === stamp || cells[next] === 1) continue;
      seen[next] = stamp;
      came[next] = at;
      if (next === goal) {
        found = true;
        break;
      }
      queue[tail++] = next;
    }
  }
  if (!found) return null;

  // Back from the goal to the start, then the right way round.
  const cellPath: number[] = [];
  for (let at = goal; at !== -1; at = came[at]) cellPath.push(at);
  cellPath.reverse();

  // Keep only the cells where the direction changes: everything between two
  // corners is a straight line, and a walker needs the corners.
  const corners: Point[] = [];
  for (let i = 1; i < cellPath.length - 1; i++) {
    const previous = cellPath[i - 1];
    const current = cellPath[i];
    const next = cellPath[i + 1];
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
  if (start !== stood) {
    const cx = start % cols;
    corners.unshift({ x: (cx + 0.5) * cell, y: ((start - cx) / cols + 0.5) * cell });
  }
  return corners;
}

/** East, west, south and north: the order a search takes its neighbours in. */
const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

/**
 * The working memory of a search, one set per shape of grid and reused.
 *
 * A route across the world map is a flood of up to fifty thousand cells, and
 * it used to build a `Map` for where each came from and an array of little
 * objects for the queue, every time. These are typed arrays the size of the
 * grid, allocated once; `seen` holds the number of the search that last
 * reached a cell, so starting a new search is bumping a counter rather than
 * clearing fifty thousand entries. Nothing here is re-entrant, and nothing
 * needs it to be.
 */
interface Search {
  came: Int32Array;
  seen: Uint32Array;
  queue: Int32Array;
  stamp: number;
}

const searches = new Map<string, Search>();

function searchFor(cols: number, rows: number): Search {
  const shape = `${cols}x${rows}`;
  let search = searches.get(shape);
  if (!search) {
    const size = cols * rows;
    search = {
      came: new Int32Array(size),
      seen: new Uint32Array(size),
      queue: new Int32Array(size),
      stamp: 0,
    };
    searches.set(shape, search);
  }
  return search;
}

/** A fresh number for a new search, clearing the marks on the rare day it wraps. */
function nextStamp(search: Search): number {
  if (search.stamp === 0xffffffff) {
    search.seen.fill(0);
    search.stamp = 0;
  }
  return ++search.stamp;
}

/**
 * Which connected stretch of open ground each cell is in: 0 for a blocked
 * cell, and the same number for every cell a walker could get between.
 *
 * Worked out once per painted grid and kept against it, which is what lets a
 * route to somewhere unreachable be refused without a search. Numbered in the
 * order the cells are met, so the answer is the same every time.
 */
const labelled = new WeakMap<Uint8Array, Int32Array>();

function regionsOf(cells: Uint8Array, cols: number, rows: number): Int32Array {
  const kept = labelled.get(cells);
  if (kept) return kept;
  const size = cols * rows;
  const regions = new Int32Array(size);
  const queue = new Int32Array(size);
  let region = 0;
  for (let first = 0; first < size; first++) {
    if (cells[first] === 1 || regions[first] !== 0) continue;
    region += 1;
    regions[first] = region;
    let head = 0;
    let tail = 0;
    queue[tail++] = first;
    while (head < tail) {
      const at = queue[head++];
      const cx = at % cols;
      const cy = (at - cx) / cols;
      for (let n = 0; n < 4; n++) {
        const nx = cx + DX[n];
        const ny = cy + DY[n];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (cells[next] === 1 || regions[next] !== 0) continue;
        regions[next] = region;
        queue[tail++] = next;
      }
    }
  }
  labelled.set(cells, regions);
  return regions;
}

/**
 * The closest cell not inside a solid, searched outward from a blocked one;
 * -1 when the whole map is solid, which would mean the map was built wrong.
 *
 * Walks the grid without regard for what is solid — the point is to get out
 * of it — and stops at the first cell that is clear.
 */
function nearestFree(
  from: number,
  cols: number,
  rows: number,
  cells: Uint8Array,
  search: Search,
): number {
  const { seen, queue } = search;
  const stamp = nextStamp(search);
  seen[from] = stamp;
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  while (head < tail) {
    const at = queue[head++];
    const cx = at % cols;
    const cy = (at - cx) / cols;
    for (let n = 0; n < 4; n++) {
      const nx = cx + DX[n];
      const ny = cy + DY[n];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (seen[next] === stamp) continue;
      seen[next] = stamp;
      if (cells[next] !== 1) return next;
      queue[tail++] = next;
    }
  }
  return -1;
}
