/**
 * The open-plan office.
 *
 * One room that fits on the screen, shaped like a 7, with a door at the top
 * left and the lift below it at the bottom of the left part, a whiteboard on the wall and a game in the corner:
 * a menu as much as a place. The whiteboard is lifted out of the old
 * partitioned map (see ./harvest.ts), so the art is unchanged.
 */

import { harvest, type Region, type SourceMap } from "./harvest";
import type { PoiSpec, RoomSpec, WallVocabulary } from "./spec";

export const WIDTH = 20;
export const HEIGHT = 19;

/**
 * The room is shaped like a 7: full width for the top rows, then only the
 * right-hand two thirds carry on down. The lift stays at the bottom of the
 * left part, under the door; the longer right part is room for more to do.
 */
export const CUTOUT = { x: 0, y: 14, width: 6, height: 5 } as const;

/** The last floor row of the left part: where the lift stands. */
export const LEFT_BOTTOM = CUTOUT.y - 1;
export const TILE = 48;

/**
 * Wall pieces, read off the old map's rooms.
 *
 * A LimeZu wall is a stack, not a nine-slice: a cap along the top, an
 * optional face, a base, and then a shadow the wall throws onto the first
 * floor row. Keeping `topFace` empty gives the shortest wall the tileset
 * supports, which buys two more rows of usable floor.
 */
export const WALLS: WallVocabulary = {
  cornerTL: 24,
  cornerTR: 26,
  cornerBL: 56,
  cornerBR: 58,
  edgeLeft: 40,
  edgeRight: 42,
  topCap: 178,
  // One face row: the old rooms stacked cap/face/base for a wall with real
  // height. Dropping it saves a row of floor but leaves the top edge looking
  // like a line rather than a wall.
  topFace: [182],
  topBase: 194,
  topShadow: 92,
  bottomRun: 57,
  floor: 108,
};

/**
 * The one thing on the walls: a whiteboard, lifted from the old office. It
 * is the shared board — every room shows the same drawing — and its point
 * of interest sits on the board's lower tile so standing just below is
 * within reach.
 */
export const WHITEBOARD = {
  region: {
    label: "whiteboard",
    sx: 6,
    sy: 3,
    sw: 2,
    sh: 2,
    dx: 9,
    dy: 1,
    layers: ["walls"],
  } satisfies Region,
  poi: { name: "Whiteboard", tx: 10, ty: 2, facing: "up" } satisfies PoiSpec,
};

/** Nothing else hangs on the walls: the room is a menu, and the board is the one item on it. */
export const REGIONS: Region[] = [WHITEBOARD.region];

/**
 * Where the player starts.
 *
 * One spawn, not none: with an empty spawns layer the scene falls back to the
 * middle of the map, and the task terminal anchors to the same point. Naming
 * it here keeps both under control. It is the only spawn, so no agents are
 * created — the roster is built from every spawn but the player's.
 */
export const PLAYER_START = { tx: 5, ty: 6, facing: "down" } as const;

/**
 * Tiles a person can stand on.
 *
 * Two of them, not one: the row directly under the top wall carries the
 * shadow the wall throws, and it is ordinary floor to walk on. Anything that
 * reasons about reachability has to know that or it will treat the whole
 * strip below the top wall as solid.
 */
export const STANDABLE: readonly number[] = [WALLS.floor, WALLS.topShadow];

/**
 * The games. Each lobby gets one, in the top right corner. The art is drawn
 * by the scene from its own sprite; the region here is only its footprint,
 * which becomes the collision box, and the point of interest is the floor
 * in front of it, where you stand to play. The scene finds it by name.
 */
export type Game = "pong" | "pinball" | "arcade";

export const GAMES: Record<Game, { region: Region; poi: PoiSpec }> = {
  pong: {
    // Drawn by the scene (public/sprites/pingpong_table_96x72.png); the
    // region is its footprint, for the collision box, and the point is the
    // floor in front of it.
    region: { label: "ping pong table", sx: 0, sy: 0, sw: 2, sh: 2, dx: 15, dy: 4, layers: [] },
    poi: { name: "Ping pong table", tx: 16, ty: 6, facing: "up" },
  },
  pinball: {
    // Likewise: public/sprites/pinball_machine_96x120.png. Right up against
    // the top wall, so its footprint starts on the wall's shadow row.
    region: { label: "pinball machine", sx: 0, sy: 0, sw: 2, sh: 2, dx: 15, dy: 3, layers: [] },
    poi: { name: "Pinball machine", tx: 16, ty: 5, facing: "up" },
  },
  arcade: {
    // public/sprites/arcade_cabinet_96x120.png, beside the pinball machine
    // and against the same wall.
    region: { label: "arcade cabinet", sx: 0, sy: 0, sw: 2, sh: 2, dx: 12, dy: 3, layers: [] },
    poi: { name: "Arcade cabinet", tx: 13, ty: 5, facing: "up" },
  },
};

/**
 * The help desk in a lobby that staffs one.
 *
 * Four tiles of counter with somebody's work all over it, drawn by the scene
 * from public/sprites/help_desk_counter_192x96.png; the region here is only
 * its footprint, which becomes the collision box. Both its rows are solid, so
 * nobody walks round the front of it into the wall.
 *
 * It stands down in the wide bottom of the room — the part that carries on
 * past the bitten-out corner (see CUTOUT), where the floor runs from column 7
 * to the far wall and nothing else is. One row of floor is left in front of it
 * to walk up to it from, and two rows behind for whoever works it to pace.
 *
 * Its point of interest is that floor in front. The name is deliberately not
 * "Help desk": that is the support-queue board on an Operations floor, which
 * the scene finds by exactly that name.
 */
const COUNTER_COLUMN = 9;
const COUNTER_ROW = 15;

export const HELP_COUNTER = {
  region: {
    label: "help desk counter",
    sx: 0,
    sy: 0,
    sw: 4,
    sh: 2,
    dx: COUNTER_COLUMN,
    dy: COUNTER_ROW,
    layers: [],
  } satisfies Region,
  poi: {
    name: "Help desk counter",
    tx: COUNTER_COLUMN + 1,
    ty: COUNTER_ROW + 2,
    facing: "up",
  } satisfies PoiSpec,
  /**
   * Where whoever works it stands when they are still: centred on the counter,
   * on the floor row behind it, with the bottom edge of their 96px sheet
   * meeting the counter's top edge — so the desk and everything on it is
   * between them and the room without a pixel of overlap.
   *
   * Behind rather than partly hidden by it, which would read better, because
   * the room's depths do not allow the second thing. A prop is drawn at depth
   * 4 and a presence player at the height of their own feet, several hundred
   * — so a counter cannot cover anybody standing at it, whatever height it is
   * given: raise it above the residents and it covers the person walking up
   * to it instead, who is on depth 5 and lower down the screen.
   */
  post: { x: (COUNTER_COLUMN + 2) * TILE, y: COUNTER_ROW * TILE - 48 },
  /**
   * The floor they pace, as bounds for the sprite's centre.
   *
   * Two rows deep and a little wider than the counter, so they work their way
   * along it and out past either end. The bottom of the band is the post, and
   * it goes no lower for the same reason the post is where it is: a centre
   * half a tile further down puts the sheet through the counter, and a
   * resident is drawn over it rather than behind it.
   */
  paces: {
    x: (COUNTER_COLUMN - 0.5) * TILE,
    y: COUNTER_ROW * TILE - 96,
    width: 5 * TILE,
    height: 48,
  },
};

/** What a lobby holds beyond its walls, its board and the ways out. */
export interface OfficeOptions {
  /** The game in the top right corner. */
  game?: Game;
  /** Any more games, beside the first. */
  also?: Game[];
  /** A staffed help desk out on the floor. */
  helpDesk?: boolean;
}

export function buildOfficeSpec(source: SourceMap, options: OfficeOptions = {}): RoomSpec {
  const picked = harvest(source, REGIONS);
  const games = options.game ? [options.game, ...(options.also ?? [])] : [];
  // Harvested apart from the decor: the decor's old collision boxes are
  // deliberately left behind (the room is open floor), but the games' are
  // wanted — and if the old map drew none, the whole of each is solid.
  const corners = games.map((g) => ({ game: g, corner: harvest(source, [GAMES[g].region]) }));
  const cornerBoxes = corners.flatMap(({ game: g, corner }) =>
    corner.collisions.length ? corner.collisions : [regionBox(GAMES[g].region)],
  );

  return {
    width: WIDTH,
    height: HEIGHT,
    tileSize: TILE,
    walls: WALLS,
    placements: [...picked.placements, ...corners.flatMap(({ corner }) => corner.placements)],
    // No agent seats: an open room. The only interaction point is the game
    // in the corner, when a lobby has one; the wall collisions the generator
    // adds and the game's own boxes are the only solid things in it.
    pois: [
      WHITEBOARD.poi,
      ...games.map((g) => GAMES[g].poi),
      ...(options.helpDesk ? [HELP_COUNTER.poi] : []),
    ],
    spawns: [{ tx: PLAYER_START.tx, ty: PLAYER_START.ty, facing: PLAYER_START.facing }],
    collisions: [...cornerBoxes, ...(options.helpDesk ? [regionBox(HELP_COUNTER.region)] : [])],
    cutout: CUTOUT,
    transitions: [
      // The door leads outside, to the world map. The lift is still a stub —
      // it will lead to a person's own office one day.
      //
      // Each zone spans the wall it sits in *and* the floor in front of it.
      // A zone confined to the wall would never fire: the wall is solid, so
      // nobody can stand in it, and the doorway would be scenery.
      { name: "door", target: "world", tx: 2, ty: 0, tw: 1, th: 4, facing: "up" },
      // Under the door, so from the world map one held key — down — takes
      // you in through the door, across the lobby and into the lift.
      {
        name: "elevator",
        target: "elevator",
        tx: 2,
        ty: LEFT_BOTTOM - 1,
        tw: 2,
        th: 2,
        facing: "down",
      },
    ],
  };
}

/** The whole of a region's destination, in pixels. */
function regionBox(region: Region) {
  return {
    x: region.dx * TILE,
    y: region.dy * TILE,
    width: region.sw * TILE,
    height: region.sh * TILE,
  };
}
