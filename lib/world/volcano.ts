/**
 * Volcano Island, and the cave under its volcano.
 *
 * The second ferry on the world map — the one off the east avenue's dock —
 * crosses to an island that is nobody's. That is the whole reason this is
 * not a campus: a campus is an organisation's yard, its buildings are that
 * organisation's lobbies and its name goes across the top of the screen.
 * The volcano has no lobbies and no owner. It has black sand, lava either
 * side of the one path up from the dock, and a cave in the foot of the
 * mountain with a blob in it.
 *
 * Two places, each described as data here and drawn by `VolcanoScene`:
 *
 * | Place  | Address         | Room           | Ways out                              |
 * | ------ | --------------- | -------------- | ------------------------------------- |
 * | Island | `/volcano`      | `volcano`      | The end of the dock; the cave's mouth |
 * | Cave   | `/volcano/cave` | `volcano-cave` | The mouth, at the foot of the chamber |
 *
 * Each is its own presence room, so the people on the beach and the people
 * in the cave are in different places — and the blob has exactly one room
 * to be published to. See `lib/world/blob.ts` for the blob.
 *
 * Nothing here touches Phaser.
 */

import { BOAT, TILE, type Rect } from "./tenants";
import {
  groundGrid,
  propBody,
  signBody,
  solidGround,
  type Ground,
  type GroundPlan,
  type PlacedProp,
  type Sign,
} from "./scenery";
import type { Enterable } from "./entrances";
import { CAVE_PATH, VOLCANO_PATH, WORLD_PATH } from "./paths";
import { CAVE_ROOM_SLUG, VOLCANO_ROOM_SLUG } from "../rooms";

/** A way out of one of the two places: walk onto it and you go. */
export interface Way {
  /** For the log, and the door zone's name. */
  name: string;
  /** Walk onto this to go. */
  zone: Rect;
  /** The address it leads to. */
  to: string;
  /** Which way you are walking as you go through it. */
  facing: "up" | "down";
}

/** Where somebody stands on arriving, and the way they face. */
export interface Landing {
  x: number;
  y: number;
  facing: "up" | "down";
}

/**
 * The volcano itself: a picture much bigger than any building, standing at
 * the top of the island with the cave's mouth at the foot of it.
 *
 * Its solid is a stack of bands rather than one rectangle, because it is a
 * cone and not a box. A rectangle the size of the picture would put an
 * invisible wall across the black sand either side of the summit, where the
 * picture is sky.
 */
export interface Volcano extends Enterable {
  /** Texture key of the picture. */
  art: string;
  /** The cone, as solid bands from the summit down. */
  solids: Rect[];
  /** Where the smoke comes out: the middle of the crater, in pixels. */
  crater: { x: number; y: number };
}

export interface VolcanoPlace {
  /** The presence room this place is. */
  room: string;
  /** Its address. */
  path: string;
  columns: number;
  rows: number;
  /** What is underfoot, as `groundGrid` takes it. */
  ground: GroundPlan;
  props: PlacedProp[];
  signs: Sign[];
  /** The volcano, on the island; none in the cave, which is inside it. */
  volcano?: Volcano;
  /** The ferry's picture, top left in pixels, where one is moored. */
  boat?: { x: number; y: number };
  ways: Way[];
  /**
   * The patch of floor the blob keeps to, in pixels — the cave's chamber.
   * Absent on the island, which has no blob.
   */
  arena?: Rect;
}

/** The volcano picture's size in pixels: twelve tiles by nine. */
export const VOLCANO_ART = { width: 576, height: 432 };

/**
 * The cone's outline, in the picture's own pixels: how wide it is at the
 * crater and at the foot, and how hard its flanks flare between the two.
 *
 * Written twice — here, and as `CONE` in `scripts/make-world-art.mjs`, which
 * draws the mountain to it. A `.mjs` cannot import a `.ts`, which is the
 * arrangement the basketball's board already lives under; change one and
 * change the other, or the island grows invisible walls in the sky beside
 * the summit. `volcano.test.ts` holds this copy to the picture's size.
 */
export const CONE = { summitY: 40, summitHalf: 74, baseY: 431, baseHalf: 278, flare: 1.7 };

/** Half the cone's width at a height in the picture, by the curve above. */
export function coneHalf(y: number): number {
  const s = Math.min(1, Math.max(0, (y - CONE.summitY) / (CONE.baseY - CONE.summitY)));
  return CONE.summitHalf + (CONE.baseHalf - CONE.summitHalf) * s ** CONE.flare;
}

/**
 * Where the cone's solid bands break, down the picture. Closer together
 * towards the foot, where the flanks spread fastest and a band's width is
 * furthest from the rock's at its top and bottom edges.
 */
const BAND_BREAKS = [40, 110, 170, 230, 280, 330, 370];

/** The ferry's footprint, which the pathfinder routes around and a tap boards. */
const BOAT_SOLID = { width: BOAT.width, height: BOAT.height };

// ── The island ──────────────────────────────────────────

const ISLAND_COLUMNS = 28;
const ISLAND_ROWS = 26;

/** The dock, in tiles: two planks wide, running off the bottom of the island. */
const ISLAND_DOCK: Rect = { x: 13, y: 20, width: 2, height: 5 };
/** The first row of open water under the island, which the boat is moored against. */
const ISLAND_SHORE = 22;

function volcanoAt(tx: number, ty: number): Volcano {
  const { width, height } = VOLCANO_ART;
  const frame = { x: tx * TILE, y: ty * TILE, width, height };
  const mid = frame.x + width / 2;
  const foot = frame.y + height;
  // The bands follow `CONE`, each as wide as the rock at its own middle
  // height: a pixel or two of sky at its top corners and a pixel or two of
  // rock left walkable at its bottom ones, which at this size nobody can
  // tell from the outline. The last runs to half a tile off the foot, as a
  // building's wall stops: the mouth is a gap in nothing, and the strip
  // under the last band is where somebody stands to walk in.
  const breaks = [...BAND_BREAKS, height - TILE / 2];
  const solids = breaks.slice(0, -1).map((top, i): Rect => {
    const bottom = breaks[i + 1];
    const half = Math.round(coneHalf((top + bottom) / 2));
    return { x: mid - half, y: frame.y + top, width: half * 2, height: bottom - top };
  });
  return {
    art: "volcano",
    frame,
    solids,
    door: { x: mid - TILE / 2, y: foot - TILE / 2, width: TILE, height: TILE },
    outside: { x: mid, y: foot + TILE * 1.25 },
    crater: { x: mid, y: frame.y + CONE.summitY + 8 },
  };
}

const ISLAND_VOLCANO = volcanoAt(8, 2);

/**
 * Volcano Island.
 *
 * The ferry ties up at a dock in the middle of the south shore; a path runs
 * straight up from it to the cave's mouth in the foot of the mountain; and
 * the lava coming down either flank of it pools on both sides of the path,
 * which is what makes the walk up the one way there is. Black sand
 * everywhere else, with dead trees and cinder rocks on it — and two boards,
 * neither of which says where you are, because the top of the screen
 * already does.
 */
function island(): VolcanoPlace {
  const columns = ISLAND_COLUMNS;
  const rows = ISLAND_ROWS;
  const dock = ISLAND_DOCK;
  const mouth = ISLAND_VOLCANO;
  return {
    room: VOLCANO_ROOM_SLUG,
    path: VOLCANO_PATH,
    columns,
    rows,
    ground: {
      base: "ash",
      paved: [],
      built: [],
      // From the mouth down to the head of the dock.
      trail: [{ x: 13, y: 11, width: 2, height: 9 }],
      water: [
        { x: 0, y: 0, width: columns, height: 2 },
        { x: 0, y: ISLAND_SHORE, width: columns, height: rows - ISLAND_SHORE },
        { x: 0, y: 2, width: 2, height: ISLAND_SHORE - 2 },
        { x: columns - 2, y: 2, width: 2, height: ISLAND_SHORE - 2 },
        // Bays at the four corners, so the island is a shape rather than a
        // rectangle of sand with a rectangle of sea round it.
        { x: 2, y: 2, width: 3, height: 2 },
        { x: columns - 5, y: 2, width: 3, height: 2 },
        { x: 2, y: 18, width: 3, height: 4 },
        { x: columns - 5, y: 18, width: 3, height: 4 },
        { x: 2, y: 4, width: 1, height: 2 },
        { x: columns - 3, y: 4, width: 1, height: 2 },
      ],
      // Out from under the foot of the cone where the two rivulets painted
      // down its flanks reach the ground — `flow` in the art script — and
      // pooling either side of the path. Three tiles clear of the trail at
      // the nearest, so the walk up is between two pools rather than along
      // the edge of one.
      lava: [
        { x: 8, y: 10, width: 2, height: 3 },
        { x: 3, y: 13, width: 7, height: 3 },
        { x: 4, y: 16, width: 5, height: 1 },
        { x: 18, y: 10, width: 2, height: 3 },
        { x: 18, y: 13, width: 7, height: 3 },
        { x: 19, y: 16, width: 5, height: 1 },
      ],
      dock: [dock],
    },
    volcano: mouth,
    boat: { x: (dock.x + dock.width) * TILE, y: ISLAND_SHORE * TILE - TILE / 2 },
    signs: [
      // At the head of the dock, on the left as you step off it — the same
      // place the Irish island hangs its greeting.
      { text: "DANGER!\nHOT LAVA", x: dock.x * TILE - 60, y: dock.y * TILE + 44 },
      // And beside the path under the mouth, which is the one board here
      // that says anything about what is inside.
      { text: "BEWARE\nOF BLOB", x: 11 * TILE + 12, y: 12 * TILE + 30 },
    ],
    props: [
      { kind: "snag", x: 150, y: 330 },
      { kind: "snag", x: 1190, y: 350 },
      { kind: "snag", x: 440, y: 930 },
      { kind: "snag", x: 1000, y: 960 },
      { kind: "cinder", x: 180, y: 520 },
      { kind: "cinder", x: 1170, y: 540 },
      { kind: "cinder", x: 520, y: 700 },
      { kind: "cinder", x: 830, y: 760 },
      { kind: "cinder", x: 290, y: 880 },
      { kind: "cinder", x: 1060, y: 870 },
    ],
    ways: [
      // The end of the dock, where the ferry waits to go back.
      {
        name: "ferry",
        zone: {
          x: dock.x * TILE,
          y: (dock.y + 3) * TILE,
          width: dock.width * TILE,
          height: 2 * TILE,
        },
        to: WORLD_PATH,
        facing: "down",
      },
      { name: "cave", zone: mouth.door, to: CAVE_PATH, facing: "up" },
    ],
  };
}

// ── The cave ────────────────────────────────────────────

const CAVE_COLUMNS = 22;
const CAVE_ROWS = 16;

/** The main chamber, in tiles: where the floor is widest, and where the blob keeps to. */
const CHAMBER: Rect = { x: 3, y: 3, width: 16, height: 9 };
/** The passage down to the mouth, in tiles, running off the bottom of the cave. */
const PASSAGE: Rect = { x: 10, y: 12, width: 2, height: CAVE_ROWS - 12 };

/**
 * The cave in the foot of the volcano.
 *
 * One chamber cut out of the rock, rounder than a room — the floor bulges a
 * tile beyond the chamber on every side — with a passage down to the mouth
 * at the bottom, which is the way back out onto the island. A pool of lava
 * in the far corner, stalagmites standing about, and crystals glowing in
 * the rock. And the blob, which is the point of the place and is not in
 * this file: it is the server's, like the basketball.
 *
 * The rock is ground rather than walls drawn over it, and solid in the way
 * the sea is — see `solidGround`. So the floor is the part that was dug out
 * rather than the part laid down, which is why the cave's base is rock and
 * the chamber is the exception to it.
 */
function cave(): VolcanoPlace {
  const inPixels = (r: Rect): Rect => ({
    x: r.x * TILE,
    y: r.y * TILE,
    width: r.width * TILE,
    height: r.height * TILE,
  });
  return {
    room: CAVE_ROOM_SLUG,
    path: CAVE_PATH,
    columns: CAVE_COLUMNS,
    rows: CAVE_ROWS,
    ground: {
      base: "rock",
      paved: [],
      built: [],
      cave: [
        CHAMBER,
        // The bulges, a tile past the chamber on each side and shy of its
        // corners, so the walls round off rather than meeting square.
        { x: 5, y: 2, width: 12, height: 1 },
        { x: 2, y: 5, width: 1, height: 5 },
        { x: 19, y: 5, width: 1, height: 5 },
        { x: 5, y: 12, width: 12, height: 1 },
        PASSAGE,
      ],
      // A pool of it in the far corner of the chamber: the one light down
      // here that is not a crystal, and the one reason not to back into a
      // corner while something is hopping at you.
      lava: [
        { x: 16, y: 3, width: 3, height: 2 },
        { x: 17, y: 5, width: 2, height: 1 },
      ],
    },
    signs: [],
    props: [
      { kind: "stalagmite", x: 5 * TILE, y: 5 * TILE },
      { kind: "stalagmite", x: 4 * TILE + 20, y: 11 * TILE + 30 },
      { kind: "stalagmite", x: 17 * TILE, y: 11 * TILE + 20 },
      { kind: "stalagmite", x: 14 * TILE + 24, y: 3 * TILE + 40 },
      { kind: "crystal", x: 3 * TILE + 30, y: 8 * TILE },
      { kind: "crystal", x: 8 * TILE, y: 3 * TILE + 30 },
      { kind: "crystal", x: 19 * TILE + 10, y: 9 * TILE },
    ],
    ways: [
      {
        name: "mouth",
        zone: inPixels({ x: PASSAGE.x, y: CAVE_ROWS - 1, width: PASSAGE.width, height: 1 }),
        to: VOLCANO_PATH,
        facing: "down",
      },
    ],
    arena: inPixels(CHAMBER),
  };
}

export const VOLCANO_ISLAND = island();
export const VOLCANO_CAVE = cave();

/** The place an address names — the island or the cave. */
export function volcanoPlace(which: "island" | "cave"): VolcanoPlace {
  return which === "cave" ? VOLCANO_CAVE : VOLCANO_ISLAND;
}

/**
 * Where to stand on arriving, by where you came from.
 *
 * Out of the cave onto the island is out of its mouth, walking down the
 * path; anything else onto the island is off the ferry, walking up the dock.
 * Into the cave there is one way, which is up the passage from the mouth.
 */
export function landingIn(place: VolcanoPlace, from: string | null | undefined): Landing {
  if (place === VOLCANO_CAVE) {
    return { x: (PASSAGE.x + PASSAGE.width / 2) * TILE, y: 14 * TILE, facing: "up" };
  }
  if (from === CAVE_ROOM_SLUG && place.volcano) {
    return { ...place.volcano.outside, facing: "down" };
  }
  return {
    x: (ISLAND_DOCK.x + ISLAND_DOCK.width / 2) * TILE,
    y: ISLAND_SHORE * TILE - TILE / 2,
    facing: "up",
  };
}

/** The ground at every cell of a place. */
export function groundOf(place: VolcanoPlace): Ground[][] {
  return groundGrid(place.columns, place.rows, place.ground);
}

/** The boat's footprint as a rectangle, where there is one. */
export function boatOf(place: VolcanoPlace): Rect | null {
  return place.boat ? { ...place.boat, ...BOAT_SOLID } : null;
}

const solidsKept = new Map<VolcanoPlace, Rect[]>();

/**
 * Everything solid in a place: the ground nobody stands on, the volcano's
 * cone, the props' feet, the boards and the moored boat. Worked out once
 * per place and kept, for the reason `worldSolids` is — the blob asks it a
 * few times a hop, and the route planner keys its grid on the array.
 */
export function solidsOf(place: VolcanoPlace): Rect[] {
  const kept = solidsKept.get(place);
  if (kept) return kept;
  const boat = boatOf(place);
  const solids = [
    ...solidGround(groundOf(place)),
    ...(place.volcano?.solids ?? []),
    ...place.props.map(propBody).filter((r): r is Rect => r !== null),
    ...place.signs.map(signBody),
    ...(boat ? [boat] : []),
  ];
  solidsKept.set(place, solids);
  return solids;
}

/**
 * The things a tap can be aimed at: the volcano, which is walked into by its
 * mouth, and the moored ferry, which is boarded from the end of the dock.
 * The cave has neither — its way out is a passage, not a picture.
 */
export function enterablesOf(place: VolcanoPlace): Enterable[] {
  const boat = boatOf(place);
  const ferry = place.ways.find((w) => w.name === "ferry");
  return [
    ...(place.volcano ? [place.volcano] : []),
    // The boat's way in is the island's way out, and where the ferry puts
    // you down is standing room by definition.
    ...(boat && ferry ? [{ frame: boat, door: ferry.zone, outside: landingIn(place, null) }] : []),
  ];
}
