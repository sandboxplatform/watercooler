import { PF_CELL_SIZE } from "@/lib/constants";
import { regionsOf } from "@/lib/world/route";

export interface PathPoint {
  x: number;
  y: number;
}

/** A route as far toward a goal as the ground goes. */
export interface Approach {
  path: PathPoint[];
  /** Whether it reaches the goal, rather than the reachable cell nearest it. */
  complete: boolean;
}

const CELL_SIZE = PF_CELL_SIZE;

/**
 * What a step costs: straight, and corner to corner. The grid's 1 : 1.414 in
 * whole numbers, so that two ways of the same length cost exactly the same
 * and the estimate below is exactly what the steps it counts would cost.
 */
const STRAIGHT = 1000;
const DIAGONAL = 1414;

/**
 * The eight steps as rows and columns, straight ones first — the order the
 * search tries them in. Two flat arrays rather than eight pairs, since a
 * long walk takes them up to a few hundred thousand times.
 */
const DR = Int8Array.of(-1, 1, 0, 0, -1, -1, 1, 1);
const DC = Int8Array.of(0, 0, -1, 1, -1, 1, -1, 1);

/**
 * A route across a room or a place out of doors, on a grid of 16px cells.
 *
 * **The grid is painted, not tested.** A cell is blocked when any part of it
 * overlaps any solid, inflated by `padding` — and that used to be asked of
 * every cell against every solid. Indoors that is a few thousand cells and a
 * few dozen boxes; on the world map it is some hundred and fifteen thousand
 * cells against two and a half thousand trees, buildings and stretches of
 * water, which took two seconds of every arrival out there. Painting each
 * rectangle into the cells it covers is the same answer for the work of the
 * cells actually covered.
 *
 * **And the search is on typed arrays.** A node is an index into a handful of
 * parallel arrays rather than an object, the open list is a binary heap of
 * those indices, and "seen in this search" is a stamp rather than a Map that
 * is cleared — so a long route across the map is a few milliseconds rather
 * than a pile of garbage. The same route comes back for the same ask.
 *
 * **Each cell is opened once.** The longest walks on the world map — from
 * the south-east corner round the river to the west end of the wood — took
 * a tenth of a second and more, opening every cell several times over, for
 * three reasons that compounded. The estimate counted a diagonal at √2
 * while a step cost 1.414, so it promised more than the steps delivered and
 * a cell opened at one cost was opened again at a slightly better one. The
 * costs were fractions, so two ways of the same length came to totals a
 * rounding apart and each looked an improvement on the other. And a cell's
 * best was only written down when it was opened, so every neighbour that
 * reached it before then queued it again. Costs are whole numbers now, the
 * estimate is exactly what its steps would cost, and the best is kept from
 * the moment a cell is queued: those walks are about ten milliseconds.
 *
 * **Nothing is searched for that is not there.** The grid's connected
 * stretches of ground are labelled once, with the residents' own
 * `regionsOf`, and a goal in another one is refused before any search
 * starts. They are the stretches this search walks between: a diagonal step
 * needs both cells beside it open, so it never joins two that straight
 * steps do not. That is also why there is no cap on the search any more.
 * It was there to give up on a goal with no way to it, and it gave up on
 * long walks that had one — at a flat twenty thousand steps, and again at
 * twice the grid once the stale entries in the heap were counted against it.
 *
 * **And a goal with no way to it still gets a walk** — `findApproach`, to
 * the reachable cell nearest it. `findPath` is the strict one: a route that
 * arrives, or none.
 */
export class Pathfinder {
  /** 1 where a cell is blocked. */
  private blocked: Uint8Array;
  private cols: number;
  private rows: number;

  // Per-cell search state, reused between searches and told apart by stamp.
  private bestG: Float64Array;
  private seen: Uint32Array;
  private stamp = 0;

  // The nodes of the search in progress, grown as needed.
  private nodeCell = new Int32Array(1024);
  private nodeG = new Float64Array(1024);
  private nodeF = new Float64Array(1024);
  private nodeParent = new Int32Array(1024);
  private nodeCount = 0;
  private heap = new Int32Array(1024);
  private heapSize = 0;

  /**
   * @param padding  Extra clearance around collision rects (half of the
   *                 moving body's largest dimension) to prevent clipping.
   */
  constructor(
    mapWidthPx: number,
    mapHeightPx: number,
    collisionRects: readonly { x: number; y: number; width: number; height: number }[],
    padding = 0,
  ) {
    this.cols = Math.ceil(mapWidthPx / CELL_SIZE);
    this.rows = Math.ceil(mapHeightPx / CELL_SIZE);
    const cells = this.cols * this.rows;
    this.blocked = new Uint8Array(cells);
    this.bestG = new Float64Array(cells);
    this.seen = new Uint32Array(cells);

    // A cell is blocked when ANY part of it overlaps ANY inflated rect — the
    // strict overlap a per-cell test asks, so a rect whose edge lands exactly
    // on a cell boundary does not block the cell beyond it.
    for (const r of collisionRects) {
      if (!(r.width > 0 && r.height > 0)) continue;
      const left = r.x - padding;
      const top = r.y - padding;
      const right = r.x + r.width + padding;
      const bottom = r.y + r.height + padding;
      const c0 = Math.max(0, Math.floor(left / CELL_SIZE));
      const c1 = Math.min(this.cols - 1, Math.ceil(right / CELL_SIZE) - 1);
      const r0 = Math.max(0, Math.floor(top / CELL_SIZE));
      const r1 = Math.min(this.rows - 1, Math.ceil(bottom / CELL_SIZE) - 1);
      for (let row = r0; row <= r1; row++) {
        this.blocked.fill(1, row * this.cols + c0, row * this.cols + c1 + 1);
      }
    }
  }

  /** Whether the cell at this row and column can be walked; off the grid is not. */
  walkable(r: number, c: number): boolean {
    return this.valid(r, c) && this.blocked[r * this.cols + c] === 0;
  }

  /** The way to a goal, or null when there is none. */
  findPath(sx: number, sy: number, ex: number, ey: number): PathPoint[] | null {
    return this.search(sx, sy, ex, ey, false)?.path ?? null;
  }

  /**
   * The way to a goal if there is one, and otherwise the way to the cell
   * nearest it that can be reached. Null only when the start is boxed in.
   *
   * A tap on ground nobody can get to — the far bank of the river, the
   * middle of a thicket — has no route, and the walker's fallback for no
   * route was a straight line at it, through whatever buildings were in
   * between. Going as far as the ground goes is what was meant: the
   * reachable cell nearest the tap, and the way there.
   */
  findApproach(sx: number, sy: number, ex: number, ey: number): Approach | null {
    return this.search(sx, sy, ex, ey, true);
  }

  /** The way there, or with `approach` as near as it goes, or null. */
  private search(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    approach: boolean,
  ): Approach | null {
    let sc = this.toCol(sx);
    let sr = this.toRow(sy);
    // On the grid, so an aim off its edge still has a nearest cell.
    const tc = Math.max(0, Math.min(this.cols - 1, this.toCol(ex)));
    const tr = Math.max(0, Math.min(this.rows - 1, this.toRow(ey)));
    let ec = tc;
    let er = tr;
    let endSnapped = false;

    if (!this.valid(sr, sc)) return null;

    if (!this.walkable(sr, sc)) {
      const ns = this.nearestWalkableCell(sr, sc);
      if (!ns) return null;
      sr = ns.r;
      sc = ns.c;
    }

    // A goal deep inside something solid is left where it is, and is in no
    // region at all, which the check below takes as out of reach.
    if (!this.walkable(er, ec)) {
      const nearest = this.nearestWalkableCell(er, ec);
      if (nearest) {
        er = nearest.r;
        ec = nearest.c;
        endSnapped = true;
      }
    }

    // A goal in another stretch of ground is out of reach, and saying so is
    // one array read — the residents' planner's own check, on this grid. It
    // used to be a search of everything the start could reach, done twice
    // over (the padded grid and the bare one), up to a quarter of a second
    // on the world map for a tap on the far bank of the river.
    const regions = regionsOf(this.blocked, this.cols, this.rows);
    const home = regions[sr * this.cols + sc];
    if (regions[er * this.cols + ec] !== home) {
      if (!approach) return null;
      const near = this.nearestIn(regions, home, tr, tc, sr, sc);
      const path = this.walk(sr, sc, (near / this.cols) | 0, near % this.cols);
      return path && { path, complete: false };
    }

    if (sr === er && sc === ec) {
      return {
        path: [
          { x: sx, y: sy },
          { x: ex, y: ey },
        ],
        complete: true,
      };
    }

    const path = this.walk(sr, sc, er, ec);
    if (!path) return null;
    if (endSnapped) {
      path[path.length - 1] = {
        x: Math.max(ec * CELL_SIZE, Math.min((ec + 1) * CELL_SIZE, ex)),
        y: Math.max(er * CELL_SIZE, Math.min((er + 1) * CELL_SIZE, ey)),
      };
    } else {
      path[path.length - 1] = { x: ex, y: ey };
    }
    return { path, complete: true };
  }

  /**
   * The cell of a region nearest a tapped cell, and of two as near, the one
   * nearer the start. A sweep of the whole grid, one read a cell, which is
   * cheap beside the search over the same cells it replaces.
   */
  private nearestIn(
    regions: Int32Array,
    region: number,
    tr: number,
    tc: number,
    sr: number,
    sc: number,
  ): number {
    const cols = this.cols;
    let best = sr * cols + sc;
    let bestD = (sr - tr) ** 2 + (sc - tc) ** 2;
    let bestFromStart = 0;
    for (let cell = 0; cell < regions.length; cell++) {
      if (regions[cell] !== region) continue;
      const r = (cell / cols) | 0;
      const c = cell - r * cols;
      const d = (r - tr) ** 2 + (c - tc) ** 2;
      if (d > bestD) continue;
      const fromStart = (r - sr) ** 2 + (c - sc) ** 2;
      if (d < bestD || fromStart < bestFromStart) {
        best = cell;
        bestD = d;
        bestFromStart = fromStart;
      }
    }
    return best;
  }

  /**
   * Cell centres from one open cell to another in the same region. Null
   * only if the region labels and the search disagreed, which they cannot.
   */
  private walk(sr: number, sc: number, er: number, ec: number): PathPoint[] | null {
    const cols = this.cols;
    const rows = this.rows;
    const blocked = this.blocked;
    const bestG = this.bestG;
    const seen = this.seen;
    // A fresh stamp marks every cell unseen at once. On the rare wrap, the
    // stamps really are cleared, or a cell from four billion searches ago
    // would read as seen.
    if (++this.stamp === 0xffffffff) {
      seen.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    const goal = er * cols + ec;

    this.nodeCount = 0;
    this.heapSize = 0;
    const start = sr * cols + sc;
    seen[start] = stamp;
    bestG[start] = 0;
    this.push(start, 0, this.h(sr, sc, er, ec), -1);

    while (this.heapSize > 0) {
      const node = this.pop();
      const cell = this.nodeCell[node];
      const g = this.nodeG[node];

      // A better way here was queued after this one: this one is spent.
      if (g > bestG[cell]) continue;
      if (cell === goal) return this.reconstruct(node);

      const r = (cell / cols) | 0;
      const c = cell - r * cols;
      for (let d = 0; d < 8; d++) {
        const dr = DR[d];
        const dc = DC[d];
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const next = nr * cols + nc;
        if (blocked[next]) continue;

        const diagonal = dr !== 0 && dc !== 0;
        // No cutting a corner: both of the cells beside a diagonal step
        // have to be open, or the body would clip the one that is not.
        if (diagonal && (blocked[(r + dr) * cols + c] || blocked[r * cols + c + dc])) continue;

        // Queued only when it is the best way to the cell so far. The best
        // is kept from the moment it is queued, not from when it is opened,
        // or every neighbour that reaches a cell first queues it again.
        const ng = g + (diagonal ? DIAGONAL : STRAIGHT);
        if (seen[next] === stamp && bestG[next] <= ng) continue;
        seen[next] = stamp;
        bestG[next] = ng;
        this.push(next, ng, ng + this.h(nr, nc, er, ec), node);
      }
    }

    return null;
  }

  private toCol(x: number) {
    return Math.floor(x / CELL_SIZE);
  }
  private toRow(y: number) {
    return Math.floor(y / CELL_SIZE);
  }
  private valid(r: number, c: number) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }
  private h(r1: number, c1: number, r2: number, c2: number) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return STRAIGHT * Math.max(dr, dc) + (DIAGONAL - STRAIGHT) * Math.min(dr, dc);
  }

  // ── The open list ──────────────────────────────────────
  //
  // A min-heap on f = g + h, over node indices, ties left where the heap
  // puts them. Taking the one further along first is the textbook way to
  // break them, and out here it was slower: the long walks on the world
  // map are detours around the river and the wood, and the one further
  // along is as often the one heading into the dead end.

  private push(cell: number, g: number, f: number, parent: number) {
    if (this.nodeCount === this.nodeCell.length) this.growNodes();
    const node = this.nodeCount++;
    this.nodeCell[node] = cell;
    this.nodeG[node] = g;
    this.nodeF[node] = f;
    this.nodeParent[node] = parent;

    if (this.heapSize === this.heap.length) {
      const grown = new Int32Array(this.heap.length * 2);
      grown.set(this.heap);
      this.heap = grown;
    }
    const heap = this.heap;
    const score = this.nodeF;
    let i = this.heapSize++;
    heap[i] = node;
    while (i > 0) {
      const parentAt = (i - 1) >> 1;
      if (score[heap[i]] >= score[heap[parentAt]]) break;
      const swap = heap[i];
      heap[i] = heap[parentAt];
      heap[parentAt] = swap;
      i = parentAt;
    }
  }

  private pop(): number {
    const heap = this.heap;
    const score = this.nodeF;
    const top = heap[0];
    const last = heap[--this.heapSize];
    const n = this.heapSize;
    if (n > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && score[heap[l]] < score[heap[smallest]]) smallest = l;
        if (r < n && score[heap[r]] < score[heap[smallest]]) smallest = r;
        if (smallest === i) break;
        const swap = heap[i];
        heap[i] = heap[smallest];
        heap[smallest] = swap;
        i = smallest;
      }
    }
    return top;
  }

  private growNodes() {
    const size = this.nodeCell.length * 2;
    const cell = new Int32Array(size);
    const g = new Float64Array(size);
    const f = new Float64Array(size);
    const parent = new Int32Array(size);
    cell.set(this.nodeCell);
    g.set(this.nodeG);
    f.set(this.nodeF);
    parent.set(this.nodeParent);
    this.nodeCell = cell;
    this.nodeG = g;
    this.nodeF = f;
    this.nodeParent = parent;
  }

  private nearestWalkableCell(r: number, c: number): { r: number; c: number } | null {
    for (let d = 1; d <= 12; d++) {
      let bestDist = Infinity;
      let bestCell: { r: number; c: number } | null = null;
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.abs(dr) < d && Math.abs(dc) < d) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (this.walkable(nr, nc)) {
            const dist = dr * dr + dc * dc;
            if (dist < bestDist) {
              bestDist = dist;
              bestCell = { r: nr, c: nc };
            }
          }
        }
      }
      if (bestCell) return bestCell;
    }
    return null;
  }

  private reconstruct(node: number): PathPoint[] {
    const raw: PathPoint[] = [];
    for (let at = node; at !== -1; at = this.nodeParent[at]) {
      const cell = this.nodeCell[at];
      const r = (cell / this.cols) | 0;
      const c = cell - r * this.cols;
      raw.push({ x: c * CELL_SIZE + CELL_SIZE / 2, y: r * CELL_SIZE + CELL_SIZE / 2 });
    }
    raw.reverse();
    return this.simplify(raw);
  }

  private simplify(path: PathPoint[]): PathPoint[] {
    if (path.length <= 2) return path;
    const result: PathPoint[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const p = path[i - 1],
        c = path[i],
        n = path[i + 1];
      if (c.x - p.x !== n.x - c.x || c.y - p.y !== n.y - c.y) {
        result.push(c);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }
}
