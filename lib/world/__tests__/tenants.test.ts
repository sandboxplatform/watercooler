import { describe, it, expect } from "vitest";
import {
  BUILDINGS,
  DOCK,
  ORGANISATIONS,
  TENANTS,
  TILE,
  VOLCANO_DOCK,
  WORLD_HEIGHT,
  WORLD_SPAWN,
  WORLD_WIDTH,
  arcadeGameIn,
  buildingFrom,
  hasCampus,
  hasFloors,
  lobbyGame,
  spawnFor,
  tenantFor,
  tenantTitle,
  tenantUrl,
  tenantsOf,
} from "../tenants";
import { VOLCANO_ROOM_SLUG, normaliseRoomSlug } from "../../rooms";

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("organisations and their lobbies", () => {
  it("names the businesses, and the lab", () => {
    expect(ORGANISATIONS.map((o) => o.name)).toEqual([
      "Castle Atlantic",
      "Sandbox ERP",
      "Chester",
      "Blockhouse",
      "Targetts",
      "Masstown",
      "MacCallum",
      "Happy Harrys",
      "Homestar",
      "Mettara",
      "Apeiron Media",
    ]);
  });

  it("gives every lobby a slug the room layer accepts unchanged, and an organisation", () => {
    for (const t of TENANTS) {
      expect(normaliseRoomSlug(t.slug)).toBe(t.slug);
      expect(ORGANISATIONS.some((o) => o.slug === t.org)).toBe(true);
    }
    expect(new Set(TENANTS.map((t) => t.slug)).size).toBe(TENANTS.length);
  });

  it("lists each store's parts and each campus's departments", () => {
    expect(tenantsOf("chester").map((t) => t.location)).toEqual(["Warehouse", "Store"]);
    expect(tenantsOf("blockhouse").map((t) => t.location)).toEqual([
      "Warehouse",
      "Store",
      "Field Crew",
    ]);
    // The four newer ones are a store and a warehouse and nothing else.
    // **No field crew**, which is what tells them from Blockhouse, and what
    // `buildStoreSpec` reads to decide whether the shop gets a side door.
    for (const shop of ["targetts", "masstown", "maccallum", "happy-harrys"]) {
      expect(
        tenantsOf(shop).map((t) => t.location),
        shop,
      ).toEqual(["Warehouse", "Store"]);
      expect(
        tenantsOf(shop).some((t) => t.kind === "garage"),
        shop,
      ).toBe(false);
    }
    expect(tenantsOf("homestar").map((t) => t.location)).toEqual([
      "Sales",
      "Finance",
      "Operations",
      "Building Supply",
      "Building Supply Warehouse",
      "Field Crew",
    ]);
    expect(hasCampus("castle-atlantic")).toBe(false);
    expect(hasCampus("chester")).toBe(false);
    expect(hasCampus("homestar")).toBe(true);
  });

  it("titles and points each lobby at its own room", () => {
    expect(tenantUrl(TENANTS[0])).toBe("/r/castle-atlantic");
    expect(tenantTitle(tenantFor("sandbox-erp")!)).toBe("Sandbox ERP");
    expect(tenantTitle(tenantFor("chester-warehouse")!)).toBe("Chester · Warehouse");
    expect(tenantFor("local")).toBeNull();
  });
});

describe("the games in the lobbies", () => {
  /**
   * One game to a lobby and one lobby to a game.
   *
   * The first half the types settle — `game` is a single field, and the
   * `also` that once put the whole arcade beside Sandbox ERP's pinball
   * machine is gone. The second half is only ever true because the list
   * says so, and nothing about the world running would notice: two
   * buildings declaring Breakout both draw a cabinet, both open the same
   * panel, and the only sign of it is that the high score table you were
   * beating is in the other building. So it is asserted here.
   */
  it("never puts one game in two lobbies", () => {
    const games = TENANTS.map((t) => t.game).filter((g): g is NonNullable<typeof g> => Boolean(g));
    expect(new Set(games).size, games.join(", ")).toBe(games.length);
  });

  it("only puts a game where there is a lobby to put it in", () => {
    // A store, a warehouse and a garage are drawn by `lib/map/premises.ts`,
    // which has no corner to stand a machine in and no point of interest to
    // walk up to. A game declared on one would be furniture nobody sees.
    for (const tenant of TENANTS) {
      if (tenant.game) expect(hasFloors(tenant), tenant.slug).toBe(true);
    }
  });

  it("tells the HUD which game the room it is in has", () => {
    // How the cabinet knows what it is: the panel is mounted in every room
    // and asks by slug, since there is no menu to pick from any more.
    expect(lobbyGame("sandbox-erp")).toBe("pinball");
    expect(lobbyGame("mettara")).toBe("breakout");
    expect(arcadeGameIn("mettara")).toBe("breakout");
    expect(arcadeGameIn("apeiron-media")).toBe("oak-island");
    // The other two machines are their own panels, not cabinets.
    expect(arcadeGameIn("castle-atlantic")).toBeNull();
    expect(arcadeGameIn("sandbox-erp")).toBeNull();
    // A floor above a lobby, a room with nothing in it, nowhere at all.
    expect(arcadeGameIn("mettara-floor-2")).toBeNull();
    expect(lobbyGame("chester-store")).toBeNull();
    expect(lobbyGame("local")).toBeNull();
    expect(lobbyGame(null)).toBeNull();
  });
});

describe("the world map", () => {
  it("gives every organisation one front door, to a lobby or a campus", () => {
    const owned = BUILDINGS.flatMap((b) => (b.org ? [b.org.slug] : []));
    expect(owned.sort()).toEqual(ORGANISATIONS.map((o) => o.slug).sort());
    for (const b of BUILDINGS) {
      if (!b.org) continue;
      if (b.entrance.kind === "lobby") expect(hasCampus(b.org.slug)).toBe(false);
      else if (b.entrance.kind === "campus") expect(b.entrance.campus).toBe(b.org.slug);
      else throw new Error(`${b.id} is an organisation's, and crosses to the volcano`);
    }
  });

  /**
   * The one thing on the map you can walk into that is nobody's: the ferry
   * to Volcano Island, off the second dock. Owned by nobody, crossing to the
   * volcano, and found again by the room the island hands back on the way
   * home — which is the whole of how the map knows which dock to put you on.
   */
  it("moors the ferry to Volcano Island at the second dock, belonging to nobody", () => {
    const ownerless = BUILDINGS.filter((b) => !b.org);
    expect(ownerless.map((b) => b.id)).toEqual(["volcano-ferry"]);
    const [ferry] = ownerless;
    expect(ferry.entrance).toEqual({ kind: "volcano" });
    expect(ferry.frame.x).toBe((VOLCANO_DOCK.x + VOLCANO_DOCK.width) * TILE);
    expect(buildingFrom(VOLCANO_ROOM_SLUG)).toBe(ferry);
    expect(spawnFor(VOLCANO_ROOM_SLUG)).toEqual(ferry.outside);
    // And the first ferry is still Apeiron Media's, at the first dock.
    expect(buildingFrom("apeiron-media")?.frame.x).toBe((DOCK.x + DOCK.width) * TILE);
  });

  it("gives every building a name of its own, owned or not", () => {
    const ids = BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BUILDINGS) if (b.org) expect(b.id).toBe(b.org.slug);
  });

  it("keeps every building, door and spawn inside the map", () => {
    for (const b of BUILDINGS) {
      for (const r of [b.frame, b.solid, b.door]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(r.y + r.height).toBeLessThanOrEqual(WORLD_HEIGHT);
      }
      expect(b.outside.y).toBeLessThan(WORLD_HEIGHT);
    }
    expect(WORLD_SPAWN.y).toBeLessThan(WORLD_HEIGHT);
  });

  it("does not let buildings overlap", () => {
    for (let i = 0; i < BUILDINGS.length; i++)
      for (let j = i + 1; j < BUILDINGS.length; j++)
        expect(overlaps(BUILDINGS[i].frame, BUILDINGS[j].frame)).toBe(false);
  });

  it("puts the doorway on the ground where a person can reach it", () => {
    for (const b of BUILDINGS) {
      expect(overlaps(b.door, b.solid)).toBe(false);
      // Under the building — or, for the ferry, on the dock beside it.
      if (b.art === "world-boat") expect(b.door.x + b.door.width).toBeLessThanOrEqual(b.solid.x);
      else expect(b.door.y).toBeGreaterThanOrEqual(b.solid.y + b.solid.height);
    }
  });

  it("stands you outside the building you just left, clear of its door", () => {
    const castle = BUILDINGS[0];
    expect(spawnFor("castle-atlantic")).toEqual(castle.outside);
    expect(spawnFor("castle-atlantic").y).toBeGreaterThan(castle.door.y + castle.door.height);
    // Out of a store is that store's front door; out of a campus's lobby, the gate.
    const chester = BUILDINGS.find((b) => b.id === "chester")!;
    expect(chester.entrance).toEqual({ kind: "lobby", tenant: tenantFor("chester-store") });
    expect(spawnFor("chester-store")).toEqual(chester.outside);
    expect(spawnFor("homestar-sales")).toEqual(BUILDINGS.find((b) => b.id === "homestar")!.outside);
    expect(spawnFor("nowhere")).toEqual(WORLD_SPAWN);
    expect(spawnFor(null)).toEqual(WORLD_SPAWN);
  });
});
