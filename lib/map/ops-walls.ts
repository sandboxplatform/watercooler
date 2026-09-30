/**
 * What hangs where on an Operations floor's walls: the board, the room's
 * name and the counts on each working room's wall, and the floor's own name
 * and the week's figures on the corridor's.
 *
 * Split out of `floor.ts`, which re-exports all of it.
 */

import {
  BOARD_WALL,
  COUNTS_AT,
  DOOR_AT,
  NAME_AT,
  type OpsRoom,
  UPPER_WALL,
  type WallRun,
  opsOperations,
  opsProjectRooms,
  opsSupportRoom,
  opsWallRun,
  opsWallRuns,
} from "./ops-layout";
import { PROJECT_FLOW, SUPPORT_PULSE } from "./floor-fixtures";

/**
 * The clear stretch of a working room's wall, in columns from its left
 * edge: what the board, the counts and — downstairs — its own doorway
 * leave for the room's name.
 *
 * Two answers, because the two ranks are looking at different walls.
 * Upstairs a room's boards hang on the map's top wall and its doorway is
 * cut through another wall altogether, so the gap runs the whole way from
 * the board to the counts. Downstairs all four want one run, and the
 * doorway is the right-hand end of it.
 */
function nameRun(rank: OpsRoom["rank"]): WallRun {
  return { from: NAME_AT, to: rank === "lower" ? DOOR_AT : COUNTS_AT };
}

/**
 * Where a working room letters its name, and how much wall it has for it.
 *
 * The middle of the clear stretch, and `cols` is the stretch itself —
 * which the scene wraps the lettering to, so a long board name takes two
 * lines rather than running across the pictures either side of it.
 */
function signOn(room: OpsRoom) {
  const run = nameRun(room.rank);
  return {
    tx: room.x + (run.from + run.to) / 2,
    ty: room.wallRow,
    cols: run.to - run.from,
  } as const;
}

/**
 * Where the whiteboard hangs on whichever wall it has: the left end of it,
 * where every other board on this floor starts.
 *
 * It is the one thing in its room, so nothing forces it anywhere — which is
 * the argument for putting it where the eye already looks. Every working
 * room on this floor opens with a board two tiles in (`BOARD_WALL.board`:
 * the project boards, the support queue), so a whiteboard in the middle of
 * its own wall was the one thing on the corridor that did not line up with
 * the doorway before it or the one after.
 *
 * Centred is what it was, and it read as centred rather than as placed —
 * the room has a table in it too, and a board floating in the middle of a
 * bare wall above a table is a room with two centres.
 *
 * Its point of interest is the board's right-hand tile, the same as in a
 * lobby, which is why the sign over it carries a nudge of half a tile
 * (`lib/fixtures.ts`).
 */
export const WHITEBOARD_AT = BOARD_WALL.board;

/** The middle of a run, which is where anything lettered on it goes. */
const middleOf = (run: WallRun) => (run.from + run.to) / 2;

/**
 * Where this floor writes its name: the middle of the stretch of the
 * corridor's upper wall that Operations fronts.
 *
 * Every other room hangs its sign on the wall across the top of the map,
 * because in every other room you can see that wall. Up there on this one
 * it is behind the upper rank, and the corridor — the only part of the
 * floor anybody walks — never has it in shot. The face of the wall the
 * corridor looks at is in view along most of its length.
 *
 * Right of the doorway rather than over it: a sign across a gap labels the
 * gap. The Operations room is the one the floor is named after and the one
 * the lift lands you facing, so its side of the wall is the side to use.
 *
 * It used to be centred between the doorway and the room's own right-hand
 * edge, which is not the wall anybody sees: the wall does not stop where
 * the room does — it carries on past the divider between the bays to the
 * next doorway along. So the name sat a couple of tiles left of the middle
 * of the stretch it was written on, with no edge in the room to line up
 * with and nothing to explain why.
 */
export function opsSign(rooms: number) {
  const operations = opsOperations(rooms);
  return { tx: middleOf(opsWallRun(rooms, operations)), ty: UPPER_WALL } as const;
}

/**
 * Where the desk's week is lettered: the corridor wall outside Support,
 * two figures side by side.
 *
 * The counts on Support's own wall are the desk today — what is standing on
 * it and what moved since midnight — and they are a plate five tiles wide
 * with no room for a third bank. The week is the other question, and the
 * corridor wall is where it goes: the same face the floor writes its name
 * on, outside the room the numbers belong to, so walking out of the lift
 * tells you where you are and how the week has gone in two glances.
 *
 * Last week hangs beside it on the next stretch along — see
 * `opsLastWeekCounts`, which is where the two are one row of lettering.
 *
 * Quarter and three-quarters of the run rather than a gap between them,
 * because each figure is centred under its own heading and the pair has to
 * read as two things rather than one long one. `net` is the middle of the
 * run, which is where the difference between them is lettered: it belongs
 * between the two figures it is taken from, and the middle is the one spot
 * on the stretch that reads as belonging to both rather than to either.
 *
 * Null on the two floors with nowhere to put them, and the room keeps its
 * five counts on both: where Support is in the lower rank — a floor of two
 * rooms, whose lower wall is the one the lift is set into and the one the
 * room's own boards hang on — and where its stretch is the one the floor
 * has written its name on, which is a floor of one room, where Operations
 * and Support are the same room.
 */
export function opsWeekCounts(rooms: number) {
  const run = weekWallRun(rooms);
  return run && weekOn(run);
}

/**
 * The stretch this week is lettered on: the corridor wall outside Support,
 * or null on the two floors that have none.
 *
 * Its own function because last week's is read off it — the two blocks are
 * one row of lettering on one wall, and the second is "the next stretch
 * along" rather than a stretch found again from scratch.
 */
function weekWallRun(rooms: number): WallRun | null {
  const support = opsSupportRoom(rooms);
  if (support.rank !== "upper") return null;
  const run = opsWallRun(rooms, support);
  return middleOf(run) === opsSign(rooms).tx ? null : run;
}

/** The three columns a week is lettered in, on a stretch of wall. */
function weekOn(run: WallRun) {
  const width = run.to - run.from;
  return {
    tx: [run.from + width / 4, run.from + (width * 3) / 4] as const,
    net: middleOf(run),
    ty: UPPER_WALL,
  };
}

/**
 * And last week, on the next clear stretch along.
 *
 * The same three figures over the week before, because a week of traffic
 * says very little on its own: twelve raised and eleven closed is a good
 * week or a quiet disaster depending on what the week before it did, and
 * the wall is the one place anybody is standing when they ask. Two blocks
 * side by side is that comparison made by looking.
 *
 * The next stretch rather than the one before, so the corridor reads away
 * from the lift as it reads back in time: the floor's name, then this week,
 * then last. And a stretch of its own rather than six figures crowded onto
 * Support's, which is the same argument that put the week out here in the
 * first place — each block is headed, and a heading over three figures is
 * the only thing saying which week they are.
 *
 * Null where there is no next stretch, which is a floor of three or four
 * rooms: Support fronts the last one. The week keeps its own wall there,
 * exactly as the desk keeps its five counts on a floor with no wall for the
 * week at all.
 */
export function opsLastWeekCounts(rooms: number) {
  const week = weekWallRun(rooms);
  if (!week) return null;
  const next = opsWallRuns(rooms).find((run) => run.from >= week.to);
  return next && middleOf(next) !== opsSign(rooms).tx ? weekOn(next) : null;
}

/**
 * Where Support letters its name: the middle of the clear stretch of its
 * own wall, between the queue on the left and whatever the wall gives up
 * next — the five counts upstairs, its own doorway downstairs.
 *
 * It used to have two tiles at the left end, which is all the whiteboard
 * and the queue left it — seven letters at twelve pixels, small enough
 * that the sign read as a caption rather than as the room's name. Moving
 * the whiteboard out and sliding the queue into its place opened the
 * middle of the wall, and `nameRun` is how much of it: the name is the
 * room's, so the middle of the clear wall is where it goes.
 */
export function opsSupportSign(rooms: number) {
  return signOn(opsSupportRoom(rooms));
}

/**
 * Where the five counts hang, in tiles, for the scene that draws them.
 *
 * Read off the room rather than written down, so a longer corridor carries
 * the board with it — and off the same layout the map is generated from, so
 * the picture the scene draws lands on the footprint the map made solid.
 */
export function opsSupportPulse(rooms: number) {
  const room = opsSupportRoom(rooms);
  return {
    tx: room.x + BOARD_WALL.counts,
    ty: room.wallRow + SUPPORT_PULSE.region.dy,
    tw: SUPPORT_PULSE.region.sw,
    th: SUPPORT_PULSE.region.sh,
  } as const;
}

/**
 * Where a project room letters the name of the board hanging in it: the
 * middle of the clear stretch of its own wall, between the board on the
 * left and its own doorway on the right.
 *
 * Exactly where Support letters its own name, and that is the point: the
 * two kinds of working room are the same wall, so what changes from one
 * doorway to the next is the words rather than the arrangement. `slot` is
 * one-based, as the points of interest are lettered.
 *
 * Null where the floor has no such room, which a stale slot asks for.
 */
export function opsProjectSign(rooms: number, slot: number) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  return room ? signOn(room) : null;
}

/**
 * Where a project room's five stage counts hang, in tiles, for the scene
 * that draws them.
 *
 * Off the room rather than written down, so a longer corridor carries them
 * with it — and off the same layout the map is generated from, so the
 * picture the scene draws lands on the footprint the map made solid. The
 * same arrangement as `opsSupportPulse`, in whichever room the board is.
 */
export function opsProjectFlow(rooms: number, slot = 1) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  if (!room) return null;
  return {
    tx: room.x + BOARD_WALL.counts,
    ty: room.wallRow + PROJECT_FLOW.region.dy,
    tw: PROJECT_FLOW.region.sw,
    th: PROJECT_FLOW.region.sh,
  } as const;
}
