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
 * to the right-hand corner. The offsets are `SUPPORT_WALL`; what is here is
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
 * Where each thing hangs along Support's wall, in tiles from its left edge.
 *
 * Fourteen tiles of wall and three things wanting some of it, so the layout
 * is written down once here rather than worked out in three places. The
 * queue takes the left, the counts run to the right-hand corner, and the
 * room's name has the middle — which is the stretch nothing else wants,
 * and the only place a name reads as the room's rather than as a caption
 * on whatever picture it is lettered across.
 *
 * The whiteboard had the left of it until lately, with the name squeezed
 * into the two tiles before that — seven letters wanting nearer three, at
 * the one size in the world nothing else is drawn at. So the board went to
 * the empty room next door (see `opsWhiteboardRoom`), the queue took its
 * place, and the name got the middle.
 */
const SUPPORT_WALL = {
  queue: 2,
  sign: ROOM_COLS / 2,
  pulse: ROOM_COLS - SUPPORT_PULSE.region.sw,
} as const;

/**
 * Where each thing hangs along the Operations room's wall.
 *
 * The same two ends as Support's: the board on the left, where it always
 * hung, and the counts running to the right-hand corner — so the two rooms
 * read alike from the corridor, the work on the left and the numbers on the
 * right. Four clear tiles between them, which is the gap that keeps the one
 * from reading as a caption on the other.
 */
const OPS_WALL = {
  board: 2,
  flow: ROOM_COLS - PROJECT_FLOW.region.sw,
} as const;

/**
 * Where the whiteboard hangs on whichever wall it has: the middle of it.
 *
 * It is the one thing in its room, so the middle is where it belongs —
 * nothing else on that wall for it to keep out of the way of. Its point of
 * interest is the board's right-hand tile, the same as in a lobby, which is
 * why the sign over it carries a nudge of half a tile (`lib/fixtures.ts`).
 */
const WHITEBOARD_AT = (ROOM_COLS - WHITEBOARD.region.sw) / 2;

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
 * Quarter and three-quarters of the run rather than a gap between them,
 * because each figure is centred under its own heading and the pair has to
 * read as two things rather than one long one.
 *
 * Null on the two floors with nowhere to put them, and the room keeps its
 * five counts on both: where Support is in the lower rank — a floor of two
 * rooms, whose lower wall is the one the lift is set into and the one the
 * room's own boards hang on — and where its stretch is the one the floor
 * has written its name on, which is a floor of one room, where Operations
 * and Support are the same room.
 */
export function opsWeekCounts(rooms: number) {
  const support = opsSupportRoom(rooms);
  if (support.rank !== "upper") return null;
  const run = opsWallRun(rooms, support);
  if (middleOf(run) === opsSign(rooms).tx) return null;
  const width = run.to - run.from;
  return { tx: [run.from + width / 4, run.from + (width * 3) / 4] as const, ty: UPPER_WALL };
}

/**
 * Where Support letters its name: the middle of its own wall, between the
 * queue on the left and the five counts running to the right-hand corner.
 *
 * It used to have two tiles at the left end, which is all the whiteboard
 * and the queue left it — seven letters at twelve pixels, small enough
 * that the sign read as a caption rather than as the room's name. Moving
 * the whiteboard out and sliding the queue into its place opens four tiles
 * in the middle, which is both the centre of the wall and the centre of
 * the gap: the name is the room's, so the middle of the room is where it
 * goes.
 */
export function opsSupportSign(rooms: number) {
  const room = opsSupportRoom(rooms);
  return { tx: room.x + SUPPORT_WALL.sign, ty: room.wallRow } as const;
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
    tx: room.x + SUPPORT_WALL.pulse,
    ty: room.wallRow + SUPPORT_PULSE.region.dy,
    tw: SUPPORT_PULSE.region.sw,
    th: SUPPORT_PULSE.region.sh,
  } as const;
}

/**
 * Where the five stage counts hang, in tiles, for the scene that draws
 * them.
 *
 * Off the first room — Operations, the one the project board hangs in —
 * and off the same layout the map is generated from, so the picture the
 * scene draws lands on the footprint the map made solid. The same
 * arrangement as `opsSupportPulse`, one room along.
 */
export function opsProjectFlow(rooms: number) {
  const [operations] = opsRooms(rooms);
  return {
    tx: operations.x + OPS_WALL.flow,
    ty: operations.wallRow + PROJECT_FLOW.region.dy,
    tw: PROJECT_FLOW.region.sw,
    th: PROJECT_FLOW.region.sh,
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
    post: { x: left + 7 * TILE, y: (room.y + 3) * TILE },
    paces: { x: left + 2 * TILE, y: (room.y + 2) * TILE, width: 10 * TILE, height: 2 * TILE },
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
  /**
   * Whether the five stage counts hang beside the project board.
   *
   * Only whether, not which: the stages a building runs are named in
   * `lib/world/tenants.ts` and read at the moment the numbers are fetched,
   * so renaming one is not a map to regenerate. What the map carries is a
   * footprint and a point of interest, and those are the same five tiles
   * whatever the stages are called.
   */
  flow?: boolean;
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
      options.flow ?? false,
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
  flow: boolean,
): RoomSpec {
  const rooms = opsRooms(roomCount);
  const width = opsWidth(roomCount);

  const [first] = rooms;
  const support = opsSupportRoom(roomCount);

  /**
   * Hang a board on a room's wall, `at` tiles along from its left edge, with
   * the point of interest under the middle of it — so you stand in front of
   * a wide board to read it rather than at one end. Odd widths land on a
   * tile; the five counts are five tiles, which is why they are.
   */
  const hang = (board: { region: Region; poi: PoiSpec }, room: OpsRoom, at: number) => ({
    ...board,
    region: { ...board.region, dx: room.x + at, dy: room.wallRow + 1 },
    poi: {
      ...board.poi,
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
  const hung = kinds
    .filter((kind) => kind !== SUPPORT_BOARD)
    .map((kind, i) => hang(BOARDS[kind], first, OPS_WALL.board + i * (BOARDS[kind].region.sw + 1)));
  // The stage counts, at the right-hand end of the same wall — a second way
  // of reading the board on the left of it, so the same room and the same
  // arrangement Support's queue and counts have.
  if (flow) hung.push(hang(PROJECT_FLOW, first, OPS_WALL.flow));

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
    ? [hang(queue, support, SUPPORT_WALL.queue), hang(SUPPORT_PULSE, support, SUPPORT_WALL.pulse)]
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
    pois: [whiteboard, ...hung.map((b) => b.poi), ...inSupport.map((b) => b.poi)],
    spawns: [{ ...opsPlayerStart(roomCount) }],
    collisions: [...hung, ...inSupport].map(box),
    partitions,
    transitions: [
      { name: "elevator", target: "elevator", ...opsElevator(roomCount), facing: "down" },
    ],
  };
}
