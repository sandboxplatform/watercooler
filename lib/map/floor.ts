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

import type { BoardKind } from "../world/tenants";
import { harvest, type Region, type SourceMap } from "./harvest";
import type { PartitionSpec, PoiSpec, RoomSpec } from "./spec";
import { buildCubiclesSpec } from "./cubicles";
import { TILE, WALL_ROWS, WALLS, WHITEBOARD } from "./office";
import {
  BOARDROOM_TABLE,
  BOARDS,
  ELEVATOR,
  HEIGHT,
  PLAYER_START,
  PROJECT_FLOW,
  REGIONS,
  SUPPORT_BOARD,
  SUPPORT_PULSE,
  WIDTH,
} from "./floor-fixtures";
import {
  BETWEEN_ROOMS,
  BOARD_WALL,
  LOWER_TOP,
  LOWER_WALL,
  OPS_HEIGHT,
  type OpsRoom,
  ROOM_ROWS,
  UPPER_TOP,
  UPPER_WALL,
  opsBoardroomTable,
  opsElevator,
  opsPlayerStart,
  opsProjectRooms,
  opsRooms,
  opsSupportRoom,
  opsWhiteboardRoom,
  opsWidth,
} from "./ops-layout";
import { WHITEBOARD_AT } from "./ops-walls";

// The layout, the walls and the line live beside this file; everything that
// imported them from here goes on doing so.
export {
  WIDTH,
  HEIGHT,
  REGIONS,
  PLAYER_START,
  ELEVATOR,
  PROJECT_BOARD,
  HELP_DESK,
  SUPPORT_PULSE,
  PROJECT_FLOW,
  BOARDROOM_TABLE,
  SUPPORT_BOARD,
} from "./floor-fixtures";
export {
  opsSupportRoom,
  opsWhiteboardRoom,
  opsBoardroom,
  ROOM_COLS,
  OPS_HEIGHT,
  opsBays,
  opsWidth,
  opsWing,
  opsOperations,
  opsElevator,
  type WallRun,
  opsWallRuns,
  opsWallRun,
  opsProjectRooms,
  roomsForBoards,
  opsSupportPost,
  opsBoardroomTable,
  opsPlayerStart,
  type OpsRoom,
  opsRooms,
} from "./ops-layout";
export {
  opsSign,
  opsWeekCounts,
  opsLastWeekCounts,
  opsSupportSign,
  opsSupportPulse,
  opsProjectSign,
  opsProjectFlow,
} from "./ops-walls";
export {
  opsRefined,
  opsMachine,
  opsRoadblock,
  opsTesting,
  opsDeployed,
  opsIncident,
} from "./ops-line";

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
  /**
   * How many cubicles the People floor has, which is what makes a floor
   * one — see `lib/map/cubicles.ts`. It is read off the building's own
   * people (`cubicleCount`), with spares where there are fewer of them
   * than a floor is worth drawing.
   *
   * Absent, and with no boards either, the floor is the plain rectangle
   * the agents' floor still is.
   */
  cubicles?: number;
}

export function buildFloorSpec(source: SourceMap, options: FloorOptions = {}): RoomSpec {
  const kinds = options.boards ?? [];
  // A count of cubicles is what makes a floor the People floor, and the
  // People floor is the one with a bank of them above a corridor. Asked
  // first because it is the narrower question: no floor is both, and a
  // building's People floor names no boards.
  if (options.cubicles) return buildCubiclesSpec(source, options.cubicles);
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
   * a wide board to read it rather than at one end. An even width lands the
   * point half a tile off the middle, which a plate six tiles wide can
   * afford and a picture three tiles wide cannot.
   *
   * How deep into the wall is the region's own — `dy` and `sh` — because
   * the two kinds of thing on these walls want different amounts of it: a
   * board is a picture that hangs on the face, and a plate of counts is a
   * screen that takes the wall. The point of interest is on the bottom row
   * of the band either way, which is the row you stand under.
   */
  const hang = (
    board: { region: Region; poi: PoiSpec },
    room: OpsRoom,
    at: number,
    slot?: number,
  ) => ({
    ...board,
    region: { ...board.region, dx: room.x + at, dy: room.wallRow + board.region.dy },
    poi: {
      ...board.poi,
      // Numbered only where there are several of the same thing to tell
      // apart. The queue and its counts are one apiece, and an unnumbered
      // name is what `lib/fixtures.ts` matches when there is nothing to say.
      name: slot === undefined ? board.poi.name : `${board.poi.name} ${slot}`,
      tx: room.x + at + Math.floor(board.region.sw / 2),
      ty: room.wallRow + WALL_ROWS - 1,
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
