/**
 * An Operations floor's layout: the corridor, the rooms off it in bays, the
 * wing west of the lift, the doorways, and which room is which.
 *
 * Split out of `floor.ts`, which re-exports all of it.
 */

import { TILE, WALL_ROWS } from "./office";
import { BOARDROOM_TABLE, PROJECT_BOARD, SUPPORT_PULSE } from "./floor-fixtures";

/**
 * The second working room: the whiteboard's, and the support queue's where
 * there is one, which is what makes it Support.
 *
 * Not Operations — that room has its own wall — and not the room whose
 * wall the lift is set into, which is the lower room of the same bay. The
 * first upper room **east** of Operations has a clear wall; fall back only
 * when there is none.
 *
 * East rather than simply the next one along, because a floor long enough
 * has a wing west of the lift (`opsWing`) and those rooms are the boards':
 * the queue hung out there would be behind you as you step out, on the two
 * walls nearest the lift, which are the two this floor most wants for the
 * work itself.
 */
export function opsSupportRoom(rooms: number): OpsRoom {
  const list = opsRooms(rooms);
  const operations = opsOperations(rooms);
  const along = list.find((r) => r.rank === "upper" && r.x > operations.x);
  const across = list.find((r) => r.x === operations.x && r.rank === "lower");
  return along ?? across ?? operations;
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
 * Rooms fill in bays along the corridor, one above and one below each bay,
 * left to right — so a building with two rooms gets one on each side and a
 * building with six gets three bays, and the floor **grows sideways**
 * rather than being redrawn. That is the point of the shape: a company with
 * more projects on the go gets a longer corridor.
 *
 * The lift is at the left-hand end of it, under Operations' door, until the
 * corridor is four bays long — at which point the first bay stands west of
 * the lift instead and the work opens off both hands. See `opsWing`.
 *
 *   rows 0-2      the top wall, boards on the first room's half of it
 *   rows 3-9      the upper rank of rooms
 *   rows 10-13    the wall they share with the corridor, doorways cut in it
 *   rows 13-16    the corridor, lift at the left end or a bay in (opsWing)
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
export const ROOM_ROWS = 7;
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
export const UPPER_TOP = WALL_ROWS;
export const UPPER_WALL = UPPER_TOP + ROOM_ROWS;
const CORRIDOR_TOP = UPPER_WALL + WALL_ROWS;
export const LOWER_WALL = CORRIDOR_TOP + CORRIDOR_ROWS;
export const LOWER_TOP = LOWER_WALL + WALL_ROWS;

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
export const BETWEEN_ROOMS = {
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
 * left between them — and the plate of counts, unlike the board, goes on
 * until it meets what is next along, which downstairs is the doorway and
 * upstairs is nothing at all. A screen is as readable as it is big, so of
 * the things on this wall it is the one to give the spare tile to. Two tiles of clear wall to the left of the board is
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
export const NAME_AT = BOARD_AT + PROJECT_BOARD.region.sw;
export const COUNTS_AT = ROOM_COLS - SUPPORT_PULSE.region.sw;
/**
 * Hard against the counts.
 *
 * The same column it has always been at, and now saying why differently:
 * the doorway is the last thing onto the wall, so it takes the right-hand
 * end of what the name does not want, and it ends where the plate begins.
 * There used to be a clear tile between the two, from when the counts were
 * five tiles of a wall of seventeen — a tile nothing either side wanted,
 * which reads as a gap rather than as a margin. The answer was to give the
 * wall to the plate rather than leave it standing empty, so the plate grew
 * a column and the doorway stayed where it was. What is left to the left
 * of it is the name's, which is what `nameRun` hands out.
 */
export const DOOR_AT = COUNTS_AT - DOOR_COLS;

export const BOARD_WALL = {
  board: BOARD_AT,
  door: DOOR_AT,
  counts: COUNTS_AT,
} as const;

/** How many bays a given number of rooms needs: two rooms to a bay. */
export const opsBays = (rooms: number) => Math.max(1, Math.ceil(rooms / 2));

/** The floor is as wide as its bays, plus the wall that closes the last one. */
export const opsWidth = (rooms: number) => 1 + opsBays(rooms) * (ROOM_COLS + 1);

/**
 * How many bays stand **west** of the lift, which on most floors is none.
 *
 * The corridor grows eastward a bay at a time, and for three bays that is
 * the right shape: the lift is at one end, you step out facing Operations,
 * and the whole floor is in front of you. A fourth bay stops that being
 * true — the far room is four doorways off with nothing at your back, and
 * a corridor read entirely in one direction is a corridor half of which is
 * a walk rather than a place.
 *
 * So from four bays on, the first bay stands west of the lift. Stepping
 * out you still face Operations; what changes is that there is work off
 * both hands rather than all of it off one, and the two rooms nearest the
 * lift — one up, one down — are the two nearest anybody riding to this
 * floor, which is what makes them worth hanging a board in.
 *
 * One bay and no more. A second would put the lift back in the middle of a
 * walk, from the other end.
 */
const WING_FROM_BAYS = 4;
export const opsWing = (rooms: number) => (opsBays(rooms) >= WING_FROM_BAYS ? 1 : 0);

/**
 * The Operations room: the upper room of the lift's own bay, and so the
 * doorway you step out facing.
 *
 * The first room on a floor with no wing and the third on one with, which
 * is why it is asked of the layout rather than taken as `opsRooms(...)[0]`.
 * That is what every caller used to do, and a bay west of the lift is
 * exactly what makes it quietly wrong.
 */
export function opsOperations(rooms: number): OpsRoom {
  const list = opsRooms(rooms);
  return list[2 * opsWing(rooms)] ?? list[0];
}

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
  const operations = opsOperations(rooms);
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

/**
 * The rooms the project boards hang in, in the order the boards were
 * declared.
 *
 * They run **outward from the lift**, because that is the order anybody
 * riding to this floor meets them.
 *
 * The first is Operations — the room above the lift, which is what you step
 * out facing, so the building's own board is the one you walk into. Then
 * the wing, where there is one: the bay west of the lift, upper room then
 * lower, which are the two nearest doorways on the floor and the only pair
 * facing each other across the corridor that both have a clear wall. Then
 * the lower rank east, left to right — the rooms nothing else wants, lining
 * the far side of the corridor, so a board reads as a doorway rather than
 * as one more thing on one long wall.
 *
 * The lift's own room is skipped for the same reason it is not Support. The
 * car is three tiles tall and hangs a tile below the wall's cap, which is
 * that room's own wall face — so a board on the left of it is a board with
 * a lift drawn across the end. Asked of `opsElevator` rather than written
 * down as "not the first lower room", because where the lift stands is a
 * fact about the floor and has moved twice now.
 *
 * Shorter than `count` where the floor has not the rooms for it, which
 * cannot happen from a tenant — `operationsRoomCount` grows the floor to
 * fit — but can from a hand-built spec, and a board with no wall is better
 * left off than hung in somebody else's room.
 */
export function opsProjectRooms(rooms: number, count: number): OpsRoom[] {
  const list = opsRooms(rooms);
  const operations = opsOperations(rooms);
  const lift = opsElevator(rooms);
  const clearOfLift = (room: OpsRoom) =>
    lift.tx >= room.x + BOARD_WALL.counts || lift.tx + lift.tw <= room.x + BOARD_WALL.board;
  const wing = list.filter((room) => room.x < operations.x);
  const east = list.filter(
    (room) => room.rank === "lower" && room.x >= operations.x && clearOfLift(room),
  );
  return [operations, ...wing, ...east].slice(0, count).filter(Boolean);
}

/**
 * How many rooms `boards` project boards want, Operations included.
 *
 * Grown against the layout rather than worked out from it, because three
 * rules decide it — Operations first, then the wing, then the lower rank
 * east of the lift — and the wing only appears past a certain length of
 * corridor. Arithmetic saying the same thing is arithmetic that disagrees
 * with the rooms at the boundary, and the failure is a board declared with
 * no wall to hang on, which draws perfectly.
 *
 * One board is one room: it hangs in Operations, and a floor of one room is
 * a floor that has it. Anything more grows the floor until the layout has
 * the walls for it.
 */
export function roomsForBoards(boards: number): number {
  if (boards <= 1) return 1;
  const most = 2 * boards + 4;
  for (let rooms = 2; rooms < most; rooms++) {
    if (opsProjectRooms(rooms, boards).length === boards) return rooms;
  }
  return most;
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
  const { door } = opsOperations(rooms);
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
