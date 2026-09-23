/**
 * The People floor: a bank of cubicles along the top, a corridor under it,
 * and two rooms off the far side.
 *
 * Floor 1 was one open rectangle with a whiteboard on the wall and eight
 * desk slots drawn in two rows of four — the same room the agents' floor
 * is, furnished from `lib/world/desks.ts`. It was the one floor in the
 * building with nothing in it to look at: Operations grew rooms, a
 * corridor, boards and a line of work across every project room, and the
 * floor where the *people* sit stayed a car park of desks.
 *
 * So it is laid out the way an Operations floor is, and deliberately not
 * as a copy of one. Two things differ and both are the point:
 *
 * - **A cubicle is open to the corridor.** Only the dividers between
 *   neighbours are wall, and they stop at the corridor's edge — which is
 *   what makes a bank of cubicles a bank rather than a row of cells.
 *   Walking the corridor you see into every one of them, which is the
 *   whole of why they are worth walking past.
 * - **The back wall is theirs.** A cubicle letters its occupant's name on
 *   the map's top wall, centred on its own width, the way a project room
 *   letters the board it holds. Six cubicles is six names read from the
 *   corridor without going in.
 *
 * **And each one carries a shelf of the eggs its occupant has found** —
 * one of every kind in their basket, standing against the back wall. That
 * is the floor's reason to be a place rather than a list: a basket is
 * already on a profile card, and a card is something you open about
 * somebody you had in mind already. A shelf is something you come across.
 *
 * The floor **grows sideways** with the number of people, exactly as the
 * corridor upstairs grows with the number of projects — `cubicleWidth`
 * takes a count and the height never changes. A building with more people
 * gets a longer bank rather than a redrawn floor.
 *
 * Nothing here touches Phaser or the DOM: the scene reads these same
 * functions for where to stand its pictures, so the art and the solid
 * parts of the map cannot drift apart.
 */

import { harvest, type Region, type SourceMap } from "./harvest";
import type { PartitionSpec, PoiSpec, Rect, RoomSpec } from "./spec";
import { TILE, WALL_ROWS, WALLS, WHITEBOARD } from "./office";

/**
 * How wide a cubicle is, which is how much wall its name is written on.
 *
 * Six tiles: four for the shelf, with a clear column either side of it so
 * the shelf reads as standing against the back wall rather than as wedged
 * between two dividers. The desk is two of the four, centred under it.
 */
export const CUBICLE_COLS = 6;

/**
 * How deep one is, front to back.
 *
 * The shelf takes the first row, against the wall; the desk the third;
 * and the last is the one you walk in on. Four rows would lose the clear
 * row between the shelf and the desk, which is what keeps the eggs from
 * reading as ornaments standing on the desk itself.
 */
const CUBICLE_ROWS = 5;

const CORRIDOR_ROWS = 4;
const ROOM_ROWS = 7;

/** The first walkable row of each band, worked out once so nothing drifts. */
const BANK_TOP = WALL_ROWS;
const CORRIDOR_TOP = BANK_TOP + CUBICLE_ROWS;
/** The row the corridor's lower wall caps at — the two rooms' own wall. */
export const LOWER_WALL = CORRIDOR_TOP + CORRIDOR_ROWS;
const LOWER_TOP = LOWER_WALL + WALL_ROWS;

export const CUBICLES_HEIGHT = LOWER_TOP + ROOM_ROWS + 1;

/**
 * How few cubicles a floor is drawn with, however few people work there.
 *
 * Four, and the spare ones are spare desks — which is what an office floor
 * actually looks like, and the honest answer for a building with one
 * person in it. Hunter is that case: a floor of one cubicle is eight
 * columns wide, with no room under it for the two rooms and nothing to
 * walk along.
 *
 * A spare cubicle is furnished exactly as an occupied one — desk, shelf,
 * plant — because the map is named by how many cubicles a floor has, and
 * two buildings with four apiece share it whoever sits in them. What
 * occupancy decides is what the *scene* draws on top: the name on the wall
 * and the eggs on the shelf.
 */
export const MIN_CUBICLES = 4;

/** How many cubicles a floor with this many people is drawn with. */
export function cubicleCount(people: number): number {
  return Math.max(MIN_CUBICLES, people);
}

/** As wide as its cubicles, plus the wall that closes the last one. */
export const cubicleWidth = (count: number) => 1 + count * (CUBICLE_COLS + 1);

export interface Cubicle {
  /** Its leftmost floor column, and its first walkable row. */
  x: number;
  y: number;
  /** The row its name is lettered on: the cap of the map's top wall. */
  wallRow: number;
}

/** Where each cubicle sits, left to right along the top of the floor. */
export function cubicles(count: number): Cubicle[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({
    x: 1 + i * (CUBICLE_COLS + 1),
    y: BANK_TOP,
    wallRow: 0,
  }));
}

/**
 * Where a cubicle letters its occupant's name, and how much wall it has
 * for it.
 *
 * The middle of its own width, and `cols` is that width — which the scene
 * wraps the lettering to, so a long name takes two lines rather than
 * running over the divider into the cubicle next door.
 *
 * The whole width rather than a clear stretch of it, because unlike a
 * working room upstairs nothing else is on this wall: the shelf stands on
 * the floor below it and the desk below that. A wall with one thing on it
 * is centred on itself.
 */
export function cubicleSign(count: number, slot: number) {
  const cubicle = cubicles(count)[slot];
  if (!cubicle) return null;
  return { tx: cubicle.x + CUBICLE_COLS / 2, ty: cubicle.wallRow, cols: CUBICLE_COLS } as const;
}

/** How wide the shelf of eggs is, in tiles. */
export const SHELF_COLS = 4;

/**
 * The shelf against a cubicle's back wall, in tiles.
 *
 * On the first walkable row — the shadow the top wall throws, which is
 * ordinary floor — so it stands against the wall rather than hanging on
 * it. Not hard into the corners: a clear column either side, because a
 * shelf reaching both dividers would read as a worktop built into the
 * cubicle rather than as something somebody put there.
 *
 * Solid, like every other piece of furniture on this floor; the two clear
 * columns are what you walk up its side by.
 */
export function cubicleShelf(count: number, slot: number) {
  const cubicle = cubicles(count)[slot];
  if (!cubicle) return null;
  return { tx: cubicle.x + 1, ty: cubicle.y, tw: SHELF_COLS, th: 1 } as const;
}

/** The desk, centred under the shelf with a clear row between them. */
export function cubicleDesk(count: number, slot: number) {
  const cubicle = cubicles(count)[slot];
  if (!cubicle) return null;
  return { tx: cubicle.x + 2, ty: cubicle.y + 2, tw: 2, th: 1 } as const;
}

/** A plant in the far corner, which is the corner nothing else wants. */
export function cubiclePlant(count: number, slot: number) {
  const cubicle = cubicles(count)[slot];
  if (!cubicle) return null;
  return { tx: cubicle.x + CUBICLE_COLS - 1, ty: cubicle.y + CUBICLE_ROWS - 1, tw: 1, th: 1 };
}

export interface PeopleRoom {
  /** Its leftmost floor column, and how many it has. */
  x: number;
  cols: number;
  /** Its first walkable row, how many it has, and its own wall's cap. */
  y: number;
  rows: number;
  wallRow: number;
  /** The gap in that wall, as [from, to) columns. */
  door: { from: number; to: number };
}

const DOOR_COLS = 2;

/**
 * What the left-hand corner of each room's wall is already spoken for by,
 * in tiles: the lift car in the near room, the whiteboard in the far one.
 *
 * The same two columns in both, which is luck rather than design and worth
 * saying out loud — it is what lets one number stand for where the name
 * starts in either room.
 */
const CORNER_COLS = 2;

/**
 * Where a room cuts its doorway: hard against its right-hand edge, less a
 * clear column.
 *
 * So the wall reads corner, name, doorway, exactly as a working room's does
 * upstairs (`BOARD_WALL` in `lib/map/floor.ts`) — the picture on one side
 * of the words and the way in on the other. It was at the left-hand end
 * first, which put the break room's name on the far side of its own door
 * from its whiteboard, and from the corridor that read as the board
 * belonging to the room before it.
 *
 * The clear column is what keeps the doorway and the wall between the two
 * rooms from reading as one wide gap.
 */
const roomDoorAt = (cols: number) => cols - 1 - DOOR_COLS;

/**
 * The two rooms off the far side of the corridor: the copy room, and the
 * break room beyond it.
 *
 * Two, rather than a rank that grows, because these are the floor's own
 * rooms rather than one per anything — a building does not gain a kitchen
 * for gaining a person. They split whatever width the bank above them came
 * to, with a wall and a doorway between them, so the floor's one growing
 * dimension carries them along with it.
 *
 * The copy room is the near one, which is the one with the lift set into
 * its wall; the break room is the far one, which is the one worth walking
 * to. That is also why the whiteboard hangs in the break room — the board
 * everybody scribbles on belongs where everybody stands about, and the
 * near room's wall is the lift's.
 */
export function peopleRooms(count: number): [PeopleRoom, PeopleRoom] {
  const width = cubicleWidth(count);
  // Every column inside the ring, less the one the wall between them takes.
  const divider = 1 + Math.floor((width - 3) / 2);
  const room = (x: number, cols: number): PeopleRoom => ({
    x,
    cols,
    y: LOWER_TOP,
    rows: ROOM_ROWS,
    wallRow: LOWER_WALL,
    door: { from: x + roomDoorAt(cols), to: x + roomDoorAt(cols) + DOOR_COLS },
  });
  return [room(1, divider - 1), room(divider + 1, width - 2 - divider)];
}

/** What each of them is called, in the order they run. */
export const ROOM_NAMES = ["COPY ROOM", "BREAK ROOM"] as const;

/**
 * Where a room letters its name: the middle of the clear stretch of its
 * own wall, between whatever is in the left-hand corner and its doorway.
 *
 * The same arrangement as a working room upstairs, and for the same
 * reason — the room's name is only the room's if it is lettered on wall
 * rather than across a picture, and the middle of the clear wall is the
 * one place that is true of. Read along the corridor, each frontage is
 * then corner, name, doorway, whichever room you are looking into.
 */
export function roomSign(count: number, which: 0 | 1) {
  const room = peopleRooms(count)[which];
  const from = room.x + CORNER_COLS;
  return {
    tx: (from + room.door.from) / 2,
    ty: room.wallRow,
    cols: room.door.from - from,
  } as const;
}

/**
 * Where the whiteboard hangs: the left-hand corner of the break room's
 * wall, which is where every board on an Operations floor starts.
 *
 * Left of that room's own doorway, so the wall reads board, doorway, name
 * — the picture on one side of the way in and the words on the other,
 * which is what makes the corridor readable a floor up.
 */
export function peopleWhiteboard(count: number) {
  const [, breakRoom] = peopleRooms(count);
  return { tx: breakRoom.x, ty: breakRoom.wallRow + 1 } as const;
}

/**
 * Where the lift stands: set into the corridor's lower wall at the
 * left-hand end of it.
 *
 * At the end rather than under a doorway, because this floor has no room
 * it is named after to step out facing. What it has is a bank of cubicles,
 * and the end of the corridor is the one spot that puts the whole of it in
 * front of you: you arrive, and walk down the line.
 *
 * The zone covers the last corridor row and the wall's cap, as every other
 * lift's does, so you stand in front of the car rather than inside the
 * wall.
 */
export function peopleElevator() {
  return { tx: 1, ty: LOWER_WALL - 1, tw: 2, th: 2 } as const;
}

/**
 * Out of the lift and into the corridor, facing the bank.
 *
 * Clear of the car rather than in front of it, which is where the lift's
 * own zone reaches — and clear by two rows rather than one, because what
 * the doorway is tested against is the middle of the collision body and
 * that sits well below the middle of the sprite.
 *
 * Arriving by the lift is repositioned by the scene and never sees this.
 * Arriving at the floor's own URL does, and standing somebody in the
 * doorway of a lift opens it in their face before the room has finished
 * appearing.
 */
export function peoplePlayerStart() {
  return { tx: peopleElevator().tx, ty: LOWER_WALL - 3, facing: "up" } as const;
}

/**
 * A piece of furniture on this floor: which picture, and the tiles it
 * stands on.
 *
 * The scene draws the picture bottom-centred on the footprint's bottom
 * edge and the spec makes that same footprint solid, so the two come off
 * one list and cannot disagree about where anything is. Which is the
 * arrangement the boards upstairs are already under: the map carries the
 * box, the scene carries the art.
 */
export type FurnishingArt =
  | "desk"
  | "plant"
  | "sofa"
  | "armchair"
  | "lowtable"
  | "cooler"
  | "vending"
  | "shelf"
  | "copier";

export interface Furnishing {
  art: FurnishingArt;
  tx: number;
  ty: number;
  tw: number;
  th: number;
}

/**
 * Everything standing on this floor: the cubicles first, then the two
 * rooms.
 *
 * Read off the cubicles and the rooms rather than written down as columns,
 * so a longer bank carries the lot with it — the rule everything on an
 * Operations floor is placed by.
 *
 * The copy room is shelving, a copier and a plant along its back wall; the
 * break room is a lounge in the middle of it with the vending machine and
 * the water cooler against the wall. Neither does anything yet and neither
 * is meant to: a floor is a place before it is a feature, and what is
 * being asked of these two rooms is that the corridor have somewhere to
 * lead.
 */
export function peopleFurnishings(count: number): Furnishing[] {
  const standing: Furnishing[] = [];
  for (let slot = 0; slot < count; slot++) {
    const desk = cubicleDesk(count, slot);
    const plant = cubiclePlant(count, slot);
    if (desk) standing.push({ art: "desk", ...desk });
    if (plant) standing.push({ art: "plant", ...plant });
  }

  const [copy, lounge] = peopleRooms(count);
  standing.push(
    // Along the back wall from the left-hand corner, because that is the
    // end of it the doorway is furthest from — a room's own doorway is at
    // its right-hand end, and a plant standing in the way of it is the one
    // thing everybody walking in has to go round.
    { art: "shelf", tx: copy.x + 1, ty: copy.y, tw: 2, th: 1 },
    { art: "shelf", tx: copy.x + 3, ty: copy.y, tw: 2, th: 1 },
    { art: "copier", tx: copy.x + 6, ty: copy.y, tw: 2, th: 1 },
    { art: "plant", tx: copy.x + copy.cols - 2, ty: copy.y + copy.rows - 1, tw: 1, th: 1 },
  );
  standing.push(
    // The lounge is down the room rather than against its back wall: you
    // stand under a whiteboard to draw on it, and a sofa in that corner is
    // a board nobody can reach.
    { art: "sofa", tx: lounge.x + 1, ty: lounge.y + 3, tw: 2, th: 1 },
    { art: "lowtable", tx: lounge.x + 3, ty: lounge.y + 4, tw: 1, th: 1 },
    { art: "armchair", tx: lounge.x + 5, ty: lounge.y + 3, tw: 1, th: 1 },
    // And the machines are measured back from the doorway rather than
    // from the wall's end, which is the same thing until a floor of five
    // makes the rooms a column wider.
    { art: "vending", tx: lounge.door.from - 5, ty: lounge.y, tw: 2, th: 1 },
    { art: "cooler", tx: lounge.door.from - 2, ty: lounge.y, tw: 1, th: 1 },
  );
  return standing;
}

/** A footprint in pixels, which is what a collision box is. */
function box(at: { tx: number; ty: number; tw: number; th: number }): Rect {
  return { x: at.tx * TILE, y: at.ty * TILE, width: at.tw * TILE, height: at.th * TILE };
}

/**
 * The doorway between the two rooms: three rows, dead centre of the wall
 * they share.
 *
 * The same opening an Operations floor cuts between neighbours, for the
 * same reason — a room with one door is a room you leave the way you came
 * in, and these two are next door to each other.
 */
const BETWEEN_ROOMS_ROWS = 3;

/** The floor, built. See the top of this file for what is in each band. */
export function buildCubiclesSpec(source: SourceMap, count: number): RoomSpec {
  const bank = cubicles(count);
  const width = cubicleWidth(count);
  const rooms = peopleRooms(count);

  const at = peopleWhiteboard(count);
  const board: Region = { ...WHITEBOARD.region, dx: at.tx, dy: at.ty };
  // Only the whiteboard is cut from the source map. Everything else on
  // this floor is a picture the scene draws over a footprint, which is why
  // those have no region here at all.
  const picked = harvest(source, [board]);
  const whiteboard: PoiSpec = { ...WHITEBOARD.poi, tx: at.tx + 1, ty: at.ty + 1 };

  const partitions: PartitionSpec[] = [
    // The wall the two rooms share with the corridor, their doorways cut
    // out of it. There is no matching wall above the corridor: a cubicle
    // is open to it, which is what makes the bank a bank.
    {
      orientation: "horizontal",
      at: LOWER_WALL,
      from: 1,
      to: width - 1,
      doorways: rooms.map((room) => room.door),
    },
  ];

  // A divider between each pair of cubicles, stopping at the corridor.
  for (const cubicle of bank.slice(1)) {
    partitions.push({
      orientation: "vertical",
      at: cubicle.x - 1,
      from: BANK_TOP,
      to: BANK_TOP + CUBICLE_ROWS,
    });
  }

  // And the wall between the two rooms, with a way through it.
  const gap = rooms[0].y + Math.floor((ROOM_ROWS - BETWEEN_ROOMS_ROWS) / 2);
  partitions.push({
    orientation: "vertical",
    at: rooms[1].x - 1,
    from: rooms[0].y,
    to: rooms[0].y + ROOM_ROWS,
    doorways: [{ from: gap, to: gap + BETWEEN_ROOMS_ROWS }],
  });

  const shelves = bank
    .map((_, slot) => cubicleShelf(count, slot))
    .filter((shelf): shelf is NonNullable<typeof shelf> => shelf !== null);

  return {
    width,
    height: CUBICLES_HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: picked.placements,
    pois: [whiteboard],
    spawns: [{ ...peoplePlayerStart() }],
    collisions: [
      ...peopleFurnishings(count).map(box),
      ...shelves.map(box),
      {
        x: at.tx * TILE,
        y: at.ty * TILE,
        width: WHITEBOARD.region.sw * TILE,
        height: WHITEBOARD.region.sh * TILE,
      },
    ],
    partitions,
    // No door: the only way out is the way in.
    transitions: [{ name: "elevator", target: "elevator", ...peopleElevator(), facing: "down" }],
  };
}
