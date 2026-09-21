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
import { TILE, WALL_ROWS, WALLS, WHITEBOARD } from "./office";
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
    sw: 5,
    sh: 2,
    dx: 0,
    dy: 1,
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
    sw: 5,
    sh: 2,
    dx: 0,
    dy: 1,
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
const BOARDS: Record<BoardKind, { region: Region; poi: PoiSpec }> = {
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

/**
 * The second working room: the whiteboard's, and the support queue's where
 * there is one, which is what makes it Support.
 *
 * Not the first room — Operations has that wall — and not the room whose
 * wall the lift is set into, which is the first of the lower rank. The
 * second bay's upper room has a clear wall; fall back only when there is no
 * second bay.
 */
export function opsSupportRoom(rooms: number): OpsRoom {
  const list = opsRooms(rooms);
  return list.find((r, i) => i > 0 && r.rank === "upper") ?? list[1] ?? list[0];
}

/**
 * The room the whiteboard hangs in: the empty one next door to Support.
 *
 * Support's wall is full — the queue, the five counts and the room's own
 * name — and the whiteboard is the one board on this floor that stands for
 * nothing in particular, so it is the one to move. Next along the same rank
 * is what "next door" means from the corridor, which is the only place
 * anybody sees these walls from.
 *
 * Falling back across the corridor rather than piling it back onto
 * Support's wall: a floor short enough to have no room to the right still
 * has the one facing Support, and either way the point is a wall with
 * space on it. Only a floor of one room has neither, and there Operations,
 * Support and the whiteboard's room are all the same room anyway.
 *
 * Where a building runs no support queue there is no Support and nothing
 * else on that wall, so the whiteboard stays where it always hung — see
 * `operationsSpec`.
 */
export function opsWhiteboardRoom(rooms: number): OpsRoom {
  const list = opsRooms(rooms);
  const support = opsSupportRoom(rooms);
  const alongside = list.find((r) => r.rank === support.rank && r.x > support.x);
  const across = list.find((r) => r.x === support.x && r.rank !== support.rank);
  return alongside ?? across ?? support;
}

/**
 * The room the boardroom table stands in: the far one at the top.
 *
 * The end of the upper rank, which is as far from the lift as this floor
 * goes — a room you pass everything else to reach, which is what a
 * boardroom is. It shares the room with the whiteboard, and that is the
 * point rather than a collision: a table to sit round and a board to draw
 * on is a meeting room.
 *
 * On a short floor the far upper room is Operations itself, and the table
 * stands in the middle of it. That is the same answer `opsWhiteboardRoom`
 * gives on a floor with nowhere else to hang a board, and for the same
 * reason: a floor of one room is one room.
 */
export function opsBoardroom(rooms: number): OpsRoom {
  const upper = opsRooms(rooms).filter((room) => room.rank === "upper");
  return upper[upper.length - 1];
}

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
/**
 * How wide a room is, which is how wide its wall is.
 *
 * Seventeen rather than the fourteen it was, because the lower rank's wall
 * has to carry four things and fourteen fits three. Upstairs a room hangs
 * its boards on the map's top wall and its doorway is cut through a
 * different wall altogether; downstairs they share one, so the doorway is a
 * hole in the middle of the same run the board, the name and the counts
 * want. At fourteen the counts ran through it — five tiles starting at nine,
 * a doorway at eight — and the plate was drawn across a gap in the wall it
 * was supposed to be hanging on.
 *
 * Three tiles of growth is what `BOARD_WALL` needs and no more: it puts a
 * clear tile either side of the doorway. The corridor is that much longer
 * per bay, which is the floor doing what it is built to do.
 */
export const ROOM_COLS = 17;
const ROOM_ROWS = 7;
const CORRIDOR_ROWS = 4;

/**
 * A doorway off the corridor, and where each rank cuts one.
 *
 * The upper rank's is a hole in a wall with nothing else on it — a room up
 * here hangs its boards on the map's top wall — so it sits where it always
 * did, a few tiles in from the room's left edge. The lower rank's is a hole
 * in the wall its own boards hang on, so it goes where `BOARD_WALL` leaves
 * room for it, which is what `DOOR_AT` works out.
 *
 * The two are far enough apart that two rooms facing each other across the
 * corridor do not line their doors up into what reads as one wide gap — and
 * the lower one never lands on the lift, which is set into that wall
 * beneath the first upper door.
 */
const DOOR_COLS = 2;
const UPPER_DOOR_AT = 4;

/** The first walkable row of each band, worked out once so nothing drifts. */
const UPPER_TOP = WALL_ROWS;
const UPPER_WALL = UPPER_TOP + ROOM_ROWS;
const CORRIDOR_TOP = UPPER_WALL + WALL_ROWS;
const LOWER_WALL = CORRIDOR_TOP + CORRIDOR_ROWS;
const LOWER_TOP = LOWER_WALL + WALL_ROWS;

export const OPS_HEIGHT = LOWER_TOP + ROOM_ROWS + 1;

/**
 * The doorway through the wall between two rooms in the same rank: three
 * tiles, dead centre of it.
 *
 * A room with one door is a room you leave the way you came in, so getting
 * from one project's room to the next door's meant walking back out to the
 * corridor and along it. Neighbours already share a wall, so the short way
 * is through it.
 *
 * Wider than the two-tile doors off the corridor, and deliberately: those
 * are doorways in a wall you look at the face of, and this is a wall seen
 * from above, where the same two tiles read as a slot rather than a way
 * through. Three of the seven rows leaves two tiles of wall above and two
 * below — the only width that is symmetrical, so the opening sits where a
 * person walking the middle of the room already is.
 */
const BETWEEN_ROOMS_ROWS = 3;
const BETWEEN_ROOMS = {
  rows: BETWEEN_ROOMS_ROWS,
  at: Math.floor((ROOM_ROWS - BETWEEN_ROOMS_ROWS) / 2),
} as const;

/**
 * Where each thing hangs along a working room's wall, in tiles from its
 * left edge.
 *
 * Fourteen tiles of wall and three things wanting some of it, so the layout
 * is written down once here rather than worked out in several places — and
 * once for both kinds of room, because Support and a project room are the
 * same arrangement: the board in the left-hand corner, the room's own name
 * in the middle, and the counts running to the right-hand corner. That is what
 * makes the corridor readable rather than merely tidy — the work on the
 * left of every doorway and the numbers on the right of it, whichever room
 * you are looking into.
 *
 * Both pictures go **hard into their corners** and the name has whatever is
 * left between them. Two tiles of clear wall to the left of the board is
 * not a margin, it is a gap: a board that starts a couple of tiles in
 * reads as having drifted off the end of its wall, and from the corridor
 * the eye has the doorway's edge to compare it against. Flush, the three
 * rooms line up with each other and with Support.
 *
 * The name is the middle of **what is left**, not the middle of the wall.
 * They were the same tile while the board started two in, which is why one
 * number stood for both; with the board in the corner the clear stretch
 * runs from tile 3 to tile 9 and its middle is a tile to the left of the
 * wall's. The middle of the gap is the one that matters — a name is only
 * the room's if it is lettered on wall rather than across a picture — and
 * centred on the wall it would have crowded the counts.
 *
 * And the gap is **measured** rather than declared, which is what it was:
 * a name band four tiles wide, hard against the board, centred on itself.
 * That is the middle of the gap only where the gap happens to be four
 * tiles, and downstairs it is six — so every project room lettered its
 * board's name a whole tile to the left of the clear wall it was written
 * on, with the doorway's edge on the right of it to compare against.
 * `nameRun` is the stretch and the name is the middle of it, whatever it
 * comes to.
 */
const BOARD_AT = 0;
const NAME_AT = BOARD_AT + PROJECT_BOARD.region.sw;
const COUNTS_AT = ROOM_COLS - SUPPORT_PULSE.region.sw;
/**
 * Hard against the counts, less a clear tile.
 *
 * The same column it has always been at, and now saying why: the doorway
 * is the last thing onto the wall, so it takes the right-hand end of what
 * the name does not want and leaves a tile of wall between itself and the
 * plate — without which the gap and the doorway read as one opening. What
 * is left to the left of it is the name's, which is what `nameRun` hands
 * out.
 */
const DOOR_AT = COUNTS_AT - DOOR_COLS - 1;

const BOARD_WALL = {
  board: BOARD_AT,
  door: DOOR_AT,
  counts: COUNTS_AT,
} as const;

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
const WHITEBOARD_AT = BOARD_WALL.board;

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

/** A clear stretch of wall, as [from, to) columns. */
export interface WallRun {
  from: number;
  to: number;
}

/**
 * The clear stretches of the corridor's upper wall, split by the doorways
 * cut through it.
 *
 * The one wall on this floor with anything written on it, and the only one
 * the corridor sees a whole face of: the lower rank's is the wall the lift
 * is set into and the lower rooms hang their boards on. A doorway is a hole
 * in it, so a stretch is what is left between two of them — which is what
 * "on the wall" has to mean before anything can be centred on it.
 */
export function opsWallRuns(rooms: number): WallRun[] {
  const runs: WallRun[] = [];
  let from = 0;
  for (const room of opsRooms(rooms).filter((room) => room.rank === "upper")) {
    runs.push({ from, to: room.door.from });
    from = room.door.to;
  }
  runs.push({ from, to: opsWidth(rooms) });
  return runs.filter((run) => run.to > run.from);
}

/**
 * The stretch of that wall a room fronts: the run it shares most of its
 * width with.
 *
 * A room's own doorway divides its frontage in two, and the larger half is
 * the side of it there is room to write on — which for every room on this
 * floor is the side away from the door, since a doorway sits four tiles in
 * from one edge and eight from the other. Asked as an overlap rather than
 * written down as "the run after the door", because the lower rank's doors
 * are offset the other way and one rule that reads the geometry beats two
 * that assume it.
 */
export function opsWallRun(rooms: number, room: OpsRoom): WallRun {
  const runs = opsWallRuns(rooms);
  const shared = (run: WallRun) =>
    Math.max(0, Math.min(run.to, room.x + ROOM_COLS) - Math.max(run.from, room.x));
  return runs.reduce((best, run) => (shared(run) > shared(best) ? run : best), runs[0]);
}

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
  const [operations] = opsRooms(rooms);
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
 * The rooms the project boards hang in, in the order the boards were
 * declared.
 *
 * The first is Operations — the room above the lift, which is what you step
 * out facing, so the building's own board is the one you walk into. The
 * rest take the lower rank left to right, **except the room the lift is set
 * into**: those are the rooms nothing else wants, and they line the far
 * side of the corridor, so three boards read as three doorways rather than
 * as one wall with three things on it.
 *
 * The lift's room is skipped for the same reason it is not Support. The car
 * is three tiles tall and hangs a tile below the wall's cap, which is the
 * room's own wall face — so a board on the left of that wall is a board
 * with a lift drawn across the end of it. Asked of `opsElevator` rather
 * than written down as "not the first lower room", because where the lift
 * stands is a fact about the floor and has moved once already.
 *
 * Shorter than `count` where the floor has not the rooms for it, which
 * cannot happen from a tenant — `operationsRoomCount` grows the floor to
 * fit — but can from a hand-built spec, and a board with no wall is better
 * left off than hung in somebody else's room.
 */
export function opsProjectRooms(rooms: number, count: number): OpsRoom[] {
  const list = opsRooms(rooms);
  const lift = opsElevator(rooms);
  const clearOfLift = (room: OpsRoom) =>
    lift.tx >= room.x + BOARD_WALL.counts || lift.tx + lift.tw <= room.x + BOARD_WALL.board;
  const lower = list.filter((room) => room.rank === "lower" && clearOfLift(room));
  return [list[0], ...lower].slice(0, count).filter(Boolean);
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

/**
 * Where a project room stands its roadblock, in tiles: the middle of the
 * room, both ways.
 *
 * On the floor rather than on the wall, and that is the whole of it. The
 * wall is where the work is — the board and the five stages it is spread
 * over — and a roadblock is not a stage, it is the reason a stage is not
 * moving. Put up there it would be a sixth bay on a plate of five and
 * would read as more of the same; stood on the floor it is a thing in the
 * way, which is what it is.
 *
 * The middle rather than in line with the doorway, which is where it
 * stood first. Lined up with the door it was a thing to walk round on the
 * way in, and off to one side of a room whose every other feature is on
 * the wall opposite — so the room had the barrier in one corner of the
 * eye and what it is about in the other. The middle is the one spot in an
 * empty room that belongs to the room rather than to one of its edges,
 * and it is in shot through the doorway from the corridor either way.
 *
 * Both ways: the middle column of seventeen is a half tile, which is
 * exact rather than awkward — the marker is drawn centred on the point.
 * The row is the middle of seven, and the marker stands on the bottom of
 * it, so the feet land a shade below centre, which is where a thing that
 * stands up looks centred from.
 *
 * Null where the floor has no such room, as the sign and the counts are.
 */
export function opsRoadblock(rooms: number, slot: number) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  if (!room) return null;
  return {
    tx: room.x + ROOM_COLS / 2,
    ty: room.y + Math.floor(ROOM_ROWS / 2),
  } as const;
}

/**
 * Where a project room stacks what has shipped, in tiles: the far corner
 * of the floor, two columns in from the right-hand wall and standing on
 * the room's last row.
 *
 * The roadblock's opposite number, and placed as its opposite. Work that
 * has stopped stands in the **middle** because it is in the way, which is
 * the one thing there is to say about it; work that has gone out is
 * finished with, so it is stacked **out of the way** — and the corner it
 * is stacked in is the one diagonally across the room from the board it
 * came off. The board hangs in the left-hand corner of the wall, so a room
 * reads left to right and front to back: the work on the wall, the trouble
 * in the middle of the floor, the crates in the far corner.
 *
 * Two columns in rather than hard into the corner: the stack is two tiles
 * wide and drawn centred on the point, so this leaves a clear column
 * between it and the wall — without which the crates read as having been
 * shoved through it. The row is the room's last, so they stand against the
 * back wall, which is where a pallet of finished goods ends up.
 *
 * It is clear of both ranks' doorways by construction: the lower rank's is
 * cut at `BOARD_WALL.door`, well to the left of this, and the upper rank's
 * is further left again.
 *
 * Null where the floor has no such room, as the roadblock and the counts
 * are.
 */
export function opsDeployed(rooms: number, slot: number) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  if (!room) return null;
  return {
    tx: room.x + ROOM_COLS - 2,
    ty: room.y + ROOM_ROWS - 1,
  } as const;
}

/**
 * Doc's post in Support, and the floor he paces at it.
 *
 * A band across the middle of the room rather than a spot against a wall:
 * there is no counter up here to stand behind, so what keeps him off the
 * furniture is the bounds themselves — nothing collides a resident. Both are
 * for the sprite's centre, as every station's are, and both are worked out
 * from the room so they follow it when the corridor grows.
 */
export function opsSupportPost(rooms: number) {
  const room = opsSupportRoom(rooms);
  const left = room.x * TILE;
  return {
    post: { x: left + (ROOM_COLS / 2) * TILE, y: (room.y + 3) * TILE },
    paces: {
      x: left + 2 * TILE,
      y: (room.y + 2) * TILE,
      width: (ROOM_COLS - 4) * TILE,
      height: 2 * TILE,
    },
  } as const;
}

/**
 * Where the boardroom table stands, in tiles: the middle of its room.
 *
 * Centred both ways: two clear rows above and two below, and four clear
 * columns to the left of it — five tiles of table cannot sit dead centre
 * in a room fourteen wide, and half a tile of overhang on the right is
 * closer to centred than a table shoved against a wall. The lower of the
 * two rows below is where the point of interest sits, which is where you
 * stand to use it.
 *
 * Read off the room, like the boards, so a longer corridor carries the
 * table with it rather than leaving it behind at a hard-coded column.
 */
export function opsBoardroomTable(rooms: number) {
  const room = opsBoardroom(rooms);
  const { sw, sh } = BOARDROOM_TABLE.region;
  return {
    tx: room.x + Math.floor((ROOM_COLS - sw) / 2),
    ty: room.y + Math.floor((ROOM_ROWS - sh) / 2),
    tw: sw,
    th: sh,
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
    // Each rank cuts its doorway where its own wall has room — see
    // DOOR_COLS above for why the two offsets are not the same number.
    const doorFrom = x + (upper ? UPPER_DOOR_AT : BOARD_WALL.door);
    rooms.push({
      rank: upper ? "upper" : "lower",
      x,
      y: upper ? UPPER_TOP : LOWER_TOP,
      wallRow: upper ? 0 : LOWER_WALL,
      door: { from: doorFrom, to: doorFrom + DOOR_COLS },
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
  /**
   * The project boards hanging on this floor, one to a room: for each,
   * whether the five stage counts hang beside it.
   *
   * Only how many and whether, not which board or which stages: those are
   * named in `lib/world/tenants.ts` and read at the moment the numbers are
   * fetched, so renaming a board or a lane is not a map to regenerate. What
   * the map carries is a footprint and a point of interest per room, and
   * those are the same tiles whatever the board is called.
   *
   * Empty means the one unnamed board on the Operations wall with nothing
   * counted beside it, which is what every floor was before boards had
   * rooms of their own.
   */
  projects?: readonly { counts: boolean }[];
}

export function buildFloorSpec(source: SourceMap, options: FloorOptions = {}): RoomSpec {
  const kinds = options.boards ?? [];
  // Naming boards is what makes a floor an Operations floor, and an
  // Operations floor is the one with rooms off a hallway.
  if (kinds.length)
    return operationsSpec(
      source,
      kinds,
      Math.max(1, options.rooms ?? OPS_ROOM_COUNT),
      options.projects?.length ? options.projects : [{ counts: false }],
    );

  const boards = kinds.map((kind) => BOARDS[kind]);
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
  kinds: readonly BoardKind[],
  roomCount: number,
  projects: readonly { counts: boolean }[],
): RoomSpec {
  const rooms = opsRooms(roomCount);
  const width = opsWidth(roomCount);

  const support = opsSupportRoom(roomCount);

  /**
   * Hang a board on a room's wall, `at` tiles along from its left edge, with
   * the point of interest under the middle of it — so you stand in front of
   * a wide board to read it rather than at one end. Odd widths land on a
   * tile; the five counts are five tiles, which is why they are.
   */
  const hang = (
    board: { region: Region; poi: PoiSpec },
    room: OpsRoom,
    at: number,
    slot?: number,
  ) => ({
    ...board,
    region: { ...board.region, dx: room.x + at, dy: room.wallRow + 1 },
    poi: {
      ...board.poi,
      // Numbered only where there are several of the same thing to tell
      // apart. The queue and its counts are one apiece, and an unnumbered
      // name is what `lib/fixtures.ts` matches when there is nothing to say.
      name: slot === undefined ? board.poi.name : `${board.poi.name} ${slot}`,
      tx: room.x + at + Math.floor(board.region.sw / 2),
      ty: room.wallRow + 2,
    },
  });

  /**
   * The support queue hangs in Support, not in Operations.
   *
   * A board is a picture of the work it stands for, so the room it hangs in
   * is what the room is for — and the queue is the one board that names a
   * job somebody does rather than a project everybody watches. Trello stays
   * on the Operations wall with the corridor outside it; Zoho goes in on
   * the next wall along, and that room is Support.
   *
   * It is the same wall it always was in a building running only Trello, so
   * Castle Atlantic is untouched and has no Support room at all — the same
   * way a building naming no boards has no Operations floor.
   */
  const queue = kinds.includes(SUPPORT_BOARD) ? BOARDS[SUPPORT_BOARD] : null;

  /**
   * A project board to a room, and its stage counts on the same wall.
   *
   * The points of interest are numbered from one — `Project board 2`, and
   * `Project flow 2` beside it — because the map is shared by every
   * building running this many boards and a slot is geometry where a name
   * is the tenant's. The scene reads the number back out of the name and
   * asks the building which board that room holds; the browser never names
   * a board, for the same reason it never names the room it is standing in.
   *
   * A room with no counts declared gets the board and nothing on the right
   * of its wall, which is Castle Atlantic's one unnamed board.
   */
  const hung = kinds.includes("trello")
    ? opsProjectRooms(roomCount, projects.length).flatMap((room, i) => {
        const slot = i + 1;
        const board = hang(BOARDS.trello, room, BOARD_WALL.board, slot);
        return projects[i]?.counts
          ? [board, hang(PROJECT_FLOW, room, BOARD_WALL.counts, slot)]
          : [board];
      })
    : ([] as ReturnType<typeof hang>[]);

  /**
   * The whiteboard goes in the empty room next door, where there is a queue
   * to crowd it out of Support's wall and somewhere to move it to.
   *
   * A building running no queue has neither: nothing else hangs on that
   * wall, so the board keeps it and every other room stays empty, exactly
   * as before. Either way it is centred on the wall it has — it is the one
   * thing in the room.
   */
  const whiteboardRoom = queue ? opsWhiteboardRoom(roomCount) : support;
  const board: Region = {
    ...WHITEBOARD.region,
    dx: whiteboardRoom.x + WHITEBOARD_AT,
    dy: whiteboardRoom.wallRow + 1,
  };
  // The counts come with the queue rather than being declared: they are the
  // same desk counted, so a building with no support queue has nothing for
  // them to count and no room to hang them in.
  const inSupport = queue
    ? [hang(queue, support, BOARD_WALL.board), hang(SUPPORT_PULSE, support, BOARD_WALL.counts)]
    : ([] as ReturnType<typeof hang>[]);
  // Only the whiteboard is cut from the source map. A board is a picture the
  // scene draws over the wall, which is why its region is here for its box
  // and its point of interest and has no layers to harvest.
  const picked = harvest(source, [board]);
  const whiteboard: PoiSpec = {
    ...WHITEBOARD.poi,
    tx: whiteboardRoom.x + WHITEBOARD_AT + 1,
    ty: whiteboardRoom.wallRow + 2,
  };

  /**
   * The table in the far room at the top, and the point you use it from.
   *
   * Every Operations floor gets one — see `opsBoardroom`. Its point is the
   * tile below the table rather than under the middle of it, because this
   * is furniture: you stand at a table's near side, not inside it.
   */
  const table = opsBoardroomTable(roomCount);
  const boardroom: PoiSpec = {
    ...BOARDROOM_TABLE.poi,
    tx: table.tx + Math.floor(table.tw / 2),
    ty: table.ty + table.th,
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

  // A wall between neighbouring rooms in the same rank, closing each bay —
  // with a doorway through it, so the rooms along a rank connect to each
  // other as well as to the corridor.
  for (const rank of ["upper", "lower"] as const) {
    const inRank = rooms.filter((r) => r.rank === rank);
    const top = rank === "upper" ? UPPER_TOP : LOWER_TOP;
    for (const room of inRank.slice(1)) {
      const gap = top + BETWEEN_ROOMS.at;
      partitions.push({
        orientation: "vertical",
        at: room.x - 1,
        from: top,
        to: top + ROOM_ROWS,
        doorways: [{ from: gap, to: gap + BETWEEN_ROOMS.rows }],
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
    pois: [whiteboard, boardroom, ...hung.map((b) => b.poi), ...inSupport.map((b) => b.poi)],
    spawns: [{ ...opsPlayerStart(roomCount) }],
    collisions: [
      ...[...hung, ...inSupport].map(box),
      // The table is solid, so the room is walked round it rather than
      // through it. The whole picture, chairs included: a chair is no more
      // walkable than the table it is pushed under.
      {
        x: table.tx * TILE,
        y: table.ty * TILE,
        width: table.tw * TILE,
        height: table.th * TILE,
      },
    ],
    partitions,
    transitions: [
      { name: "elevator", target: "elevator", ...opsElevator(roomCount), facing: "down" },
    ],
  };
}
