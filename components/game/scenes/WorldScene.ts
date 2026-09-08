import * as Phaser from "phaser";
import { OutdoorScene, type OutdoorPlace, type Standing } from "./OutdoorScene";
import type { DoorZone } from "@/lib/doors";
import { LOBBY, floorUrl } from "@/lib/world/floors";
import { OUTSIDE_SPOT, type Whereabouts } from "@/lib/world/residents";
import { createLogger } from "@/lib/logger";
import { WORLD_PATH } from "@/lib/world/paths";
import {
  BUILDINGS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  buildingFrom,
  spawnFor,
  type Building,
} from "@/lib/world/tenants";
import { SCENERY, WORLD_SIGNS, groundTiles, worldSolids } from "@/lib/world/scenery";
import { asset } from "@/lib/assets";
import { addSolid, layGround, placeBuilding, placeProp, placeSign } from "./outdoors";

/**
 * Where each building's name goes: the blank sign the picture leaves, from
 * the frame's top.
 *
 * The ferry has no entry, and that is what leaves it unlettered — a boat
 * carries no business's name over a door, because it has no door and it is
 * nobody's premises. It used to read APEIRON MEDIA, which named the island
 * at the far end of the crossing rather than the boat, and the "FERRY TO
 * IRELAND" sign standing on the quay beside it already says where it goes.
 */
const SIGN_Y: Record<string, number> = {
  "world-castle": 175,
  "world-office": 186,
  "world-supply": 92,
  "world-blocks": 169,
  "world-campus": 173,
  "world-lab": 159,
};
/** A door zone target that starts a scene rather than loading a page. */
const CAMPUS_TARGET = "campus:";
/** How far apart residents stand when the server gave no spot for them. */
const OUTSIDE_SPACING = 40;

export interface WorldSceneData {
  /** The tenant or campus whose building the person just walked out of, if any. */
  from?: string | null;
}

/**
 * Outside.
 *
 * The world map is the space between businesses: three screens of green
 * with the two head offices and a plaza in the middle, the building supply
 * stores to the west and the campus gate to the east, and a path to each
 * door. Walking into a lobby's door moves you to that tenant's room, which
 * is a new page — every room carries its own people, agents and
 * conversation, so the boundary between businesses is the room boundary.
 * Walking through a campus gate goes onto its yard, another scene here.
 *
 * Everything it has in common with a campus — walking, presence, doorways,
 * the camera, the residents taking the air — is in `OutdoorScene`.
 */
export class WorldScene extends OutdoorScene<WorldSceneData> {
  protected readonly log = createLogger("World");

  constructor() {
    super({ key: "WorldScene" });
  }

  protected loadArt() {
    this.load.image("world-pond", asset("/sprites/world/pond_288x192.png"));
    this.load.image("van", asset("/sprites/world/van_96x144.png"));
    this.load.image("world-castle", asset("/sprites/world/building_castle.png"));
    this.load.image("world-office", asset("/sprites/world/building_office.png"));
    this.load.image("world-supply", asset("/sprites/world/building_supply.png"));
    this.load.image("world-blocks", asset("/sprites/world/building_blocks.png"));
    this.load.image("world-campus", asset("/sprites/world/building_campus.png"));
    this.load.image("world-lab", asset("/sprites/world/building_lab.png"));
  }

  protected layOut(data: WorldSceneData, walls: Phaser.Physics.Arcade.StaticGroup): OutdoorPlace {
    layGround(this, groundTiles());
    const doors = BUILDINGS.map((b) => this.putUp(b, walls));
    for (const prop of SCENERY) placeProp(this, prop, walls);
    for (const sign of WORLD_SIGNS) placeSign(this, sign, walls);
    // The buildings and props are already walls of their own; the sea is
    // solid too, so nobody walks off the dock.
    const solids = worldSolids();
    for (const water of solids.slice(BUILDINGS.length + SCENERY.length)) addSolid(walls, water);

    const at = spawnFor(data?.from);
    const left = buildingFrom(data?.from);
    this.log.info(`outside, arriving from ${data?.from ?? "the road"}`);

    return {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      // Off a building's path, or up the dock away from the ferry's gangway.
      spawn: { x: at.x, y: at.y, facing: left?.arrive ?? "down" },
      // Only out of a door: arriving by the road, the keys are yours at once.
      walkIn: Boolean(left),
      doors,
      // Every building on the map, the ferry among them: a tap on any of
      // their pictures walks to that front door and goes in.
      entrances: BUILDINGS,
      solids,
      label: "World map",
      path: WORLD_PATH,
      camera: {
        coverMap: true,
        // The map opens where it was left. Every building is a page of its
        // own, so an errand indoors used to hand the map back at its fitted
        // zoom however far out you had chosen to stand.
        remembersZoom: true,
      },
    };
  }

  /** A building's picture and name, and the doorway into it. */
  private putUp(b: Building, walls: Phaser.Physics.Arcade.StaticGroup): DoorZone {
    // The same size as a campus building's, so the two maps read alike. A
    // picture with no band to letter — the ferry — gets no name at all.
    const band = SIGN_Y[b.art];
    placeBuilding(
      this,
      b,
      walls,
      band === undefined ? null : { text: b.org.name.toUpperCase(), y: band, size: "18px" },
    );
    const target =
      b.entrance.kind === "lobby"
        ? floorUrl(b.entrance.tenant, LOBBY, "door")
        : `${CAMPUS_TARGET}${b.entrance.campus}`;
    return { name: b.org.slug, target, ...b.door, facing: "up" };
  }

  protected standing(all: Whereabouts[]): Standing[] {
    return all
      .filter((r) => r.place === "outside")
      .map((resident, i) => ({
        resident,
        // Where the server put them; by the fountain when it did not say.
        at: resident.spot ?? {
          x: OUTSIDE_SPOT.x + i * OUTSIDE_SPACING,
          y: OUTSIDE_SPOT.y,
        },
      }));
  }

  protected goThrough(zone: DoorZone): boolean {
    if (!zone.target.startsWith(CAMPUS_TARGET)) return false;
    this.scene.start("CampusScene", { campus: zone.target.slice(CAMPUS_TARGET.length) });
    return true;
  }
}
