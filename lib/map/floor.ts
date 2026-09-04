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

export interface FloorOptions {
  /** The board floor: the project board and the help desk hang on the wall. */
  board?: boolean;
}

export function buildFloorSpec(source: SourceMap, options: FloorOptions = {}): RoomSpec {
  const picked = harvest(source, REGIONS);
  const board = options.board === true;
  return {
    width: WIDTH,
    height: HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: picked.placements,
    pois: board ? [WHITEBOARD.poi, PROJECT_BOARD.poi, HELP_DESK.poi] : [WHITEBOARD.poi],
    spawns: [{ tx: PLAYER_START.tx, ty: PLAYER_START.ty, facing: PLAYER_START.facing }],
    collisions: board
      ? [PROJECT_BOARD.region, HELP_DESK.region].map((region) => ({
          x: region.dx * TILE,
          y: region.dy * TILE,
          width: region.sw * TILE,
          height: region.sh * TILE,
        }))
      : [],
    // No door: the only way out is the way in.
    transitions: [{ name: "elevator", target: "elevator", ...ELEVATOR, facing: "down" }],
  };
}
