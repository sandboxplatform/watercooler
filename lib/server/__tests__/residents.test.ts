import { describe, expect, it } from "vitest";
import { PresenceHub } from "../presence-hub";
import {
  GREET_CLEAR_PX,
  GREET_PX,
  GREET_QUIET_MS,
  LEAVE_WALK_MS,
  ResidentSimulation,
  SPOOK_MS,
  SPOOK_SPEED_PX_S,
  WANDER_SPEED_PX_S,
  presenceIdFor,
} from "../residents";
import {
  PERSONAL_SPACE_PX,
  RESIDENTS,
  WANDER_AREAS,
  WORLD_WANDER_SPOTS,
  deskSpot,
  doorstepOf,
  doorwayFor,
  hauntsOf,
  outsideSpots,
  residentById,
  roomToStand,
  yardArea,
  type Whereabouts,
} from "../../world/residents";
import { worldSolids } from "../../world/scenery";
import { EGG_CHANCE } from "../../world/eggs";
import { routeAcross, type Point } from "../../world/route";
import { WORLD_HEIGHT, WORLD_WIDTH, operationsRoomCount, tenantFor } from "../../world/tenants";
import { WORLD_ROOM_SLUG } from "../../rooms";
import { TILE } from "../../map/office";
import { opsSupportRoom } from "../../map/floor";
import { FRAME_HEIGHT } from "../../../components/game/config/animations";
import { facingFor } from "../../facing";
import { setRoomBroadcast } from "../room-broadcast";

const yoshi = RESIDENTS[0];
const mark = residentById("mark")!;
const steve = residentById("steve")!;
const doc = residentById("doc")!;
const michael = residentById("michael")!;

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

  /**
   * The world map is a room like any other, so somebody taking the air is a
   * player on it — walked by the server, seen in the same place by everyone
   * looking. They used to be in no room at all out there, drawn by each
   * browser at a spot the server named, which is what let two of them be
   * drawn at the same spot.
   */
  it("joins the world map's room when it goes outside, by its own front door", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.99,
      startAt: "room",
    });
    clock = 5 * 60_000;
    sim.tick(clock);
    const where = sim.whereabouts()[0];
    expect(where.place).toBe("outside");
    expect(where.room).toBe(WORLD_ROOM_SLUG);
    const player = rooms
      .get(WORLD_ROOM_SLUG)!
      .hub.snapshot()
      .find((p) => p.id === presenceIdFor(yoshi))!;
    expect(player.resident).toBe(true);
    // On the doorstep of Castle Atlantic, which is where he came out.
    expect(player).toMatchObject(doorstepOf(yoshi)!);
    expect(rooms.get("castle-atlantic")!.hub.has(presenceIdFor(yoshi))).toBe(false);
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
    // A yard is a room too, so the people on it see him walk about it.
    expect(onYard!.room).toBe("campus-homestar");
    const yard = yardArea("homestar");
    expect(onYard!.spot!.x).toBeGreaterThanOrEqual(yard.x);
    expect(onYard!.spot!.x).toBeLessThanOrEqual(yard.x + yard.width);
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
        // A step at a dead-even 45° is not a fair question here. The hub
        // rounds a position to a hundredth for the wire, `facingFor` breaks
        // an exact diagonal towards the horizontal, and the resident faced
        // by the full-precision figures — so a leg that happens to run at
        // exactly 45°, which a route across a grid of square cells throws
        // up now and then, is decided one way by the simulation and the
        // other by a hundredth of a pixel of rounding.
        const even = Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.02;
        if (expected && !even) {
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
   * Doc's day is Support and the map, nothing between, so `startAt` has
   * no office to find for him and hands back his first haunt — the post.
   */
  it("opens the room and stands at the post, facing into it", () => {
    const { rooms, host } = world();
    const sim = new ResidentSimulation(host, { now: () => 0, random: () => 0.5 });
    const lobby = rooms.get(doc.station!.room)!;
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
  it("paces the patch in Support without leaving it", () => {
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
        .get(doc.station!.room)!
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

  /**
   * Nothing collides a resident, so the bounds are all that keep him inside
   * Support: out through the top is the wall his own boards hang on, out
   * through the bottom is the corridor.
   */
  it("never paces out through Support's walls", () => {
    let clock = 0;
    const { rooms, host } = world(() => clock);
    const sim = new ResidentSimulation(host, { now: () => clock, random: () => 0.35 });
    const room = opsSupportRoom(operationsRoomCount(tenantFor("sandbox-erp")));
    const walls = {
      left: room.x * TILE,
      right: (room.x + 14) * TILE,
      top: room.y * TILE,
      bottom: (room.y + 7) * TILE,
    };
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
      const player = rooms
        .get(doc.station!.room)!
        .hub.snapshot()
        .find((p) => p.id === presenceIdFor(doc))!;
      // The sheet's bottom edge, which is what would show through a wall.
      const feet = player.y + FRAME_HEIGHT / 2;
      expect(player.x, `${player.x},${player.y}`).toBeGreaterThan(walls.left);
      expect(player.x, `${player.x},${player.y}`).toBeLessThan(walls.right);
      expect(player.y, `${player.x},${player.y}`).toBeGreaterThan(walls.top);
      expect(feet, `${player.x},${player.y}`).toBeLessThan(walls.bottom);
    }
  });

  /**
   * Off for a wander and back again. Everything is scaled down so a stay is
   * over in a few ticks; what is being checked is that he leaves the lobby's
   * hub when he goes and is a walker on the world map when he gets there.
   */
  it("goes out to the map and comes back to the post", () => {
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
      const lobby = rooms.get(doc.station!.room)!.hub.snapshot();
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

/**
 * Doc remarks on arriving somewhere, and what he says depends on where he
 * is: at his post in Support, or off for a wander.
 *
 * It goes out over the same broadcast a person's speech is relayed on, so
 * the room draws it in an ordinary bubble without knowing he is not a
 * person. Nothing is said when no socket is attached — every other test in
 * this file runs that way, and a resident talking to an empty process is
 * not worth a crash.
 */
describe("what a resident says", () => {
  function listening() {
    const heard: { room: string; text: string; from: string }[] = [];
    setRoomBroadcast((room, message) => {
      if (message.type !== "said") return;
      heard.push({ room, text: message.text, from: message.from.id });
    });
    return heard;
  }

  it("says the on-duty line on arriving at the post", () => {
    const heard = listening();
    const { host } = world();
    new ResidentSimulation(host, { now: () => 0, random: () => 0.5 });
    const mine = heard.filter((h) => h.from === presenceIdFor(doc));
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toBe("I'm about to be hooked up to Mettara!");
    expect(mine[0].room).toBe(doc.station!.room);
    setRoomBroadcast(null);
  });

  it("says the fresh-air line once he is off the floor", () => {
    let clock = 0;
    const heard = listening();
    const { host } = world(() => clock);
    const sim = new ResidentSimulation(host, {
      now: () => clock,
      random: () => 0.5,
      dwellScale: 0.0001,
    });
    for (let i = 0; i < 400; i++) {
      clock += 120;
      sim.tick(clock);
    }
    const said = new Set(heard.filter((h) => h.from === presenceIdFor(doc)).map((h) => h.text));
    expect(said).toContain("I just needed some fresh air!");
    expect(said).toContain("I'm about to be hooked up to Mettara!");
    setRoomBroadcast(null);
  });

  /** Everyone else walks past without a word. */
  it("leaves the residents with no lines silent", () => {
    const heard = listening();
    const { host } = world();
    new ResidentSimulation(host, { now: () => 0, random: () => 0.5 });
    expect(heard.every((h) => h.from === presenceIdFor(doc))).toBe(true);
    setRoomBroadcast(null);
  });
});

/**
 * Michael says his one word to whoever walks up to him.
 *
 * Unlike Doc's remarks it is not something the resident does on his own
 * account: it is an answer to somebody arriving, so what has to hold is that
 * it goes off once for an arrival rather than once a tick for as long as
 * they stand there — and that the residents milling about outside are not
 * arrivals.
 */
describe("what a resident says when you walk up", () => {
  function listening() {
    const heard: { room: string; text: string; from: string }[] = [];
    setRoomBroadcast((room, message) => {
      if (message.type !== "said") return;
      heard.push({ room, text: message.text, from: message.from.id });
    });
    return heard;
  }

  /**
   * A simulation with Michael out on the map, and the map's hub to hand.
   *
   * The fixed roll suits everything about the greeting, which does not care
   * where he walks; anything about the bolt wants a varied one, since a
   * constant sends him the same way every time by construction.
   */
  function outside(clock: () => number, random: () => number = () => 0.5) {
    const { rooms, host } = world(clock);
    const sim = new ResidentSimulation(host, { now: clock, random });
    return { sim, hub: rooms.get(WORLD_ROOM_SLUG)!.hub };
  }

  function whereIsHe(sim: ResidentSimulation): { x: number; y: number } {
    const spot = sim.whereabouts().find((w) => w.id === michael.id)!.spot;
    if (!spot) throw new Error("Michael is nowhere");
    return spot;
  }

  const clucks = (heard: { from: string }[]) =>
    heard.filter((h) => h.from === presenceIdFor(michael)).length;

  function person(hub: PresenceHub, at: { x: number; y: number }) {
    hub.join("visitor", {
      name: "Coop",
      spriteKey: "character_boss",
      x: at.x,
      y: at.y,
      facing: "down",
    });
  }

  it("clucks when somebody stands next to him", () => {
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    person(hub, whereIsHe(sim));
    clock += 120;
    sim.tick(clock);
    const mine = heard.filter((h) => h.from === presenceIdFor(michael));
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toBe("Cluck!");
    expect(mine[0].room).toBe(WORLD_ROOM_SLUG);
    setRoomBroadcast(null);
  });

  it("says nothing to somebody across the map", () => {
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    const him = whereIsHe(sim);
    person(hub, { x: him.x + GREET_CLEAR_PX * 4, y: him.y });
    for (let i = 0; i < 20; i++) {
      clock += 120;
      sim.tick(clock);
    }
    expect(clucks(heard)).toBe(0);
    setRoomBroadcast(null);
  });

  /** One cluck for the arrival, not one a tick for as long as they stay. */
  it("does not cluck at somebody who is already there", () => {
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    person(hub, whereIsHe(sim));
    for (let i = 0; i < 40; i++) {
      clock += 120;
      sim.tick(clock);
      // Follow him about, so it is the same visit throughout rather than
      // him wandering out of earshot and back into it.
      hub.place("visitor", { ...whereIsHe(sim), facing: "down" });
    }
    expect(clock).toBeLessThan(GREET_QUIET_MS);
    expect(clucks(heard)).toBe(1);
    setRoomBroadcast(null);
  });

  it("clucks again for somebody who went away and came back", () => {
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    person(hub, whereIsHe(sim));
    clock += 120;
    sim.tick(clock);
    expect(clucks(heard)).toBe(1);

    hub.leave("visitor");
    while (clock < GREET_QUIET_MS * 2) {
      clock += 120;
      sim.tick(clock);
    }
    expect(clucks(heard)).toBe(1);

    person(hub, whereIsHe(sim));
    clock += 120;
    sim.tick(clock);
    expect(clucks(heard)).toBe(2);
    setRoomBroadcast(null);
  });

  /** The others out taking the air are the simulation, not company. */
  it("is not set off by the other residents", () => {
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    const him = whereIsHe(sim);
    hub.join("resident:someone-else", {
      name: "Bud",
      spriteKey: "character_bud",
      x: him.x,
      y: him.y,
      facing: "down",
      resident: true,
    });
    for (let i = 0; i < 20; i++) {
      clock += 120;
      sim.tick(clock);
    }
    expect(clucks(heard)).toBe(0);
    setRoomBroadcast(null);
  });

  /**
   * The fright is the other half of the cluck: he is off, and he is quick
   * about it. Measured over a stretch of the five seconds rather than one
   * tick, since a dash that ends mid-tick is a short step.
   */
  it("bolts when he clucks", () => {
    let clock = 0;
    listening();
    const { sim, hub } = outside(() => clock);
    const start = whereIsHe(sim);
    person(hub, start);
    let furthest = 0;
    while (clock < SPOOK_MS) {
      clock += 120;
      sim.tick(clock);
      const now = whereIsHe(sim);
      furthest = Math.max(furthest, Math.hypot(now.x - start.x, now.y - start.y));
    }
    // A stroll for the same five seconds could not have got him this far.
    expect(furthest).toBeGreaterThan((WANDER_SPEED_PX_S * SPOOK_MS) / 1000);
    setRoomBroadcast(null);
  });

  /**
   * A cluck is a fright, and a fright goes the other way.
   *
   * Put as the distance from where whoever startled him was standing rather
   * than as a compass direction, because the dashes wobble either side of
   * straight away: what has to hold is that the bolt is putting ground
   * between the two of them, not that any one dash points anywhere exact.
   * Run from both sides of him, since a bolt that always went east would
   * pass this from one of them by luck.
   */
  it("runs away from whoever startled him", () => {
    for (const side of [-1, 1]) {
      let clock = 0;
      listening();
      const { sim, hub } = outside(() => clock, rolls(7));
      const start = whereIsHe(sim);
      const them = { x: start.x + side * (GREET_PX - 12), y: start.y };
      person(hub, them);
      const apart = Math.hypot(start.x - them.x, start.y - them.y);
      let nearest = Infinity;
      let afterASecond: { x: number; y: number } | null = null;
      while (clock < SPOOK_MS) {
        clock += 120;
        sim.tick(clock);
        const at = whereIsHe(sim);
        nearest = Math.min(nearest, Math.hypot(at.x - them.x, at.y - them.y));
        afterASecond ??= clock >= 1000 ? at : null;
      }
      const ended = whereIsHe(sim);
      // He sets off the other way: somebody standing to his west leaves him
      // east of where he was. Said of the first second rather than of the
      // finish, because a dash is planned around what is in the way — over
      // five seconds of it the route bends round trees and buildings and
      // the compass bearing of the whole bolt is the map's answer, not this
      // rule's.
      expect(Math.sign(afterASecond!.x - start.x)).toBe(-side);
      // And at no point in the fright is he nearer them than when he
      // clucked, which a bolt in no particular direction would not manage.
      expect(nearest).toBeGreaterThanOrEqual(apart);
      expect(Math.hypot(ended.x - them.x, ended.y - them.y)).toBeGreaterThan(apart * 10);
    }
    setRoomBroadcast(null);
  });

  /**
   * Two people within earshot, and the fright is the near one's.
   *
   * The far one is inside the reach too and joined first, so a rule that
   * took whoever it came across first would send him straight past the
   * person standing on top of him. Which is why the hub is asked for the
   * nearest rather than for any.
   */
  it("runs from the nearer of two people", () => {
    let clock = 0;
    listening();
    const { sim, hub } = outside(() => clock, rolls(7));
    const start = whereIsHe(sim);
    const stand = (id: string, x: number) =>
      hub.join(id, { name: id, spriteKey: "character_boss", x, y: start.y, facing: "down" });
    stand("far", start.x - (GREET_PX - 6));
    stand("near", start.x + 20);
    while (clock < SPOOK_MS) {
      clock += 120;
      sim.tick(clock);
    }
    // Away from the near one, which is past the far one rather than from it.
    expect(whereIsHe(sim).x).toBeLessThan(start.x);
    setRoomBroadcast(null);
  });

  /**
   * A fright is a dash, a turn and another dash, not a run to somewhere —
   * so the cone it is aimed into is a third of the circle rather than a
   * bearing, and he comes out of it having faced more than one way.
   */
  it("scrambles rather than running a line", () => {
    let clock = 0;
    listening();
    const { sim, hub } = outside(() => clock, rolls(5));
    person(hub, whereIsHe(sim));
    let last = whereIsHe(sim);
    const ways = new Set<string>();
    while (clock < SPOOK_MS) {
      clock += 120;
      sim.tick(clock);
      const now = whereIsHe(sim);
      const way = facingFor(now.x - last.x, now.y - last.y);
      if (way) ways.add(way);
      last = now;
    }
    expect(ways.size).toBeGreaterThan(1);
    setRoomBroadcast(null);
  });

  /** Nothing collides a resident, so a panic is as able to cross a wall as a walk. */
  it("keeps out of the buildings and the sea while he is at it", () => {
    let clock = 0;
    listening();
    const { sim, hub } = outside(() => clock);
    person(hub, whereIsHe(sim));
    const solids = worldSolids();
    while (clock < SPOOK_MS * 2) {
      clock += 120;
      sim.tick(clock);
      const at = whereIsHe(sim);
      const wall = solids.find(
        (s) => at.x >= s.x && at.x <= s.x + s.width && at.y >= s.y && at.y <= s.y + s.height,
      );
      expect(wall, `${Math.round(at.x)},${Math.round(at.y)}`).toBeUndefined();
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(WORLD_WIDTH);
      expect(at.y).toBeLessThanOrEqual(WORLD_HEIGHT);
    }
    setRoomBroadcast(null);
  });

  /** And then the day goes on: a stroll, at the speed of one. */
  it("is back to a wander five seconds later", () => {
    let clock = 0;
    listening();
    const { sim, hub } = outside(() => clock);
    person(hub, whereIsHe(sim));
    while (clock < SPOOK_MS) {
      clock += 120;
      sim.tick(clock);
    }
    // The bolt's own pace, for comparison: it is quicker than the walk that
    // follows it, which is the whole of `spooked` being over.
    expect(SPOOK_SPEED_PX_S).toBeGreaterThan(WANDER_SPEED_PX_S);
    // And whoever gave him the fright goes away, or the quiet period runs
    // out while he is being watched and he is off again — which is the rule
    // above working rather than this one failing.
    hub.leave("visitor");
    let last = whereIsHe(sim);
    let furthest = 0;
    for (let i = 0; i < 200; i++) {
      clock += 120;
      sim.tick(clock);
      const now = whereIsHe(sim);
      furthest = Math.max(furthest, Math.hypot(now.x - last.x, now.y - last.y));
      last = now;
    }
    const stroll = (WANDER_SPEED_PX_S * 120) / 1000;
    expect(furthest).toBeLessThanOrEqual(stroll + 0.001);
    expect(furthest).toBeGreaterThan(0);
    setRoomBroadcast(null);
  });

  /** The reach is a walk-up, and letting go of somebody is wider than taking hold. */
  it("hears people at arm's length and no further", () => {
    expect(GREET_PX).toBeLessThan(GREET_CLEAR_PX);
    let clock = 0;
    const heard = listening();
    const { sim, hub } = outside(() => clock);
    const him = whereIsHe(sim);
    person(hub, { x: him.x + GREET_PX + GREET_CLEAR_PX, y: him.y });
    clock += 120;
    sim.tick(clock);
    expect(clucks(heard)).toBe(0);
    hub.place("visitor", { ...whereIsHe(sim), facing: "down" });
    clock += 120;
    sim.tick(clock);
    expect(clucks(heard)).toBe(1);
    setRoomBroadcast(null);
  });
});

/**
 * The two rules that keep a resident one person in one place.
 *
 * Sara and Bud stood inside each other on the grass outside Sandbox ERP:
 * both had their building's doorstep as a place to stand outside, both were
 * sent to it, and nothing anywhere asked whether it was taken. Neither of
 * them walked there either — outside was drawn rather than walked, so they
 * simply appeared, and appeared somewhere else when their stay was up.
 *
 * A whole day is driven here rather than a moment of one, because both
 * faults needed two residents to want the same thing at the same time,
 * which is a thing that happens between one stay and the next.
 */
describe("keeping out of each other", () => {
  const seeded = (seed: number) => () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  /** Everybody's whereabouts, tick by tick, at the rate the server ticks. */
  function aDay(ticks: number, dwellScale = 0.02, random = seeded(19)) {
    let clock = 0;
    const { host } = world(() => clock);
    const sim = new ResidentSimulation(host, { now: () => clock, random, dwellScale });
    const frames: Whereabouts[][] = [];
    for (let i = 0; i < ticks; i++) {
      clock += 120;
      sim.tick(clock);
      frames.push(sim.whereabouts());
    }
    return frames;
  }

  it("never puts two of them in the same space, wherever they are", () => {
    for (const [tick, frame] of aDay(3000).entries()) {
      for (const [i, one] of frame.entries()) {
        for (const other of frame.slice(i + 1)) {
          if (one.room !== other.room || !one.room) continue;
          expect(
            roomToStand(one.spot!, [other.spot!]),
            `${one.name} and ${other.name} in ${one.room} at tick ${tick}`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * Nobody jumps. A resident's position may only change by what a walk
   * covers in a tick, for as long as they stay in one place — the hub
   * clamps a *reported* move to walking speed, so this is asked of the
   * simulation's own idea of where everybody is, which nothing clamps.
   *
   * A bolt is quicker than a walk, and there is nobody in these rooms to
   * set one off: a day with no people in it is walking pace throughout.
   */
  it("moves nobody further in a tick than a walk covers", () => {
    const stride = (WANDER_SPEED_PX_S * 120) / 1000;
    const frames = aDay(3000);
    for (let tick = 1; tick < frames.length; tick++) {
      for (const [i, now] of frames[tick].entries()) {
        const before = frames[tick - 1][i];
        // A change of room is a door, not a step across the ground.
        if (before.room !== now.room) continue;
        const step = Math.hypot(now.spot!.x - before.spot!.x, now.spot!.y - before.spot!.y);
        expect(step, `${now.name} in ${now.room} at tick ${tick}`).toBeLessThanOrEqual(
          stride + 0.001,
        );
      }
    }
  });

  /**
   * Out of doors they come and go by their own front door: the walk across
   * the green is part of leaving, so the last thing anybody sees of them is
   * stepping inside rather than winking out on the grass.
   */
  /**
   * The backstop has to be longer than the longest honest walk.
   *
   * `LEAVE_WALK_MS` is there for a resident who *cannot* reach their door —
   * blocked by somebody who will not move, or no route to plan — and it is
   * the wrong answer for one who simply has a long way to go: they go
   * indoors from wherever they got to, which is the fault it exists to
   * prevent rather than a smaller version of it. Yash walks from the row by
   * the fountain to Mettara's door in the far south-west and that is
   * thirty-five seconds; the limit was thirty, so he never once arrived.
   * Measured off the map rather than remembered, so a building put further
   * out fails here instead of on somebody's screen.
   */
  it("leaves long enough for the longest walk home", () => {
    const solids = worldSolids();
    const map = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    let longest = 0;
    for (const resident of RESIDENTS) {
      const outside = hauntsOf(resident).find((h) => h.kind === "outside");
      const door = outside && doorwayFor(resident, outside);
      if (!door) continue;
      for (const spot of outsideSpots(resident)) {
        const route = routeAcross(map, solids, spot, door);
        expect(route, `${resident.name} cannot reach his own door`).not.toBeNull();
        let walk = 0;
        let at = spot;
        for (const leg of route!) {
          walk += Math.hypot(leg.x - at.x, leg.y - at.y);
          at = leg;
        }
        longest = Math.max(longest, (walk / WANDER_SPEED_PX_S) * 1000);
      }
    }
    expect(longest).toBeGreaterThan(0);
    // Half as long again, for the moments they stand aside for each other.
    expect(LEAVE_WALK_MS).toBeGreaterThan(longest * 1.5);
  });

  it("comes out of its own door and walks back to it before going in", () => {
    const frames = aDay(6000, 0.5, seeded(5));
    let arrivals = 0;
    let departures = 0;
    for (let tick = 1; tick < frames.length; tick++) {
      for (const [i, now] of frames[tick].entries()) {
        const before = frames[tick - 1][i];
        if (before.room === now.room) continue;
        const resident = residentById(now.id)!;
        const door = doorstepOf(resident);
        if (!door) continue;
        // At the door, or the step aside somebody else's arrival costs.
        const atTheDoor = (at: { x: number; y: number }, when: string) =>
          expect(
            Math.hypot(at.x - door.x, at.y - door.y),
            `${now.name} ${when} at ${Math.round(at.x)},${Math.round(at.y)}, tick ${tick}`,
          ).toBeLessThanOrEqual(3 * PERSONAL_SPACE_PX);
        if (now.place === "outside") {
          atTheDoor(now.spot!, "came out");
          arrivals++;
        } else if (before.place === "outside") {
          atTheDoor(before.spot!, "went in from");
          departures++;
        }
      }
    }
    expect(arrivals).toBeGreaterThan(0);
    expect(departures).toBeGreaterThan(0);
  });
});

/**
 * The one thing a fright leaves behind.
 *
 * The simulation's whole part in it is deciding *whether* — it holds the
 * fright and the seeded randomness — so that is what is asserted here.
 * What kind of egg it is and what becomes of it belong to the host, and
 * are `lib/server/eggs.ts` and the socket's business.
 */
describe("the egg a fright leaves behind", () => {
  /** A simulation with Michael out on the map, and every laying recorded. */
  function outside(clock: () => number, random: () => number) {
    const { rooms, host } = world(clock);
    const laid: { id: string; room: string; at: Point; by: string | null }[] = [];
    const sim = new ResidentSimulation(
      {
        ...host,
        laid: (id, room, at, by) => laid.push({ id, room, at, by }),
      },
      { now: clock, random },
    );
    return { sim, laid, hub: rooms.get(WORLD_ROOM_SLUG)!.hub };
  }

  function whereIsHe(sim: ResidentSimulation): { x: number; y: number } {
    return sim.whereabouts().find((w) => w.id === michael.id)!.spot!;
  }

  function walkUp(hub: PresenceHub, at: { x: number; y: number }, id = "visitor") {
    hub.join(id, { name: "Coop", spriteKey: "character_boss", x: at.x, y: at.y, facing: "down" });
  }

  it("leaves one where he was standing when the roll pays out", () => {
    let clock = 0;
    setRoomBroadcast(() => {});
    const { sim, hub, laid } = outside(
      () => clock,
      () => EGG_CHANCE / 2,
    );
    const start = whereIsHe(sim);
    walkUp(hub, start);
    clock += 120;
    sim.tick(clock);
    expect(laid).toHaveLength(1);
    expect(laid[0].id).toBe(michael.id);
    expect(laid[0].room).toBe(WORLD_ROOM_SLUG);
    // Where he *was*, not where the bolt has taken him: the egg is dropped
    // as he turns to run, and by the time anybody walks over he is a field
    // away.
    expect(laid[0].at).toEqual({ x: start.x, y: start.y });
    setRoomBroadcast(null);
  });

  it("leaves nothing when it does not", () => {
    let clock = 0;
    setRoomBroadcast(() => {});
    const { sim, hub, laid } = outside(
      () => clock,
      () => 0.5,
    );
    walkUp(hub, whereIsHe(sim));
    clock += 120;
    sim.tick(clock);
    expect(laid).toEqual([]);
    setRoomBroadcast(null);
  });

  /** Whoever caused the fright gets the credit; the badge is theirs to be given. */
  it("names the person who walked up", () => {
    let clock = 0;
    setRoomBroadcast(() => {});
    const { sim, hub, laid } = outside(
      () => clock,
      () => EGG_CHANCE / 2,
    );
    walkUp(hub, whereIsHe(sim), "somebody");
    clock += 120;
    sim.tick(clock);
    expect(laid[0].by).toBe("somebody");
    setRoomBroadcast(null);
  });

  /**
   * One per cluck, and a cluck is one per arrival — so standing there does
   * not fill a basket. The quiet period is the other half of it and is the
   * reason a queue of people is one egg rather than five.
   */
  it("leaves one for the arrival, not one a tick for as long as they stay", () => {
    let clock = 0;
    setRoomBroadcast(() => {});
    const { sim, hub, laid } = outside(
      () => clock,
      () => EGG_CHANCE / 2,
    );
    walkUp(hub, whereIsHe(sim));
    for (let i = 0; i < 40; i++) {
      clock += 120;
      sim.tick(clock);
      hub.place("visitor", { ...whereIsHe(sim), facing: "down" });
    }
    expect(clock).toBeLessThan(GREET_QUIET_MS);
    expect(laid).toHaveLength(1);
    setRoomBroadcast(null);
  });

  /**
   * It is a mode, not a check for a chicken — and it is the only mode in
   * the cast that has it, which is worth saying out loud: a second resident
   * given `lays` starts leaving eggs with no other change anywhere.
   */
  it("is one resident's, by a flag rather than by name", () => {
    expect(michael.lays).toBe(true);
    expect(RESIDENTS.filter((r) => r.lays)).toEqual([michael]);
    // And it only ever fires alongside a greeting, since the egg comes of
    // the fright and the fright comes of the cluck.
    for (const resident of RESIDENTS) {
      if (resident.lays) expect(resident.greeting).toBeTruthy();
    }
  });
});
