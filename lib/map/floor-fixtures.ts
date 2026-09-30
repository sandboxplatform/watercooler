/**
 * The fixed parts of a floor above the lobby: its size, where the lift and the
 * whiteboard stand, and the pictures that hang on an Operations floor's walls.
 *
 * Split out of `floor.ts`, which re-exports all of it.
 */

import type { Region } from "./harvest";
import { WALL_ROWS, WHITEBOARD } from "./office";
import type { PoiSpec } from "./spec";
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
 * On the wall across the top of the Operations room, and the only thing
 * on it — the floor writes its own name on the corridor wall instead, which
 * is the one you can see from the corridor.
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
 * The help desk board: the support queue, first along Support's own wall,
 * with the room's name lettered in the middle and the five counts running
 * to the right-hand corner. The offsets are `BOARD_WALL`; what is here is
 * the footprint and the point of interest, as the project board's is.
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

/**
 * How much wall a plate of counts takes, and how deep into it.
 *
 * All of what is left, which is the whole point: a plate is a screen, and
 * the two things that decide how big a number on it can be drawn are the
 * wall it has and the wall it takes. Five tiles of a seventeen-tile wall
 * left a clear tile between the plate and whatever was next along — a tile
 * nothing either side wanted, which is a gap rather than a margin — and two
 * rows of a three-row band left a stripe of bare wall above every plate on
 * the floor.
 *
 * So a plate runs from the doorway, or from the board's own corner
 * upstairs, to the room's right-hand corner, and stands the full depth of
 * the wall. `WALL_FACE` is where the picture goes inside that, since the
 * band is not all wall you can hang something on — that is the drawing's,
 * in `systems/CountBoard`, and what is here is the footprint.
 */
const COUNTS_COLS = 6;

/**
 * The five counts, next along Support's wall from the queue.
 *
 * Wider than the other two because it is five things rather than one, and
 * the last thing on that wall — it runs to the room's right-hand corner.
 * Like them, the picture is the scene's: what the map carries is the
 * footprint that makes it solid and the point of interest to read it from.
 *
 * Not a `BoardKind`. A board is something a building declares it runs; this
 * is a second way of looking at the queue, so it comes with the queue
 * wherever the queue hangs rather than being named separately.
 */
export const SUPPORT_PULSE = {
  region: {
    label: "support pulse",
    sx: 0,
    sy: 0,
    sw: COUNTS_COLS,
    sh: WALL_ROWS,
    dx: 0,
    dy: 0,
    layers: [],
  } satisfies Region,
  poi: { name: "Support pulse", tx: 2, ty: 2, facing: "up" } satisfies PoiSpec,
};

/**
 * The five stage counts, at the other end of the Operations room's wall
 * from the project board they count.
 *
 * The same plate as Support's — five tiles by two, its picture drawn by the
 * scene and its numbers kept current — because it is the same kind of
 * thing: a board whose picture is its numbers. What the map carries is the
 * footprint that makes it solid and the point of interest to read it from.
 *
 * Not a `BoardKind` either, and for the same reason the support counts are
 * not: it is a second way of looking at the project board, so it comes with
 * a building declaring the stages it runs (`flow` in `lib/world/tenants.ts`)
 * rather than being a board of its own.
 */
export const PROJECT_FLOW = {
  region: {
    label: "project flow",
    sx: 0,
    sy: 0,
    sw: COUNTS_COLS,
    sh: WALL_ROWS,
    dx: 0,
    dy: 0,
    layers: [],
  } satisfies Region,
  poi: { name: "Project flow", tx: 2, ty: 2, facing: "up" } satisfies PoiSpec,
};

/**
 * The boardroom table: five tiles of it, three rows deep with the chairs.
 *
 * The one thing on this floor that is furniture rather than something on a
 * wall, so what the map carries is the footprint that makes it solid and a
 * point of interest on the tile **below** it — you walk up to the near side
 * of a table, and the picture the scene stands on that point is three rows
 * of table above it (`lib/fixtures.ts`).
 *
 * Not a `BoardKind` and not declared per building: every Operations floor
 * has one, in the same room, so it is not another thing for the map's file
 * name to distinguish. A floor with rooms to hold meetings in and nowhere
 * to hold one is the odder answer.
 */
export const BOARDROOM_TABLE = {
  region: {
    label: "boardroom table",
    sx: 0,
    sy: 0,
    sw: 5,
    sh: 3,
    dx: 0,
    dy: 0,
    layers: [],
  } satisfies Region,
  poi: { name: "Boardroom table", tx: 2, ty: 3, facing: "up" } satisfies PoiSpec,
};

/** Where each board hangs, and the point of interest to read it from. */
export const BOARDS: Record<BoardKind, { region: Region; poi: PoiSpec }> = {
  trello: PROJECT_BOARD,
  zoho: HELP_DESK,
};

/**
 * The board that makes a room Support.
 *
 * The support queue is the one board that stands for a job somebody does
 * rather than a project everybody watches, so it does not hang in the room
 * everybody walks through. Where a building runs one, the room it hangs in
 * is Support; where it does not, there is no such room — the same way a
 * building naming no boards has no Operations floor.
 */
export const SUPPORT_BOARD: BoardKind = "zoho";
