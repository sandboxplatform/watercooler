import { PF_CELL_SIZE, PF_MIN_ITER } from "@/lib/constants";

export interface PathPoint {
  x: number;
  y: number;
}

const CELL_SIZE = PF_CELL_SIZE;

/** The eight steps, straight ones first — the order the search tries them in. */
const DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

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
 * than a pile of garbage. The heap is the one it replaced, operation for
 * operation, so the same route comes back for the same ask.
 *
 * The iteration cap scales with the grid. It was a flat twenty thousand,
 * which is a sixth of the world map's cells: a third of the walks between
 * the places a resident is sent to ran out of it, and the fallback walked
 * the player straight into the trees.
 */
export class Pathfinder {
  /** 1 where a cell is blocked. */
  private blocked: Uint8Array;
  private cols: number;
  private rows: number;
  private maxIter: number;

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
    // Room to cross the whole grid twice over: a route that has not been
    // found in that many steps is not there to be found.
    this.maxIter = Math.max(PF_MIN_ITER, cells * 2);

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

  findPath(sx: number, sy: number, ex: number, ey: number): PathPoint[] | null {
    let sc = this.toCol(sx);
    let sr = this.toRow(sy);
    let ec = this.toCol(ex);
    let er = this.toRow(ey);
    let endSnapped = false;

    if (!this.valid(sr, sc)) return null;

    if (!this.walkable(sr, sc)) {
      const ns = this.nearestWalkableCell(sr, sc);
      if (!ns) return null;
      sr = ns.r;
      sc = ns.c;
    }

    if (!this.walkable(er, ec)) {
      const nearest = this.nearestWalkableCell(er, ec);
      if (!nearest) return null;
      er = nearest.r;
      ec = nearest.c;
      endSnapped = true;
    }

    if (sr === er && sc === ec) {
      return [
        { x: sx, y: sy },
        { x: ex, y: ey },
      ];
    }

    const cols = this.cols;
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
    this.push(sr * cols + sc, 0, this.h(sr, sc, er, ec), -1);

    let iterations = 0;
    while (this.heapSize > 0 && iterations++ < this.maxIter) {
      const node = this.pop();
      const cell = this.nodeCell[node];
      const g = this.nodeG[node];

      if (cell === goal) {
        const path = this.reconstruct(node);
        if (path.length > 0) {
          if (endSnapped) {
            path[path.length - 1] = {
              x: Math.max(ec * CELL_SIZE, Math.min((ec + 1) * CELL_SIZE, ex)),
              y: Math.max(er * CELL_SIZE, Math.min((er + 1) * CELL_SIZE, ey)),
            };
          } else {
            path[path.length - 1] = { x: ex, y: ey };
          }
        }
        return path;
      }

      if (seen[cell] === stamp && bestG[cell] <= g) continue;
      seen[cell] = stamp;
      bestG[cell] = g;

      const r = (cell / cols) | 0;
      const c = cell - r * cols;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!this.valid(nr, nc)) continue;
        const next = nr * cols + nc;
        if (blocked[next]) continue;

        const diagonal = dr !== 0 && dc !== 0;
        // No cutting a corner: both of the cells beside a diagonal step
        // have to be open, or the body would clip the one that is not.
        if (diagonal && (blocked[(r + dr) * cols + c] || blocked[r * cols + c + dc])) continue;

        const ng = g + (diagonal ? 1.414 : 1);
        if (seen[next] === stamp && bestG[next] <= ng) continue;
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
    return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
  }

  // ── The open list ──────────────────────────────────────
  //
  // A min-heap on f = g + h, over node indices. The comparisons are the ones
  // the object heap made (`>=` going up, `<` going down), so ties break the
  // same way and so does the route.

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
