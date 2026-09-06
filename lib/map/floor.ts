/**
 * A floor above the lobby: where a building's people, or its agents, have
 * their desks.
 *
 * One room shared by everyone on that floor, reached only by the lift,
 * which stands where it does downstairs — bottom left — so the ride feels
 * like a ride. The desks are not in the map: who sits here changes, so the
 * scene places one per occupant (see lib/world/desks.ts). The wall carries
 * the shared whiteboard, as the lobby does.
 */

import { harvest, type Region, type SourceMap } from "./harvest";
import type { PartitionSpec, PoiSpec, RoomSpec } from "./spec";
import { TILE, WALLS, WHITEBOARD } from "./office";
import type { BoardKind } from "../world/tenants";

export const WIDTH = 20;
export const HEIGHT = 14;

/** The same one thing on the wall as downstairs: the shared whiteboard. */
export const REGIONS: Region[] = [WHITEBOARD.region];

/** Where you stand when the lift is not how you came. */
export const PLAYER_START = { tx: 9, ty: 7, facing: "down" } as const;

/** Where it is downstairs: bottom left, under where the door would be. */
export const ELEVATOR = { tx: 2, ty: HEIGHT - 2, tw: 2, th: 2 } as const;

/**
 * The project board's place on the wall: the picture is drawn by the scene
 * from its own sprite, so what the map carries is the footprint that makes
 * it solid, and the point of interest on its lower tile — stand below it
 * and you are within reach, the way the whiteboard works.
 *
 * On the left of the wall: the whiteboard has the middle, and the room's
 * name is lettered across the right.
 */
export const PROJECT_BOARD = {
  region: {
    label: "project board",
    sx: 0,
    sy: 0,
    sw: 3,
    sh: 2,
    dx: 3,
    dy: 1,
    layers: [],
  } satisfies Region,
  poi: { name: "Project board", tx: 4, ty: 2, facing: "up" } satisfies PoiSpec,
};

/**
 * The help desk board, next along the same wall: the support queue beside
 * the project board, with the whiteboard past it and the room's name
 * lettered across the right.
 */
export const HELP_DESK = {
  region: {
    label: "help desk board",
    sx: 0,
    sy: 0,
    sw: 3,
    sh: 2,
    dx: 6,
    dy: 1,
    layers: [],
  } satisfies Region,
  poi: { name: "Help desk", tx: 7, ty: 2, facing: "up" } satisfies PoiSpec,
};

/** Where each board hangs, and the point of interest to read it from. */
const BOARDS: Record<BoardKind, { region: Region; poi: PoiSpec }> = {
  trello: PROJECT_BOARD,
  zoho: HELP_DESK,
};

/**
 * An Operations floor: a corridor with rooms opening off both sides.
 *
 * The lift is at the left-hand end of the corridor. Rooms fill in bays along
 * it, one above and one below each bay, left to right — so a building with
 * two rooms gets one on each side and a building with six gets three bays,
 * and the floor **grows sideways** rather than being redrawn. That is the
 * point of the shape: a company with more projects on the go gets a longer
 * corridor.
 *
 *   rows 0-2      the top wall, boards on the first room's half of it
 *   rows 3-9      the upper rank of rooms
 *   rows 10-13    the wall they share with the corridor, doorways cut in it
 *   rows 13-16    the corridor, lift at the left end
 *   rows 17-20    the wall the lower rank shares with it, doorways likewise
 *   rows 20-26    the lower rank
 *   row  27       the bottom wall
 */
const ROOM_COLS = 14;
const ROOM_ROWS = 7;
const CORRIDOR_ROWS = 4;

/** How deep a wall stack is, cap through base. Its shadow row is floor below. */
const WALL_ROWS = 3;

/** The first walkable row of each band, worked out once so nothing drifts. */
const UPPER_TOP = WALL_ROWS;
const UPPER_WALL = UPPER_TOP + ROOM_ROWS;
const CORRIDOR_TOP = UPPER_WALL + WALL_ROWS;
const LOWER_WALL = CORRIDOR_TOP + CORRIDOR_ROWS;
const LOWER_TOP = LOWER_WALL + WALL_ROWS;

export const OPS_HEIGHT = LOWER_TOP + ROOM_ROWS + 1;

/** How many bays a given number of rooms needs: two rooms to a bay. */
export const opsBays = (rooms: number) => Math.max(1, Math.ceil(rooms / 2));

/** The floor is as wide as its bays, plus the wall that closes the last one. */
export const opsWidth = (rooms: number) => 1 + opsBays(rooms) * (ROOM_COLS + 1);

/**
 * Where the lift stands: set into the lower wall, directly beneath the door
 * to Operations.
 *
 * Not at the end of the corridor. The ride has to land you somewhere that
 * tells you where you are, and the room with the boards in it is the one
 * this floor is named after — so you step out facing its door. The zone
 * covers the last corridor row and the wall's cap, as the lobby's does, so
 * you can stand in front of the car rather than inside the wall.
 */
export function opsElevator(rooms: number) {
  const [operations] = opsRooms(rooms);
  return {
    tx: operations.door.from,
    ty: LOWER_WALL - 1,
    tw: 2,
    th: 2,
  } as const;
}

/** Out of the lift and into the corridor, facing the door it is under. */
export function opsPlayerStart(rooms: number) {
  const door = opsRooms(rooms)[0].door;
  return { tx: door.from, ty: LOWER_WALL - 1, facing: "up" } as const;
}

export interface OpsRoom {
  /** Which side of the corridor it opens off. */
  rank: "upper" | "lower";
  /** Its leftmost floor column, and its first walkable row. */
  x: number;
  y: number;
  /** The row a board hangs on: the cap of the wall above the room. */
  wallRow: number;
  /** The gap in the wall between it and the corridor, as [from, to) columns. */
  door: { from: number; to: number };
}

/**
 * Where each room sits. Bay by bay, upper then lower, left to right.
 *
 * The doorway is two tiles wide and toward the middle of the room, so that
 * two rooms facing each other across the corridor do not line their doors up
 * into what reads as one wide gap.
 */
export function opsRooms(count: number): OpsRoom[] {
  const rooms: OpsRoom[] = [];
  for (let i = 0; i < count; i++) {
    const bay = Math.floor(i / 2);
    const upper = i % 2 === 0;
    const x = 1 + bay * (ROOM_COLS + 1);
    // Offset the two doors in a bay so they do not line up into what reads
    // as one wide gap — and so the lower rank's door never lands on the
    // lift, which is set into that wall beneath the first upper door.
    const doorFrom = x + (upper ? 4 : ROOM_COLS - 6);
    rooms.push({
      rank: upper ? "upper" : "lower",
      x,
      y: upper ? UPPER_TOP : LOWER_TOP,
      wallRow: upper ? 0 : LOWER_WALL,
      door: { from: doorFrom, to: doorFrom + 2 },
    });
  }
  return rooms;
}

export interface FloorOptions {
  /**
   * The boards hanging on the wall, which is what makes a floor an
   * Operations floor. Each keeps its own place along the wall whether or
   * not the others are there, so a building with one board has a gap where
   * the other would be rather than a board in the wrong spot.
   */
  boards?: readonly BoardKind[];
  /**
   * How many rooms the Operations floor has, Operations included. The
   * corridor is as long as it needs to be — ten projects at once is a long
   * walk and nothing else.
   */
  rooms?: number;
}

export function buildFloorSpec(source: SourceMap, options: FloorOptions = {}): RoomSpec {
  const boards = (options.boards ?? []).map((kind) => BOARDS[kind]);
  // Naming boards is what makes a floor an Operations floor, and an
  // Operations floor is the one with rooms off a hallway.
  if (boards.length)
    return operationsSpec(source, boards, Math.max(1, options.rooms ?? OPS_ROOM_COUNT));

  const picked = harvest(source, REGIONS);
  return {
    width: WIDTH,
    height: HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: picked.placements,
    pois: [WHITEBOARD.poi, ...boards.map((b) => b.poi)],
    spawns: [{ tx: PLAYER_START.tx, ty: PLAYER_START.ty, facing: PLAYER_START.facing }],
    collisions: boards.map(({ region }) => ({
      x: region.dx * TILE,
      y: region.dy * TILE,
      width: region.sw * TILE,
      height: region.sh * TILE,
    })),
    // No door: the only way out is the way in.
    transitions: [{ name: "elevator", target: "elevator", ...ELEVATOR, facing: "down" }],
  };
}

/** When a caller does not say: Operations, and one room to work in. */
export const OPS_ROOM_COUNT = 2;

/** The corridor layout. See the block above OPS_HEIGHT for what goes where. */
function operationsSpec(
  source: SourceMap,
  boards: { region: Region; poi: PoiSpec }[],
  roomCount: number,
): RoomSpec {
  const rooms = opsRooms(roomCount);
  const width = opsWidth(roomCount);

  // The first room is the one with the boards on its wall; the next gets the
  // shared whiteboard, so there is something to work at in both.
  const [first, second] = rooms;
  const hung = boards.map((board, i) => ({
    ...board,
    region: { ...board.region, dx: first.x + 2 + i * (board.region.sw + 1), dy: first.wallRow + 1 },
    poi: {
      ...board.poi,
      tx: first.x + 3 + i * (board.region.sw + 1),
      ty: first.wallRow + 2,
    },
  }));

  // Not the first room — the boards have that wall — and not the room whose
  // wall the lift is set into, which is the first of the lower rank. The
  // second bay's upper room has a clear wall; fall back only when there is
  // no second bay.
  const whiteboardRoom = rooms.find((r, i) => i > 0 && r.rank === "upper") ?? second ?? first;
  void second;
  const board: Region = {
    ...WHITEBOARD.region,
    dx: whiteboardRoom.x + 2,
    dy: whiteboardRoom.wallRow + 1,
  };
  const picked = harvest(source, [board]);
  const whiteboard: PoiSpec = {
    ...WHITEBOARD.poi,
    tx: whiteboardRoom.x + 3,
    ty: whiteboardRoom.wallRow + 2,
  };

  // One wall above the corridor and one below it, each with the doorways of
  // the rooms on that side cut out of it.
  const doorsOn = (rank: "upper" | "lower") =>
    rooms.filter((r) => r.rank === rank).map((r) => r.door);

  const partitions: PartitionSpec[] = [
    {
      orientation: "horizontal",
      at: UPPER_WALL,
      from: 1,
      to: width - 1,
      doorways: doorsOn("upper"),
    },
    {
      orientation: "horizontal",
      at: LOWER_WALL,
      from: 1,
      to: width - 1,
      doorways: doorsOn("lower"),
    },
  ];

  // A wall between neighbouring rooms in the same rank, closing each bay.
  for (const rank of ["upper", "lower"] as const) {
    const inRank = rooms.filter((r) => r.rank === rank);
    const top = rank === "upper" ? UPPER_TOP : LOWER_TOP;
    for (const room of inRank.slice(1)) {
      partitions.push({
        orientation: "vertical",
        at: room.x - 1,
        from: top,
        to: top + ROOM_ROWS,
      });
    }
  }

  const box = ({ region }: { region: Region }) => ({
    x: region.dx * TILE,
    y: region.dy * TILE,
    width: region.sw * TILE,
    height: region.sh * TILE,
  });

  return {
    width,
    height: OPS_HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: picked.placements,
    pois: [whiteboard, ...hung.map((b) => b.poi)],
    spawns: [{ ...opsPlayerStart(roomCount) }],
    collisions: hung.map(box),
    partitions,
    transitions: [
      { name: "elevator", target: "elevator", ...opsElevator(roomCount), facing: "down" },
    ],
  };
}
