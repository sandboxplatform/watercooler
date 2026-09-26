import * as Phaser from "phaser";
import { OutdoorScene, type OutdoorPlace } from "./OutdoorScene";
import type { DoorZone } from "@/lib/doors";
import { createLogger } from "@/lib/logger";
import { travelTo } from "@/lib/room-travel";
import { asset } from "@/lib/assets";
import { describeRoom } from "@/lib/world/places";
import { TILE } from "@/lib/world/tenants";
import {
  enterablesOf,
  groundOf,
  landingIn,
  solidsOf,
  volcanoPlace,
  type VolcanoPlace,
} from "@/lib/world/volcano";
import { solidGround } from "@/lib/world/scenery";
import { BlobHop } from "../systems/BlobHop";
import { Eruption } from "../systems/Eruption";
import { confirmLabel } from "../systems/GamepadInput";
import {
  addSolid,
  layGround,
  placeBoat,
  placeProp,
  placeSign,
  preloadVolcanoGround,
} from "./outdoors";

export interface VolcanoSceneData {
  /** Which of the two: the island, or the cave under the volcano. */
  place: "island" | "cave";
  /** The room just left, which decides where on the island you step off. */
  from?: string | null;
}

/**
 * Volcano Island, and the cave in the foot of its volcano.
 *
 * One scene for the two, for the reason one `CampusScene` draws every
 * campus: they are the same kind of place drawn from the same kind of
 * description — `lib/world/volcano.ts` — and the router restarts the scene
 * with the other one when somebody walks through the mouth. The island has
 * the mountain, the ferry and the smoke; the cave has the blob.
 *
 * Everything it has in common with the world map — walking, presence,
 * doorways, the camera — is in `OutdoorScene`. The cave is no more out of
 * doors than a lobby is, and it is drawn out here all the same: a lobby is a
 * tilemap from the office pack, and nothing in that pack is a cave.
 */
export class VolcanoScene extends OutdoorScene<VolcanoSceneData> {
  protected readonly log = createLogger("Volcano");
  private place!: VolcanoPlace;

  constructor() {
    super({ key: "VolcanoScene" });
  }

  protected loadArt() {
    preloadVolcanoGround(this);
    this.load.image("volcano", asset("/sprites/world/volcano_576x432.png"));
  }

  protected layOut(data: VolcanoSceneData, walls: Phaser.Physics.Arcade.StaticGroup): OutdoorPlace {
    const place = volcanoPlace(data?.place ?? "island");
    this.place = place;

    const ground = groundOf(place);
    layGround(this, ground);

    const mountain = place.volcano;
    if (mountain) {
      const { frame } = mountain;
      // Sorted by its foot, like a building: somebody walking below the
      // mountain is drawn in front of it, and somebody beside the summit
      // behind it.
      this.add
        .image(frame.x, frame.y, mountain.art)
        .setOrigin(0, 0)
        .setDepth(frame.y + frame.height);
      for (const band of mountain.solids) addSolid(walls, band);
    }
    for (const prop of place.props) placeProp(this, prop, walls);
    for (const sign of place.signs) placeSign(this, sign, walls);
    if (place.boat) placeBoat(this, place.boat, walls);
    for (const body of solidGround(ground)) addSolid(walls, body);

    const doors: DoorZone[] = place.ways.map((way) => ({
      name: way.name,
      target: way.to,
      ...way.zone,
      facing: way.facing,
    }));
    const spawn = landingIn(place, data?.from);
    this.log.info(`on ${describeRoom(place.room).label}, from ${data?.from ?? "the ferry"}`);

    return {
      width: place.columns * TILE,
      height: place.rows * TILE,
      spawn,
      // Always: off the ferry it is a few steps up the dock, out of the cave
      // a few down the path, and into it a few up the passage — each of them
      // away from the way just come in by.
      walkIn: true,
      doors,
      entrances: enterablesOf(place),
      solids: solidsOf(place),
      label: describeRoom(place.room).label,
      extras: mountain
        ? [new Eruption(this, mountain.crater)]
        : [
            new BlobHop(this, () =>
              this.gamepad.connected ? confirmLabel(this.gamepad.layout) : null,
            ),
          ],
    };
  }

  /**
   * Every way out of here is an address, and each needs telling where it
   * came from: the world map stands you on the right dock when the island
   * says so, and the island stands you at the mouth when the cave does.
   */
  protected goThrough(zone: DoorZone): boolean {
    travelTo(zone.target, { from: this.place.room });
    return true;
  }
}
