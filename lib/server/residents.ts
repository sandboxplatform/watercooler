/**
 * Walks the residents about.
 *
 * Each resident keeps a loose routine through their haunts — the desk,
 * their organisation's rooms, its campus yard, outside — and wherever they
 * are they are a player in that place's presence hub like anyone else, so
 * the people there see them walk. They take no human seat and never time
 * out.
 *
 * Every haunt is a room, the world map and the campuses included, which is
 * what makes a resident one thing rather than two. The map used to be the
 * exception: outside had no room, and each browser asked `/api/residents`
 * where to paint the people standing about on it. Nobody walked out there —
 * they were drawn at a spot, and drawn at another one later — and two of
 * them sent to the same spot stood inside each other for the length of a
 * stay.
 *
 * Two rules keep them out of each other now, and both are here rather than
 * in the drawing, because nothing collides a resident: they are only ever
 * *sent* somewhere nobody is (see `roomToStand`), and a step that would put
 * one on top of somebody is not taken — they wait, and go round or go
 * elsewhere if the way stays blocked.
 *
 * The simulation owns its clock and randomness so it can be driven by hand
 * in tests.
 */

import type { PresenceHub } from "./presence-hub";
import { currentBroadcast } from "./room-broadcast";
import type { Facing } from "../presence-types";
import {
  PERSONAL_SPACE_PX,
  RESIDENTS,
  deskSpot,
  doorwayFor,
  dwell,
  hauntKey,
  hauntsOf,
  nextHaunt,
  outsideSpots,
  roomForHaunt,
  roomToStand,
  wanderArea,
  wanderSpots,
  type Haunt,
  type PlaceKind,
  type Rect,
  type Resident,
  type Whereabouts,
} from "../world/residents";
import { WORLD_ROOM_SLUG } from "../rooms";
import { createLogger } from "../logger";
import { facingFor } from "../facing";
import { routeAcross, type Point } from "../world/route";
import { worldSolids } from "../world/scenery";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../world/tenants";

const log = createLogger("Residents");

/** Slower than a person: nobody wanders at a march. */
export const WANDER_SPEED_PX_S = 55;
const PAUSE_MS: [number, number] = [1500, 4000];
const TICK_MS = 120;
/** A moment to get their bearings on arriving somewhere. */
const ARRIVAL_PAUSE_MS = 800;
/** Near enough to somewhere to count as being there. */
const ARRIVED_PX = 8;
/**
 * How long the walk to the door may take before they simply go.
 *
 * A resident who cannot reach their own doorstep — the way blocked by
 * somebody who will not move, a route that cannot be planned — must not be
 * stuck outside for the rest of the day. Leaving from where they stand is
 * the worse of the two behaviours and the safer one.
 */
const LEAVE_WALK_MS = 30_000;
/** How long they wait for somebody in the way before going somewhere else. */
const MAKE_WAY_MS = 3000;
/** How many places to try before settling for a crowded one. */
const SPACING_TRIES = 8;
/** Which way a step aside goes: along the front of a door, not into it. */
const ASIDE = [1, -1, 2, -2, 3, -3];

export interface ResidentHost {
  /** The room's hub, opening the room if it is not. */
  roomFor(slug: string): { hub: PresenceHub };
}

export interface ResidentOptions {
  now?: () => number;
  random?: () => number;
  /** The kind of haunt every resident starts at; their first of that kind, else their first haunt. */
  startAt?: PlaceKind;
  /** Multiplies every stay; below 1 to watch a whole day go by quickly. */
  dwellScale?: number;
}

interface State {
  resident: Resident;
  haunt: Haunt;
  room: string | null;
  since: number;
  until: number;
  x: number;
  y: number;
  target: Point | null;
  /**
   * The legs still to walk after the current target, for somebody crossing
   * ground that has to be gone round rather than through. Empty everywhere
   * a resident wanders by bounds, where the next corner is the destination.
   */
  legs: Point[];
  pauseUntil: number;
  facing: Facing;
  lastTick: number;
  /**
   * The haunt they are on their way to the door to leave for; null while
   * they are staying put. Set only where the place has a door to walk to.
   */
  leavingFor: Haunt | null;
  /** When to give up on reaching that door and go from where they stand. */
  leaveBy: number;
  /** Since when somebody has been standing in their way; 0 when nobody is. */
  heldSince: number;
}

/**
 * The world map's solids, worked out once.
 *
 * They never change — the buildings, the props' feet, the signs and the sea
 * are all laid out at module load — and a route is planned every time
 * somebody outside picks somewhere new to be, so this is not worth
 * recomputing.
 */
let worldObstacles: Rect[] | null = null;
const obstacles = () => (worldObstacles ??= worldSolids());

function firstHaunt(resident: Resident, kind?: PlaceKind): Haunt {
  const haunts = hauntsOf(resident);
  return haunts.find((h) => h.kind === kind) ?? haunts[0];
}

export const presenceIdFor = (resident: Resident) => `resident:${resident.id}`;

export class ResidentSimulation {
  private states = new Map<string, State>();
  private now: () => number;
  private random: () => number;
  private dwellScale: number;

  constructor(
    private host: ResidentHost,
    options: ResidentOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.dwellScale = options.dwellScale ?? 1;
    const at = this.now();
    for (const resident of RESIDENTS) {
      const haunt = firstHaunt(resident, options.startAt ?? "office");
      const state: State = {
        resident,
        haunt,
        room: null,
        since: at,
        until: at + this.stay(haunt),
        x: 0,
        y: 0,
        target: null,
        legs: [],
        pauseUntil: 0,
        facing: "down",
        lastTick: at,
        leavingFor: null,
        leaveBy: 0,
        heldSince: 0,
      };
      this.states.set(resident.id, state);
      this.arrive(state, haunt, at);
    }
  }

  /** Run on a timer until the returned function is called. */
  start(): () => void {
    const timer = setInterval(() => this.tick(this.now()), TICK_MS);
    timer.unref?.();
    log.info(`${RESIDENTS.map((r) => r.name).join(", ")} clocked in`);
    return () => {
      clearInterval(timer);
      for (const state of this.states.values()) this.leaveRoom(state);
    };
  }

  whereabouts(): Whereabouts[] {
    return [...this.states.values()].map((state) => {
      const { resident, haunt } = state;
      return {
        id: resident.id,
        name: resident.name,
        title: resident.title,
        spriteKey: resident.spriteKey,
        org: resident.org,
        place: haunt.kind,
        room: state.room,
        campus: haunt.kind === "campus" ? haunt.campus : null,
        spot: { x: state.x, y: state.y },
        since: state.since,
      };
    });
  }

  /** One step of everyone's day. */
  tick(now: number) {
    for (const state of this.states.values()) {
      if (state.leavingFor) this.goIfAtTheDoor(state, now);
      else if (now >= state.until) this.moveOn(state, now);
      this.walk(state, now);
      state.lastTick = now;
    }
  }

  private stay(haunt: Haunt): number {
    return Math.max(1000, dwell(haunt.kind, this.random) * this.dwellScale);
  }

  /**
   * Their stay is up: somewhere else, by the door where there is one.
   *
   * Out of doors that walk is part of going rather than something before
   * it, which is why the haunt does not change here — they are still
   * outside, on their way to the door, and anyone watching sees them cross
   * the green and step in.
   */
  private moveOn(state: State, now: number) {
    const next = nextHaunt(state.resident, state.haunt, this.random);
    if (hauntKey(next) === hauntKey(state.haunt)) {
      // Nowhere else to be — a wanderer never goes in. Just carry on
      // walking: leaving and arriving in the same place would snap them
      // back to the middle of it and blink them out of the room.
      state.until = now + this.stay(next);
      return;
    }
    const doorway = doorwayFor(state.resident, state.haunt);
    if (doorway && !this.standingOn(state, doorway)) {
      state.leavingFor = next;
      state.leaveBy = now + LEAVE_WALK_MS;
      state.pauseUntil = 0;
      this.setCourse(state, doorway);
      return;
    }
    this.go(state, next, now);
  }

  /** At the door, or out of time to reach it: through it. */
  private goIfAtTheDoor(state: State, now: number) {
    const there = !state.target && state.legs.length === 0;
    if (!there && now < state.leaveBy) return;
    this.go(state, state.leavingFor!, now);
  }

  private go(state: State, next: Haunt, now: number) {
    state.leavingFor = null;
    this.leaveRoom(state);
    this.arrive(state, next, now);
    state.until = now + this.stay(next);
    log.info(`${state.resident.name} went to ${hauntKey(next)}`);
  }

  private arrive(state: State, haunt: Haunt, now: number) {
    state.haunt = haunt;
    state.since = now;
    state.room = roomForHaunt(state.resident, haunt);
    state.target = null;
    state.legs = [];
    state.heldSince = 0;
    state.pauseUntil = now + ARRIVAL_PAUSE_MS;
    const doorway = doorwayFor(state.resident, haunt);
    const area = wanderArea(haunt, state.resident);
    const spots = wanderSpots(haunt);
    if (haunt.kind === "station" && state.resident.station) {
      // At their post to begin with, facing the room, whether or not they
      // pace afterwards — arriving in the middle of the patch would put them
      // off to one side of their own counter.
      const post = state.resident.station;
      state.x = post.x;
      state.y = post.y;
      state.facing = post.facing;
    } else if (haunt.kind === "office") {
      // At the desk, facing it, and staying put.
      const spot = deskSpot(state.resident);
      state.x = spot.x;
      state.y = spot.y;
      state.facing = "up";
    } else if (doorway) {
      // Out of their own front door and onto the map, then a walk to
      // wherever they are standing today: an outdoor place is arrived at
      // rather than appeared in.
      this.stand(state, doorway);
      state.facing = "down";
      const to = this.freeSpot(state, outsideSpots(state.resident));
      if (to) this.setCourse(state, to);
    } else if (spots) {
      // Start at one of the places rather than in the middle of the map,
      // which for the world map would be somewhere in a building.
      this.stand(state, this.freeSpot(state, spots) ?? spots[0]);
      state.facing = "down";
    } else if (area) {
      this.stand(state, this.freePoint(state, area));
      state.facing = "down";
    }
    if (state.room) this.ensureInRoom(state);
    this.remark(state, haunt);
  }

  /**
   * What a resident says on arriving, for the ones with anything to say.
   *
   * Through the same broadcast the socket relays a person's speech over, so
   * it arrives at every client as an ordinary remark and the room's bubbles
   * draw it without knowing a resident is not a person.
   */
  private remark(state: State, haunt: Haunt) {
    const lines = state.resident.lines;
    if (!lines || !state.room) return;
    const say = currentBroadcast();
    if (!say) return;
    say(state.room, {
      type: "said",
      id: `resident:${state.resident.id}:${this.now()}`,
      from: { id: presenceIdFor(state.resident), name: state.resident.name },
      text: haunt.kind === "station" ? lines.onDuty : lines.away,
      at: new Date(this.now()).toISOString(),
      scope: "room",
    });
  }

  private ensureInRoom(state: State) {
    if (!state.room) return;
    const { hub } = this.host.roomFor(state.room);
    const id = presenceIdFor(state.resident);
    if (hub.has(id)) return;
    hub.join(id, {
      name: state.resident.name,
      spriteKey: state.resident.spriteKey,
      x: state.x,
      y: state.y,
      facing: state.facing,
      resident: true,
    });
  }

  private leaveRoom(state: State) {
    if (!state.room) return;
    this.host.roomFor(state.room).hub.leave(presenceIdFor(state.resident));
    state.room = null;
  }

  // ── Keeping out of each other ─────────────────────────

  /** Everybody else in the same place, where they are standing this instant. */
  private bodies(state: State): Point[] {
    const others: Point[] = [];
    for (const other of this.states.values()) {
      if (other === state || !other.room || other.room !== state.room) continue;
      others.push({ x: other.x, y: other.y });
    }
    return others;
  }

  /**
   * Everybody else in the same place and everywhere they are going to end
   * up, so two residents never set off for the same patch of floor.
   *
   * Where they are is not enough on its own: Sara and Bud both chose the
   * doorstep of Sandbox ERP from opposite ends of the map, and neither was
   * anywhere near it at the time.
   */
  private crowd(state: State): Point[] {
    const taken = this.bodies(state);
    for (const other of this.states.values()) {
      if (other === state || !other.room || other.room !== state.room) continue;
      const rest = other.legs[other.legs.length - 1] ?? other.target;
      if (rest) taken.push(rest);
    }
    return taken;
  }

  /** One of these places with nobody in it or on their way to it; null if every one is taken. */
  private freeSpot(state: State, spots: readonly Point[]): Point | null {
    const taken = this.crowd(state);
    const free = spots.filter((spot) => roomToStand(spot, taken));
    if (free.length === 0) return null;
    return free[Math.min(free.length - 1, Math.floor(this.random() * free.length))];
  }

  /** Somewhere in these bounds with nobody in it; a crowded one only if there is no other. */
  private freePoint(state: State, area: Rect): Point {
    const taken = this.crowd(state);
    let at = randomPoint(area, this.random);
    for (let tries = 1; tries < SPACING_TRIES && !roomToStand(at, taken); tries++) {
      at = randomPoint(area, this.random);
    }
    return at;
  }

  /**
   * Stand them at a place, or a step to the side of it when somebody is
   * already there — two people out of the same door at the same moment.
   *
   * Sideways only. A doorstep has a building a little way above it and its
   * own path below, and the ground either side of a door is the one
   * direction that is open at every door on the map.
   */
  private stand(state: State, at: Point) {
    const taken = this.bodies(state);
    state.x = at.x;
    state.y = at.y;
    if (roomToStand(at, taken)) return;
    for (const step of ASIDE) {
      const beside = { x: at.x + step * PERSONAL_SPACE_PX, y: at.y };
      if (!roomToStand(beside, taken)) continue;
      state.x = beside.x;
      state.y = beside.y;
      return;
    }
  }

  private standingOn(state: State, at: Point) {
    return Math.hypot(state.x - at.x, state.y - at.y) <= ARRIVED_PX;
  }

  // ── Walking ───────────────────────────────────────────

  /**
   * Plan the way to somewhere and set off.
   *
   * The world map is the one place that has to be gone round rather than
   * through, and the only one with its solids to hand; a room's bounds and a
   * campus's paving are open floor, where the destination is the whole route.
   */
  private setCourse(state: State, to: Point) {
    if (state.room !== WORLD_ROOM_SLUG) {
      state.legs = [];
      state.target = to;
      return;
    }
    const route = routeAcross(
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      obstacles(),
      { x: state.x, y: state.y },
      to,
    );
    if (!route) {
      log.warn(`${state.resident.name} could not get to ${Math.round(to.x)},${Math.round(to.y)}`);
      state.legs = [];
      state.target = null;
      return;
    }
    state.legs = route.slice(1);
    state.target = route[0];
  }

  /**
   * Somewhere else to be, for a place that offers a choice of them. A stay
   * outside is not one: they have their own place to stand and stand in it.
   */
  private aim(state: State) {
    const spots = wanderSpots(state.haunt);
    if (spots) {
      // Never the spot they are on, so a wanderer always goes somewhere.
      const elsewhere = spots.filter((spot) => !this.standingOn(state, spot));
      const to = this.freeSpot(state, elsewhere) ?? null;
      if (to) this.setCourse(state, to);
      return;
    }
    const area = wanderArea(state.haunt, state.resident);
    if (area) this.setCourse(state, this.freePoint(state, area));
  }

  private walk(state: State, now: number) {
    if (!state.room) return;
    // The room may have been closed and reopened while nobody was there.
    this.ensureInRoom(state);
    const { hub } = this.host.roomFor(state.room);
    let moving = false;
    if (now >= state.pauseUntil) {
      // Nothing new while they are on their way out: the door is the errand.
      if (!state.target && !state.leavingFor) this.aim(state);
      if (state.target) moving = this.step(state, now);
    }
    hub.move(presenceIdFor(state.resident), {
      x: state.x,
      y: state.y,
      facing: state.facing,
      moving,
    });
  }

  /**
   * One tick's worth of the walk, unless somebody is standing in it.
   *
   * A step that would end up inside another resident is not taken — they
   * wait for the way to clear, and after a moment of it go somewhere else
   * instead, which is what stops two of them holding each other up for ever
   * in a doorway. A step that takes them *further* from whoever they are too
   * close to is always allowed, or anyone who found themselves overlapping
   * would be pinned there.
   */
  private step(state: State, now: number): boolean {
    const target = state.target!;
    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const distance = Math.hypot(dx, dy);
    const stride = (WANDER_SPEED_PX_S * (now - state.lastTick)) / 1000;
    if (distance <= stride) {
      if (this.blocked(state, target)) return this.holdOn(state, now);
      state.heldSince = 0;
      state.x = target.x;
      state.y = target.y;
      // Straight on round the corner if the walk goes further; a rest only
      // once they are actually somewhere.
      state.target = state.legs.shift() ?? null;
      if (!state.target) {
        state.pauseUntil = now + PAUSE_MS[0] + this.random() * (PAUSE_MS[1] - PAUSE_MS[0]);
      }
      return false;
    }
    const next = { x: state.x + (dx / distance) * stride, y: state.y + (dy / distance) * stride };
    if (this.blocked(state, next)) return this.holdOn(state, now);
    state.heldSince = 0;
    state.x = next.x;
    state.y = next.y;
    state.facing = facingFor(dx, dy) ?? state.facing;
    return true;
  }

  /** Whether a step would put them inside somebody, and no further out of them than they are. */
  private blocked(state: State, next: Point): boolean {
    const bodies = this.bodies(state);
    if (roomToStand(next, bodies)) return false;
    return nearest(next, bodies) <= nearest({ x: state.x, y: state.y }, bodies);
  }

  /** Wait for the way to clear, and give up on it after a moment. */
  private holdOn(state: State, now: number): boolean {
    if (!state.heldSince) state.heldSince = now;
    if (now - state.heldSince < MAKE_WAY_MS) return false;
    state.heldSince = 0;
    state.target = null;
    state.legs = [];
    state.pauseUntil = now + PAUSE_MS[0];
    return false;
  }
}

function randomPoint(area: Rect, random: () => number) {
  return { x: area.x + random() * area.width, y: area.y + random() * area.height };
}

/** How far the nearest of them is; infinity when there is nobody. */
function nearest(at: Point, others: readonly Point[]): number {
  let least = Infinity;
  for (const other of others) least = Math.min(least, Math.hypot(at.x - other.x, at.y - other.y));
  return least;
}
