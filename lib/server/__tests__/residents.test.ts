import { describe, expect, it } from "vitest";
import { PresenceHub } from "../presence-hub";
import { ResidentSimulation, presenceIdFor } from "../residents";
import {
  RESIDENTS,
  WANDER_AREAS,
  WORLD_WANDER_SPOTS,
  deskSpot,
  residentById,
} from "../../world/residents";
import { worldSolids } from "../../world/scenery";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../world/tenants";
import { WORLD_ROOM_SLUG } from "../../rooms";
import { HELP_COUNTER, TILE } from "../../map/office";
import { FRAME_HEIGHT } from "../../../components/game/config/animations";
import { facingFor } from "../../facing";

const yoshi = RESIDENTS[0];
const mark = residentById("mark")!;
const steve = residentById("steve")!;
const doc = residentById("doc")!;

/**
 * @param now the same clock the simulation is driven by.
 *
 * Passing it matters. A hub clamps how far a player may move per unit of
 * wall-clock time — it is what stops a client teleporting — so a hub left on
 * `Date.now()` while the simulation is stepped by a fake clock allows almost
 * no movement at all, and every resident appears to stand still.
 */
function world(now: () => number = () => Date.now()) {
  const rooms = new Map<string, { hub: PresenceHub }>();
  const host = {
    roomFor(slug: string) {
      let room = rooms.get(slug);
      if (!room) {
        room = { hub: new PresenceHub({ now }) };
        rooms.set(slug, room);
      }
      return room;
    },
  };
  return { rooms, host };
}

describe("a resident's day", () => {
  it("starts in the office as a resident, not a person", () => {
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, {
      now: () => 0,
      random: () => 0.5,
      startAt: "office",
    });
    const office = rooms.get("castle-atlantic-floor-2")!;
    const player = office.hub.snapshot().find((p) => p.id === presenceIdFor(yoshi))!;
    expect(player.name).toBe("Yoshi");
    expect(player.x).toBe(deskSpot(yoshi).x);
    expect(player.facing).toBe("up");
    expect(player.resident).toBe(true);
    expect(player.spriteKey).toBe(yoshi.spriteKey);
    expect(office.hub.count).toBe(0);
    expect(sim.whereabouts()[0].place).toBe("office");
  });

  it("wanders inside the room's walkable area", () => {
    let clock = 0;
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.9,
      startAt: "room",
    });
    const area = WANDER_AREAS.lobby;
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms.get("castle-atlantic")!.hub.snapshot()[0];
      expect(player.x).toBeGreaterThanOrEqual(area.x);
      expect(player.x).toBeLessThanOrEqual(area.x + area.width);
      expect(player.y).toBeGreaterThanOrEqual(area.y);
      expect(player.y).toBeLessThanOrEqual(area.y + area.height);
    }
  });

  it("moves on when the dwell is up, and leaves the room behind", () => {
    let clock = 0;
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0,
      startAt: "room",
    });
    expect(rooms.get("castle-atlantic")!.hub.has(presenceIdFor(yoshi))).toBe(true);
    clock = 3 * 60_000;
    sim.tick(clock);
    // random 0 picks the first other place: the office.
    expect(sim.whereabouts()[0].place).toBe("office");
    expect(rooms.get("castle-atlantic")!.hub.has(presenceIdFor(yoshi))).toBe(false);
    expect(rooms.get("castle-atlantic-floor-2")!.hub.has(presenceIdFor(yoshi))).toBe(true);
  });

  it("is in no room while outside", () => {
    let clock = 0;
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.99,
      startAt: "room",
    });
    clock = 5 * 60_000;
    sim.tick(clock);
    expect(sim.whereabouts()[0].place).toBe("outside");
    expect(sim.whereabouts()[0].room).toBeNull();
    expect(sim.whereabouts()[0].spot).not.toBeNull();
    for (const room of rooms.values()) expect(room.hub.has(presenceIdFor(yoshi))).toBe(false);
  });

  it("puts Steve in the warehouse and Mark at his Sales desk to begin with", () => {
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, { now: () => 0, random: () => 0.5 });
    // Steve has no desk: his first haunt stands in for the office.
    expect(rooms.get("chester-warehouse")!.hub.has(presenceIdFor(steve))).toBe(true);
    expect(rooms.get("homestar-sales-floor-2")!.hub.has(presenceIdFor(mark))).toBe(true);
    const marks = sim.whereabouts().find((w) => w.id === "mark")!;
    expect(marks.place).toBe("office");
    expect(marks.room).toBe("homestar-sales-floor-2");
  });

  it("stands Mark somewhere on the yard when he is on the campus", () => {
    let clock = 0;
    const { host } = world();
    // A fixed but varied sequence, so his day takes him round every haunt.
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const sim = new ResidentSimulation(host, { now: () => clock, random });
    // Walk his day until he reaches the yard.
    let onYard = null;
    for (let i = 0; i < 200 && !onYard; i++) {
      clock += 9 * 60_000;
      sim.tick(clock);
      const where = sim.whereabouts().find((w) => w.id === "mark")!;
      if (where.place === "campus") onYard = where;
    }
    expect(onYard).not.toBeNull();
    expect(onYard!.campus).toBe("homestar");
    expect(onYard!.room).toBeNull();
    expect(onYard!.spot!.x).toBeGreaterThan(0);
  });

  it("rejoins a room that was closed and reopened", () => {
    let clock = 0;
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.5,
      startAt: "room",
    });
    rooms.delete("castle-atlantic");
    clock += 120;
    sim.tick(clock);
    expect(rooms.get("castle-atlantic")!.hub.has(presenceIdFor(yoshi))).toBe(true);
  });
});

describe("a wanderer's day", () => {
  const michael = residentById("michael")!;
  /** A fixed but varied sequence, so the walk is not one direction forever. */
  const seeded = (seed: number) => () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  /** Long enough to cross the map several times at the wander speed. */
  function walkFor(ticks: number, random = seeded(11)) {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, { now: () => clock, random, startAt: "room" });
    const been: { x: number; y: number }[] = [];
    for (let i = 0; i < ticks; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms
        .get(WORLD_ROOM_SLUG)!
        .hub.snapshot()
        .find((p) => p.id === presenceIdFor(michael));
      if (player) been.push({ x: player.x, y: player.y });
    }
    return { been, sim };
  }

  it("starts on one of the twenty places", () => {
    const { been } = walkFor(1);
    expect(WORLD_WANDER_SPOTS).toContainEqual(been[0]);
  });

  /**
   * The point of the twenty. A strip of road walked back and forth read as
   * pacing; crossing the map is what makes it look like wandering.
   */
  it("gets right across the map, not up and down one street", () => {
    const { been } = walkFor(6000);
    const xs = been.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(WORLD_WIDTH / 2);
  });

  it("reaches several different places", () => {
    const { been } = walkFor(6000);
    const visited = WORLD_WANDER_SPOTS.filter((spot) =>
      been.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < 1),
    );
    expect(visited.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Nothing collides a resident, so the route is the only thing keeping a
   * chicken out of the walls and the sea. Checked over the whole walk, since
   * a straight line between two spots crosses two head offices.
   */
  it("never walks through a building, a prop or the water", () => {
    const { been } = walkFor(6000);
    const solids = worldSolids();
    for (const at of been) {
      const inside = solids.find(
        (s) => at.x >= s.x && at.x <= s.x + s.width && at.y >= s.y && at.y <= s.y + s.height,
      );
      expect(inside, `${Math.round(at.x)},${Math.round(at.y)}`).toBeUndefined();
    }
  });

  it("stays on the map", () => {
    const { been } = walkFor(4000);
    for (const at of been) {
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(WORLD_WIDTH);
      expect(at.y).toBeLessThanOrEqual(WORLD_HEIGHT);
    }
  });

  /** A wanderer has one haunt, so they must never blink out of the world. */
  it("stays in the world map's room the whole time", () => {
    const { been, sim } = walkFor(4000);
    expect(been).toHaveLength(4000);
    expect(sim.whereabouts().find((w) => w.id === "michael")!.room).toBe(WORLD_ROOM_SLUG);
  });

  it("faces the way it is walking", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: seeded(3),
      startAt: "room",
    });
    let checked = 0;
    let last: { x: number; y: number } | null = null;
    for (let i = 0; i < 3000; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms
        .get(WORLD_ROOM_SLUG)!
        .hub.snapshot()
        .find((p) => p.id === presenceIdFor(michael))!;
      if (last && player.moving) {
        const dx = player.x - last.x;
        const dy = player.y - last.y;
        const expected = facingFor(dx, dy);
        if (expected) {
          expect(player.facing, `step ${i}`).toBe(expected);
          checked += 1;
        }
      }
      last = { x: player.x, y: player.y };
    }
    expect(checked).toBeGreaterThan(100);
  });
});

/** A deterministic stand-in for Math.random that actually varies. */
function rolls(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("someone on a station", () => {
  /**
   * Doc's day is the counter and the map, nothing between, so `startAt` has
   * no office to find for him and hands back his first haunt — the post.
   */
  it("opens the lobby and stands at the post, facing the room", () => {
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, { now: () => 0, random: () => 0.5 });
    const lobby = rooms.get("sandbox-erp")!;
    const player = lobby.hub.snapshot().find((p) => p.id === presenceIdFor(doc))!;
    expect(player.name).toBe("Doc");
    expect(player.x).toBe(doc.station!.x);
    expect(player.y).toBe(doc.station!.y);
    expect(player.facing).toBe("down");
    expect(player.resident).toBe(true);
    // A resident is nobody's seat and takes none of the room's four places.
    expect(lobby.hub.count).toBe(0);
    expect(sim.whereabouts().find((w) => w.id === "doc")!.place).toBe("station");
  });

  /**
   * Pacing, which is the wander-by-bounds code with the counter's own patch of
   * floor instead of the room's. Nothing collides a resident, so staying
   * inside the patch is the only thing keeping him out of his own desk.
   */
  it("paces the patch round the counter without leaving it", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    // A varying source, not a constant: handed the same number every time he
    // picks the same point to walk to, arrives on the spot he is standing on
    // and never sets off again — which measures the stub, not the pacing.
    const sim = new ResidentSimulation(host, { now: () => clock, random: rolls() });
    const paces = doc.station!.paces!;
    const seen = new Set<string>();
    let moved = 0;
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms
        .get("sandbox-erp")!
        .hub.snapshot()
        .find((p) => p.id === presenceIdFor(doc))!;
      expect(player.x).toBeGreaterThanOrEqual(paces.x);
      expect(player.x).toBeLessThanOrEqual(paces.x + paces.width);
      expect(player.y).toBeGreaterThanOrEqual(paces.y);
      expect(player.y).toBeLessThanOrEqual(paces.y + paces.height);
      seen.add(`${Math.round(player.x)},${Math.round(player.y)}`);
      if (player.moving) moved++;
    }
    // He walks, rather than standing at the post for the whole shift.
    expect(moved).toBeGreaterThan(50);
    expect(seen.size).toBeGreaterThan(20);
  });

  /** The counter is drawn over him, so a step into it is a step out of sight. */
  it("never paces into the counter itself", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, { now: () => clock, random: () => 0.35 });
    const counter = HELP_COUNTER.region;
    const box = {
      x: counter.dx * TILE,
      y: counter.dy * TILE,
      right: (counter.dx + counter.sw) * TILE,
      bottom: (counter.dy + counter.sh) * TILE,
    };
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms
        .get("sandbox-erp")!
        .hub.snapshot()
        .find((p) => p.id === presenceIdFor(doc))!;
      // The sheet's bottom edge, which is what would show through the desk.
      const feet = player.y + FRAME_HEIGHT / 2;
      const over =
        player.x >= box.x && player.x <= box.right && feet > box.y && player.y < box.bottom;
      expect(over, `${player.x},${player.y}`).toBe(false);
    }
  });

  /**
   * Off for a wander and back again. Everything is scaled down so a stay is
   * over in a few ticks; what is being checked is that he leaves the lobby's
   * hub when he goes and is a walker on the world map when he gets there.
   */
  it("goes out to the map and comes back behind the counter", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.5,
      dwellScale: 0.0001,
    });
    const seen = new Set<string>();
    let awayFromLobby = false;
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
      const place = sim.whereabouts().find((w) => w.id === "doc")!.place;
      seen.add(place);
      const lobby = rooms.get("sandbox-erp")!.hub.snapshot();
      if (place === "room") {
        // Gone: out of the lobby altogether, and on the map with the walkers.
        expect(lobby.some((p) => p.id === presenceIdFor(doc))).toBe(false);
        expect(
          rooms
            .get(WORLD_ROOM_SLUG)!
            .hub.snapshot()
            .some((p) => p.id === presenceIdFor(doc)),
        ).toBe(true);
        awayFromLobby = true;
      } else {
        const player = lobby.find((p) => p.id === presenceIdFor(doc))!;
        expect(player.x).toBe(doc.station!.x);
      }
    }
    expect([...seen].sort()).toEqual(["room", "station"]);
    expect(awayFromLobby).toBe(true);
  });
});
