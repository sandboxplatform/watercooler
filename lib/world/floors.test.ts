import { describe, expect, it } from "vitest";
import {
  AGENTS_FLOOR,
  PEOPLE_FLOOR,
  addressFromLocation,
  describeFloor,
  elevatorStops,
  floorUrl,
  mapFileFor,
  occupantsOf,
  roomForFloor,
  LIFT_REFUSAL,
  PRIVATE_LIFTS,
  liftIsPrivate,
  mayEnterRoom,
  mayRideLift,
  OPERATIONS_FLOOR,
  floorTitle,
  landsOutside,
  OUTSIDE_PATH,
  operationsMapFile,
} from "./floors";
import { TENANTS, hasOperationsFloor, operationsBoards, operationsRoomCount } from "./tenants";
import { roomFromLocation } from "../rooms";

const castle = TENANTS[0];
const people = [
  { id: "ab12cd34", name: "Robert" },
  { id: "ef56gh78", name: "Alice" },
];

describe("addresses", () => {
  it("reads the lobby and the floors from the path", () => {
    expect(addressFromLocation({ pathname: `/r/${castle.slug}` })).toEqual({
      tenant: castle,
      floor: { kind: "lobby" },
    });
    expect(addressFromLocation({ pathname: `/r/${castle.slug}/floor/2` })).toEqual({
      tenant: castle,
      floor: AGENTS_FLOOR,
    });
  });

  it("is nowhere for the bare app, an unknown building, or a floor that does not exist", () => {
    expect(addressFromLocation({ pathname: "/" })).toBeNull();
    expect(addressFromLocation({ pathname: "/r/somewhere-else" })).toBeNull();
    expect(addressFromLocation({ pathname: `/r/${castle.slug}/floor/7` })).toBeNull();
  });

  it("round-trips through the URL, and the room the socket joins agrees", () => {
    const url = floorUrl(castle, PEOPLE_FLOOR, "elevator");
    expect(url).toBe(`/r/${castle.slug}/floor/1?via=elevator`);
    const pathname = url.split("?")[0];
    expect(addressFromLocation({ pathname })!.floor).toEqual(PEOPLE_FLOOR);
    expect(roomFromLocation({ pathname, search: "" })).toBe(roomForFloor(castle, PEOPLE_FLOOR));
    expect(roomForFloor(castle, { kind: "lobby" })).toBe(castle.slug);
  });
});

describe("the lift", () => {
  it("lists every floor of the building, with who is on each", () => {
    const stops = elevatorStops({ tenant: castle, floor: { kind: "lobby" } }, { people });
    expect(stops.map((s) => s.label)).toEqual([
      "Lobby",
      "Floor 1 · People",
      "Floor 2 · Agents",
      "Floor 3 · Operations",
    ]);
    expect(stops[1].names).toEqual(["Robert", "Alice"]);
    expect(stops[2].names).toEqual(["Yoshi"]);
    // Nobody sits on the Operations floor; the boards are what it is for.
    expect(stops[3].names).toEqual([]);
    expect(stops.map((s) => s.here)).toEqual([true, false, false, false]);
    expect(stops[2].url).toBe(`/r/${castle.slug}/floor/2?via=elevator`);
  });

  /** Most buildings have no third floor, and their lift stops at two. */
  it("stops at the agents' floor in a building with no boards", () => {
    const sales = TENANTS.find((t) => t.slug === "homestar-sales")!;
    const stops = elevatorStops({ tenant: sales, floor: { kind: "lobby" } }, { people: [] });
    expect(stops.map((s) => s.label)).toEqual(["Lobby", "Floor 1 · People", "Floor 2 · Agents"]);
  });

  it("has nobody on the agents' floor of a building with no agents", () => {
    const finance = TENANTS.find((t) => t.slug === "homestar-finance")!;
    const stops = elevatorStops({ tenant: finance, floor: { kind: "lobby" } }, { people: [] });
    expect(stops[2].names).toEqual([]);
  });

  it("draws each room from the right map: a game lobby its own, premises their own, the rest shared", () => {
    expect(mapFileFor({ tenant: TENANTS[0], floor: { kind: "lobby" } })).toBe(
      "/maps/lobby-castle-atlantic.json",
    );
    expect(mapFileFor({ tenant: TENANTS[2], floor: { kind: "lobby" } })).toBe(
      "/maps/room-chester-warehouse.json",
    );
    expect(mapFileFor({ tenant: TENANTS[7], floor: { kind: "lobby" } })).toBe("/maps/lobby.json");
  });

  it("knows which floor you are on", () => {
    const stops = elevatorStops({ tenant: castle, floor: PEOPLE_FLOOR }, { people });
    expect(stops.map((s) => s.here)).toEqual([false, true, false, false]);
  });
});

describe("desks", () => {
  it("seat the people on Floor 1 and the agents on Floor 2, in order", () => {
    expect(occupantsOf(castle, PEOPLE_FLOOR, { people })).toEqual(people);
    expect(occupantsOf(castle, AGENTS_FLOOR, { people })).toEqual([{ id: "yoshi", name: "Yoshi" }]);
    expect(occupantsOf(castle, { kind: "lobby" }, { people })).toEqual([]);
  });
});

describe("the top bar and the maps", () => {
  it("describes a floor", () => {
    expect(describeFloor({ tenant: castle, floor: { kind: "lobby" } })).toBe("Lobby");
    expect(describeFloor({ tenant: castle, floor: AGENTS_FLOOR })).toBe("Floor 2 · Agents");
  });

  it("draws each floor from its own map", () => {
    expect(mapFileFor(null)).toBe("/maps/office3.json");
    expect(mapFileFor({ tenant: castle, floor: { kind: "lobby" } })).toBe(
      "/maps/lobby-castle-atlantic.json",
    );
    expect(mapFileFor({ tenant: castle, floor: PEOPLE_FLOOR })).toBe("/maps/floor.json");
  });
});

describe("who may ride the lift", () => {
  it("carries Coop and Rob up in either of their buildings", () => {
    for (const building of ["sandbox-erp", "castle-atlantic"]) {
      expect(mayRideLift(building, "coop"), building).toBe(true);
      expect(mayRideLift(building, "rob"), building).toBe(true);
    }
  });

  it("will not carry a visitor up in either", () => {
    expect(mayRideLift("sandbox-erp", "visitor")).toBe(false);
    expect(mayRideLift("castle-atlantic", "visitor")).toBe(false);
  });

  /** Only that building is private; a new one works without being listed. */
  it("carries anybody anywhere else", () => {
    for (const identity of ["visitor", "coop", "rob"] as const) {
      expect(mayRideLift("homestar-sales", identity), identity).toBe(true);
      expect(mayRideLift("chester-store", identity), identity).toBe(true);
      expect(mayRideLift("a-building-nobody-has-built-yet", identity), identity).toBe(true);
    }
  });

  it("knows which buildings are private", () => {
    expect(liftIsPrivate("sandbox-erp")).toBe(true);
    expect(liftIsPrivate("castle-atlantic")).toBe(true);
    expect(liftIsPrivate("homestar-sales")).toBe(false);
    expect(Object.keys(PRIVATE_LIFTS).sort()).toEqual(["castle-atlantic", "sandbox-erp"]);
  });

  it("has a line to say", () => {
    expect(LIFT_REFUSAL).toBe("Thou shall not pass!");
  });
});

describe("who may be in a room", () => {
  /** The same rule, asked of a room slug, which is what the socket has. */
  it("keeps a visitor off every floor of a private building", () => {
    for (const building of ["sandbox-erp", "castle-atlantic"]) {
      for (const level of [1, 2, 3]) {
        expect(mayEnterRoom(`${building}-floor-${level}`, "visitor"), building).toBe(false);
      }
    }
  });

  it("lets Coop and Rob onto them", () => {
    expect(mayEnterRoom("sandbox-erp-floor-2", "coop")).toBe(true);
    expect(mayEnterRoom("sandbox-erp-floor-2", "rob")).toBe(true);
  });

  /**
   * The lobby stays public — a visitor may walk in and talk to whoever is
   * there. It is the floors above that are shut.
   */
  it("leaves the lobby open to everyone", () => {
    expect(mayEnterRoom("sandbox-erp", "visitor")).toBe(true);
    expect(mayEnterRoom("castle-atlantic", "visitor")).toBe(true);
  });

  it("leaves the outdoors and every other room open", () => {
    expect(mayEnterRoom("world", "visitor")).toBe(true);
    expect(mayEnterRoom("campus-homestar", "visitor")).toBe(true);
    expect(mayEnterRoom("homestar-sales-floor-2", "visitor")).toBe(true);
    expect(mayEnterRoom("chester-warehouse", "visitor")).toBe(true);
  });

  /** The room a floor actually uses, so the rule cannot miss by a name. */
  it("agrees with the slug the floor's room is kept under", () => {
    const erp = TENANTS.find((t) => t.slug === "sandbox-erp")!;
    expect(mayEnterRoom(roomForFloor(erp, AGENTS_FLOOR), "visitor")).toBe(false);
    expect(mayEnterRoom(roomForFloor(erp, PEOPLE_FLOOR), "visitor")).toBe(false);
    expect(mayEnterRoom(roomForFloor(erp, { kind: "lobby" }), "visitor")).toBe(true);
  });
});

describe("the Operations floor", () => {
  const erp = TENANTS.find((t) => t.slug === "sandbox-erp")!;

  it("is where a building's boards hang, and only buildings that name some have one", () => {
    expect(hasOperationsFloor(erp)).toBe(true);
    expect(hasOperationsFloor(castle)).toBe(true);
    expect(hasOperationsFloor(TENANTS.find((t) => t.slug === "homestar-sales")!)).toBe(false);
    // A store has no floors at all, so it cannot have this one.
    expect(hasOperationsFloor(TENANTS.find((t) => t.slug === "chester-store")!)).toBe(false);
  });

  it("gives Sandbox ERP both boards and Castle Atlantic the project board alone", () => {
    expect(operationsBoards(erp)).toEqual(["trello", "zoho"]);
    expect(operationsBoards(castle)).toEqual(["trello"]);
  });

  /**
   * Named by the shape rather than the building: the boards on the wall and
   * the number of rooms off the corridor. Two buildings running the same
   * boards with the same number of projects share a file; change either and
   * a new one is written, because both are in the name.
   */
  it("draws the floor the boards and the room count make", () => {
    const erpFile = mapFileFor({ tenant: erp, floor: OPERATIONS_FLOOR });
    const castleFile = mapFileFor({ tenant: castle, floor: OPERATIONS_FLOOR });
    expect(erpFile).toBe(`/maps/floor-ops-trello-zoho-${operationsRoomCount(erp)}.json`);
    expect(castleFile).toBe(`/maps/floor-ops-trello-${operationsRoomCount(castle)}.json`);
    expect(erpFile).not.toBe(castleFile);
  });

  /**
   * The room count is what makes the corridor longer, so it has to reach the
   * file name — two buildings with the same boards and different numbers of
   * projects are different floors.
   */
  it("counts Operations itself among the rooms", () => {
    expect(operationsRoomCount(erp)).toBeGreaterThan(1);
    expect(operationsRoomCount(null)).toBe(0);
    expect(operationsMapFile(["trello"], 4)).not.toBe(operationsMapFile(["trello"], 6));
  });

  it("is reachable by address only in a building that has one", () => {
    expect(addressFromLocation({ pathname: `/r/${castle.slug}/floor/3` })).toEqual({
      tenant: castle,
      floor: OPERATIONS_FLOOR,
    });
    expect(addressFromLocation({ pathname: "/r/homestar-sales/floor/3" })).toBeNull();
  });

  it("is called Operations", () => {
    expect(floorTitle(OPERATIONS_FLOOR)).toBe("Floor 3 · Operations");
  });
});

/**
 * Where a person lands when they arrive at the front door.
 *
 * The root is the default room, which is an office. A visitor has no
 * building, so being dropped inside one is being dropped in the one place
 * that is not theirs — they start outside instead, on the world map.
 */
describe("landing outside", () => {
  it("sends a visitor at the root out to the world map", () => {
    expect(landsOutside("/", "visitor")).toBe(true);
    expect(OUTSIDE_PATH).toBe("/world");
  });

  /** Their own code names their building, so the default room is not a stranger's. */
  it("leaves somebody with a building of their own where they asked to be", () => {
    expect(landsOutside("/", "coop")).toBe(false);
    expect(landsOutside("/", "rob")).toBe(false);
  });

  /**
   * Only the root. A lobby is public and a shared link has to work, so a
   * typed or pasted room URL opens that room whoever follows it.
   */
  it("does not touch any other path", () => {
    for (const path of [
      "/world",
      "/r/sandbox-erp",
      "/r/chester-store",
      "/campus/homestar",
      "/unlock",
      "/api/health",
    ]) {
      expect(landsOutside(path, "visitor"), path).toBe(false);
    }
  });

  /** The world map is somewhere a visitor may actually be. */
  it("sends them somewhere they are allowed", () => {
    expect(mayEnterRoom(roomFromLocation({ pathname: OUTSIDE_PATH, search: "" }), "visitor")).toBe(
      true,
    );
  });
});
