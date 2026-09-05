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
import type { PoiSpec, RoomSpec } from "./spec";
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
 * An Operations floor: two rooms off a hallway, rather than one open space.
 *
 * Taller than an ordinary floor, because the hallway and the wall above it
 * cost six rows and two five-row rooms read as cupboards. Nothing else is
 * affected — every floor carries its own width and height, and the desks the
 * scene places are on the agents' floor, which is unchanged.
 *
 *   rows 0-3    the top wall, with the boards on it
 *   rows 3-10   OPERATIONS  |  PROJECT ROOM
 *   rows 11-14  the wall between them and the hallway, with two doorways
 *   rows 14-18  the hallway
 *   row  19     the bottom wall; the lift is bottom left, where it always is
 *
 * The lift stays where it is on every other floor, so the ride still lands
 * you in the same corner of the building — and Operations is the room
 * directly above it.
 */
export const OPS_WIDTH = 20;
export const OPS_HEIGHT = 20;

/** The two columns of wall between the rooms; Operations is to the left. */
export const OPS_DIVIDE = 9;
/** The row of wall between the rooms and the hallway. */
export const OPS_HALL_WALL = 11;

/** Where each room's doorway sits in that wall, as [from, to) columns. */
export const OPS_DOORWAYS = {
  operations: { from: 4, to: 6 },
  project: { from: 14, to: 16 },
} as const;

/** Where the lift puts you down: the hallway, in front of the doors. */
export const OPS_PLAYER_START = { tx: 5, ty: 17, facing: "up" } as const;

/**
 * The shared whiteboard moves into the project room. Downstairs it has the
 * middle of the wall; here the middle is where the rooms are divided, and the
 * boards have Operations' half. Kept to the left of the room so it does not
 * sit under the building's name, which the scene letters at column 15.
 */
export const OPS_WHITEBOARD_COLUMN = 11;

/** Where each room's doorway is, for the scene to letter above it. */
export const OPS_ROOM_SIGNS = [
  { label: "OPERATIONS", door: OPS_DOORWAYS.operations },
  { label: "PROJECT", door: OPS_DOORWAYS.project },
] as const;

export interface FloorOptions {
  /**
   * The boards hanging on the wall, which is what makes a floor an
   * Operations floor. Each keeps its own place along the wall whether or
   * not the others are there, so a building with one board has a gap where
   * the other would be rather than a board in the wrong spot.
   */
  boards?: readonly BoardKind[];
}

export function buildFloorSpec(source: SourceMap, options: FloorOptions = {}): RoomSpec {
  const boards = (options.boards ?? []).map((kind) => BOARDS[kind]);
  // Naming boards is what makes a floor an Operations floor, and an
  // Operations floor is the one with rooms off a hallway.
  if (boards.length) return operationsSpec(source, boards);

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

/** The two-room layout. See OPS_HEIGHT above for what goes where. */
function operationsSpec(source: SourceMap, boards: { region: Region; poi: PoiSpec }[]): RoomSpec {
  // The whiteboard is lifted from the old map as ever, but hung in the
  // project room rather than over the middle of one open wall.
  const board: Region = { ...WHITEBOARD.region, dx: OPS_WHITEBOARD_COLUMN };
  const picked = harvest(source, [board]);
  const whiteboard: PoiSpec = {
    ...WHITEBOARD.poi,
    tx: OPS_WHITEBOARD_COLUMN + 1,
  };

  const box = ({ region }: { region: Region }) => ({
    x: region.dx * TILE,
    y: region.dy * TILE,
    width: region.sw * TILE,
    height: region.sh * TILE,
  });

  return {
    width: OPS_WIDTH,
    height: OPS_HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: picked.placements,
    pois: [whiteboard, ...boards.map((b) => b.poi)],
    spawns: [{ ...OPS_PLAYER_START }],
    collisions: boards.map(box),
    partitions: [
      {
        orientation: "vertical",
        at: OPS_DIVIDE,
        from: 1,
        to: OPS_HALL_WALL,
      },
      {
        orientation: "horizontal",
        at: OPS_HALL_WALL,
        from: 1,
        to: OPS_WIDTH - 1,
        doorways: [OPS_DOORWAYS.operations, OPS_DOORWAYS.project],
      },
    ],
    transitions: [
      {
        name: "elevator",
        target: "elevator",
        tx: 2,
        ty: OPS_HEIGHT - 2,
        tw: 2,
        th: 2,
        facing: "down",
      },
    ],
  };
}
