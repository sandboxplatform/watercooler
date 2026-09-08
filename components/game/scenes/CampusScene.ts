import * as Phaser from "phaser";
import { OutdoorScene, type OutdoorPlace, type Standing } from "./OutdoorScene";
import type { DoorZone } from "@/lib/doors";
import { LOBBY, floorUrl } from "@/lib/world/floors";
import { createLogger } from "@/lib/logger";
import { campusPath } from "@/lib/world/paths";
import { TILE, organisationFor } from "@/lib/world/tenants";
import { campusFor, campusSpawnFor, type Campus, type CampusBuilding } from "@/lib/world/campus";
import type { Whereabouts } from "@/lib/world/residents";
import { groundGrid, propBody, signBody, tilesOf, waterBodies } from "@/lib/world/scenery";
import { asset } from "@/lib/assets";
import { addSolid, layGround, placeBoat, placeBuilding, placeProp, placeSign } from "./outdoors";

/** Where each picture's sign band is, from the frame's top. */
const SIGN_Y: Record<string, number> = {
  "site-warehouse": 61,
  "site-store": 59,
  "site-garage": 63,
  "site-office": 109,
  "site-office-sales": 109,
  "site-office-finance": 100,
  "site-office-operations": 104,
  "site-irish": 64,
};
// The same pictures doubled, for a yard that fills the screen.
for (const [key, y] of Object.entries(SIGN_Y)) SIGN_Y[`${key}-2x`] = y * 2;
/** Where a sign band sits on a picture nobody has measured yet. */
const SIGN_Y_FALLBACK = 60;
/** A door zone target meaning "back out to the world map". */
const EXIT_TARGET = "world";
/** The ferry's footprint, which the pathfinder routes around. */
const BOAT_SOLID = { width: 192, height: 168 };

export interface CampusSceneData {
  campus: string;
  /** The lobby the person just walked out of, if any. */
  from?: string | null;
}

/**
 * A campus: an organisation's yard of little buildings.
 *
 * Every building here is one of the organisation's lobbies, and walking
 * into it is the same as walking into a building on the world map — a new
 * page, with its own people and conversation. The road at the bottom is the
 * way back to the world map, and on the island it is a ferry instead.
 *
 * Everything it has in common with the world map — walking, presence,
 * doorways, the camera, the residents out on the yard — is in
 * `OutdoorScene`.
 */
export class CampusScene extends OutdoorScene<CampusSceneData> {
  protected readonly log = createLogger("Campus");
  private campus!: Campus;

  constructor() {
    super({ key: "CampusScene" });
  }

  protected loadArt() {
    for (const key of Object.keys(SIGN_Y)) {
      if (key === "site-office-2x") continue;
      this.load.image(key, asset(`/sprites/world/${key.replace(/-/g, "_")}.png`));
    }
  }

  protected layOut(
    data: CampusSceneData,
    walls: Phaser.Physics.Arcade.StaticGroup,
  ): OutdoorPlace | null {
    const campus = campusFor(data?.campus);
    if (!campus) {
      this.log.error(`no campus "${data?.campus}"; back to the world`);
      this.scene.start("WorldScene", {});
      return null;
    }
    this.campus = campus;

    const width = campus.columns * TILE;
    const height = campus.rows * TILE;
    const ground = groundGrid(
      campus.columns,
      campus.rows,
      campus.paved,
      campus.buildings.map((b) => tilesOf(b.frame)),
      [],
      campus.water ?? [],
      campus.dock ?? [],
    );
    layGround(this, ground);

    const doors = campus.buildings.map((b) => this.putUp(b, walls));
    doors.push({
      name: campus.boat ? "ferry" : "road",
      target: EXIT_TARGET,
      ...campus.exit,
      facing: "down",
    });
    for (const prop of campus.props) placeProp(this, prop, walls);
    for (const sign of campus.signs ?? []) placeSign(this, sign, walls);
    const company = organisationFor(campus.slug);
    if (campus.boat) placeBoat(this, campus.boat, walls);
    const water = waterBodies(ground);
    for (const body of water) addSolid(walls, body);

    // Whose yard this is, across the top.
    this.add
      .text(width / 2, 14, (company?.name ?? campus.slug).toUpperCase(), {
        fontFamily: '"ArkPixel", "Press Start 2P", monospace',
        fontSize: "16px",
        color: "#ffe9a8",
        backgroundColor: "rgba(27,27,42,0.85)",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(50)
      .setResolution(2);

    const at = campusSpawnFor(campus, data?.from);
    const fromBuilding = campus.buildings.find((b) => b.tenant.slug === data?.from);
    this.log.info(
      `on the ${company?.name ?? campus.slug} campus, from ${data?.from ?? "the road"}`,
    );

    return {
      width,
      height,
      spawn: { x: at.x, y: at.y, facing: fromBuilding?.exitDirection ?? "up" },
      // Always: out of a building it is steps away from its door, and in
      // from the road it is steps up onto the yard, clear of the road out.
      walkIn: true,
      doors,
      // The yard's buildings, and the moored ferry where there is one: the
      // boat's way in is the campus's way out, and `entrance` is the spot
      // you are stood on when the ferry brings you here, so it is standing
      // room by definition.
      entrances: [
        ...campus.buildings,
        ...(campus.boat
          ? [
              {
                frame: { ...campus.boat, ...BOAT_SOLID },
                door: campus.exit,
                outside: campus.entrance,
              },
            ]
          : []),
      ],
      solids: [
        ...campus.buildings.map((b) => b.solid),
        ...campus.props.map(propBody).filter((r) => r !== null),
        ...(campus.signs ?? []).map(signBody),
        ...(campus.boat ? [{ ...campus.boat, ...BOAT_SOLID }] : []),
        ...water,
      ],
      label: `${company?.name ?? campus.slug} · ${campus.place ?? "Campus"}`,
      path: campusPath(campus.slug),
    };
  }

  /** A building's picture and name, and the doorway into its lobby. */
  private putUp(b: CampusBuilding, walls: Phaser.Physics.Arcade.StaticGroup): DoorZone {
    // What it is: the department, or the whole name for a building that is
    // the organisation's only one.
    placeBuilding(this, b, walls, {
      text: (b.tenant.location ?? b.tenant.name).toUpperCase(),
      y: SIGN_Y[b.art] ?? SIGN_Y_FALLBACK,
      size: b.art.endsWith("-2x") ? "18px" : "11px",
    });
    return {
      name: b.tenant.slug,
      target: floorUrl(b.tenant, LOBBY, "door"),
      ...b.door,
      facing: b.side === "bottom" ? "up" : b.side,
    };
  }

  protected standing(all: Whereabouts[]): Standing[] {
    return all
      .filter((r) => r.place === "campus" && r.campus === this.campus.slug && r.spot)
      .map((resident) => ({ resident, at: resident.spot! }));
  }

  protected goThrough(zone: DoorZone): boolean {
    if (zone.target !== EXIT_TARGET) return false;
    this.scene.start("WorldScene", { from: this.campus.slug });
    return true;
  }
}
