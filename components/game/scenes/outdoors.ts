import * as Phaser from "phaser";
import { TILE, BOAT, type Rect } from "@/lib/world/tenants";
import { asset } from "@/lib/assets";
import {
  PROPS,
  propBody,
  signBody,
  type Ground,
  type PlacedProp,
  type PropSpec,
  type Sign,
} from "@/lib/world/ground";
import { PIXEL_FONT } from "../config/drawing";
import { cull } from "../systems/culling";
import { addSolid } from "../utils/solids";

export { addSolid };

/**
 * What the world map, the campuses and the volcano draw alike: the ground,
 * the water and its foam, the props, the signs and the ferry. Every outdoor
 * scene lays its pictures from the same sheet, so the pieces live here once.
 *
 * Everything laid here stands still, so all of it is culled — filed by the
 * squares of the map it covers and only drawn while near the camera (see
 * `systems/culling`). The ground culls itself, being a tilemap layer.
 */

export const PROPS_KEY = "world-props";
export const BOAT_KEY = "world-boat";
const WATER_KEY = "world-water";
const WATER2_KEY = "world-water2";
const FOAM_KEY = "world-foam";
const FOUNTAIN_ANIM = "world-fountain";
/** How often the sea's two frames swap, which is the speed it always moved at. */
const WATER_FRAME_RATE = 1.5;

const GROUND: Record<Exclude<Ground, "water" | "lava">, string> = {
  grass: "world-grass",
  paving: "world-paving",
  kerb: "world-kerb",
  asphalt: "world-asphalt",
  highway: "world-highway",
  dock: "world-dock",
  court: "world-court",
  trail: "world-trail",
  shingle: "world-shingle",
  ash: "world-ash",
  rock: "world-rock",
  cave: "world-cave",
};

/**
 * Volcano Island's moving and edged ground: two frames of lava, the dark
 * crust laid along a flow where it meets the sand (turned for each side,
 * the way the sea's foam is), and the face of the rock where a cave wall
 * stands over the floor.
 *
 * Loaded by `VolcanoScene` alone — see `preloadVolcanoGround` — since nothing
 * on the world map or a campus is made of any of it.
 */
const LAVA_KEY = "world-lava";
const LAVA2_KEY = "world-lava2";
const CRUST_KEY = "world-crust";
const ROCK_FACE_KEY = "world-rock-face";
/** How often the lava's two frames swap. */
const LAVA_FRAME_RATE = 2;
/** The pictures of the volcano's own ground, on top of the outdoor pack. */
export function preloadVolcanoGround(scene: Phaser.Scene) {
  scene.load.image(GROUND.ash, asset("/sprites/world/ash_48.png"));
  scene.load.image(GROUND.rock, asset("/sprites/world/rock_48.png"));
  scene.load.image(ROCK_FACE_KEY, asset("/sprites/world/rock_face_48.png"));
  scene.load.image(GROUND.cave, asset("/sprites/world/cave_48.png"));
  scene.load.image(LAVA_KEY, asset("/sprites/world/lava_48.png"));
  scene.load.image(LAVA2_KEY, asset("/sprites/world/lava2_48.png"));
  scene.load.image(CRUST_KEY, asset("/sprites/world/crust_48.png"));
}

/**
 * The grass, eight tiles square, which is what the map is carpeted with.
 *
 * The 48px tile above is still loaded and still used — a campus lays its
 * ground a tile at a time, and both keys name the same green — but the world
 * map does not lay grass tile by tile any more. See `layGround`.
 */
const GRASS_BLOCK_KEY = "world-grass-block";
/** How many tiles across one block of the carpet is. */
const GRASS_BLOCK = 8;

/** The lines painted on the basketball court, laid over its surface. */
export const COURT_LINES_KEY = "world-court-lines";
/** The markings painted down the highway, four tiles across and one deep. */
export const HIGHWAY_MARKS_KEY = "world-highway-marks";

export function preloadOutdoors(scene: Phaser.Scene) {
  scene.load.image(GROUND.grass, asset("/sprites/world/grass_48.png"));
  scene.load.image(GROUND.paving, asset("/sprites/world/paving_48.png"));
  scene.load.image(GROUND.kerb, asset("/sprites/world/kerb_48.png"));
  scene.load.image(GROUND.asphalt, asset("/sprites/world/asphalt_48.png"));
  scene.load.image(GROUND.highway, asset("/sprites/world/highway_48.png"));
  scene.load.image(GRASS_BLOCK_KEY, asset("/sprites/world/grass_384.png"));
  scene.load.image(HIGHWAY_MARKS_KEY, asset("/sprites/world/highway_marks_192x48.png"));
  scene.load.image(GROUND.dock, asset("/sprites/world/dock_48.png"));
  scene.load.image(GROUND.court, asset("/sprites/world/court_48.png"));
  scene.load.image(GROUND.trail, asset("/sprites/world/trail_48.png"));
  scene.load.image(GROUND.shingle, asset("/sprites/world/shingle_48.png"));
  scene.load.image(COURT_LINES_KEY, asset("/sprites/world/court_lines_768x384.png"));
  scene.load.image(WATER_KEY, asset("/sprites/world/water_48.png"));
  scene.load.image(WATER2_KEY, asset("/sprites/world/water2_48.png"));
  scene.load.image(FOAM_KEY, asset("/sprites/world/foam_48.png"));
  scene.load.image(BOAT_KEY, asset("/sprites/world/boat_192x168.png"));
  scene.load.image(PROPS_KEY, asset("/sprites/world/props.png"));
  scene.load.json("world-props-frames", asset("/sprites/world/props.json"));
}

/** Name the rectangles of the props sheet, and set up what moves: the fountain. */
export function cutOutdoorFrames(scene: Phaser.Scene) {
  const props = scene.textures.get(PROPS_KEY);
  const frames = scene.cache.json.get("world-props-frames") as Record<string, Rect> | undefined;
  for (const [name, r] of Object.entries(frames ?? {})) {
    if (!props.has(name)) props.add(name, 0, r.x, r.y, r.width, r.height);
  }
  if (!scene.anims.exists(FOUNTAIN_ANIM)) {
    scene.anims.create({
      key: FOUNTAIN_ANIM,
      frames: [
        { key: PROPS_KEY, frame: "fountain" },
        { key: PROPS_KEY, frame: "fountain2" },
      ],
      frameRate: 3,
      repeat: -1,
    });
  }
}

/** The four sides of a cell, and the turn a picture laid along each takes. */
const EDGES: readonly [number, number, number][] = [
  [0, -1, 0],
  [1, 0, 90],
  [0, 1, 180],
  [-1, 0, 270],
];

/**
 * Lay the ground: a carpet of grass, and then every cell that is not grass
 * over the top of it. Water moves, and gets a line of foam along any edge
 * that meets land; the dock lies over it and is walked like paving.
 *
 * **The carpet is why this is not simply a tile per cell.** It was, and on
 * the town-sized map that was four thousand pictures on the display list
 * before anything was standing on them. The map is three times as wide now
 * and four cells in five of it are grass: thirteen thousand, of which ten
 * thousand would have been the same green square. Eight tiles to a block
 * and the blocks laid under everything at depth -1. The overhang past the
 * last whole block is left alone: it is grass, the camera is clamped to the
 * map, and cutting it would mean a second, part-width picture per edge.
 *
 * **And what is not grass is one tilemap layer**, not a picture per cell.
 * The world map has some two and a half thousand cells of paving, road and
 * water, and the water was a sprite apiece each running its own two-frame
 * animation — twelve hundred animations stepped every frame to move in step
 * with one another. A layer is one thing on the display list, draws only
 * the cells in view, and animates by swapping the picture its water tiles
 * are cut from, once, on a timer at the rate the sprites ran at.
 */
export function layGround(scene: Phaser.Scene, grid: Ground[][]) {
  const columns = grid[0]?.length ?? 0;
  const block = GRASS_BLOCK * TILE;
  // Only where there is grass to carpet. Volcano Island is black sand and
  // its cave is rock, so a carpet under either would be a few dozen
  // pictures on the display list that no pixel of the place ever shows.
  if (grid.some((row) => row.includes("grass"))) {
    for (let y = 0; y < grid.length * TILE; y += block)
      for (let x = 0; x < columns * TILE; x += block)
        cull(scene, scene.add.image(x, y, GRASS_BLOCK_KEY).setOrigin(0, 0).setDepth(-1));
  }

  // Which picture each cell is, and a line of foam or crust along any edge
  // where water or lava meets the land.
  const keys: string[] = [];
  const gids = new Map<string, number>();
  const cells: [number, number, number][] = [];
  const put = (key: string, tx: number, ty: number) => {
    let gid = gids.get(key);
    if (gid === undefined) {
      keys.push(key);
      gids.set(key, (gid = keys.length));
    }
    cells.push([gid, tx, ty]);
  };
  grid.forEach((row, ty) =>
    row.forEach((ground, tx) => {
      // The carpet is already grass; anything else is laid over it.
      if (ground === "grass") return;
      if (ground === "lava") {
        put(LAVA_KEY, tx, ty);
        edge(scene, grid, tx, ty, CRUST_KEY, (next) => next !== "lava" && next !== "rock");
        return;
      }
      if (ground === "rock") {
        // A wall seen from above is its top; where the floor runs up to it
        // from the south, what shows is its face. The cave is looked at the
        // way every room in this world is, so a wall with floor below it
        // stands up out of it rather than lying flat.
        const below = grid[ty + 1]?.[tx];
        put(below !== undefined && below !== "rock" ? ROCK_FACE_KEY : GROUND.rock, tx, ty);
        return;
      }
      if (ground !== "water") {
        put(GROUND[ground], tx, ty);
        return;
      }
      put(WATER_KEY, tx, ty);
      // Foam where the water laps at the land — but not at the map's edge,
      // where the sea just carries on.
      edge(scene, grid, tx, ty, FOAM_KEY, (next) => next !== "water");
    }),
  );
  if (cells.length === 0) return;

  const map = scene.make.tilemap({
    tileWidth: TILE,
    tileHeight: TILE,
    width: columns,
    height: grid.length,
  });
  const tilesets = new Map<string, Phaser.Tilemaps.Tileset>();
  for (const key of keys) {
    // A picture that never loaded is a cell left as grass rather than a
    // missing-texture box; the loader has already said which file failed.
    if (!scene.textures.exists(key)) continue;
    const tileset = map.addTilesetImage(key, key, TILE, TILE, 0, 0, gids.get(key));
    if (tileset) tilesets.set(key, tileset);
  }
  const layer = map.createBlankLayer("ground", [...tilesets.values()], 0, 0);
  if (!layer) return;
  layer.setDepth(0);
  for (const [gid, tx, ty] of cells) {
    if (tilesets.has(keys[gid - 1])) layer.putTileAt(gid, tx, ty, false);
  }
  animateTiles(scene, tilesets.get(WATER_KEY), WATER_KEY, WATER2_KEY, WATER_FRAME_RATE);
  animateTiles(scene, tilesets.get(LAVA_KEY), LAVA_KEY, LAVA2_KEY, LAVA_FRAME_RATE);
}

/**
 * Lay a picture along each side of a cell whose neighbour asks for one —
 * the sea's foam, the lava's crust. Not at the map's edge, where the ground
 * just carries on.
 */
function edge(
  scene: Phaser.Scene,
  grid: Ground[][],
  tx: number,
  ty: number,
  key: string,
  meets: (next: Ground) => boolean,
) {
  for (const [dx, dy, angle] of EDGES) {
    const next = grid[ty + dy]?.[tx + dx];
    if (next === undefined || !meets(next)) continue;
    cull(
      scene,
      scene.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, key)
        .setAngle(angle)
        .setDepth(1),
    );
  }
}

/** Swap a tileset between two pictures of itself, for as long as the scene runs. */
function animateTiles(
  scene: Phaser.Scene,
  tileset: Phaser.Tilemaps.Tileset | undefined,
  first: string,
  second: string,
  frameRate: number,
) {
  if (!tileset || !scene.textures.exists(second)) return;
  let showing = first;
  scene.time.addEvent({
    delay: 1000 / frameRate,
    loop: true,
    callback: () => {
      showing = showing === first ? second : first;
      tileset.setImage(scene.textures.get(showing));
    },
  });
}

/**
 * The court's markings, in one piece over the tarmac.
 *
 * At depth 1, which is where the water's foam goes: over the ground and
 * under everything that stands on it, so a player dribbling across the
 * centre circle is drawn on top of it rather than under the paint.
 */
export function placeCourtLines(scene: Phaser.Scene, at: { x: number; y: number }) {
  cull(scene, scene.add.image(at.x, at.y, COURT_LINES_KEY).setOrigin(0, 0).setDepth(1));
}

/**
 * The highway's markings, a row at a time down the road.
 *
 * At depth 1 with the court's lines and the water's foam: over the tarmac,
 * under everybody and everything standing on it. One strip per row rather
 * than one picture for the whole road, because the road is the height of the
 * map — sixty-nine rows of it is nothing to lay, and a single picture would
 * be a 192 by 3312 texture held for the life of the scene to draw four
 * straight lines and a dash.
 */
export function placeHighwayMarks(scene: Phaser.Scene, road: Rect) {
  for (let y = road.y; y < road.y + road.height; y += TILE) {
    cull(scene, scene.add.image(road.x, y, HIGHWAY_MARKS_KEY).setOrigin(0, 0).setDepth(1));
  }
}

/** A prop on its feet; whoever's feet are lower stands in front. */
export function placeProp(
  scene: Phaser.Scene,
  prop: PlacedProp,
  walls: Phaser.Physics.Arcade.StaticGroup,
) {
  const spec: PropSpec = PROPS[prop.kind];
  const image = spec.animate
    ? scene.add.sprite(prop.x, prop.y, PROPS_KEY, prop.kind).play(FOUNTAIN_ANIM)
    : spec.texture
      ? scene.add.image(prop.x, prop.y, spec.texture)
      : scene.add.image(prop.x, prop.y, PROPS_KEY, prop.kind);
  cull(scene, image.setOrigin(0.5, 1).setDepth(prop.y));
  const body = propBody(prop);
  if (body) addSolid(walls, body);
}

/** A board on two posts with its words painted on, standing on its feet. */
export function placeSign(
  scene: Phaser.Scene,
  sign: Sign,
  walls: Phaser.Physics.Arcade.StaticGroup,
) {
  cull(
    scene,
    scene.add.image(sign.x, sign.y, PROPS_KEY, "board").setOrigin(0.5, 1).setDepth(sign.y),
  );
  cull(
    scene,
    scene.add
      .text(sign.x, sign.y - 58, sign.text, {
        fontFamily: PIXEL_FONT,
        fontSize: "11px",
        color: "#1b1b2a",
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(sign.y + 1)
      .setResolution(2),
  );
  addSolid(walls, signBody(sign));
}

/**
 * A building's picture, the wall it puts up, and its name on the sign band
 * the art leaves blank.
 *
 * Both maps hang the name the same way — centred on the band, carrying its
 * own strip of the band's colour so a long name stays readable past the
 * band's ends — but they read it from different places and at different
 * sizes, so the caller works out the words and where they go. What comes
 * back is nothing: the door zone is the caller's, since a lobby's door and
 * a campus gate lead to different kinds of place.
 *
 * `sign` may be null, for a thing on the map that is not a premises with a
 * name over the door. The ferry is the one: it is a boat that goes
 * somewhere, not the business at the other end of the crossing, and the
 * board along its side used to read APEIRON MEDIA — a company's name on a
 * public boat, and the third time the island says so, after the sign on the
 * quay and the name across the top of the yard.
 */
export function placeBuilding(
  scene: Phaser.Scene,
  building: { frame: Rect; art: string; solid: Rect },
  walls: Phaser.Physics.Arcade.StaticGroup,
  sign: { text: string; y: number; size: string } | null,
) {
  const { frame, art, solid } = building;
  const foot = frame.y + frame.height;
  cull(scene, scene.add.image(frame.x, frame.y, art).setOrigin(0, 0).setDepth(foot));
  addSolid(walls, solid);
  if (!sign) return;
  cull(
    scene,
    scene.add
      .text(frame.x + frame.width / 2, frame.y + sign.y, sign.text, {
        fontFamily: PIXEL_FONT,
        fontSize: sign.size,
        color: "#1b1b2a",
        align: "center",
        backgroundColor: "#e0b870",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(foot + 1)
      .setResolution(2),
  );
}

/**
 * The ferry, moored with its bow up.
 *
 * Unlettered, like the one on the world map: the board along its side read
 * the company's name, which is not whose boat it is — and standing on the
 * island it named the place you were already in rather than where it goes.
 * The quay's own sign says which crossing this is.
 */
export function placeBoat(
  scene: Phaser.Scene,
  at: { x: number; y: number },
  walls: Phaser.Physics.Arcade.StaticGroup,
) {
  const foot = at.y + BOAT.height;
  cull(scene, scene.add.image(at.x, at.y, BOAT_KEY).setOrigin(0, 0).setDepth(foot));
  addSolid(walls, { x: at.x, y: at.y, width: BOAT.width, height: BOAT.height });
}
