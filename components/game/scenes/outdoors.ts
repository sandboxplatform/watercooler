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
} from "@/lib/world/scenery";

/**
 * What the world map and the campuses draw alike: the ground, the water
 * and its foam, the props, the signs and the ferry. Both scenes lay their
 * pictures from the same sheet, so the pieces live here once.
 */

export const PROPS_KEY = "world-props";
export const BOAT_KEY = "world-boat";
const WATER_KEY = "world-water";
const WATER2_KEY = "world-water2";
const FOAM_KEY = "world-foam";
const WATER_ANIM = "world-water";
const FOUNTAIN_ANIM = "world-fountain";

const GROUND: Record<Exclude<Ground, "water">, string> = {
  grass: "world-grass",
  paving: "world-paving",
  kerb: "world-kerb",
  asphalt: "world-asphalt",
  highway: "world-highway",
  dock: "world-dock",
  court: "world-court",
  trail: "world-trail",
  shingle: "world-shingle",
};

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

/** Name the rectangles of the props sheet, and set up what moves: the fountain and the sea. */
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
  if (!scene.anims.exists(WATER_ANIM)) {
    scene.anims.create({
      key: WATER_ANIM,
      frames: [{ key: WATER_KEY }, { key: WATER2_KEY }],
      frameRate: 1.5,
      repeat: -1,
    });
  }
}

/**
 * Lay the ground: a carpet of grass, and then every cell that is not grass
 * over the top of it. Water moves, and gets a line of foam along any edge
 * that meets land; the dock lies over it and is walked like paving.
 *
 * **The carpet is why this is not simply a tile per cell.** It was, and on
 * the town-sized map that was four thousand pictures on the display list
 * before anything was standing on them. The map is three times as wide now
 * and four cells in five of it are grass: thirteen thousand, of which ten
 * thousand would have been the same green square. Phaser walks the whole
 * display list every frame whether a thing is on camera or not, so that is
 * paid sixty times a second for the life of the scene.
 *
 * Eight tiles to a block and the blocks laid under everything at depth -1,
 * which takes it back to about what the town cost. The overhang past the
 * last whole block is left alone: it is grass, the camera is clamped to the
 * map, and cutting it would mean a second, part-width picture per edge.
 */
export function layGround(scene: Phaser.Scene, grid: Ground[][]) {
  const isWater = (tx: number, ty: number) => grid[ty]?.[tx] === "water";
  const columns = grid[0]?.length ?? 0;
  const block = GRASS_BLOCK * TILE;
  for (let y = 0; y < grid.length * TILE; y += block)
    for (let x = 0; x < columns * TILE; x += block)
      scene.add.image(x, y, GRASS_BLOCK_KEY).setOrigin(0, 0).setDepth(-1);
  grid.forEach((row, ty) =>
    row.forEach((ground, tx) => {
      const x = tx * TILE;
      const y = ty * TILE;
      // The carpet is already grass; anything else is laid over it.
      if (ground === "grass") return;
      if (ground !== "water") {
        scene.add.image(x, y, GROUND[ground]).setOrigin(0, 0).setDepth(0);
        return;
      }
      scene.add.sprite(x, y, WATER_KEY).setOrigin(0, 0).setDepth(0).play(WATER_ANIM);
      // Foam where the water laps at the land — but not at the map's edge,
      // where the sea just carries on.
      const edges: [number, number, number][] = [
        [tx, ty - 1, 0],
        [tx + 1, ty, 90],
        [tx, ty + 1, 180],
        [tx - 1, ty, 270],
      ];
      for (const [nx, ny, angle] of edges) {
        if (grid[ny]?.[nx] === undefined || isWater(nx, ny)) continue;
        scene.add
          .image(x + TILE / 2, y + TILE / 2, FOAM_KEY)
          .setAngle(angle)
          .setDepth(1);
      }
    }),
  );
}

/**
 * The court's markings, in one piece over the tarmac.
 *
 * At depth 1, which is where the water's foam goes: over the ground and
 * under everything that stands on it, so a player dribbling across the
 * centre circle is drawn on top of it rather than under the paint.
 */
export function placeCourtLines(scene: Phaser.Scene, at: { x: number; y: number }) {
  scene.add.image(at.x, at.y, COURT_LINES_KEY).setOrigin(0, 0).setDepth(1);
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
    scene.add.image(road.x, y, HIGHWAY_MARKS_KEY).setOrigin(0, 0).setDepth(1);
  }
}

/** An invisible wall the size of a rectangle. */
export function addSolid(walls: Phaser.Physics.Arcade.StaticGroup, r: Rect) {
  const wall = walls.create(
    r.x + r.width / 2,
    r.y + r.height / 2,
    undefined,
    undefined,
    false,
  ) as Phaser.Physics.Arcade.Sprite;
  wall.body!.setSize(r.width, r.height);
  wall.setVisible(false);
  (wall.body as Phaser.Physics.Arcade.StaticBody).enable = true;
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
  image.setOrigin(0.5, 1).setDepth(prop.y);
  const body = propBody(prop);
  if (body) addSolid(walls, body);
}

/** A board on two posts with its words painted on, standing on its feet. */
export function placeSign(
  scene: Phaser.Scene,
  sign: Sign,
  walls: Phaser.Physics.Arcade.StaticGroup,
) {
  scene.add.image(sign.x, sign.y, PROPS_KEY, "board").setOrigin(0.5, 1).setDepth(sign.y);
  scene.add
    .text(sign.x, sign.y - 58, sign.text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "11px",
      color: "#1b1b2a",
      align: "center",
      lineSpacing: 4,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(sign.y + 1)
    .setResolution(2);
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
  scene.add.image(frame.x, frame.y, art).setOrigin(0, 0).setDepth(foot);
  addSolid(walls, solid);
  if (!sign) return;
  scene.add
    .text(frame.x + frame.width / 2, frame.y + sign.y, sign.text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: sign.size,
      color: "#1b1b2a",
      align: "center",
      backgroundColor: "#e0b870",
      padding: { x: 6, y: 3 },
    })
    .setOrigin(0.5, 0.5)
    .setDepth(foot + 1)
    .setResolution(2);
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
  scene.add.image(at.x, at.y, BOAT_KEY).setOrigin(0, 0).setDepth(foot);
  addSolid(walls, { x: at.x, y: at.y, width: BOAT.width, height: BOAT.height });
}
