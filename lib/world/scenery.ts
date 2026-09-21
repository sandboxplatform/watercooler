/**
 * What stands on the world map besides the buildings.
 *
 * The ground is a grid of grass with paved areas laid on top: a promenade
 * along the bottom, a plaza in the middle, and a path up to each door. The
 * props are placed by their feet (bottom centre), which is also how they
 * sort against people: whoever's feet are lower is drawn in front.
 *
 * The props are drawn by scripts/make-world-art.mjs in the interiors'
 * palette. Nothing here touches Phaser, so the layout can be checked
 * without a browser.
 */

import {
  BOAT,
  BUILDINGS,
  CENTRE_X,
  DOCK,
  EAST_X,
  SHORE_ROW,
  TILE,
  TOWN_LEFT,
  TOWN_RIGHT,
  TOWN_TOP,
  WOOD_ROWS,
  WORLD_COLUMNS,
  WORLD_HEIGHT,
  WORLD_ROWS,
  WORLD_SPAWN,
  WORLD_WIDTH,
  type Rect,
} from "./tenants";
import { HIGHWAY, SEA, WILD_PLANTING, shoreAt } from "./wilderness";
import { blockedCells } from "./route";
import { COURT, HOOPS, hoopProp } from "./basketball";
import {
  WOOD_BEACHES,
  WOOD_BOULDER,
  WOOD_CABIN,
  WOOD_PLANTING,
  WOOD_TRAILS,
  riverBanks,
  riverBed,
} from "./wood";

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
  | "shingle";

const CENTRE = CENTRE_X / TILE;
/** The town's first column: what a column written in the town's own layout is off by. */
const TOWN = TOWN_LEFT / TILE;

/** Where the promenades run, in tile rows. */
export const NORTH_ROAD = WOOD_ROWS + 16;
export const SOUTH_ROAD = WOOD_ROWS + 30;

/**
 * The three avenues joining the two promenades, as the left of each pair of
 * tile columns: one in the west, one up the middle past the plaza, one out
 * east by the campus. Named because they are junctions — the routes across
 * the map run along them, and a wanderer's spots sit on them.
 */
export const WEST_AVENUE = TOWN + 8;
export const CENTRE_AVENUE = CENTRE + 14;
export const EAST_AVENUE = CENTRE + 30 + 6;

/**
 * The two crossings out in the shops' stretch, west of the town.
 *
 * Same job as the three above and no name of their own, because there is
 * nothing out there for them to be named after: they join the two roads
 * where the walk between them would otherwise be forty columns. One between
 * the first pair of shops and one between the second, so no doorstep on that
 * road is more than a few shops from a way down to the promenade.
 */
export const SHOP_AVENUES: readonly number[] = [12, 38];

/** Every crossing between the two roads, west to east. */
const AVENUES: readonly number[] = [...SHOP_AVENUES, WEST_AVENUE, CENTRE_AVENUE, EAST_AVENUE];

/** A path from a building's door straight down to the road below it, in tiles. */
function pathDown(b: (typeof BUILDINGS)[number]): Rect {
  const x = Math.floor((b.door.x + b.door.width / 2) / TILE) - 1;
  const y = (b.frame.y + b.frame.height) / TILE;
  const road = y <= NORTH_ROAD ? NORTH_ROAD : SOUTH_ROAD;
  return { x, y, width: 2, height: road - y };
}

/** Paved ground, in tiles. Order does not matter; anything paved is walkable. */
export const PAVED: readonly Rect[] = [
  // The two promenades, from the west edge of the map to the town's own east
  // edge — which is as far as the town goes. They used to run the map's whole
  // width, which was the same thing while the map was the town; carried east
  // unchanged, a slabbed promenade would have run out through the meadow and
  // off the edge of the world, and the wilderness is wilderness because
  // nothing has been laid through it.
  { x: 0, y: NORTH_ROAD, width: TOWN_RIGHT / TILE, height: 2 },
  { x: 0, y: SOUTH_ROAD, width: TOWN_RIGHT / TILE, height: 2 },
  { x: CENTRE + 11, y: WOOD_ROWS + 9, width: 8, height: 7 }, // plaza
  // A path to each door; the ferry has the dock instead.
  ...BUILDINGS.filter((b) => b.frame.y < SOUTH_ROAD * TILE).map(pathDown),
  // The avenues joining the two roads.
  ...AVENUES.map((x) => ({
    x,
    y: NORTH_ROAD + 2,
    width: 2,
    height: SOUTH_ROAD - NORTH_ROAD - 2,
  })),
];

/**
 * Asphalt, in tiles: the car park by the campus, off the east avenue, and
 * the highway down the far side of the wilderness.
 *
 * The same tarmac for both, and deliberately: a highway is a car park you
 * cannot stop on, and what makes it a road is the markings painted down it
 * rather than a second kind of ground. The scene lays those over the top in
 * one piece, the way it lays the basketball court's lines — see
 * `HIGHWAY_MARKS` in `components/game/scenes/outdoors.ts`.
 */
export const ASPHALT: readonly Rect[] = [
  { x: CENTRE + 30 + 9, y: WOOD_ROWS + 22, width: 6, height: 5 },
];

/**
 * The highway, in tiles, which is tarmac of its own rather than the car
 * park's.
 *
 * Not the same ground, and the difference is one white line: the car park's
 * tile carries a bay line down its left edge, which is what makes a field of
 * them read as parking bays and what would put a stripe across both lanes of
 * a road every forty-eight pixels. The markings that make this one a road
 * are painted over it in one piece, the way the basketball court's are —
 * see `placeHighwayMarks` in `components/game/scenes/outdoors.ts`.
 */
export const HIGHWAYS: readonly Rect[] = [HIGHWAY];

/**
 * The trails through the wood, in tiles.
 *
 * Their own ground rather than the town's paving, for the reason the court
 * and the car park have theirs: what is underfoot is a fact about the map,
 * and a slabbed pavement through a wood reads as the town having got there
 * first. Trodden earth instead — and no kerb, which is a thing a town lays
 * along a road rather than something a path through trees has.
 */
export const TRAILS: readonly Rect[] = WOOD_TRAILS;

/**
 * The rocky beaches on the far bank of the Gold River, in tiles.
 *
 * Ground rather than a picture laid over the grass, for the reason the court
 * and the trails are: what is underfoot is a fact about the map, and the one
 * list that answers "what is here" should answer it for the shingle too. It
 * is also what puts the beach *under* the river's foam, which is the whole
 * look of it — water lapping at stones rather than at a rectangle of them.
 */
export const BEACHES: readonly Rect[] = WOOD_BEACHES;

/**
 * The basketball court's surface, in tiles.
 *
 * Its own ground rather than a picture laid over the grass, for the reason
 * the car park is: what the court is made of is a fact about the map, and
 * the one list that answers "what is underfoot here" should answer it for
 * the court too. The lines painted on it are a separate picture — nine
 * tiles of centre circle and keys is not something a repeating tile can
 * carry — and the scene lays that over the top.
 */
export const COURTS: readonly Rect[] = [COURT];

/**
 * Open water, in tiles: the sea across the whole bottom of the map, past the
 * bushes on the shore, and the Gold River through the wood at the top.
 *
 * One list, so the river is solid, drawn and foamed at its banks by exactly
 * what the sea already goes through — `waterBodies` walks the ground grid
 * rather than this, so it never had to know there was only one of them.
 */
export const WATER: readonly Rect[] = [...SEA, ...riverBed()];

/**
 * Planking, in tiles: the dock out over the sea, and nothing else.
 *
 * This is also what a bridge over the Gold River would be — the dock is
 * already water walked over on boards — and there is deliberately not one:
 * the far bank of the river is somewhere to look at for now.
 */
export const DOCKS: readonly Rect[] = [DOCK];

/** A board with words on it, standing on its feet like a prop. */
export interface Sign {
  text: string;
  x: number;
  y: number;
}

/**
 * The board at the head of the dock, and nothing else on the map.
 *
 * There was one in the wood too, where the walk up from the town meets the
 * river, naming the Gold River. A sign earns its board by telling somebody
 * something they would otherwise get wrong — the dock's says where the boat
 * goes, which is the one thing about it a person cannot see — and a river
 * you are standing in front of is not that.
 */
export const WORLD_SIGNS: readonly Sign[] = [
  { text: "FERRY TO\nIRELAND", x: DOCK.x * TILE - 60, y: (SHORE_ROW - 1) * TILE + 44 },
];

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
  } = plan;
  const isPaved = (x: number, y: number) => paved.some((r) => inRect(r, x, y));
  const grid: Ground[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Ground[] = [];
    for (let x = 0; x < columns; x++) {
      if (dock.some((r) => inRect(r, x, y))) row.push("dock");
      else if (water.some((r) => inRect(r, x, y))) row.push("water");
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
      else if (!isPaved(x, y)) row.push("grass");
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

export function groundTiles(): Ground[][] {
  return groundGrid(WORLD_COLUMNS, WORLD_ROWS, {
    paved: PAVED,
    built: BUILDINGS.map((b) => tilesOf(b.frame)),
    asphalt: ASPHALT,
    highway: HIGHWAYS,
    water: WATER,
    dock: DOCKS,
    court: COURTS,
    trail: TRAILS,
    shingle: BEACHES,
  });
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

/** The world's water, as solids. */
export function worldWater(): Rect[] {
  return waterBodies(groundTiles());
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
} as const satisfies Record<string, PropSpec>;

export type PropKind = keyof typeof PROPS;

export interface PlacedProp {
  kind: PropKind;
  /** Feet: bottom centre, in world pixels. */
  x: number;
  y: number;
}

const treeLine = (y: number, xs: number[]): PlacedProp[] => xs.map((x) => ({ kind: "tree", x, y }));

/** Props in the middle screen, placed as if it stood alone, then moved into place. */
const centre = (props: PlacedProp[]): PlacedProp[] =>
  props.map((p) => ({ ...p, x: p.x + CENTRE_X }));

/**
 * The town's props, laid out in the town's own rows and moved down past the
 * wood — the same trick `centre` plays with x, for the reason in `TOWN_TOP`.
 *
 * So a y in here still reads against the town: the north road is row 16 of
 * it, the plaza row 9, and the trees along its top edge are at 118. The
 * wood's own props are placed in world rows and go in outside this.
 */
const town = (props: PlacedProp[]): PlacedProp[] => props.map((p) => ({ ...p, y: p.y + TOWN_TOP }));

/**
 * The town's *west* props, written in the town's own columns and moved east
 * past the shops — the same trick again, on the other axis, for the reason
 * in `TOWN_LEFT`.
 *
 * Only the west stretch needs it. Everything in the middle already goes
 * through `centre()` and everything out east is written off `EAST_X`, and
 * both of those are measured from `CENTRE_X`, which carries the shift
 * already. Sending one of those through here as well would move it east
 * twice — which is the mistake the basketball hoops were already caught by
 * on the other axis, and the reason they sit outside the `town()` block.
 */
const townWest = (props: PlacedProp[]): PlacedProp[] =>
  props.map((p) => ({ ...p, x: p.x + TOWN_LEFT }));

/**
 * Where the trail comes down out of the wood, in pixels, and how wide a hole
 * it needs in the tree line along the town's top edge.
 *
 * The line is a row of trees the whole way across, and a trunk in the middle
 * of a two-tile trail is a trail nobody can walk down. Taken off the trail
 * rather than written as a pair of numbers, since the two have to move
 * together and only one of them is visible on the map.
 */
const TRAIL_HEAD = { from: WOOD_TRAILS[0].x * TILE - 20, to: (WOOD_TRAILS[0].x + 2) * TILE + 20 };

/** Two rectangles touching. Also what `allReachable` asks of a cell below. */
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** A tile rectangle in pixels. */
const inPixels = (r: Rect): Rect => ({
  x: r.x * TILE,
  y: r.y * TILE,
  width: r.width * TILE,
  height: r.height * TILE,
});

/**
 * What no prop's **picture** may be drawn over, in pixels.
 *
 * Everything out of doors sorts by the bottom of its own picture, so a tree
 * whose feet are above a walker's is drawn in front of them: a canopy over a
 * path is a stretch of it somebody disappears along, and a canopy over a
 * lane is a car that vanishes halfway down the map.
 *
 * So: every hard surface — the roads and paths, the car park, the highway,
 * the court, the dock, the trails — and the buildings. It began as the
 * trails alone, which was the whole of it while the only scatter was the
 * wood's and the wood had nothing in it but trails. The meadow's scatter
 * runs down to the town's own edge, and the first thing it did was hang a
 * bush over the end of the north road.
 *
 * Asked of the scatter, which is where it matters, and of the tree line
 * along the town's top edge, which is the one run placed by hand long enough
 * to walk into something.
 */
const KEEP_CLEAR: readonly Rect[] = [
  ...[...PAVED, ...ASPHALT, ...HIGHWAYS, ...COURTS, ...DOCKS, ...WOOD_TRAILS].map(inPixels),
  ...BUILDINGS.map((b) => b.frame),
];

/**
 * Lamps and flowers at a shop's door, and a tree to one side of it.
 *
 * Measured off the building so that it follows the building, in the pixels
 * the frame is already in — which is why this sits outside the `town()`
 * block below rather than in it.
 */
const atTheDoor = (b: (typeof BUILDINGS)[number]): PlacedProp[] => {
  const base = b.frame.y + b.frame.height;
  const right = b.frame.x + b.frame.width;
  return [
    { kind: "bush", x: b.frame.x + 22, y: base + 20 },
    { kind: "bush", x: right - 22, y: base + 20 },
    { kind: "lamp", x: b.frame.x + 76, y: base + 66 },
    { kind: "lamp", x: right - 76, y: base + 66 },
    { kind: "tree", x: right + 96, y: b.frame.y + 32 },
  ];
};

/** Every 140px across a stretch. */
const along = (from: number, to: number, step: number): number[] => {
  const xs: number[] = [];
  for (let x = from; x <= to; x += step) xs.push(x);
  return xs;
};

/**
 * Everything on the map that was put somewhere on purpose.
 *
 * Kept apart from the scatter because the scatter has to fit **around** it:
 * a tree planted by a hash where a bench already stands is two footprints
 * merged into one wider solid, and the one that was chosen should be the one
 * that stays. So this is worked out first and `SCATTERED` is given its
 * bodies to keep off — which is the same rule the scatter already applies to
 * itself, asked one list wider.
 */
const PLACED: readonly PlacedProp[] = [
  // The cabin on the far bank of the Gold River.
  { kind: "cabin", ...WOOD_CABIN },
  // The boulder standing in the river at the foot of the shoulder beach,
  // likewise: a marked rock on the far side of water nothing crosses.
  { kind: "boulder", ...WOOD_BOULDER },
  // Bushes along the shore, the whole way — except at the dock and the
  // ferry. Their row is read off the coast rather than written as
  // `SHORE_ROW`: the shore steps south twice out in the wilderness and then
  // leaves the map altogether, so a row would put the last of them in the
  // water and the rest in a meadow with no sea in sight.
  ...along(80, WORLD_WIDTH - 60, 220)
    .filter((x) => x < DOCK.x * TILE - 140 || x > (DOCK.x + DOCK.width) * TILE + BOAT.width + 60)
    .map((x) => ({ x, shore: shoreAt(Math.floor(x / TILE)) }))
    .filter((b): b is { x: number; shore: number } => b.shore !== null)
    .map(({ x, shore }): PlacedProp => ({ kind: "bush", x, y: shore * TILE - 12 })),

  // The four newer shops' doorsteps. Taken off each building rather than
  // written out four times over, which is also what keeps them in front of
  // the door when a shop moves: Blockhouse's and Chester's are the same
  // arrangement, measured off theirs, from when there were two of them.
  ...BUILDINGS.filter((b) => b.org.style === "shop").flatMap(atTheDoor),

  // The shops' own park, between the two roads west of the town: trees,
  // benches and a lamp or two, the same furniture the town's blocks have.
  // In world columns, since this is the stretch the town moved east to make
  // room for and there is nothing here to be relative to. Written out rather
  // than scattered because a park is somewhere somebody laid out — the
  // scatter is for the wood and the meadow, which are not.
  { kind: "tree", x: 160, y: 2450 },
  { kind: "tree", x: 400, y: 2620 },
  { kind: "tree", x: 100, y: 2780 },
  { kind: "bench", x: 280, y: 2520 },
  { kind: "lamp", x: 220, y: 2360 },
  { kind: "lamp", x: 360, y: 2360 },

  { kind: "tree", x: 820, y: 2460 },
  { kind: "tree", x: 1150, y: 2700 },
  { kind: "tree", x: 1520, y: 2430 },
  { kind: "tree", x: 1700, y: 2650 },
  { kind: "tree", x: 960, y: 2800 },
  { kind: "bench", x: 1180, y: 2470 },
  { kind: "bench", x: 1360, y: 2470 },
  { kind: "planter", x: 1270, y: 2380 },
  { kind: "lamp", x: 790, y: 2360 },
  { kind: "lamp", x: 930, y: 2360 },
  { kind: "lamp", x: 1620, y: 2360 },
  { kind: "lamp", x: 1760, y: 2360 },

  { kind: "tree", x: 2060, y: 2520 },
  { kind: "tree", x: 2420, y: 2700 },
  { kind: "tree", x: 2660, y: 2460 },
  { kind: "bench", x: 2220, y: 2600 },
  { kind: "lamp", x: 2010, y: 2360 },
  { kind: "lamp", x: 2150, y: 2360 },

  // The basketball court's two hoops, standing on their own end lines. Read
  // off `HOOPS` rather than written out, because the ball is judged against
  // those same two points — a post placed by hand is a rim the ball falls
  // through somewhere the picture is not. Which is also why they are out
  // here rather than in the town below: `COURT` is a world row already, so
  // a hoop sent through `town()` would be moved down past the wood twice —
  // it put the two posts eighteen rows south of the court they belong to.
  ...HOOPS.map((h): PlacedProp => ({ kind: hoopProp(h), x: h.post.x, y: h.post.y })),

  // Everything below is the town, laid out in the town's own rows.
  ...town([
    // The trees along the town's top edge, the whole way — except over a
    // shopfront, and where the trail comes down out of the wood. It used to
    // be the wood; it is the wood's southern edge now.
    ...treeLine(
      118,
      along(60, WORLD_WIDTH - 60, 140).filter(
        (x) =>
          // Not over a shopfront, and not over the highway. It used to be a
          // pair of numbers excluding the stretch Blockhouse stands on, which
          // was one building's worth of exception written out by hand; there
          // are five shops standing in this row now and a road through the
          // east end of it, so it is asked of the map instead.
          !KEEP_CLEAR.some((r) =>
            overlaps(propBounds({ kind: "tree", x, y: TOWN_TOP + 118 }), r),
          ) &&
          (x < TRAIL_HEAD.from || x > TRAIL_HEAD.to),
      ),
    ),

    // The town's own west: Blockhouse and Chester, each with lamps and
    // flowers at the door. In the town's columns, so east past the shops.
    ...townWest([
      { kind: "tree", x: 700, y: 250 },
      { kind: "tree", x: 1330, y: 300 },
      { kind: "tree", x: 1000, y: 640 },
      { kind: "bush", x: 214, y: 404 },
      { kind: "bush", x: 458, y: 404 },
      { kind: "lamp", x: 268, y: 450 },
      { kind: "lamp", x: 404, y: 450 },
      { kind: "bush", x: 550, y: 692 },
      { kind: "bush", x: 794, y: 692 },
      { kind: "lamp", x: 600, y: 740 },
      { kind: "lamp", x: 744, y: 740 },
      { kind: "planter", x: 520, y: 300 },
    ]),

    // Centre: the plaza between the two head offices. The trail down out of
    // the wood lands on its top edge, so the west half of that edge is kept
    // clear: a tree, a bush and a planter stood there from before there was
    // a wood above it, and out of doors everything sorts by the bottom of
    // its own picture — a canopy over a path is a stretch of it somebody
    // walking disappears along.
    ...centre([
      ...treeLine(250, [130, 1400]),
      { kind: "tree", x: 100, y: 420 },
      { kind: "tree", x: 1340, y: 420 },
      { kind: "tree", x: 830, y: 300 },
      { kind: "bush", x: 262, y: 500 },
      { kind: "bush", x: 490, y: 500 },
      { kind: "bush", x: 950, y: 500 },
      { kind: "bush", x: 1178, y: 500 },
      { kind: "lamp", x: 316, y: 540 },
      { kind: "lamp", x: 452, y: 540 },
      { kind: "lamp", x: 988, y: 540 },
      { kind: "lamp", x: 1124, y: 540 },
      { kind: "planter", x: 820, y: 424 },
      { kind: "fountain", x: 720, y: 620 },
      { kind: "bench", x: 720, y: 720 },
      { kind: "lamp", x: 504, y: 560 },
      { kind: "lamp", x: 936, y: 560 },
    ]),

    // South of the north road: a park with a pond in the middle stretch,
    // the campus car park to the east with the vans in it, and along the
    // south road, plots for the businesses still to come.
    // The pond has the middle of the west block: its picture is centred on the
    // block rather than its feet, since what anybody sees is the water. The
    // benches keep their places either side of it and came with it.
    { kind: "pond", x: CENTRE_X + 192, y: 1248 },
    { kind: "bench", x: CENTRE_X + 12, y: 1108 },
    { kind: "bench", x: CENTRE_X + 372, y: 1108 },
    // Below the pond rather than beside it, which is where the water now is.
    { kind: "tree", x: CENTRE_X - 68, y: 1330 },
    { kind: "tree", x: CENTRE_X + 540, y: 1100 },
    { kind: "tree", x: CENTRE_X + 200, y: 1010 },
    { kind: "bush", x: CENTRE_X + 380, y: 1000 },
    // The east block's fringe: the court has the middle of it, so everything
    // that stood on what is now tarmac went out to the two tiles round it.
    { kind: "planter", x: CENTRE_X + 900, y: 950 },
    { kind: "planter", x: CENTRE_X + 1100, y: 950 },
    { kind: "tree", x: CENTRE_X + 816, y: 1160 },
    { kind: "tree", x: CENTRE_X + 1382, y: 950 },
    // The lab stands back among trees, at the far end of the town's own
    // south road — which is no longer the far end of the map.
    ...townWest([
      ...treeLine(990, [80, 210, 330]),
      { kind: "tree", x: 520, y: 1120 },
      { kind: "tree", x: 530, y: 1260 },
      { kind: "bush", x: 60, y: 1330 },
      { kind: "lamp", x: 120, y: 1370 },
      { kind: "lamp", x: 264, y: 1370 },

      { kind: "lamp", x: 360, y: 1250 },
      { kind: "lamp", x: 504, y: 1250 },
    ]),
    { kind: "lamp", x: CENTRE_X + 650, y: 1000 },
    { kind: "lamp", x: CENTRE_X + 790, y: 1000 },
    { kind: "van", x: EAST_X + 480, y: 1280 },
    { kind: "van", x: EAST_X + 590, y: 1280 },
    { kind: "van", x: EAST_X + 700, y: 1280 },
    { kind: "tree", x: EAST_X + 240, y: 1160 },
    { kind: "tree", x: EAST_X + 700, y: 1000 },
    { kind: "lamp", x: EAST_X + 260, y: 1000 },
    { kind: "lamp", x: EAST_X + 400, y: 1000 },

    // East: the campus gate, with a formal approach.
    ...[
      { kind: "tree", x: 80, y: 300 },
      { kind: "tree", x: 700, y: 300 },
      { kind: "planter", x: 200, y: 520 },
      { kind: "planter", x: 480, y: 520 },
      { kind: "lamp", x: 250, y: 620 },
      { kind: "lamp", x: 420, y: 620 },
      { kind: "bench", x: 160, y: 700 },
      { kind: "bench", x: 560, y: 700 },
    ].map((p): PlacedProp => ({ ...(p as PlacedProp), x: p.x + EAST_X })),
  ]),
];

/**
 * The wood's and the meadow's trees and bushes: every candidate `wood.ts`
 * and `wilderness.ts` scattered, less the ones that cannot stand where they
 * fell.
 *
 * Four rules, and all of them are about the **picture** or the body rather
 * than about a pair of feet — which is why they are here and not in the two
 * files the scatters come from: only this file knows how big a tree is
 * drawn.
 *
 * | Rule                              | Why                                                                                                                                                                                           |
 * | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 * | Nothing hangs over hard ground    | Everything out of doors sorts by the bottom of its own picture, so a walker whose feet are above a tree's is drawn *behind* it. A stretch of path somebody disappears along is not a path     |
 * | Nothing off the edges of the map  | The camera is clamped to the map, so a tree planted on row 0 is a tree with its bottom third showing and nothing above it                                                                     |
 * | No two trunks in the same place   | Bodies, not pictures. Canopies overlapping is what a wood *is*; two footprints merged into one is a wider solid than either, and enough of them is a thicket the route planner has to go round |
 * | And none of them on a placed prop | Same rule, asked one list wider: what somebody chose the place of wins, and the scatter fits round it                                                                                         |
 *
 * The first is asymmetric and rightly so: a tree's picture is above its
 * feet, so one on the north side of a trail may stand almost on the edge of
 * it while one on the south side has to be a good two tiles back. Canopies
 * lean over the path from above, which is what a wood looks like.
 */
const SCATTERED: readonly PlacedProp[] = (() => {
  const planted: PlacedProp[] = [];
  // Seeded with what is already standing, so the scatter fits round the
  // things somebody chose the place of — the tree line along the town's top
  // edge, the bushes on the shore, the lamps at a shopfront. It began empty,
  // and the four props that came out of it stacked were all at a seam: the
  // meadow's scatter meeting the shore, and the wood's meeting the tree line
  // under it.
  const bodies: Rect[] = PLACED.map(propBody).filter((r): r is Rect => r !== null);
  for (const p of [...WOOD_PLANTING, ...WILD_PLANTING]) {
    const picture = propBounds(p);
    if (KEEP_CLEAR.some((r) => overlaps(picture, r))) continue;
    if (picture.y < -TILE || picture.x < -TILE || picture.x + picture.width > WORLD_WIDTH + TILE) {
      continue;
    }
    const body = propBody(p);
    if (body && bodies.some((other) => overlaps(body, other))) continue;
    planted.push(p);
    if (body) bodies.push(body);
  }
  return planted;
})();

/**
 * Everything on the world map that is not a building: the scatter, and what
 * was put where it is.
 *
 * The order between the two is nothing — out of doors everything sorts by
 * the bottom of its own picture — but it is the order they are worked out
 * in, and the scatter is the one that has to be told about the other.
 */
export const SCENERY: readonly PlacedProp[] = [...SCATTERED, ...PLACED];

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

// ── Can you still get everywhere? ──────────────────────

/**
 * Every cell a person can walk to from `from`, as indexes into a grid
 * `cols` wide. Coarse: cells the size of a person's feet, a cell blocked if
 * any solid touches it.
 *
 * Handed back rather than kept private because two questions want the same
 * flood and they want different things out of it: `allReachable` asks
 * whether a handful of places are in it, and `worldWanderSpots()` asks
 * which of a lattice of candidates are — and a second flood for the second
 * question is fifty thousand cells walked twice.
 */
export function reachedFrom(
  bounds: { width: number; height: number },
  solids: readonly Rect[],
  from: { x: number; y: number },
  cell = 24,
): { cols: number; rows: number; seen: Set<number> } {
  const cols = Math.ceil(bounds.width / cell);
  const rows = Math.ceil(bounds.height / cell);
  // Painted once rather than asked per cell, which is the route planner's
  // own answer to the same question — see `blockedCells`. It used to test
  // every solid against every cell: on the map as it now stands that is
  // fifty thousand cells against better than a thousand rectangles, a
  // second or so a call, and this is called several times over in the
  // tests that hold the map together.
  const cells = blockedCells(solids, cols, rows, cell);
  const key = (cx: number, cy: number) => cy * cols + cx;
  const start = { cx: Math.floor(from.x / cell), cy: Math.floor(from.y / cell) };
  const seen = new Set<number>([key(start.cx, start.cy)]);
  const queue = [start];
  while (queue.length) {
    const { cx, cy } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (seen.has(key(nx, ny)) || blocked(cells, cols, nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push({ cx: nx, cy: ny });
    }
  }
  return { cols, rows, seen };
}

const blocked = (cells: Uint8Array, cols: number, cx: number, cy: number) =>
  cells[cy * cols + cx] === 1;

/**
 * Whether a person can walk from `from` to every one of `targets` with the
 * solids in the way.
 */
export function allReachable(
  bounds: { width: number; height: number },
  solids: Rect[],
  from: { x: number; y: number },
  targets: { x: number; y: number }[],
  cell = 24,
): boolean {
  const { cols, seen } = reachedFrom(bounds, solids, from, cell);
  return targets.every((t) => seen.has(Math.floor(t.y / cell) * cols + Math.floor(t.x / cell)));
}

/**
 * Everything solid on the world map: the buildings, the props' feet, the
 * signs, the sea, and the Gold River with the strip beside it. Worked out
 * once.
 *
 * None of it moves — the map is laid out at module load and stays put for
 * as long as the process runs — and it was being rebuilt from scratch on
 * every call, a hundred and sixteen rectangles including a sweep of the sea,
 * about a millisecond and a half each time. `clearToStand` asks for it, and
 * `placeInRow` asks `clearToStand` for every step along the row, so finding
 * one resident somewhere to stand cost several milliseconds of rebuilding
 * the same list. The route planner keeps its grid against this array's
 * identity, too, so handing back the same one is what lets that be kept at
 * all.
 */
let solids: Rect[] | null = null;
export function worldSolids(): Rect[] {
  return (solids ??= [
    ...BUILDINGS.map((b) => b.solid),
    ...SCENERY.map(propBody).filter((r): r is Rect => r !== null),
    ...WORLD_SIGNS.map(signBody),
    ...worldWater(),
    // The river itself is in the water above. This is the strip along it
    // nobody may stand on, because standing there is being drawn in it —
    // see `riverBanks`.
    ...riverBanks(),
  ]);
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

/**
 * Whether somebody standing here would be seen standing here.
 *
 * Solid is not the question. Out of doors everything sorts by the bottom of
 * its own picture, so a person whose feet are above a building's or a prop's
 * bottom edge is drawn *behind* it — and the bottom strip of a picture is
 * walkable ground, since only the wall is solid. Yoshi took his place beside
 * Chester and vanished into the wall with his name tag showing underneath.
 *
 * So this asks about the pictures, which are bigger than the bodies: no
 * building frame, no prop, and nothing solid either. Somewhere a person can
 * stand and be looked at.
 */
export function clearToStand(at: { x: number; y: number }): boolean {
  const holds = (r: Rect) =>
    at.x >= r.x && at.x < r.x + r.width && at.y >= r.y && at.y < r.y + r.height;
  if (BUILDINGS.some((b) => holds(b.frame))) return false;
  if (SCENERY.some((p) => holds(propPicture(p)))) return false;
  return !worldSolids().some(holds);
}

let standing: Rect[] | null = null;

/**
 * Everything `clearToStand` asks about, as one list: the building frames,
 * the prop pictures and the solids.
 *
 * Kept, like `worldSolids`, so it can be painted into a grid — the wood
 * plants a couple of thousand trees and asking one point against the lot
 * is a thousand rectangle tests. Somewhere that sweeps the map for
 * standing room does it a few thousand times over.
 */
export function standingRoom(): Rect[] {
  if (standing) return standing;
  return (standing = [
    ...BUILDINGS.map((b) => b.frame),
    ...SCENERY.map(propPicture),
    ...worldSolids(),
  ]);
}

/** Whether every building's door on the world map can be reached from the spawn. */
export function everyDoorReachable(cell = 24): boolean {
  return allReachable(
    { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    worldSolids(),
    WORLD_SPAWN,
    BUILDINGS.map((b) => ({ x: b.door.x + b.door.width / 2, y: b.door.y })),
    cell,
  );
}
