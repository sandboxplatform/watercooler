/**
 * The wilderness east of the campus, and the highway down the far side of
 * it.
 *
 * Nothing is built out here. The town stops at the car park and what
 * follows is sixty-odd columns of meadow and scattered trees, with the Gold
 * River turning north through the top of it and one road running the whole
 * height of the map four columns in from the east edge.
 *
 * **The road is the only thing in it that is anybody's**, and it is not the
 * town's: it passes through rather than arriving, which is what a highway
 * is. Cars come down it and go up it now and then and never stop — see
 * `lib/server/traffic.ts`, which is the side that decides when one sets
 * off, and `components/game/systems/Highway.ts`, which draws them.
 *
 * **And the coast turns away from it.** The sea used to be a rectangle the
 * whole width of the map, which would have put the highway's south end in
 * the water — a road that stops at a beach, with the cars on it having
 * nowhere to go. The shore steps south twice as it runs east and leaves the
 * map before the road does, so the road runs off the bottom edge the way it
 * runs off the top one: `SEA` is that coastline, and `scenery.ts` lays the
 * water from it.
 *
 * Like `wood.ts`, this is the shape of the place and nothing else: no
 * Phaser, no props sheet, not even `PlacedProp`. `scenery.ts` imports it and
 * turns the scatter into props.
 */

import {
  SHORE_ROW,
  TILE,
  TOWN_RIGHT,
  WOOD_ROWS,
  WORLD_COLUMNS,
  WORLD_ROWS,
  type Rect,
} from "./tenants";

/** The first column of the wilderness: the town's east edge. */
export const WILD_FROM = TOWN_RIGHT / TILE;

/**
 * The highway, in tiles: four columns of tarmac from the top edge of the map
 * to the bottom.
 *
 * Four columns in from the east edge, which is as near the far side as it
 * can stand and still have a verge on both sides — a road drawn against the
 * edge of the map is a road with one shoulder, and the camera is clamped to
 * the map, so the missing one is on screen.
 *
 * Four wide because it carries two lanes: the markings are laid over the
 * tarmac as one picture, and two tiles a lane is what makes a lane wider
 * than the car in it.
 */
export const HIGHWAY: Rect = { x: WORLD_COLUMNS - 8, y: 0, width: 4, height: WORLD_ROWS };

/** The highway in pixels, which is what the scene and the traffic want. */
export const HIGHWAY_PX: Rect = {
  x: HIGHWAY.x * TILE,
  y: HIGHWAY.y * TILE,
  width: HIGHWAY.width * TILE,
  height: HIGHWAY.height * TILE,
};

/**
 * The middle of each lane, in world pixels.
 *
 * Drive on the right, so the lane going **north** is the eastern one and the
 * lane going **south** is the western one. That is not decoration: a car is
 * drawn facing the way it is going, and two of them passing on the wrong
 * sides of each other is the one thing about a road anybody would notice
 * from the far side of a meadow.
 */
export const HIGHWAY_LANES: Record<"north" | "south", number> = {
  south: HIGHWAY_PX.x + TILE,
  north: HIGHWAY_PX.x + TILE * 3,
};

/**
 * The coastline, as the columns each run of sea spans and the row it starts
 * at.
 *
 * The sea was one rectangle the whole width of the map and the shore one
 * straight row, which was true enough while the map ended at the campus.
 * Carried east unchanged it would have run the beach out to the far edge and
 * drowned the foot of the highway.
 *
 * So it steps: full depth under the town, a couple of rows shallower out in
 * the wilderness, and gone before the road. Two steps rather than a curve,
 * because the sea here is five rows deep altogether and a curve drawn in
 * five rows is a straight line with a dent in it.
 */
const COAST: readonly { from: number; to: number; row: number }[] = [
  { from: 0, to: 160, row: SHORE_ROW },
  { from: 160, to: 172, row: SHORE_ROW + 2 },
];

/**
 * The sea, in tiles: one rectangle per run of the coast, each reaching from
 * its own shore row to the bottom of the map.
 *
 * `scenery.ts` lays this beside the river as one list of water, so the
 * stepped shore is drawn, walled and foamed by exactly what the straight one
 * already went through — the foam follows the ground grid, so the steps get
 * a lapping edge down their western sides for nothing.
 */
export const SEA: readonly Rect[] = COAST.map(({ from, to, row }) => ({
  x: from,
  y: row,
  width: to - from,
  height: WORLD_ROWS - row,
}));

/** The shore row at a column, or null where the sea has left the map. */
export function shoreAt(column: number): number | null {
  const run = COAST.find((c) => column >= c.from && column < c.to);
  return run ? run.row : null;
}

/** Whether a tile is in the sea. */
function atSea(column: number, row: number): boolean {
  const shore = shoreAt(column);
  return shore !== null && row >= shore;
}

/**
 * Whether a tile is on the highway or its verges.
 *
 * A tile wider than the tarmac on each side, because this is what keeps the
 * scatter off the road and a tree is drawn from a good way above its own
 * feet: a trunk on the verge is a canopy over the near lane.
 */
function onTheRoad(column: number, row: number): boolean {
  return column >= HIGHWAY.x - 1 && column < HIGHWAY.x + HIGHWAY.width + 1 && row < HIGHWAY.height;
}

/** A settled scatter: the same meadow every time the server starts. */
const scatter = (a: number, b: number) => {
  const n = Math.sin(a * 311.7 + b * 127.1) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * Where a tree or a bush could stand out here: scattered by a hash rather
 * than written out, by the feet, in world pixels.
 *
 * The same trick the wood is planted by, and deliberately a **thinner** one:
 * about one cell in six against the wood's two in five, and more bushes than
 * trees. The wood above the town is a thing you cannot see the far side of;
 * this is open ground with clumps in it, which is what makes walking east
 * out of the car park read as leaving the town rather than as entering
 * another wood.
 *
 * The rows are the town's rather than the wood's: the thirty above are
 * already planted by `WOOD_PLANTING`, which runs the map's whole width, so
 * this picks up where that leaves off and carries on to the bottom edge —
 * which out here is land, the coast having turned away.
 *
 * **Candidates, not the planting**, exactly as the wood's are: what is kept
 * out here is what a pair of feet can decide — the sea and the road.
 * Whether a prop's *picture* hangs over something is `scenery.ts`'s
 * question, since only that file knows how big a tree is drawn.
 */
export const WILD_PLANTING: readonly { kind: "tree" | "bush"; x: number; y: number }[] = (() => {
  const props: { kind: "tree" | "bush"; x: number; y: number }[] = [];
  for (let row = WOOD_ROWS; row < WORLD_ROWS; row++) {
    for (let column = WILD_FROM; column < WORLD_COLUMNS; column++) {
      const roll = scatter(column, row);
      if (roll > 0.17) continue;
      if (atSea(column, row)) continue;
      if (onTheRoad(column, row)) continue;
      // Jittered off the grid, or a meadow reads as an orchard.
      const jitter = scatter(row + 7, column + 13);
      const x = (column + 0.2 + jitter * 0.6) * TILE;
      const y = (row + 0.6 + scatter(column + 3, row + 29) * 0.4) * TILE;
      props.push({ kind: roll < 0.07 ? "tree" : "bush", x, y });
    }
  }
  return props;
})();
