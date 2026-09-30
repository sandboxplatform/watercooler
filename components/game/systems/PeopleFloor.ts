import * as Phaser from "phaser";
import { castMember } from "@/lib/world/cast";
import { cubiclesOn, occupantsOf, type Address } from "@/lib/world/floors";
import { MAX_DESKS, deskBox, deskOrigin } from "@/lib/world/desks";
import { TILE } from "@/lib/map/office";
import {
  ROOM_NAMES,
  cubicleShelf,
  cubicleSign,
  peopleFurnishings,
  roomSign,
  type FurnishingArt,
} from "@/lib/map/cubicles";
import { createLogger } from "@/lib/logger";
import { PIXEL_FONT } from "../config/drawing";
import { addSolid } from "../utils/solids";
import { WALL_DETAIL, WALL_NAME, paintOnWall } from "../utils/wall-lettering";
import { EggShelf, cutEggFrames } from "./EggShelf";

const log = createLogger("PeopleFloor");

type Rect = { x: number; y: number; width: number; height: number };

/** What furnishing a floor leaves the scene to deal with. */
export interface Furnished {
  /** Solids the map knows nothing of, for the scene's route planner. */
  solids: Rect[];
  /** What has to be torn down with the scene, if anything. */
  stop: (() => void) | null;
}

/**
 * Furnish a floor above the lobby.
 *
 * Two quite different rooms come through here. The People floor of a
 * building somebody has a desk in is a bank of cubicles, and gets the whole
 * of `furnishCubicles`; every other floor above a lobby is the plain
 * rectangle it always was, with desks drawn in slot order.
 *
 * The desks go into the room's own walls, which the player already collides
 * with, and come back as solids so the scene plans routes round them with
 * the one route planner it builds. It used to build one for the map and a
 * second here, on every floor, and a third for the cubicles.
 */
export function furnishFloor(
  scene: Phaser.Scene,
  address: Address,
  walls: Phaser.Physics.Arcade.StaticGroup,
): Furnished {
  cutFurnitureFrames(scene);
  const cubicles = cubiclesOn(address);
  if (cubicles) return { solids: [], stop: furnishCubicles(scene, address, cubicles) };

  // Who sits here is known without asking: the people on Floor 1 and the
  // residents on Floor 2 are both read off the cast.
  const occupants = occupantsOf(address.tenant, address.floor).slice(0, MAX_DESKS);

  const solids = occupants.map((who, slot) => {
    const at = deskOrigin(slot);
    // The two offsets are where these landed while the frames were whole
    // tiles with the art padded inside them: 12 across and 6 across, 9
    // down. Same pixels, said out loud.
    scene.add
      .image(at.x + 12, at.y + 24, "modern_office", "desk")
      .setOrigin(0, 0)
      .setDepth(4);
    scene.add
      .image(at.x + 32, at.y + 9, "modern_office", "laptop")
      .setOrigin(0, 0)
      .setDepth(4);
    scene.add
      .text(at.x + 48, at.y + 20, who.name, {
        fontFamily: PIXEL_FONT,
        fontSize: "8px",
        color: "#ffe9a8",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12)
      .setResolution(2);
    const box = deskBox(slot);
    addSolid(walls, box);
    return box;
  });
  log.info(
    `${occupants.length} desk(s) on ${address.tenant.name} floor ${address.floor.kind === "floor" ? address.floor.level : 0}`,
  );
  return { solids, stop: null };
}

/**
 * The furniture cut out of the office tileset, named once.
 *
 * Nine rectangles of somebody else's sheet, which is why they are written
 * down together rather than beside the things that draw them: the numbers
 * were measured off the picture and mean nothing on their own, so the one
 * place to look for "which desk is that" is here.
 *
 * Named rather than delivered as sprites, unlike the lift, the counter and
 * the games — those are generated because the pack has nothing like them.
 * It has all of this.
 *
 * Every rect is the art's **tight** bounds rather than the tile it sits in,
 * because a cubicle stands its furniture on the bottom edge of a footprint
 * and a rect with two empty rows under it is a vending machine hovering.
 * The desk and the laptop were whole tiles before, drawn from a corner with
 * the padding measured into the call — so the two offsets on the plain
 * floor above are that same padding, taken out of the rect and put where it
 * can be seen.
 */
function cutFurnitureFrames(scene: Phaser.Scene) {
  const sheet = scene.textures.get("modern_office");
  const cut: Record<FurnishingArt | "laptop", [number, number, number, number]> = {
    desk: [300, 864, 75, 63],
    laptop: [630, 825, 39, 63],
    plant: [294, 624, 36, 66],
    sofa: [3, 828, 93, 72],
    armchair: [288, 738, 48, 54],
    lowtable: [240, 864, 48, 63],
    cooler: [579, 744, 42, 90],
    vending: [15, 1119, 69, 102],
    shelf: [339, 747, 90, 87],
    copier: [384, 1155, 93, 54],
  };
  for (const [name, [x, y, w, h]] of Object.entries(cut)) {
    if (!sheet.has(name)) sheet.add(name, 0, x, y, w, h);
  }
}

/**
 * A People floor: a cubicle per person, and the two rooms off the corridor.
 *
 * Every cubicle is furnished the same — a desk, a plant and a shelf —
 * because the map is named by how many there are and two buildings with the
 * same-sized bank share it. What occupancy decides is what is drawn on top
 * of it: the name lettered on the back wall, and the eggs standing on the
 * shelf.
 *
 * The pictures are stood on the footprints `lib/map/cubicles.ts` made solid,
 * off the same functions the spec was built from, so the art and the boxes
 * cannot drift apart — which is the arrangement the boards on an Operations
 * floor are already under. Everything here is in the map's own collision
 * boxes, so the scene's route planner already knows about all of it.
 *
 * Hands back one teardown for every shelf, since each holds a subscription
 * to the baskets.
 */
function furnishCubicles(scene: Phaser.Scene, address: Address, cubicles: number): () => void {
  cutEggFrames(scene);
  const people = occupantsOf(address.tenant, address.floor);

  for (const piece of peopleFurnishings(cubicles)) {
    standFurniture(scene, piece.art, piece);
    // Every cubicle desk carries a laptop, as the plain floor's do: a
    // little right of centre and standing on the desktop rather than on
    // the floor, which is the eight pixels.
    if (piece.art === "desk") {
      scene.add
        .image(
          (piece.tx + piece.tw / 2) * TILE + 10,
          (piece.ty + piece.th) * TILE - 8,
          "modern_office",
          "laptop",
        )
        .setOrigin(0.5, 1)
        .setDepth(4);
    }
  }

  // Each room's name, on the stretch of its own wall beside its doorway.
  ROOM_NAMES.forEach((name, i) => {
    const at = roomSign(cubicles, i as 0 | 1);
    paintOnWall(scene, at.tx * TILE, at.ty * TILE, [
      { text: name, ink: WALL_NAME, wrap: at.cols * TILE },
    ]);
  });

  const shelves: Array<() => void> = [];
  for (let slot = 0; slot < cubicles; slot++) {
    const who = people[slot] ?? null;
    const sign = cubicleSign(cubicles, slot);
    const shelf = cubicleShelf(cubicles, slot);
    // A spare cubicle letters nothing. "VACANT" on the wall is a label for
    // an absence, and the desk with nobody's name over it says it already.
    if (who && sign) {
      const wrap = sign.cols * TILE;
      paintOnWall(scene, sign.tx * TILE, sign.ty * TILE, [
        { text: who.name.toUpperCase(), ink: WALL_NAME, wrap },
        { text: (castMember(who.id)?.role ?? "").toUpperCase(), ink: WALL_DETAIL, wrap },
      ]);
    }
    if (shelf) shelves.push(new EggShelf(scene).place(shelf, TILE, who?.id ?? null));
  }

  log.info(`${people.length} of ${cubicles} cubicle(s) taken on ${address.tenant.name} floor 1`);
  return () => {
    for (const stop of shelves) stop();
  };
}

/**
 * One piece of it, standing on the bottom edge of its own footprint.
 *
 * Bottom-centred rather than drawn from a corner, because the art is cut
 * tight: a picture taller than the tiles it stands on grows up the room,
 * which is what a vending machine does and what a footprint on the floor
 * means.
 */
function standFurniture(
  scene: Phaser.Scene,
  art: FurnishingArt,
  at: { tx: number; ty: number; tw: number; th: number },
) {
  scene.add
    .image((at.tx + at.tw / 2) * TILE, (at.ty + at.th) * TILE, "modern_office", art)
    .setOrigin(0.5, 1)
    .setDepth(4);
}
