import { describe, expect, it } from "vitest";
import {
  DWELL_MS,
  RESIDENTS,
  WANDER_AREAS,
  deskOf,
  deskSpot,
  dwell,
  hauntKey,
  hauntsOf,
  nextHaunt,
  outsideSpots,
  residentById,
  residentsAt,
  residentsOf,
  roomForHaunt,
  wanderArea,
  wanderSpots,
  yardArea,
  WORLD_WANDER_SPOTS,
} from "./residents";
import { parseFloorRoomSlug, roomFromLocation } from "../rooms";
import { CUTOUT, TILE, WIDTH } from "../map/office";
import {
  HEIGHT as FLOOR_ROWS,
  WIDTH as FLOOR_COLS,
  opsSupportPost,
  opsSupportRoom,
} from "../map/floor";
import {
  SHORE_ROW,
  TENANTS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  operationsRoomCount,
  organisationFor,
  tenantFor,
} from "./tenants";
import { worldSolids } from "./scenery";
import { routeAcross } from "./route";
import { CAMPUSES } from "./campus";
import { WORKER_SPRITES } from "../../components/game/config/animations";

const yoshi = residentById("yoshi")!;
const mark = residentById("mark")!;
const steve = residentById("steve")!;

describe("the residents", () => {
  it("each have a sheet in the library, and a real organisation unless they wander", () => {
    for (const r of RESIDENTS) {
      expect(
        WORKER_SPRITES.some((w) => w.key === r.spriteKey),
        r.name,
      ).toBe(true);
      if (r.wanders) {
        // Works nowhere and sleeps at no desk: both are the point of the mode.
        expect(r.org, r.name).toBeNull();
        expect(r.home, r.name).toBeNull();
      } else {
        expect(organisationFor(r.org), r.name).not.toBeNull();
      }
      if (r.home)
        expect(
          TENANTS.some((t) => t.slug === r.home),
          r.name,
        ).toBe(true);
      if (r.station) {
        // A post is in a real room — a lobby, or a floor of one — and it is
        // instead of a desk, not as well.
        const floor = parseFloorRoomSlug(r.station.room);
        const building = floor ? floor.slug : r.station.room;
        expect(
          TENANTS.some((t) => t.slug === building),
          r.name,
        ).toBe(true);
        expect(r.home, r.name).toBeNull();
      }
    }
  });

  it("are Yoshi at Castle Atlantic, Sara, Bud and Doc at Sandbox ERP, Yash at Mettara, Steve at Chester, Mark at Homestar", () => {
    const names = (org: string) => residentsOf(org).map((r) => r.name);
    expect(names("castle-atlantic")).toEqual(["Yoshi"]);
    expect(names("sandbox-erp")).toEqual(["Sara", "Bud", "Doc"]);
    expect(names("mettara")).toEqual(["Yash"]);
    expect(names("chester")).toEqual(["Steve"]);
    expect(names("homestar")).toEqual(["Mark"]);
    expect(names("blockhouse")).toEqual([]);
  });
});

describe("wandering mode", () => {
  /** Written against the mode, not against Michael: anyone can be put in it. */
  const wanderer = { ...yoshi, id: "w", name: "W", org: null, home: null, wanders: true };

  it("has one haunt, the world map, so they never go indoors", () => {
    const haunts = hauntsOf(wanderer);
    expect(haunts).toEqual([{ kind: "room", room: "world", area: "world" }]);
  });

  it("puts them in the world map's presence room, where everyone sees the same steps", () => {
    expect(roomForHaunt(wanderer, hauntsOf(wanderer)[0])).toBe("world");
    expect(roomFromLocation({ pathname: "/world", search: "" })).toBe("world");
  });

  /**
   * Places, not bounds. A patch of ground the size of the world would put a
   * wanderer through a wall or in the sea, so the world map is the one haunt
   * wandered by a set of spots.
   */
  it("gives them places to walk between rather than a patch of ground", () => {
    const haunt = hauntsOf(wanderer)[0];
    expect(wanderArea(haunt)).toBeNull();
    expect(wanderSpots(haunt)).toBe(WORLD_WANDER_SPOTS);
  });

  it("has twenty of them", () => {
    expect(WORLD_WANDER_SPOTS).toHaveLength(20);
  });

  it("spreads them over the whole map rather than one corner of it", () => {
    const xs = WORLD_WANDER_SPOTS.map((s) => s.x);
    const ys = WORLD_WANDER_SPOTS.map((s) => s.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(WORLD_WIDTH * 0.75);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(WORLD_HEIGHT * 0.4);
  });

  it("keeps every one of them on dry land", () => {
    for (const spot of WORLD_WANDER_SPOTS) {
      expect(spot.y, `${spot.x},${spot.y}`).toBeLessThan(SHORE_ROW * TILE);
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(WORLD_WIDTH);
    }
  });

  /**
   * Nothing collides a resident — they are drawn where the server says — so
   * a spot inside a building or a prop is a chicken standing in a wall, and
   * only this catches it. The car park's spot moved once already for it.
   */
  it("stands none of them in a building, a prop or a sign", () => {
    const solids = worldSolids();
    for (const spot of WORLD_WANDER_SPOTS) {
      const inside = solids.find(
        (s) =>
          spot.x >= s.x && spot.x <= s.x + s.width && spot.y >= s.y && spot.y <= s.y + s.height,
      );
      expect(inside, `${spot.x},${spot.y} is inside ${JSON.stringify(inside)}`).toBeUndefined();
    }
  });

  /** And a spot nothing can reach is one a wanderer would never get to. */
  it("can walk from any one of them to any other", () => {
    const bounds = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    const solids = worldSolids();
    for (const from of WORLD_WANDER_SPOTS) {
      for (const to of WORLD_WANDER_SPOTS) {
        if (from === to) continue;
        expect(
          routeAcross(bounds, solids, from, to),
          `${from.x},${from.y} to ${to.x},${to.y}`,
        ).not.toBeNull();
      }
    }
  });

  /** Without this the simulation would hand back undefined and throw. */
  it("keeps them where they are when there is nowhere else to go", () => {
    const only = hauntsOf(wanderer)[0];
    expect(hauntKey(nextHaunt(wanderer, only, () => 0))).toBe(hauntKey(only));
    expect(hauntKey(nextHaunt(wanderer, only, () => 0.999))).toBe(hauntKey(only));
  });

  it("gives them no desk", () => {
    expect(deskOf(wanderer)).toBe(-1);
  });

  it("leaves everyone else's routine alone", () => {
    expect(hauntsOf(yoshi).length).toBeGreaterThan(1);
    expect(hauntsOf(yoshi).some((h) => h.kind === "office")).toBe(true);
  });

  it("is how Michael lives, and he is the only one so far", () => {
    const wanderers = RESIDENTS.filter((r) => r.wanders);
    expect(wanderers.map((r) => r.name)).toEqual(["Michael"]);
  });
});

describe("working a station", () => {
  const doc = residentById("doc")!;
  const SUPPORT_ROOMS = operationsRoomCount(tenantFor("sandbox-erp"));
  const SUPPORT = opsSupportPost(SUPPORT_ROOMS);

  it("is Doc in Support on the Operations floor, and only him so far", () => {
    expect(RESIDENTS.filter((r) => r.station).map((r) => r.name)).toEqual(["Doc"]);
    expect(doc.station).toEqual({
      room: "sandbox-erp-floor-3",
      x: SUPPORT.post.x,
      y: SUPPORT.post.y,
      facing: "down",
      paces: SUPPORT.paces,
    });
  });

  /**
   * The room he works is the room the support queue hangs in, which is what
   * makes it Support. Read off the floor rather than written down, so a
   * longer corridor moves him with it.
   */
  it("stands him inside the Support room, well clear of its walls", () => {
    const room = opsSupportRoom(SUPPORT_ROOMS);
    const left = room.x * TILE;
    const top = room.y * TILE;
    expect(SUPPORT.post.x).toBeGreaterThan(left);
    expect(SUPPORT.post.x).toBeLessThan(left + 14 * TILE);
    expect(SUPPORT.paces.x).toBeGreaterThan(left);
    expect(SUPPORT.paces.x + SUPPORT.paces.width).toBeLessThan(left + 14 * TILE);
    expect(SUPPORT.paces.y).toBeGreaterThan(top);
    expect(SUPPORT.paces.y + SUPPORT.paces.height).toBeLessThan(top + 7 * TILE);
  });

  /** Two lines, one for each end of a two-place routine. */
  it("gives him something to say at each end of the day", () => {
    expect(doc.lines).toEqual({
      onDuty: "I'm about to be hooked up to Mettara!",
      away: "I just needed some fresh air!",
    });
    expect(RESIDENTS.filter((r) => r.lines).map((r) => r.name)).toEqual(["Doc"]);
  });

  it("is two places and no more: the post, and the world map", () => {
    expect(hauntsOf(doc).map(hauntKey)).toEqual(["station", "room:world"]);
    expect(roomForHaunt(doc, { kind: "station" })).toBe("sandbox-erp-floor-3");
    expect(roomForHaunt(doc, hauntsOf(doc)[1])).toBe("world");
  });

  /**
   * A station's patch is the floor round that counter, not the kind of room
   * it is in, so it comes off the resident — and without one they stand still.
   */
  it("paces a patch of its own, and crosses the map by places", () => {
    expect(wanderArea({ kind: "station" }, doc)).toBe(doc.station!.paces);
    expect(wanderArea({ kind: "station" })).toBeNull();
    expect(wanderArea({ kind: "station" }, { ...doc, station: undefined })).toBeNull();
    // A station is somewhere to pace, never somewhere to plan a route across.
    expect(wanderSpots({ kind: "station" })).toBeNull();
    expect(wanderSpots(hauntsOf(doc)[1])).toBe(WORLD_WANDER_SPOTS);
  });

  /**
   * Bounds for the sprite's centre, so the bottom of them is the post: half a
   * sheet lower and he is drawn over his own counter, since a prop sits at
   * depth 4 and he sits at the height of his feet.
   */
  it("paces a band across the room with the post inside it", () => {
    const paces = doc.station!.paces!;
    expect(doc.station!.x).toBeGreaterThanOrEqual(paces.x);
    expect(doc.station!.x).toBeLessThanOrEqual(paces.x + paces.width);
    // Two rows deep, so it is pacing rather than sliding along a line.
    expect(paces.height).toBe(2 * TILE);
  });

  /** Two haunts, so it is always the other one — the day is post, map, post. */
  it("alternates", () => {
    const [post, map] = hauntsOf(doc);
    expect(hauntKey(nextHaunt(doc, post, () => 0))).toBe("room:world");
    expect(hauntKey(nextHaunt(doc, post, () => 0.999))).toBe("room:world");
    expect(hauntKey(nextHaunt(doc, map, () => 0.999))).toBe("station");
  });

  it("gives him no desk upstairs: the counter is where his work is", () => {
    expect(deskOf(doc)).toBe(-1);
    expect(residentsAt("sandbox-erp").some((r) => r.id === "doc")).toBe(false);
    expect(hauntsOf(doc).some((h) => h.kind === "office")).toBe(false);
  });

  it("keeps him at it longer than he is ever away from it", () => {
    const [minAt] = DWELL_MS.station;
    const [, maxAway] = DWELL_MS.room;
    expect(minAt).toBeGreaterThan(maxAway);
  });
});

describe("desks", () => {
  it("are on the agents' floor of the home lobby, whose room matches its URL", () => {
    const room = roomForHaunt(yoshi, { kind: "office" })!;
    expect(room).toBe(roomFromLocation({ pathname: "/r/castle-atlantic/floor/2", search: "" }));
    expect(deskOf(yoshi)).toBe(0);
    expect(deskSpot(yoshi).y).toBeGreaterThan(0);
  });

  it("go two to a floor at Sandbox ERP, in order", () => {
    expect(residentsAt("sandbox-erp").map((r) => r.name)).toEqual(["Sara", "Bud"]);
    expect(deskOf(residentById("spud")!)).toBe(1);
  });

  it("put Mark in Homestar Sales and nowhere else on the campus", () => {
    expect(residentsAt("homestar-sales").map((r) => r.name)).toEqual(["Mark"]);
    expect(residentsAt("homestar-finance")).toEqual([]);
    expect(roomForHaunt(mark, { kind: "office" })).toBe("homestar-sales-floor-2");
  });

  it("are not for a store's resident", () => {
    expect(deskOf(steve)).toBe(-1);
    expect(hauntsOf(steve).some((h) => h.kind === "office")).toBe(false);
  });
});

describe("haunts", () => {
  it("take Yoshi to the desk, the lobby and outside", () => {
    expect(hauntsOf(yoshi).map(hauntKey)).toEqual(["office", "room:castle-atlantic", "outside"]);
  });

  it("take Steve round the store, the warehouse and outside", () => {
    expect(hauntsOf(steve).map(hauntKey)).toEqual([
      "room:chester-warehouse",
      "room:chester-store",
      "outside",
    ]);
  });

  it("take Mark to every building on the campus, the yard and outside", () => {
    expect(hauntsOf(mark).map(hauntKey)).toEqual([
      "office",
      "room:homestar-sales",
      "room:homestar-finance",
      "room:homestar-operations",
      "room:homestar-store",
      "room:homestar-warehouse",
      "room:homestar-field-crew",
      "campus:homestar",
      "outside",
    ]);
  });

  it("have a presence room only for rooms and the office", () => {
    expect(roomForHaunt(yoshi, { kind: "room", room: "castle-atlantic", area: "lobby" })).toBe(
      "castle-atlantic",
    );
    expect(roomForHaunt(mark, { kind: "campus", campus: "homestar" })).toBeNull();
    expect(roomForHaunt(yoshi, { kind: "outside" })).toBeNull();
  });
});

describe("the routine", () => {
  it("never stays put", () => {
    const lobby = { kind: "room", room: "castle-atlantic", area: "lobby" } as const;
    for (let i = 0; i < 20; i++)
      expect(hauntKey(nextHaunt(yoshi, lobby, () => i / 20))).not.toBe(hauntKey(lobby));
    expect(nextHaunt(yoshi, { kind: "office" }, () => 0)).toEqual(lobby);
    expect(nextHaunt(yoshi, { kind: "office" }, () => 0.99)).toEqual({ kind: "outside" });
  });

  it("dwells within the range for the kind of place", () => {
    expect(dwell("room", () => 0)).toBe(2 * 60_000);
    expect(dwell("room", () => 0.999)).toBeLessThan(4 * 60_000);
    expect(dwell("office", () => 0)).toBeGreaterThan(dwell("room", () => 0));
  });

  it("wanders the lobby inside the walls, below the top wall, clear of the lift", () => {
    const area = WANDER_AREAS.lobby;
    expect(area.x).toBeGreaterThanOrEqual(TILE);
    expect(area.y).toBeGreaterThan(4 * TILE);
    expect(area.x + area.width).toBeLessThan((WIDTH - 2) * TILE);
    // Never into the notch below the left part.
    expect(area.y + area.height).toBeLessThanOrEqual((CUTOUT.y - 1) * TILE);
  });

  it("wanders a store, a warehouse and a garage inside their walls", () => {
    for (const area of [WANDER_AREAS.store, WANDER_AREAS.warehouse, WANDER_AREAS.garage]) {
      expect(area.x).toBeGreaterThanOrEqual(TILE);
      expect(area.y).toBeGreaterThan(3 * TILE);
      expect(area.x + area.width).toBeLessThan((FLOOR_COLS - 1) * TILE);
      expect(area.y + area.height).toBeLessThan((FLOOR_ROWS - 1) * TILE);
    }
  });

  it("stays put at the desk, outside and on the yard", () => {
    expect(wanderArea({ kind: "office" })).toBeNull();
    expect(wanderArea({ kind: "outside" })).toBeNull();
    expect(wanderArea({ kind: "campus", campus: "homestar" })).toBeNull();
  });

  it("stands on the paved yard of the campus", () => {
    const yard = yardArea("homestar");
    const paved = CAMPUSES.homestar.paved[0];
    expect(yard.width).toBeGreaterThan(0);
    // Feet inside the paving, top to bottom.
    expect(yard.y).toBeGreaterThan(paved.y * TILE);
    expect(yard.y + yard.height).toBeLessThan((paved.y + paved.height) * TILE);
    expect(yardArea("nowhere").width).toBe(0);
  });

  it("has a place by the fountain and one by its own building", () => {
    const spots = outsideSpots(mark);
    expect(spots).toHaveLength(2);
    expect(spots[1].x).toBeGreaterThan(spots[0].x);
    // Each resident's fountain place is its own.
    const fountain = RESIDENTS.map((r) => outsideSpots(r)[0].x);
    expect(new Set(fountain).size).toBe(RESIDENTS.length);
  });
});
