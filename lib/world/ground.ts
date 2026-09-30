/**
 * What an outdoor place is made of: the ground underfoot, the props that
 * stand on it and the signs, as data and nothing else.
 *
 * Split out of `scenery.ts`, which is the world map laid out — every building,
 * the wood and the meadow planted at module load. The volcano and the
 * campuses want the same vocabulary for places of their own, and importing it
 * from there planted a couple of thousand trees on the world map to draw an
 * island. `scenery.ts` re-exports all of it, so every older import still works.
 *
 * Nothing here touches Phaser.
 */

import { TILE, type Rect } from "./tenants";
import { MAILBOX } from "./mailboxes";

export type Ground =
  | "grass"
  | "paving"
  | "kerb"
  | "asphalt"
  | "highway"
  | "water"
  | "dock"
  | "court"
  | "trail"
  | "shingle"
  // Volcano Island's: black sand underfoot, lava that nobody walks on, and
  // under the volcano the cave's floor inside walls of living rock. None of
  // them is on the world map, and every one of them is ground rather than a
  // picture for the reason the court and the trails are — see `VOLCANO`.
  | "ash"
  | "lava"
  | "rock"
  | "cave";

/**
 * The ground nobody stands on: the sea and the river, lava, and the rock a
 * cave is cut out of. Every run of it along a row becomes a solid — see
 * `solidGround`.
 */
const IMPASSABLE: ReadonlySet<Ground> = new Set<Ground>(["water", "lava", "rock"]);

/** A board with words on it, standing on its feet like a prop. */
export interface Sign {
  text: string;
  x: number;
  y: number;
}

const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** A pixel rectangle as whole tiles. */
export const tilesOf = (r: Rect): Rect => ({
  x: r.x / TILE,
  y: r.y / TILE,
  width: r.width / TILE,
  height: r.height / TILE,
});

/**
 * The ground tile at every cell. Paving gets a kerb along any edge that
 * meets grass above it — but not where it meets a building, since a path
 * runs straight up to the door, and not where it meets the basketball
 * court: a kerb between two hard surfaces is a stone lip drawn across the
 * middle of the tarmac. The court stands in the middle of its block today
 * and touches no road, so that last rule says where the court may go
 * rather than describing the map as it is. Dock planking lies over the
 * water, so it is decided first.
 */
export interface GroundPlan {
  /** Slabs: the roads, the plaza, the paths to the doors. */
  paved: readonly Rect[];
  /** The buildings' footprints, which is what keeps a kerb from being drawn at a doorstep. */
  built: readonly Rect[];
  asphalt?: readonly Rect[];
  highway?: readonly Rect[];
  water?: readonly Rect[];
  dock?: readonly Rect[];
  court?: readonly Rect[];
  trail?: readonly Rect[];
  shingle?: readonly Rect[];
  lava?: readonly Rect[];
  /** The cave's floor, cut out of whatever the base is. */
  cave?: readonly Rect[];
  /**
   * What everything not otherwise named is. Grass on the world map and a
   * campus; black sand on Volcano Island; rock in the cave, where the floor
   * is the part that was dug out rather than the part laid down.
   */
  base?: Ground;
}

export function groundGrid(columns: number, rows: number, plan: GroundPlan): Ground[][] {
  const {
    paved,
    built,
    asphalt = [],
    highway = [],
    water = [],
    dock = [],
    court = [],
    trail = [],
    shingle = [],
    lava = [],
    cave = [],
    base = "grass",
  } = plan;
  const isPaved = (x: number, y: number) => paved.some((r) => inRect(r, x, y));
  const grid: Ground[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Ground[] = [];
    for (let x = 0; x < columns; x++) {
      if (dock.some((r) => inRect(r, x, y))) row.push("dock");
      else if (water.some((r) => inRect(r, x, y))) row.push("water");
      // After the water and before everything walked on, for the water's
      // reason: a path laid up to a lava flow stops at its edge.
      else if (lava.some((r) => inRect(r, x, y))) row.push("lava");
      else if (court.some((r) => inRect(r, x, y))) row.push("court");
      // After the water, which is the rule the wilderness's coastline is
      // drawn to rather than a thing to remember: the road stops at the sea
      // rather than being laid over it, and the sea stops short of the road.
      else if (highway.some((r) => inRect(r, x, y))) row.push("highway");
      else if (asphalt.some((r) => inRect(r, x, y))) row.push("asphalt");
      // After the water, so a trail laid up to the river stops at the bank
      // rather than being drawn across it. Nothing crosses the Gold River
      // today; when something does it will be planking, which is decided
      // first of all, above.
      else if (trail.some((r) => inRect(r, x, y))) row.push("trail");
      // And the shingle after the water for the same reason: a beach is laid
      // along the bank by the rows the water leaves dry, so a bend that moves
      // takes the beach with it rather than drawing it over the river. Where
      // a beach squares off a step in the bank the water has already given
      // those tiles up, so the order decides nothing there — see
      // `WOOD_BEACHES`.
      else if (shingle.some((r) => inRect(r, x, y))) row.push("shingle");
      else if (cave.some((r) => inRect(r, x, y))) row.push("cave");
      else if (!isPaved(x, y)) row.push(base);
      else if (
        y > 0 &&
        !isPaved(x, y - 1) &&
        !built.some((b) => inRect(b, x, y - 1)) &&
        !court.some((r) => inRect(r, x, y - 1))
      )
        row.push("kerb");
      else row.push("paving");
    }
    grid.push(row);
  }
  return grid;
}

/**
 * The water as solids, in pixels: one body per run of water tiles along a
 * row, with the dock left out so it can be walked. Nobody walks on the
 * sea, and a walk that is planned around it stays dry.
 */
export function waterBodies(grid: Ground[][]): Rect[] {
  const bodies: Rect[] = [];
  grid.forEach((row, y) => {
    let start = -1;
    const flush = (end: number) => {
      if (start >= 0)
        bodies.push({ x: start * TILE, y: y * TILE, width: (end - start) * TILE, height: TILE });
      start = -1;
    };
    row.forEach((ground, x) => {
      if (ground === "water") {
        if (start < 0) start = x;
      } else flush(x);
    });
    flush(row.length);
  });
  return bodies;
}

/**
 * Everything underfoot that nobody may stand on, as solids: the water, and
 * on Volcano Island the lava and the rock the cave is cut out of. The same
 * row-at-a-time runs as `waterBodies`, asked of every impassable ground at
 * once — the world map has none but water, so it goes on asking that.
 */
export function solidGround(grid: Ground[][]): Rect[] {
  const bodies: Rect[] = [];
  grid.forEach((row, y) => {
    let start = -1;
    const flush = (end: number) => {
      if (start >= 0)
        bodies.push({ x: start * TILE, y: y * TILE, width: (end - start) * TILE, height: TILE });
      start = -1;
    };
    row.forEach((ground, x) => {
      if (IMPASSABLE.has(ground)) {
        if (start < 0) start = x;
      } else flush(x);
    });
    flush(row.length);
  });
  return bodies;
}

/** A sign's board stands on the ground like a prop, and is as solid at the foot. */
export function signBody(sign: Sign): Rect {
  return propBody({ kind: "board", x: sign.x, y: sign.y })!;
}

// ── Props ──────────────────────────────────────────────

export interface PropSpec {
  /** Texture key, when the prop is not on the props sheet. */
  texture?: string;
  width: number;
  height: number;
  /** The solid part at the foot, centred on the prop's feet. Absent means walk-through. */
  footprint?: { width: number; height: number };
  /** Drawn frames with a second pose, shown in turn. */
  animate?: boolean;
}

export const PROPS = {
  tree: { width: 96, height: 120, footprint: { width: 22, height: 22 } },
  bush: { width: 64, height: 48, footprint: { width: 48, height: 18 } },
  lamp: { width: 32, height: 96, footprint: { width: 14, height: 10 } },
  bench: { width: 96, height: 48, footprint: { width: 92, height: 26 } },
  fountain: {
    width: 144,
    height: 96,
    footprint: { width: 132, height: 52 },
    animate: true,
  },
  planter: { width: 64, height: 48, footprint: { width: 52, height: 20 } },
  signpost: { width: 48, height: 96, footprint: { width: 12, height: 10 } },
  pond: { texture: "world-pond", width: 288, height: 192, footprint: { width: 268, height: 140 } },
  van: { texture: "van", width: 96, height: 144, footprint: { width: 88, height: 130 } },
  sheep: { width: 48, height: 40, footprint: { width: 30, height: 10 } },
  board: { width: 144, height: 88, footprint: { width: 112, height: 10 } },
  // The cabin on the far bank of the Gold River. Solid like any other prop,
  // and solid is the whole of it: there is no door to walk into and nothing
  // to press at, because it is across water nothing crosses. Its footprint
  // is the walls rather than the picture — the roof overhangs both ends and
  // the chimney stands off the top, neither of which is anything to bump
  // into.
  cabin: { width: 64, height: 72, footprint: { width: 48, height: 16 } },
  // The boulder in the Gold River, off the corner of the shoulder beach —
  // see `WOOD_BOULDER` in wood.ts. Solid like any other rock, and the
  // footprint buys nothing at all here, because the tile it stands in is
  // water and water is already solid: it is there so that a rock is a rock
  // the day somebody plants a crossing beside it. The body is the slab at
  // the waterline rather than the picture, which leans out over it.
  boulder: { width: 64, height: 56, footprint: { width: 48, height: 12 } },
  // The two ends of the basketball court, mirrored. Only the pole is solid:
  // the board is over your head and the rim is out over the court, so
  // walling off the whole picture would take a tile and a half of the end
  // line out of play for the sake of something nobody can walk into.
  hoopWest: { width: 112, height: 128, footprint: { width: 16, height: 12 } },
  hoopEast: { width: 112, height: 128, footprint: { width: 16, height: 12 } },
  // The mailbox outside a customer's building — see `lib/world/mailboxes.ts`,
  // which is where its size is written, because the bubble that hangs over it
  // is measured off the same number. Solid at the post and nowhere else: the
  // box itself is at chest height, so a footprint the width of the picture
  // would be a metre of kerb nobody can walk along for the sake of something
  // that is not in the way.
  mailbox: { width: MAILBOX.width, height: MAILBOX.height, footprint: { width: 16, height: 12 } },
  // Volcano Island's, and its cave's — see `lib/world/volcano.ts`. A lump of
  // black cinder and a tree the lava killed on the sand; a stalagmite and a
  // cluster of glowing crystal in the cave. All four are solid at the foot
  // only, for the reason everything else is: the body is what stands on the
  // ground, and the picture leans over it.
  cinder: { width: 64, height: 48, footprint: { width: 50, height: 16 } },
  snag: { width: 64, height: 96, footprint: { width: 14, height: 10 } },
  stalagmite: { width: 48, height: 72, footprint: { width: 26, height: 14 } },
  crystal: { width: 48, height: 56, footprint: { width: 30, height: 12 } },
} as const satisfies Record<string, PropSpec>;

export type PropKind = keyof typeof PROPS;

export interface PlacedProp {
  kind: PropKind;
  /** Feet: bottom centre, in world pixels. */
  x: number;
  y: number;
}

/** The picture's rectangle. */
export function propBounds(p: PlacedProp): Rect {
  const spec: PropSpec = PROPS[p.kind];
  return { x: p.x - spec.width / 2, y: p.y - spec.height, width: spec.width, height: spec.height };
}

/** The part a person cannot walk through, or null for a walk-through prop. */
export function propBody(p: PlacedProp): Rect | null {
  const foot = (PROPS[p.kind] as PropSpec).footprint;
  if (!foot) return null;
  return { x: p.x - foot.width / 2, y: p.y - foot.height, width: foot.width, height: foot.height };
}

/** The whole picture a prop is drawn from: bottom-centred on its position. */
export function propPicture(p: PlacedProp): Rect {
  const spec = PROPS[p.kind] as PropSpec;
  return {
    x: p.x - spec.width / 2,
    y: p.y - spec.height,
    width: spec.width,
    height: spec.height,
  };
}
