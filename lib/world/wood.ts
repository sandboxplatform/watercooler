/**
 * The wood along the top of the map, and the Gold River through it.
 *
 * Thirty rows of trees above the town (`WOOD_ROWS`), with a river coming
 * down out of the north-west, bending east and running the whole width of
 * the map, and a walk along the near bank of it. The town begins below it at
 * `TOWN_TOP`, which is why anything laid out here is in plain world rows
 * from 0 while the town's own layout is written in its own rows and moved
 * down.
 *
 * **Nothing crosses the water.** The river is solid like the sea, so the
 * north-east of the wood is somewhere to look at rather than somewhere to
 * go — see `WOOD_TRAILS` for what a crossing would take.
 *
 * **And nobody stands in it either.** A character is drawn from a little
 * above where they stand to a good way below it, so keeping their feet out
 * of the water is not the same as keeping them out of the river — see
 * `riverBanks`, which is the rule that actually holds.
 *
 * This is the shape of the place and nothing else: no Phaser, no props
 * sheet, not even `PlacedProp` — `scenery.ts` imports this and turns the
 * trees into props, which is what keeps the two from importing each other.
 *
 * **The river is a line with a width, not a list of rectangles.** A river
 * drawn as rectangles is one nobody can change: move a bend and every
 * rectangle after it is wrong. `RIVER` is the centreline and `riverBed()`
 * rasterises it, so reshaping the river is moving points on a line — which
 * is what it took to trace the drawing properly rather than approximately.
 */

import { TILE, WOOD_ROWS, WORLD_COLUMNS, type Rect } from "./tenants";

/** A point on the river's centreline, in tiles. */
export interface Bend {
  x: number;
  y: number;
}

/** The drawing the river was traced off, in its own pixels: 505 across. */
const DRAWING = { width: 505 };

/**
 * The Gold River's centreline, in the drawing's pixels.
 *
 * The first two thirds are **measured rather than sketched**: the blue was
 * read out of the picture, the middle of it taken row by row down the
 * north-south limb and column by column along the eastward run, and the
 * result thinned to the points where it actually turns. Writing it in the
 * drawing's own units is what lets the fit below be one pair of numbers
 * instead of twenty pairs redone by hand every time the wood changes depth.
 *
 * What the shape is, and it is a **soft W**: it comes in off the top edge
 * and leans east as it falls, turns back west a fifth of the way down and
 * runs back down to an elbow — that is the first V — then east across the
 * map, shallow at first, and dropping steeply a little past halfway.
 *
 * **East of that drop the line is ours, and it is where the second V of the
 * W comes from.** The drawing runs near enough flat from there to the edge,
 * and flat water crops nothing out of the wood: the whole point of a bend is
 * the land it leaves, and a river with no bends in it leaves one long even
 * strip. So the tail is a valley at the foot of the drop, a hump halfway
 * along, and a second valley as it goes off the east edge — which puts a
 * tongue of wood into each valley from the north and one into the hump from
 * the south. Three outcrops, and the first of them is the one with the cabin
 * on it. The drawing's own flat stretch is still in there as the shallow
 * top of the hump; what changed is that it now has something either side.
 *
 * The first and last points are deliberately off the map: a river that
 * starts at the edge starts with a blunt end, and both of these carry on out
 * of sight.
 */
const TRACED: readonly (readonly [number, number])[] = [
  // Down out of the north-west, leaning east as it falls.
  [35.3, -60],
  [69.6, 3],
  [114.2, 85],
  // The furthest east the fall gets, and then back the other way.
  [116.9, 95],
  [115.6, 126],
  [92.5, 224],
  [93.5, 252],
  // The elbow: it turns and runs east from here.
  [101, 272],
  [146, 288.5],
  [233, 313.6],
  // And drops away steeply, a little past halfway. The head of the drop is
  // the last point off the drawing; everything below is ours.
  [249, 327],
  [291, 400],
  // The floor of the valley, and the deepest the river gets on the map.
  [314, 437],
  [342, 428],
  [375, 400.6],
  // The top of the hump.
  [407, 375],
  [448, 387.8],
  // And down into the second valley, which is the edge of the map.
  [476, 411.5],
  [501, 433.3],
  [530, 458.8],
];

/**
 * How many rows are kept below the river where it runs lowest.
 *
 * The river leaves the map at four fifths of the drawing's height, so a fit
 * that used the wood's whole depth would put the water a row or two off the
 * town with nowhere for the walk along the bank to go. Six rows is the
 * water's own half width, the two the walk takes, and a row of trees either
 * side of it.
 */
const BANK_ROOM = 6;

/** How far down the drawing the river gets while it is still on the map. */
const DEEPEST = Math.max(...TRACED.filter(([x]) => x <= DRAWING.width).map(([, y]) => y));

/**
 * The centreline in tiles: the drawing fitted across the map's whole width,
 * and down until the lowest the river gets on the map sits `BANK_ROOM` rows
 * off the wood's foot.
 *
 * **The slopes are flatter here than in the drawing, and cannot not be.**
 * The drawing is square and the wood is sixty-two tiles across by thirty
 * deep, so mapping the one onto the other compresses the vertical about
 * twice as hard as the horizontal and every angle lies down with it. That
 * is most of why the tail is drawn rather than traced: a bend already half
 * flattened by the fit has to be a real bend to begin with or it comes out
 * as a bevel. What survives either way, and what makes it the same river, is
 * where the bends fall and how they compare — the drop is several times the
 * slope of the shallow run before it, here as there. Making every angle read
 * true would mean a wood as deep as the map is wide, and the wood would then
 * be bigger than the world it sits above; deepening it from twenty-two rows
 * to thirty is as far as that trade is worth taking.
 *
 * **No bend falls faster than a row a column**, which is not a coincidence:
 * the walk along the bank steps down with the water, and a step of two rows
 * is a walk with a hole in it. `wood.test.ts` holds it.
 */
export const RIVER: readonly Bend[] = TRACED.map(([x, y]) => ({
  x: (x * WORLD_COLUMNS) / DRAWING.width,
  y: (y * (WOOD_ROWS - BANK_ROOM)) / DEEPEST,
}));

/**
 * Half the river's width, in tiles.
 *
 * Three and a half tiles across, which is what the drawing's own river
 * measures once its width is read against the map's width — wide enough
 * that it is water rather than a stream and that there is no stepping over
 * it, narrow enough to still read as a river rather than as the sea coming
 * inland. Held to one number rather than taken per axis from the drawing:
 * stretched over a map twice as wide as it is deep, a width in the
 * picture's own pixels would make the eastward run half the river the
 * north-south one is.
 */
const RIVER_HALF = 1.75;

/** The shortest distance from a point to a line segment, all in tiles. */
function toSegment(px: number, py: number, a: Bend, b: Bend): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / length));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

/** Whether the middle of this tile is in the water. */
function inRiver(column: number, row: number): boolean {
  const x = column + 0.5;
  const y = row + 0.5;
  for (let i = 1; i < RIVER.length; i++) {
    if (toSegment(x, y, RIVER[i - 1], RIVER[i]) <= RIVER_HALF) return true;
  }
  return false;
}

let drawn: Rect[] | null = null;

/**
 * The river as the centreline draws it, before the beaches take their
 * shelves out of it — one rectangle per run along a row.
 *
 * Runs rather than single tiles because everything downstream of this walks
 * a list per cell of the map — the ground grid asks "is this tile water?" of
 * every rectangle — and a hundred-odd one-tile rectangles is a hundred-odd
 * answers per cell to get one. Worked out once and kept, like `worldSolids`
 * and for the same reason.
 *
 * Private, and the one thing in here that is: `WOOD_BEACHES` is measured off
 * the bank this draws and then cut out of it, so a beach asking `riverBed`
 * where the bank is would be asking a question its own answer had already
 * moved. Everything else wants the water as it ends up, which is `riverBed`.
 */
function drawnBed(): Rect[] {
  if (drawn) return drawn;
  const rows: Rect[] = [];
  for (let row = 0; row < WOOD_ROWS; row++) {
    let start = -1;
    for (let column = 0; column <= WORLD_COLUMNS; column++) {
      const wet = column < WORLD_COLUMNS && inRiver(column, row);
      if (wet && start < 0) start = column;
      if (!wet && start >= 0) {
        rows.push({ x: start, y: row, width: column - start, height: 1 });
        start = -1;
      }
    }
  }
  drawn = rows;
  return drawn;
}

let bed: Rect[] | null = null;

/**
 * The river as whole tiles, one rectangle per run along a row: the water the
 * map is actually drawn and walked from.
 *
 * The drawn bed above, less the shelves the beaches square off — see
 * `WOOD_BEACHES`. A tile of shingle is a tile of bank, so it comes out of
 * the water here rather than being laid over it: the ground grid draws water
 * before shingle, the foam laps at whatever the water's edge turns out to
 * be, and `riverBanks` grows its solid off this, so subtracting once here is
 * the whole of it.
 */
export function riverBed(): Rect[] {
  if (bed) return bed;
  const rows: Rect[] = [];
  for (const run of drawnBed()) {
    let start = -1;
    for (let column = run.x; column <= run.x + run.width; column++) {
      const wet = column < run.x + run.width && !onShingle(column, run.y);
      if (wet && start < 0) start = column;
      if (!wet && start >= 0) {
        rows.push({ x: start, y: run.y, width: column - start, height: 1 });
        start = -1;
      }
    }
  }
  bed = rows;
  return bed;
}

/** Whether this tile is one of the beaches'. */
function onShingle(column: number, row: number): boolean {
  return WOOD_BEACHES.some(
    (b) => column >= b.x && column < b.x + b.width && row >= b.y && row < b.y + b.height,
  );
}

/**
 * How far a character's picture reaches above and below where they stand,
 * and how wide it is, in pixels.
 *
 * A character's position is the middle of their 96px frame and the figure
 * inside it is drawn from row 28 to row 91 — so twenty pixels of them are
 * above where they stand and forty-three below. It is the same fact
 * `FEET_BELOW_CENTRE` is about, asked of the whole figure rather than of the
 * feet.
 */
const FIGURE = { above: 20, below: 43, half: 12 };

/**
 * The patch of the map a character standing here is drawn over, in pixels.
 *
 * The one crossing between where somebody is and what they cover, which is
 * the whole of what "standing in the river" means: `riverBanks` is this
 * turned inside out, and `wood.test.ts` asks it of every tile of the wood
 * anybody can reach.
 */
export function drawnOver(at: { x: number; y: number }): Rect {
  return {
    x: at.x - FIGURE.half,
    y: at.y - FIGURE.above,
    width: FIGURE.half * 2,
    height: FIGURE.above + FIGURE.below,
  };
}

let banks: Rect[] | null = null;

/**
 * The strip along the water nobody may stand on, in pixels.
 *
 * **Keeping feet out of the river is not the same as keeping people out of
 * it.** Everything out of doors is drawn over whatever is behind it, and a
 * character is drawn a good way above their own position — so somebody whose
 * feet are on the first dry tile is drawn from the waist up across the near
 * bank, and somebody walking past on the tile below that still has their
 * head in the water. Residents are routed round the solids and nothing
 * collides them, so the only way to keep one out of the river is for the
 * ground beside it not to be somewhere they can be sent.
 *
 * So the water's rectangles are grown by the figure that would be drawn over
 * them — up by what stands below a position, down by what stands above it,
 * and half a body either side. That is a solid rather than a rule anybody
 * has to remember: it is added to `worldSolids`, so the route planner, the
 * player's own collision and `clearToStand` all get it for nothing.
 *
 * The sea is deliberately left alone. Its edge is the bottom of the map with
 * the promenade, the dock and the shore bushes along it, and a character at
 * the water's edge there is seen against the sea from below rather than
 * standing in it.
 */
export function riverBanks(): Rect[] {
  return (banks ??= riverBed().map((r) => ({
    x: r.x * TILE - FIGURE.half,
    y: r.y * TILE - FIGURE.below,
    width: r.width * TILE + FIGURE.half * 2,
    height: r.height * TILE + FIGURE.below + FIGURE.above,
  })));
}

/**
 * The first dry row south of the river at these columns.
 *
 * Read off the water rather than written down, for the reason the river is
 * a line rather than a list of rectangles: a trail that is meant to follow
 * the bank and is written as a row number leaves the bank — or ends up in
 * the water — the next time a bend moves, and there is nothing about the
 * map's own drawing to say which. Every trail in the wood takes its rows
 * from this.
 */
export function southBank(column: number, width: number): number {
  const wet = riverBed().filter((r) => r.x < column + width && r.x + r.width > column);
  return wet.length === 0 ? 0 : Math.max(...wet.map((r) => r.y)) + 1;
}

/** The last dry row north of the river at a column. The far bank's edge. */
export function northBank(column: number): number {
  return bankAbove(riverBed(), column);
}

/** The same, asked of the water before the beaches took their shelves out. */
function drawnBank(column: number): number {
  return bankAbove(drawnBed(), column);
}

function bankAbove(bed: readonly Rect[], column: number): number {
  const wet = bed.filter((r) => r.x <= column && r.x + r.width > column);
  return wet.length === 0 ? 0 : Math.min(...wet.map((r) => r.y)) - 1;
}

/**
 * The two stretches of shingle on the far bank, by the columns they run
 * between.
 *
 * A beach is where the wood stops being trees and starts being the river,
 * and the far bank is the only side of the water anybody looks at for long:
 * the walk is on this side, so what is across it is the view. Two of them,
 * both where the bank turns and the eye already goes — the shoulder where
 * the limb swings east into the elbow, and the tip of the tongue the first
 * valley leaves, which is the cabin's own bank.
 *
 * The far bank rather than the near one, and on purpose. Shingle underfoot
 * is ground somebody would expect to walk down to the water on, and nothing
 * crosses the water — a beach on this side would be a promise the river does
 * not keep.
 */
const BEACHES: readonly { from: number; to: number }[] = [
  // The shoulder of the elbow, where the limb widens and turns east.
  { from: 16, to: 22 },
  // The tip of the tongue, below the cabin.
  { from: 38, to: 42 },
];

/**
 * The shingle along the far bank, in tiles: one rectangle per beach.
 *
 * **Which rows are read off the water** — for the reason the walk on the
 * near bank is read off it. The bank staircases, so a beach written as a row
 * number is a beach in the river at one end of itself the next time a bend
 * moves. The drawn bank is the whole of the placement.
 *
 * **And a beach is a shelf rather than a staircase.** It ran a tile deep
 * along the bank, stepping down with it, which at the shoulder left a strip
 * of river between five tiles of shingle and the sixth — a beach with a
 * notch bitten out of the middle of it, reading as stones that had slipped
 * into the water rather than as a bank. So it takes every row from the
 * highest the bank reaches across the run to the lowest, and the river gives
 * up what falls inside it (`riverBed`): the water's edge comes out straight
 * along the foot of the shingle, which is what a beach looks like. The
 * tongue's is flat bank and comes out one row deep, exactly as before.
 *
 * Squaring off can only ever take water, never stand shingle in it: above
 * the bank a column is dry by definition, and below it the tiles inside the
 * shelf are the ones taken out.
 */
export const WOOD_BEACHES: readonly Rect[] = BEACHES.map(({ from, to }) => {
  const rows: number[] = [];
  for (let column = from; column < to; column++) rows.push(drawnBank(column));
  const top = Math.min(...rows);
  return { x: from, y: top, width: to - from, height: Math.max(...rows) - top + 1 };
});

/**
 * The boulder in the shallows at the foot of the shoulder beach, in world
 * pixels: feet at the bottom of the tile it stands in.
 *
 * **It is standing in the river**, a step off the beach's western corner,
 * and that is the whole of what makes it worth looking at: the walk is on
 * the near bank, so this is a thing across the water with a cross daubed on
 * it and no way of getting to it. It is the cabin's argument at one tile —
 * see `WOOD_CABIN`, and `PROPS.boulder` in `scenery.ts` for the picture.
 *
 * **Both numbers come off the beach**, which comes off the water, for the
 * reason everything else along this bank does: the shoulder is made by a
 * bend, so a rock pinned to a row is a rock standing on dry land the next
 * time the bend moves. The row is the one below the shingle, which is the
 * water's edge along its foot — a beach is a shelf, so that edge is straight
 * — and the column is the one west of it, where there is water to stand in
 * rather than stones to stand on.
 */
export const WOOD_BOULDER = (() => {
  const beach = WOOD_BEACHES[0];
  return { x: (beach.x - 0.5) * TILE, y: (beach.y + beach.height + 1) * TILE };
})();

/**
 * Which column the cabin stands on: the tip of the tongue of wood the first
 * valley leaves, where the far bank reaches furthest south.
 *
 * The tongue is four columns across and this is the middle of it, so the
 * cabin sits on the point rather than off to one side of it.
 */
const CABIN_COLUMN = 39;

/**
 * Which row the cabin's feet stand at the bottom of: two rows back from the
 * water.
 *
 * The shingle has the last dry row and a row of grass lies between, so the
 * cabin is a house looking at a beach rather than a house standing on one.
 * It was on the water's own edge before the beach went in, which put the
 * bottom of its picture over the river — a cabin with its porch in the
 * water, on the one bank nobody can walk up to and see it is not.
 */
const CABIN_ROW = northBank(CABIN_COLUMN) - 1;

/**
 * A cabin on the far bank, standing on the tongue of wood in the first
 * valley — the one place in the wood where the north side comes far enough
 * south to be looked at properly from the walk.
 *
 * **It is across the water, and that is the whole of it.** There is no
 * bridge, so nobody reaches it, walks into it or presses anything at it: it
 * is a thing on the other side of the river, which is what the far bank is
 * for. It is a prop with a footprint like any other — see `PROPS.cabin` in
 * `scenery.ts` — so it is solid, and solid is all it is.
 *
 * Taken off the water rather than written as a row, like everything else
 * that has to meet the river: the tongue is made by the bend, so a cabin
 * pinned to a row is a cabin in the river the next time the bend moves.
 */
export const WOOD_CABIN = {
  x: (CABIN_COLUMN + 0.5) * TILE,
  y: CABIN_ROW * TILE,
};

/**
 * The patch kept clear of trees around it, in tiles.
 *
 * A cabin in a wood that scatters three hundred trees is a cabin with a
 * canopy over it, and out of doors everything sorts by the bottom of its own
 * picture — so a tree standing a foot in front of it is a tree drawn over
 * it. Two tiles all round is the clearing, which is also what makes it read
 * as somebody's cabin rather than as a shed the wood grew around.
 */
const CABIN_CLEARING: Rect = {
  x: CABIN_COLUMN - 2,
  y: CABIN_ROW - 3,
  width: 5,
  height: 4,
};

/**
 * How far below the first dry row the walk runs.
 *
 * One row, which is the row `riverBanks` has already taken out of play: the
 * walk starts where somebody standing on it is drawn clear of the water, and
 * the strip between it and the river is bank rather than path.
 */
const BANK_GAP = 1;

/** How many rows wide a trail is: an avenue's width, so two can walk it abreast. */
const TRAIL_ROWS = 2;

/**
 * Which columns the walk up from the town runs in, and so where the wood's
 * one way in is.
 */
export const WALK_UP = { column: 29, width: 2 };

/**
 * Where the walk up from the town stops, which is where it meets the walk
 * along the bank.
 *
 * Asked of both its columns rather than of one: the bank falls as it goes
 * east, so the two columns of a trail can sit a row apart and the higher of
 * them would be half in the water.
 */
const walkUpTop = () => southBank(WALK_UP.column, WALK_UP.width) + BANK_GAP;

/**
 * Which columns the walk along the bank runs between.
 *
 * It starts east of the north-south limb rather than at the edge of the map.
 * West of the elbow the first dry row below the water is the row below the
 * *top* of that limb, up near row 0 — so a walk taken blindly off the bank
 * there climbs the map's west edge in a strip two tiles wide, which is not a
 * riverside walk and is barely a place.
 */
const BANK_WALK = { from: 10, to: 60 };

/** Where the walk along the bank runs at a column: on the bank, a row off it. */
const walkRowAt = (column: number) => southBank(column, 1) + BANK_GAP;

/**
 * The walk along the near bank, as rectangles: it follows the water down.
 *
 * The bank is not a row — the river falls some nine rows between the elbow
 * and the east edge of the map — so a walk written as one is a walk that
 * touches the water at one end and is out in the trees at the other. It is
 * read off `southBank` column by column and the columns at the same height
 * gathered up, which is what keeps it a dozen rectangles rather than fifty.
 *
 * Two rows deep and never stepping down by more than one of them, so each
 * step shares a row with the next and the walk is joined up. That is a fact
 * about how steeply the river falls rather than something enforced here, and
 * `residents.test.ts` is what holds it: every spot in the wood has to be
 * reachable from every other, which a walk broken at a corner is not.
 */
function bankWalk(): Rect[] {
  const runs: Rect[] = [];
  for (let column = BANK_WALK.from; column < BANK_WALK.to; column++) {
    const y = walkRowAt(column);
    const last = runs[runs.length - 1];
    if (last && last.y === y) last.width += 1;
    else runs.push({ x: column, y, width: 1, height: TRAIL_ROWS });
  }
  return runs;
}

/**
 * The trails, in tiles.
 *
 * Two of them, and between them they are a walk rather than a network: one
 * up from the town to the water, and one along the near bank. Two tiles wide
 * throughout, which is the width of an avenue in the town — a path somebody
 * can walk beside somebody else on.
 *
 * The one up from the town runs past the wood's bottom edge and down to the
 * plaza, so the wood has a way in that is a way rather than a gap somebody
 * happens to find between two buildings. The tree line along the town's top
 * has a hole cut in it for exactly that (see `scenery.ts`), which reads
 * `WOOD_TRAILS[0]` — so the walk up stays first in this list.
 *
 * There used to be a spur out to the bank beside it, from a bank walk that
 * ran in a straight row five rows off the water. The walk follows the water
 * now, so every step of it is already the spur.
 *
 * **There is no bridge, so both trails are on this side of the water.** The
 * river is solid, as the sea is, and nothing crosses it — the whole
 * north-east of the wood is somewhere you can see and not reach. A crossing,
 * when there is one, is a rectangle in `DOCKS` read off `riverBed()` at
 * those columns — planking over water is already walked at the ferry dock —
 * plus the two rows of trail either side of it, and a hole in `riverBanks`
 * where it lands.
 */
export const WOOD_TRAILS: readonly Rect[] = [
  // Up from the plaza, through the town's tree line, to the walk on the
  // bank. It ends on the plaza's own top edge — a trail that stopped on the
  // grass short of it would be a path to a lawn.
  {
    x: WALK_UP.column,
    y: walkUpTop(),
    width: WALK_UP.width,
    height: WOOD_ROWS + 9 - walkUpTop(),
  },
  ...bankWalk(),
];

/** A place on the walk along the bank, by the middle of the frame, in pixels. */
const onTheBank = (column: number) => ({
  x: (column + 0.5) * TILE,
  y: (walkRowAt(column) + TRAIL_ROWS / 2) * TILE,
});

/**
 * Where a wanderer walks to in the wood, in world pixels.
 *
 * On the walk along the bank, which is where anybody walking here would be,
 * and spread the width of the wood so that crossing between two of them is a
 * walk rather than a step. All on the near bank, because the far one cannot
 * be reached — a place a wanderer is sent to and cannot get to is one they
 * stand still for, and `residents.test.ts` says as much by holding every
 * spot to being reachable from every other.
 *
 * Taken off the walk rather than written down as rows, for the same reason
 * the walk itself is: a spot written as a row is a spot in the river the
 * next time a bend moves.
 */
export const WOOD_WANDER_SPOTS: readonly { x: number; y: number }[] = [
  onTheBank(BANK_WALK.from + 2),
  onTheBank(20),
  onTheBank(WALK_UP.column),
  onTheBank(40),
  onTheBank(BANK_WALK.to - 3),
];

/** How far a tree's trunk is kept off a trail, in tiles. */
const TRAIL_CLEARANCE = 0.4;

/** Whether a tile is on a rectangle of the list, with a margin around it. */
const near = (list: readonly Rect[], column: number, row: number, margin: number) =>
  list.some(
    (r) =>
      column + 0.5 > r.x - margin &&
      column + 0.5 < r.x + r.width + margin &&
      row + 0.5 > r.y - margin &&
      row + 0.5 < r.y + r.height + margin,
  );

/** A settled scatter: the same wood every time the server starts. */
const scatter = (a: number, b: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * Where a tree or a bush could stand: scattered by a hash rather than
 * written out, by the feet, in world pixels.
 *
 * Three hundred-odd of them, because a wood is a thing you cannot see the
 * far side of and a wood written out prop by prop is a wood nobody will ever
 * move a trail through. The scatter is settled — the same numbers every run
 * — so this is a fixed place that happens to have been generated rather than
 * a place that is different on every server.
 *
 * **Candidates, not the planting.** What is kept out here is what can be
 * decided from a pair of feet: the river, and the trails with a margin, so
 * no trunk stands on a path. Whether a prop's *picture* hangs over a trail
 * is a different question and one this file cannot answer, since only
 * `scenery.ts` knows how big a tree is drawn — it does the second half, and
 * doing it here would have meant a second copy of the prop sizes.
 */
export const WOOD_PLANTING: readonly { kind: "tree" | "bush"; x: number; y: number }[] = (() => {
  const props: { kind: "tree" | "bush"; x: number; y: number }[] = [];
  const bed = riverBed();
  for (let row = 0; row < WOOD_ROWS; row++) {
    for (let column = 0; column < WORLD_COLUMNS; column++) {
      const roll = scatter(column, row);
      if (roll > 0.42) continue;
      if (near(bed, column, row, 0.2)) continue;
      if (near(WOOD_TRAILS, column, row, TRAIL_CLEARANCE)) continue;
      if (near(WOOD_BEACHES, column, row, 0)) continue;
      if (near([CABIN_CLEARING], column, row, 0)) continue;
      // Jittered off the grid, or a wood reads as an orchard.
      const jitter = scatter(row + 7, column + 13);
      const x = (column + 0.2 + jitter * 0.6) * TILE;
      const y = (row + 0.6 + scatter(column + 3, row + 29) * 0.4) * TILE;
      props.push({ kind: roll < 0.33 ? "tree" : "bush", x, y });
    }
  }
  return props;
})();
