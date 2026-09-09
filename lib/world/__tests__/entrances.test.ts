import { describe, it, expect } from "vitest";
import { BUILDINGS, TILE, tenantFor } from "../tenants";
import { CAMPUSES } from "../campus";
import { centreOf, enterableAt, walkInTo, type Enterable } from "../entrances";
import { worldSolids } from "../scenery";

/**
 * Tapping a building has to reach the doorway, and nothing here can be seen
 * by looking at the screen: a route that stops a few pixels short arrives,
 * stands there, and the door never fires — which looks exactly like a walk
 * that worked.
 */

type Point = { x: number; y: number };

const inside = (rect: { x: number; y: number; width: number; height: number }, p: Point) =>
  p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("what a tap on a building hits", () => {
  it("finds the building under a tap anywhere on its picture", () => {
    for (const building of BUILDINGS) {
      const { frame } = building;
      // The corners of the picture, and the middle of it: the whole point is
      // that the roof and the far wall count, not only the doorstep.
      const corners = [
        { x: frame.x, y: frame.y },
        { x: frame.x + frame.width - 1, y: frame.y },
        { x: frame.x, y: frame.y + frame.height - 1 },
        { x: frame.x + frame.width - 1, y: frame.y + frame.height - 1 },
        centreOf(frame),
      ];
      for (const at of corners) {
        expect(enterableAt(at, BUILDINGS), `${building.org.slug} at ${at.x},${at.y}`).toBe(
          building,
        );
      }
    }
  });

  it("finds nothing on open ground, so an ordinary tap still walks there", () => {
    // The plaza by the fountain, where a person spawns.
    expect(enterableAt({ x: 16 * TILE + 600, y: 655 }, BUILDINGS)).toBeNull();
  });

  it("never puts two buildings under one finger", () => {
    // Asserted on the frames rather than the solids, because the frame is
    // what a tap is tested against: two overlapping pictures would be two
    // menu items in one place, and only one of them ever reachable.
    for (let i = 0; i < BUILDINGS.length; i++) {
      for (let j = i + 1; j < BUILDINGS.length; j++) {
        expect(
          overlaps(BUILDINGS[i].frame, BUILDINGS[j].frame),
          `${BUILDINGS[i].org.slug} / ${BUILDINGS[j].org.slug}`,
        ).toBe(false);
      }
    }
  });
});

describe("where the walk goes", () => {
  it("ends inside the doorway, which is what opens the door", () => {
    // `DoorLatch` fires on the feet being in the zone. A route ending in
    // front of it is a walk that arrives and does nothing at all.
    for (const building of BUILDINGS) {
      const [, doorway] = walkInTo(building);
      expect(inside(building.door, doorway), building.org.slug).toBe(true);
    }
  });

  it("stands the approach clear of the doorway, so arriving is a step into it", () => {
    // If the approach were already in the zone the door would fire the
    // moment the route was planned, from wherever the character happened to
    // be — and on the way back out it would fire again as they left.
    for (const building of BUILDINGS) {
      const [approach] = walkInTo(building);
      expect(inside(building.door, approach), building.org.slug).toBe(false);
    }
  });

  it("puts the approach on ground the character can actually stand on", () => {
    // The pathfinder is asked to plan to this point, so it has to be clear
    // of every solid on the map — the buildings, the props and the sea.
    const solids = worldSolids();
    for (const building of BUILDINGS) {
      const [approach] = walkInTo(building);
      for (const solid of solids) {
        expect(inside(solid, approach), `${building.org.slug} at ${approach.x},${approach.y}`).toBe(
          false,
        );
      }
    }
  });

  it("aims at the door of the building that was tapped, not its neighbour", () => {
    // The far corner of Sandbox ERP's picture, which is nearer to Castle
    // Atlantic's door than to its own — the whole reason this is a hit test
    // on the picture rather than a walk to the nearest doorway.
    const office = BUILDINGS.find((b) => b.org.slug === "sandbox-erp")!;
    const tapped = enterableAt({ x: office.frame.x + 8, y: office.frame.y + 8 }, BUILDINGS)!;
    expect(tapped).toBe(office);
    expect(office.entrance).toEqual({ kind: "lobby", tenant: tenantFor("sandbox-erp") });
    const [, doorway] = walkInTo(tapped);
    expect(inside(office.door, doorway)).toBe(true);
    const castle = BUILDINGS.find((b) => b.org.slug === "castle-atlantic")!;
    expect(inside(castle.door, doorway)).toBe(false);
  });

  /** The ferry is a building as far as this is concerned: tap the boat, sail. */
  it("boards the ferry from a tap on the boat", () => {
    const ferry = BUILDINGS.find((b) => b.art === "world-boat")!;
    expect(enterableAt(centreOf(ferry.frame), BUILDINGS)).toBe(ferry);
    const [approach, doorway] = walkInTo(ferry);
    // Its doorway is the end of the dock, beside the hull rather than under it.
    expect(inside(ferry.door, doorway)).toBe(true);
    expect(inside(ferry.frame, approach)).toBe(false);
  });
});

describe("a campus yard", () => {
  it("routes into every building on every campus", () => {
    for (const [slug, campus] of Object.entries(CAMPUSES)) {
      expect(campus.buildings.length, slug).toBeGreaterThan(0);
      for (const building of campus.buildings) {
        const found = enterableAt(centreOf(building.frame), campus.buildings);
        expect(found, `${slug}/${building.tenant.slug}`).toBe(building);
        const [approach, doorway] = walkInTo(building);
        expect(inside(building.door, doorway), building.tenant.slug).toBe(true);
        expect(inside(building.door, approach), building.tenant.slug).toBe(false);
        // A side door's standing room is beside the building; a front door's
        // is below it. Either way it must not be inside the walls.
        expect(inside(building.solid, approach), building.tenant.slug).toBe(false);
      }
    }
  });

  it("sails home from a tap on the island's moored boat", () => {
    const island = CAMPUSES["apeiron-media"];
    const boat: Enterable = {
      frame: { ...island.boat!, width: 192, height: 168 },
      door: island.exit,
      outside: island.entrance,
    };
    expect(enterableAt(centreOf(boat.frame), [boat])).toBe(boat);
    const [approach, doorway] = walkInTo(boat);
    expect(inside(island.exit, doorway)).toBe(true);
    // Where the ferry stands you on arriving, so it is standing room by
    // definition — and it is above the exit, not in it.
    expect(inside(island.exit, approach)).toBe(false);
  });
});
