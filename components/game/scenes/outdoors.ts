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
  dock: "world-dock",
};

export function preloadOutdoors(scene: Phaser.Scene) {
  scene.load.image(GROUND.grass, asset("/sprites/world/grass_48.png"));
  scene.load.image(GROUND.paving, asset("/sprites/world/paving_48.png"));
  scene.load.image(GROUND.kerb, asset("/sprites/world/kerb_48.png"));
  scene.load.image(GROUND.asphalt, asset("/sprites/world/asphalt_48.png"));
  scene.load.image(GROUND.dock, asset("/sprites/world/dock_48.png"));
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
 * Lay the ground tile by tile. Water moves, and gets a line of foam along
 * any edge that meets land; the dock lies over it and is walked like paving.
 */
export function layGround(scene: Phaser.Scene, grid: Ground[][]) {
  const isWater = (tx: number, ty: number) => grid[ty]?.[tx] === "water";
  grid.forEach((row, ty) =>
    row.forEach((ground, tx) => {
      const x = tx * TILE;
      const y = ty * TILE;
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
 * Somebody standing about out of doors, with their name under them.
 *
 * Not a presence player: a resident out here is not in any room, so the
 * scene asks the server where everyone is and stands them at the spot it
 * gives. Returns the pieces, for taking down again when they move on.
 */
export function placeResident(
  scene: Phaser.Scene,
  resident: { spriteKey: string; name: string },
  at: { x: number; y: number },
): Phaser.GameObjects.GameObject[] {
  const sprite = scene.add.sprite(at.x, at.y - 43, resident.spriteKey, 0).setDepth(at.y);
  sprite.play(`${resident.spriteKey}:idle-down`);
  const tag = scene.add
    .text(at.x, at.y + 6, resident.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#ffe9a8",
      backgroundColor: "rgba(0,0,0,0.7)",
      padding: { x: 4, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(at.y + 1)
    .setResolution(2);
  return [sprite, tag];
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
