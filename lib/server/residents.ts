/**
 * Walks the residents about.
 *
 * Each resident keeps a loose routine through their haunts — the desk,
 * their organisation's rooms, its campus yard, outside — and while they
 * are in a room they are a player in that room's presence hub like anyone
 * else, so the people there see them wander. They take no human seat and
 * never time out. Outside and a yard have no room; the world map and the
 * campus ask where everyone is instead (see /api/residents).
 *
 * The simulation owns its clock and randomness so it can be driven by hand
 * in tests.
 */

import type { PresenceHub } from "./presence-hub";
import type { Facing } from "../presence-types";
import {
  RESIDENTS,
  deskSpot,
  dwell,
  hauntKey,
  hauntsOf,
  nextHaunt,
  outsideSpots,
  roomForHaunt,
  wanderArea,
  wanderSpots,
  yardArea,
  type Haunt,
  type PlaceKind,
  type Rect,
  type Resident,
  type Whereabouts,
} from "../world/residents";
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
  spot: { x: number; y: number } | null;
  since: number;
  until: number;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  /**
   * The legs still to walk after the current target, for somebody crossing
   * ground that has to be gone round rather than through. Empty everywhere
   * a resident wanders by bounds, where the next corner is the destination.
   */
  legs: Point[];
  pauseUntil: number;
  facing: Facing;
  lastTick: number;
}

/**
 * The world map's solids, worked out once.
 *
 * They never change — the buildings, the props' feet, the signs and the sea
 * are all laid out at module load — and a route is planned every time a
 * wanderer picks somewhere new to be, so this is not worth recomputing.
 */
let worldObstacles: Rect[] | null = null;
const obstacles = () => (worldObstacles ??= worldSolids());

/** How a route handler, in its own module graph, reaches the running simulation. */
const WHEREABOUTS_KEY = Symbol.for("watercooler.residents.whereabouts");

function firstHaunt(resident: Resident, kind?: PlaceKind): Haunt {
  const haunts = hauntsOf(resident);
  return haunts.find((h) => h.kind === kind) ?? haunts[0];
}

function describe(state: State): Whereabouts {
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
    spot: state.spot,
    since: state.since,
  };
}

/** Where every resident is right now; their first haunt when nothing is running. */
export function residentWhereabouts(): Whereabouts[] {
  const read = (globalThis as Record<symbol, unknown>)[WHEREABOUTS_KEY] as
    | (() => Whereabouts[])
    | undefined;
  if (read) return read();
  return RESIDENTS.map((r) => {
    const haunt = firstHaunt(r);
    return describe({
      resident: r,
      haunt,
      room: roomForHaunt(r, haunt),
      spot: null,
      since: 0,
      until: 0,
      x: 0,
      y: 0,
      target: null,
      legs: [],
      pauseUntil: 0,
      facing: "down",
      lastTick: 0,
    });
  });
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
        spot: null,
        since: at,
        until: at + this.stay(haunt),
        x: 0,
        y: 0,
        target: null,
        legs: [],
        pauseUntil: 0,
        facing: "down",
        lastTick: at,
      };
      this.states.set(resident.id, state);
      this.arrive(state, haunt, at);
    }
  }

  /** Run on a timer until the returned function is called. */
  start(): () => void {
    (globalThis as Record<symbol, unknown>)[WHEREABOUTS_KEY] = () => this.whereabouts();
    const timer = setInterval(() => this.tick(this.now()), TICK_MS);
    timer.unref?.();
    log.info(`${RESIDENTS.map((r) => r.name).join(", ")} clocked in`);
    return () => {
      clearInterval(timer);
      for (const state of this.states.values()) this.leaveRoom(state);
      delete (globalThis as Record<symbol, unknown>)[WHEREABOUTS_KEY];
    };
  }

  whereabouts(): Whereabouts[] {
    return [...this.states.values()].map(describe);
  }

  /** One step of everyone's day. */
  tick(now: number) {
    for (const state of this.states.values()) {
      if (now >= state.until) {
        const next = nextHaunt(state.resident, state.haunt, this.random);
        if (hauntKey(next) === hauntKey(state.haunt)) {
          // Nowhere else to be — a wanderer never goes in. Just carry on
          // walking: leaving and arriving in the same place would snap them
          // back to the middle of it and blink them out of the room.
          state.until = now + this.stay(next);
        } else {
          this.leaveRoom(state);
          this.arrive(state, next, now);
          state.until = now + this.stay(next);
          log.info(`${state.resident.name} went to ${hauntKey(next)}`);
        }
      }
      if (state.room) this.wander(state, now);
      state.lastTick = now;
    }
  }

  private stay(haunt: Haunt): number {
    return Math.max(1000, dwell(haunt.kind, this.random) * this.dwellScale);
  }

  private arrive(state: State, haunt: Haunt, now: number) {
    state.haunt = haunt;
    state.since = now;
    state.room = roomForHaunt(state.resident, haunt);
    state.target = null;
    state.legs = [];
    state.spot = null;
    state.pauseUntil = now + 800;
    const area = wanderArea(haunt);
    const spots = wanderSpots(haunt);
    if (spots) {
      // Start at one of the places rather than in the middle of the map,
      // which for the world map would be somewhere in a building.
      const first = spots[Math.min(spots.length - 1, Math.floor(this.random() * spots.length))];
      state.x = first.x;
      state.y = first.y;
      state.facing = "down";
    } else if (area) {
      state.x = area.x + area.width / 2;
      state.y = area.y + area.height / 2;
      state.facing = "down";
    } else if (haunt.kind === "office") {
      // At the desk, facing it, and staying put.
      const spot = deskSpot(state.resident);
      state.x = spot.x;
      state.y = spot.y;
      state.facing = "up";
    } else if (haunt.kind === "outside") {
      const spots = outsideSpots(state.resident);
      state.spot = spots[Math.min(spots.length - 1, Math.floor(this.random() * spots.length))];
    } else if (haunt.kind === "campus") {
      state.spot = randomPoint(yardArea(haunt.campus), this.random);
    }
    if (state.room) this.ensureInRoom(state);
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

  private wander(state: State, now: number) {
    if (!state.room) return;
    // The room may have been closed and reopened while nobody was there.
    this.ensureInRoom(state);
    const { hub } = this.host.roomFor(state.room);
    const id = presenceIdFor(state.resident);
    const area = wanderArea(state.haunt);
    const spots = wanderSpots(state.haunt);
    if (!area && !spots) {
      hub.move(id, { x: state.x, y: state.y, facing: state.facing, moving: false });
      return;
    }

    let moving = false;
    if (now >= state.pauseUntil) {
      if (!state.target) {
        // Somewhere else to be. A patch of floor is walked at directly; a set
        // of places is a walk across the map, so it comes with a route.
        if (spots) this.setOff(state, spots);
        else if (area) state.target = randomPoint(area, this.random);
      }
      if (state.target) {
        const dx = state.target.x - state.x;
        const dy = state.target.y - state.y;
        const distance = Math.hypot(dx, dy);
        const step = (WANDER_SPEED_PX_S * (now - state.lastTick)) / 1000;
        if (distance <= step) {
          state.x = state.target.x;
          state.y = state.target.y;
          // Straight on round the corner if the walk goes further; a rest
          // only once they are actually somewhere.
          state.target = state.legs.shift() ?? null;
          if (!state.target) {
            state.pauseUntil = now + PAUSE_MS[0] + this.random() * (PAUSE_MS[1] - PAUSE_MS[0]);
          }
        } else {
          state.x += (dx / distance) * step;
          state.y += (dy / distance) * step;
          state.facing = facingFor(dx, dy) ?? state.facing;
          moving = true;
        }
      }
    }
    hub.move(id, { x: state.x, y: state.y, facing: state.facing, moving });
  }

  /**
   * Pick somewhere else among the places and plan the way there.
   *
   * Never the spot they are standing on, so a wanderer always goes somewhere.
   * A route that cannot be found leaves them where they are rather than
   * sending them through a wall — it would mean the map had changed under
   * them, and the next tick tries somewhere else.
   */
  private setOff(state: State, spots: readonly Point[]) {
    const here = spots.findIndex((s) => s.x === state.x && s.y === state.y);
    const options = spots.filter((_, i) => i !== here);
    if (options.length === 0) return;
    const to = options[Math.min(options.length - 1, Math.floor(this.random() * options.length))];
    const route = routeAcross(
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      obstacles(),
      { x: state.x, y: state.y },
      to,
    );
    if (!route) {
      log.warn(`${state.resident.name} could not get to ${to.x},${to.y}`);
      return;
    }
    state.legs = route.slice(1);
    state.target = route[0];
  }
}

function randomPoint(area: Rect, random: () => number) {
  return { x: area.x + random() * area.width, y: area.y + random() * area.height };
}
