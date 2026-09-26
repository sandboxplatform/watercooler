import * as Phaser from "phaser";
import { OutdoorScene, type OutdoorPlace } from "./OutdoorScene";
import type { DoorZone } from "@/lib/doors";
import { LOBBY, floorUrl } from "@/lib/world/floors";
import { createLogger } from "@/lib/logger";
import { VOLCANO_PATH, campusPath } from "@/lib/world/paths";
import { travelTo } from "@/lib/room-travel";
import {
  BUILDINGS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  buildingFrom,
  spawnFor,
  type Building,
} from "@/lib/world/tenants";
import { SCENERY, WORLD_SIGNS, groundTiles, worldSolids } from "@/lib/world/scenery";
import { HIGHWAY_PX } from "@/lib/world/wilderness";
import { asset } from "@/lib/assets";
import { COURT_PX } from "@/lib/world/basketball";
import { BasketballCourt } from "../systems/BasketballCourt";
import { EggPatch } from "../systems/EggPatch";
import { Highway } from "../systems/Highway";
import { Mailboxes } from "../systems/Mailboxes";
import {
  addSolid,
  layGround,
  placeBuilding,
  placeCourtLines,
  placeHighwayMarks,
  placeProp,
  placeSign,
} from "./outdoors";

/** The four shopfronts, which are one picture painted four ways. */
const SHOPS = ["targetts", "masstown", "maccallum", "happy-harrys"];

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
  "world-campus": 199,
  "world-lab": 159,
  // The four shops along the west road are one drawing with four sets of
  // colours in it (`shop()` in `scripts/make-world-art.mjs`), so the board
  // is at the same height on every one of them — which is the argument for
  // drawing them once rather than four times, seen from this end.
  ...Object.fromEntries(SHOPS.map((slug) => [`world-${slug}`, 112])),
};

/** A door zone target that starts a scene rather than loading a page. */
const CAMPUS_TARGET = "campus:";

export interface WorldSceneData {
  /** The tenant or campus whose building the person just walked out of, if any. */
  from?: string | null;
  /** Walk in anyway, having come out of no door: a first arrival in the world. */
  walkIn?: boolean;
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
    for (const slug of SHOPS) {
      this.load.image(`world-${slug}`, asset(`/sprites/world/building_${slug}.png`));
    }
  }

  protected layOut(data: WorldSceneData, walls: Phaser.Physics.Arcade.StaticGroup): OutdoorPlace {
    layGround(this, groundTiles());
    // The court's tarmac is ground, laid with everything else above; its
    // markings are one picture nine tiles wide, which no tile can carry.
    placeCourtLines(this, COURT_PX);
    // And the road's markings, likewise: the tarmac is ground, the paint is
    // a picture over it.
    placeHighwayMarks(this, HIGHWAY_PX);
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
      // Out of a door, or walking into the world for the first time.
      // Arriving by the road otherwise, the keys are yours at once.
      walkIn: Boolean(left) || data?.walkIn === true,
      doors,
      // Every building on the map, the ferry among them: a tap on any of
      // their pictures walks to that front door and goes in.
      entrances: BUILDINGS,
      solids,
      label: "World map",
      // The four things on this map that are not scenery, all of them the
      // server's: this side draws them, offers the Press E and — for the
      // ball — swings the meter. The last two have nothing to press at: a
      // car is a thing that goes past, and a mailbox is a number to read.
      extras: [
        new BasketballCourt(this),
        new EggPatch(this),
        new Highway(this),
        new Mailboxes(this),
      ],
      camera: {
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
      band === undefined || !b.org
        ? null
        : { text: b.org.name.toUpperCase(), y: band, size: "18px" },
    );
    return { name: b.id, target: this.targetOf(b), ...b.door, facing: "up" };
  }

  /**
   * Where a building's door goes: a lobby's page, a campus, or — for the
   * second ferry — Volcano Island, which is an address like any other and
   * needs nothing of `goThrough`. Arriving with no `from` is arriving by
   * boat, which is what the island takes it to mean.
   */
  private targetOf(b: Building): string {
    switch (b.entrance.kind) {
      case "lobby":
        return floorUrl(b.entrance.tenant, LOBBY, "door");
      case "campus":
        return `${CAMPUS_TARGET}${b.entrance.campus}`;
      case "volcano":
        return VOLCANO_PATH;
    }
  }

  protected goThrough(zone: DoorZone): boolean {
    if (!zone.target.startsWith(CAMPUS_TARGET)) return false;
    // A campus is an address of its own, so it travels like any other room —
    // the router puts the scene up and the socket never notices.
    travelTo(campusPath(zone.target.slice(CAMPUS_TARGET.length)));
    return true;
  }
}
