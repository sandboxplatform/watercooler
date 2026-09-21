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
import { SPRINT_SPEED_PX_S, type Facing } from "../presence-types";
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
import { EGG_CHANCE } from "../world/eggs";
import { WORLD_ROOM_SLUG } from "../rooms";
import { createLogger } from "../logger";
import { facingFor } from "../facing";
import { openGround, routeAcross, type Point } from "../world/route";
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
 *
 * **It has to be comfortably longer than the longest honest walk**, or it
 * stops being a backstop and becomes a deadline: a resident who could have
 * got home is taken indoors in the middle of the map instead, which is the
 * thing this exists to avoid rather than a milder version of it. Yash's
 * walk from his place in the row by the fountain to Mettara's door, right
 * down in the south-west corner, is nineteen hundred pixels and thirty-five
 * seconds at `WANDER_SPEED_PX_S` — it was thirty and he never once made it.
 * `residents.test.ts` measures every resident's route home against this, so
 * a building put somewhere further off is a failing test rather than
 * somebody winking out on the grass.
 */
export const LEAVE_WALK_MS = 90_000;
/** How long they wait for somebody in the way before going somewhere else. */
const MAKE_WAY_MS = 3000;
/**
 * Near enough to have walked up to somebody: a tile and a half, the same
 * reach as the things in a room you press E at.
 */
export const GREET_PX = 72;
/**
 * And how far off counts as having left again.
 *
 * Wider than the first on purpose. Somebody standing right on the boundary
 * drifts a pixel either side of it as they breathe, and without the gap
 * every one of those crossings is another greeting.
 */
export const GREET_CLEAR_PX = 120;
/**
 * How long a fright lasts.
 *
 * A resident who says something to whoever walked up to them bolts for this
 * long and then picks their day up where they left it. It is short on
 * purpose: the point is the moment of it, and a chicken who spends his
 * afternoon fleeing is a chicken nobody can walk up to.
 */
export const SPOOK_MS = 5000;
/**
 * The least time between two of them, however many people walk up — which
 * is exactly as long as a fright, and that is the whole of the rule.
 *
 * It is here because a bubble is a few seconds long, so a second greeting
 * inside that window lands on top of the first, and a row of people
 * arriving one after another would otherwise set a resident off once each.
 * Eight seconds bought that and cost the chase: it outlasted the fright by
 * three, so somebody who kept pace with Michael and was standing over him
 * when he stopped running got silence, and had to walk away and come back
 * to get another cluck out of him. A chicken who has finished running is a
 * chicken who can be startled again — see `greet`.
 */
export const GREET_QUIET_MS = SPOOK_MS;
/**
 * And the floor under two of them when the second is a *catch*.
 *
 * Being inside arm's length of a chicken who is already running is not
 * somebody arriving, it is somebody who has run him down — which is the
 * whole point of a chase, and the one thing the rule above had no way of
 * saying. It held every cluck to the length of a fright, so catching him
 * counted only if you were still within `GREET_PX` on the exact tick the
 * fright ran out: a pursuer who cut a corner, got on top of him at three
 * seconds and was a stride behind again at five got nothing for it, and
 * nothing on screen to say why.
 *
 * A second, because a catch is a moment and the queue of arrivals the
 * longer floor exists for cannot reach him at all — he is at half again a
 * sprint, so anybody inside `GREET_PX` while he is bolting has earned the
 * cluck. Short enough to read as an answer to being caught, long enough
 * that a chicken pinned in a corner clucks rather than rattles.
 */
export const CAUGHT_QUIET_MS = 1000;
/**
 * How fast a bolt is: half again as fast as a person can sprint.
 *
 * Measured against the sprint rather than written down, because the only
 * thing that matters about it is that it is faster than whoever startled
 * him. He used to bolt at 150, which is under half a sprint — so a person
 * who ran after him caught him inside a second, and a fright you can keep
 * up with at a jog is not a fright.
 *
 * A fifth again was the next try and it was still not enough: a sprinter
 * loses a pixel and a half in ten to a chicken who keeps turning, so he was
 * caught anyway and the chase had no shape to it. At half again he is gone,
 * and catching him means cutting a corner rather than out-running him.
 *
 * Well inside what the hub will carry: `move` clamps against the sprint
 * times `SPEED_TOLERANCE`, which is two and a half of them.
 */
export const SPOOK_SPEED_PX_S = Math.round(SPRINT_SPEED_PX_S * 1.5);
/**
 * How far one dash of a bolt goes before the next one turns somewhere else.
 *
 * Lengthened with the speed, and for the same reason the speed is measured
 * against the sprint: 70 to 160 was a fifth of a second apiece at this pace,
 * which is a chicken shaking rather than a chicken running. These are about
 * three quarters of a second each, so the bolt reads as a run with turns in
 * it — and it takes him a great deal further before the fright wears off.
 */
const SPOOK_DASH_PX: [number, number] = [200, 420];
/** How many directions to try before standing still for a tick and trying again. */
const SPOOK_TRIES = 6;
/**
 * How wide the cone a dash is aimed into: either side of straight away from
 * whoever startled them, so a third of the circle and the third with the
 * fright at the back of it.
 *
 * Wide enough that a bolt is still a scramble rather than a ruler-straight
 * line away, narrow enough that every dash of it puts more ground between
 * the two of them. Straight away and nothing else would read as a machine.
 */
const SPOOK_SPREAD = Math.PI / 3;
/** How many places to try before settling for a crowded one. */
const SPACING_TRIES = 8;
/** Which way a step aside goes: along the front of a door, not into it. */
const ASIDE = [1, -1, 2, -2, 3, -3];

export interface ResidentHost {
  /** The room's hub, opening the room if it is not. */
  roomFor(slug: string): { hub: PresenceHub };
  /**
   * Somebody has just come to stand beside this resident, by connection.
   *
   * Edge-triggered — reported the tick they arrive within `GREET_PX` and
   * not again until they have gone and come back — because the alternative
   * is a badge check twenty times a second for as long as anybody leans on
   * a counter. Whether it means anything is the host's business; the
   * simulation's business is noticing.
   *
   * Optional: nothing in the world stops working without it, and the sims
   * in the tests do not care who walked up.
   */
  met?(residentId: string, connectionIds: readonly string[]): void;
  /**
   * A fright has left an egg behind, here.
   *
   * The simulation decides *whether* — it holds the fright and the seeded
   * randomness the tests drive — and the host decides what kind and what
   * becomes of it, because the ladder and the field of eggs are its. The
   * chicken does not choose what he lays.
   *
   * `at` is where the run ended, not where it began: the roll is taken at
   * the cluck and the egg is dropped when the fright wears off, a field
   * away from whoever startled him. Dropped where he was standing it was
   * at their feet, and an egg you stoop for without moving is not worth
   * chasing a chicken over.
   *
   * `startledBy` is the connection that walked up, or null — for somebody
   * who has stepped away inside the tick, for somebody who has gone
   * altogether before the run ends, and for a fright another
   * resident caused, since a local holds nothing. Whoever caused it gets
   * the credit for it, which is a badge they cannot claim for themselves.
   *
   * Optional like `met`: nothing about the world stops working without
   * it, and the simulations in the tests want the fright and not the egg.
   */
  laid?(residentId: string, room: string, at: Point, startledBy: string | null): void;
  /**
   * Somebody got a hand on a resident who was already running.
   *
   * A different thing from `met`, which is the edge of walking up to
   * somebody: the pursuer never leaves that radius, so nothing about
   * arriving can express keeping up. He bolts at half again a sprint, so
   * being inside arm's length of him mid-run means a corner was cut, and
   * that is the only reason this is worth telling anybody about.
   *
   * The connection rather than the person, like `startledBy` above, and
   * only ever a person: a resident who blunders into him startles him the
   * same and is credited with nothing, for the reason a local earns no
   * badges.
   *
   * Optional like the other two. The fright works without it.
   */
  caught?(residentId: string, connectionId: string): void;
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
  /** Whether somebody is currently stood near enough to have been greeted. */
  greeted: boolean;
  /**
   * When they last greeted anybody, so they do not do it twice in a breath;
   * 0 when they never have, as `heldSince` is 0 for nobody in the way.
   *
   * The 0 is load-bearing rather than tidy: a plain `now - greetedAt` reads
   * a fresh simulation as having just said something, and on a clock that
   * starts at zero — which is every test in this file — that swallows the
   * first greeting of the run entirely.
   */
  greetedAt: number;
  /** While they are bolting from whoever walked up to them; 0 when they are not. */
  spookedUntil: number;
  /**
   * Where whoever startled them was standing when they did, which is what
   * every dash of the bolt is aimed away from. Null when nothing has.
   *
   * Where they *were*, not where they are: the fright is a moment, and
   * re-reading the person each dash would turn a bolt into a chase — one
   * that a person could steer by walking round him. Running from the spot
   * he was startled at is what a startled animal does, and it comes out as
   * a line away rather than a circle.
   *
   * A catch reads it afresh, which is not the same thing: that is a second
   * fright at a second spot, not a dash re-aimed at somebody standing
   * still. Whoever has run him down is on top of him, and running from
   * where they were a moment ago would run him into them.
   */
  spookedFrom: Point | null;
  /**
   * An egg this fright has won but not yet dropped, and who is to be
   * credited with it. Null when the roll missed, or when there is no
   * fright on.
   *
   * **Whether is settled at the cluck and where is settled at the end of
   * the run**, which is the whole of this field. The roll belongs to the
   * moment of the fright, where the seeded randomness is; the spot belongs
   * to where it left him, because an egg dropped as he turns to run is an
   * egg at the feet of whoever startled him — they have only to stand
   * still and stoop, and the chase the fright exists for never happens.
   * Laid where he finally stops, it is a field away, and going to get it
   * is the point.
   *
   * One to a fright, however many times he is caught in it: a second catch
   * that found one already pending would be a second egg out of the same
   * run, and a chicken cornered against a wall would be a basket.
   */
  laying: { by: string | null } | null;
  /**
   * Who is standing beside them right now, by connection.
   *
   * Kept so that `mingle` can report the arrivals rather than the crowd:
   * the same two people standing at a counter are one piece of news, not
   * one per tick. Cleared whenever the room empties, which is nearly
   * always, so it costs an empty Set and nothing else.
   */
  beside: Set<string>;
}

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
        greeted: false,
        greetedAt: 0,
        spookedUntil: 0,
        spookedFrom: null,
        laying: null,
        beside: new Set<string>(),
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
      // Before anything else this tick, because a fright that has run its
      // course is a fact about where they are standing *now* — the end of
      // the run, which is where the egg goes and where whoever is still
      // over them counts as having arrived again.
      this.settle(state, now);
      if (state.leavingFor) this.goIfAtTheDoor(state, now);
      else if (now >= state.until) this.moveOn(state, now);
      this.walk(state, now);
      this.greet(state, now);
      this.mingle(state);
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
      this.headForTheDoor(state);
      return;
    }
    this.go(state, next, now);
  }

  /** Plan the walk to their own doorstep, from wherever they are standing. */
  private headForTheDoor(state: State) {
    const doorway = doorwayFor(state.resident, state.haunt);
    if (doorway) this.setCourse(state, doorway);
  }

  /**
   * At the door, or out of time to reach it: through it.
   *
   * **Asked of where they are standing, not of whether they still have a
   * course.** An empty course used to mean "arrived", which is true of the
   * walk ending and of nothing else — and a course is dropped for other
   * reasons. `holdOn` drops one after a few seconds behind somebody who
   * will not move, which is two residents on adjacent spots in front of the
   * fountain, one of whom wants to walk east past the other. That read as
   * arrival, so Bud went into his building from the middle of the plaza,
   * four hundred pixels from his own front door, in full view of anybody
   * standing there.
   */
  private goIfAtTheDoor(state: State, now: number) {
    const doorway = doorwayFor(state.resident, state.haunt);
    const there = !doorway || this.standingOn(state, doorway);
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
    state.greeted = false;
    state.spookedUntil = 0;
    state.spookedFrom = null;
    // A fright abandoned by going somewhere else drops what it had won: an
    // egg is laid on the map it was won on, and the run it belonged to is
    // over. Nobody who lays has anywhere else to be today, so this is a
    // rule rather than a case.
    state.laying = null;
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
    if (!lines) return;
    this.say(state, haunt.kind === "station" ? lines.onDuty : lines.away);
  }

  /**
   * What a resident says to somebody who walks up to them.
   *
   * Edge-triggered: it is somebody arriving that is worth remarking on, so
   * one greeting per arrival rather than one per tick of standing there.
   * Whether they have gone again is asked at the wider radius, and there is
   * a quiet period besides — between them, walking to and fro at the edge of
   * a chicken's hearing cannot make him cluck like a metronome.
   *
   * It is asked of the hub rather than of the other residents because the
   * hub is where everybody standing in the room is, whichever they are —
   * and **a resident coming round the corner startles him exactly as a
   * person does.** It was people-only, on the reasoning that the residents
   * are sent to places nobody is standing in; that is true of where they
   * are *sent* and says nothing about the walk between two of them, which
   * crosses whatever is in the way because nothing collides a resident. So
   * Michael could be walked up to by one kind of thing and stood beside by
   * another, which is not a fact about chickens.
   *
   * Himself excepted, or he would spend his life fleeing his own company.
   */
  private greet(state: State, now: number) {
    const greeting = state.resident.greeting;
    if (!greeting || !state.room) return;
    const { hub } = this.host.roomFor(state.room);
    const me = presenceIdFor(state.resident);
    // **Caught.** Somebody inside arm's length of a chicken who is already
    // running has run him down, which is a second fright rather than the
    // same one — and the one thing the edge below cannot express, since
    // they never left the radius for it to trigger on again.
    //
    // It used to be that a catch counted only if the pursuer happened to
    // still be within `GREET_PX` on the exact tick the fright ran out, and
    // at half again a sprint that is a stride he does not often lose. So
    // the reward for cutting a corner and getting on top of him was a bird
    // who said nothing, which reads as the chase being broken rather than
    // as a rule about frights.
    if (this.spooked(state, now)) {
      if (now - state.greetedAt < CAUGHT_QUIET_MS) return;
      if (!hub.someoneNear({ x: state.x, y: state.y }, GREET_PX, me)) return;
      // Told before the fresh fright rather than after it: `cluck` picks
      // a new person to run away from and may find a different one, and
      // whoever is being credited with the catch is whoever is on top of
      // him *now*.
      const by = hub.nearestNeighbour({ x: state.x, y: state.y }, GREET_PX, me);
      if (by && !by.resident) this.host.caught?.call(this.host, state.resident.id, by.id);
      this.cluck(state, now, hub, GREET_PX, me);
      return;
    }
    const reach = state.greeted ? GREET_CLEAR_PX : GREET_PX;
    if (!hub.someoneNear({ x: state.x, y: state.y }, reach, me)) {
      state.greeted = false;
      return;
    }
    if (state.greeted) return;
    state.greeted = true;
    if (state.greetedAt && now - state.greetedAt < GREET_QUIET_MS) return;
    this.cluck(state, now, hub, reach, me);
  }

  /**
   * The cluck itself: the word, the fright, and the egg it may win.
   *
   * Both ways of setting him off end here — somebody walking up to him,
   * and somebody catching him in the middle of a run — because the two
   * differ in what makes them happen and in nothing that happens after.
   */
  private cluck(state: State, now: number, hub: PresenceHub, reach: number, me: string) {
    state.greeted = true;
    state.greetedAt = now;
    this.say(state, state.resident.greeting!);
    // Asked for a second time, and only here: the tick check wants a yes
    // or no and this wants somewhere to run away from. Nobody by the time
    // it is asked is possible — somebody can walk off inside a tick — and
    // a bolt in no particular direction is the right answer to that.
    const startled = hub.nearestNeighbour({ x: state.x, y: state.y }, reach, me);
    this.spook(state, now, startled);
    // The fright is the same whoever caused it; the credit is not. An egg
    // is a thing somebody is given, and a resident holds nothing — so a
    // chicken startled by Doc still lays, and the egg lies in the grass
    // for whoever comes along.
    this.winEgg(state, startled && !startled.resident ? startled.id : null);
  }

  /**
   * The fright is over: he stops running, and whatever it won is dropped
   * where it left him.
   *
   * This is also a fresh arrival for anybody still standing over him.
   * Edge-triggered is the right rule for somebody leaning on a counter and
   * the wrong one for somebody who chased the chicken down: they never
   * left the wider radius, so `greeted` stayed set, and what they got for
   * keeping up was a bird who stood there in silence until they walked
   * away and came back.
   */
  private settle(state: State, now: number) {
    if (!state.spookedUntil || now < state.spookedUntil) return;
    state.spookedUntil = 0;
    state.spookedFrom = null;
    state.greeted = false;
    const won = state.laying;
    state.laying = null;
    if (!won || !state.room) return;
    this.host.laid?.call(
      this.host,
      state.resident.id,
      state.room,
      { x: state.x, y: state.y },
      won.by,
    );
  }

  /**
   * The one thing a fright leaves behind, three times in a hundred.
   *
   * Odds rather than a count: the draw below is fresh on every cluck and
   * nothing counts them, so thirty frights may pass with nothing to show
   * and two eggs may come one after the other.
   *
   * Rolled here rather than by whoever is told about it, because this is
   * where the seeded randomness is: `residents.test.ts` drives the
   * simulation with a random of its own, and a chance rolled out of
   * `Math.random` somewhere downstream would be the one part of a cluck
   * that could not be replayed. What kind of egg it is stays the host's —
   * see `laid`.
   *
   * Won here and laid by `settle`, at the end of the run rather than at
   * the start of it: an egg dropped as he turns to run is an egg at the
   * feet of whoever startled him, and stooping where you stand is not a
   * chase. One to a fright, so catching him again is worth another cluck
   * and not another egg.
   */
  private winEgg(state: State, startledBy: string | null) {
    // Nobody to tell, or nothing to tell them: asked before the roll
    // rather than after, so a simulation with no host for this draws no
    // random number at all. `laid` is optional and most of the tests do
    // without it — a draw taken here would shift every roll after it and
    // change where he runs to, in tests that are about the running.
    if (state.laying) return;
    if (!this.host.laid || !state.resident.lays || !state.room) return;
    if (this.random() >= EGG_CHANCE) return;
    state.laying = { by: startledBy };
  }

  /**
   * Notice who has come to stand beside them.
   *
   * The plainer half of `greet`: that one is about what a resident does
   * about company, and this is only about there being some. Every resident
   * has it, not just the ones with anything to say — a badge for having met
   * everybody has to count the quiet ones too.
   *
   * At the same reach a greeting carries, `GREET_PX`, so "close enough to
   * be clucked at" and "close enough to have met" are one distance rather
   * than two numbers to keep in step. Reported on the edge and only on it:
   * standing there is not news a second time.
   */
  private mingle(state: State) {
    const met = this.host.met;
    if (!met || !state.room) return;
    const { hub } = this.host.roomFor(state.room);
    // The common case, and the one worth being free: an empty room.
    if (hub.count === 0) {
      if (state.beside.size) state.beside.clear();
      return;
    }
    const near = hub.peopleNear({ x: state.x, y: state.y }, GREET_PX);
    let arrived: string[] | null = null;
    for (const id of near) if (!state.beside.has(id)) (arrived ??= []).push(id);
    state.beside.clear();
    for (const id of near) state.beside.add(id);
    if (arrived) met.call(this.host, state.resident.id, arrived);
  }

  /**
   * The fright that goes with the greeting: off they go for `SPOOK_MS`,
   * away from `from` — where whoever startled them was standing.
   *
   * Whatever they were walking to is dropped, because a fright interrupts the
   * errand — except the walk to a door, which is a departure already under
   * way: `goIfAtTheDoor` reads an empty course as being at the door, so
   * clearing one would put them through it from the middle of the room.
   */
  private spook(state: State, now: number, from: Point | null) {
    state.spookedUntil = now + SPOOK_MS;
    state.spookedFrom = from;
    state.pauseUntil = 0;
    if (state.leavingFor) return;
    state.target = null;
    state.legs = [];
  }

  private spooked(state: State, now: number) {
    return now < state.spookedUntil;
  }

  /**
   * Put something over a resident's head, in the room they are standing in.
   *
   * Through the same broadcast the socket relays a person's speech over, so
   * it arrives at every client as an ordinary remark and the room's bubbles
   * draw it without knowing a resident is not a person.
   */
  private say(state: State, text: string) {
    if (!state.room) return;
    const say = currentBroadcast();
    if (!say) return;
    say(state.room, {
      type: "said",
      id: `resident:${state.resident.id}:${this.now()}`,
      from: { id: presenceIdFor(state.resident), name: state.resident.name },
      text,
      at: new Date(this.now()).toISOString(),
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
    // `worldSolids` keeps its own list and hands back the same array every
    // time — which is also what lets the route planner keep its grid against
    // that array's identity. A second cache over it here bought nothing and
    // was one more thing claiming to know when the map changes.
    const route = routeAcross(
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      worldSolids(),
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
  private aim(state: State, now: number) {
    if (this.spooked(state, now)) {
      this.bolt(state);
      return;
    }
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

  /**
   * One dash of a bolt: somewhere near, and away from whoever startled them.
   *
   * Short on purpose — a fright is a dash, a turn and another dash, not a
   * journey — so the scramble comes out of the dashes themselves. What it
   * is not is aimless: a chicken who clucks at somebody and then dashes
   * *past* them reads as a chicken with something else on his mind, and
   * running away is the whole point of the cluck. Each dash is therefore
   * aimed into a `SPOOK_SPREAD` cone with the fright behind it.
   *
   * Aimed away from the same remembered point every time, not from wherever
   * that person now is: see `spookedFrom`. As he puts ground between them
   * the direction hardly moves, so the bolt comes out as a line away with a
   * wobble on it rather than a circle round his pursuer.
   *
   * Nothing collides a resident, so somewhere they could have wandered to
   * anyway is the other half of the rule: inside the bounds where a room is
   * what they have, and on the map's own open ground where they are
   * outside. A dash nobody checked is a chicken through a wall. Where a
   * haunt offers neither — a desk — there is nothing to bolt across and
   * they sit tight, which is what `aim` does there too.
   *
   * **The cone gives way before the wall does.** A chicken backed into a
   * corner has no way out that is also away, and a bolt that found nothing
   * in the cone and gave up would leave him standing still in the middle of
   * a fright — so the tries past `SPOOK_TRIES` open out to the whole circle
   * and he goes wherever there is room.
   */
  private bolt(state: State) {
    const area = wanderArea(state.haunt, state.resident);
    const outside = state.room === WORLD_ROOM_SLUG;
    if (!area && !outside) return;
    const from = state.spookedFrom;
    const away = from ? Math.atan2(state.y - from.y, state.x - from.x) : null;
    for (let tries = 0; tries < SPOOK_TRIES * 2; tries++) {
      const cornered = away === null || tries >= SPOOK_TRIES;
      const angle = cornered
        ? this.random() * Math.PI * 2
        : away + (this.random() * 2 - 1) * SPOOK_SPREAD;
      const reach = SPOOK_DASH_PX[0] + this.random() * (SPOOK_DASH_PX[1] - SPOOK_DASH_PX[0]);
      const to = { x: state.x + Math.cos(angle) * reach, y: state.y + Math.sin(angle) * reach };
      if (!this.standable(state, to)) continue;
      this.setCourse(state, to);
      return;
    }
  }

  private walk(state: State, now: number) {
    if (!state.room) return;
    // The room may have been closed and reopened while nobody was there.
    this.ensureInRoom(state);
    const { hub } = this.host.roomFor(state.room);
    let moving = false;
    // A rest between two wanders is not taken while they are bolting: the
    // pause a finished dash sets is for the walk it ended, and standing about
    // in the middle of a fright is not fleeing.
    if (now >= state.pauseUntil || this.spooked(state, now)) {
      // Nothing new while they are on their way out — except the way out
      // itself. `holdOn` drops a course after a few seconds behind somebody
      // who will not move, and a leaver with no course and nothing to
      // replace it stands where they are until `leaveBy` runs out. Planned
      // again from where they now stand, so the moment the way clears they
      // are walking to their own door instead of waiting out the half minute.
      if (!state.target) {
        if (state.leavingFor) this.headForTheDoor(state);
        else this.aim(state, now);
      }
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
    const speed = this.spooked(state, now) ? SPOOK_SPEED_PX_S : WANDER_SPEED_PX_S;
    const stride = (speed * (now - state.lastTick)) / 1000;
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

  /**
   * Wait for the way to clear, then go round it, and only then give up.
   *
   * Giving up alone is no answer for somebody on their way out: a route is
   * planned over the map's solids and a person is not one, so the way to
   * the door is the same way every time it is planned and it runs through
   * whoever is standing in it. Bud and Yash have adjacent spots in the row
   * in front of the fountain, and Bud's building is east of both — so for
   * thirty seconds he planned, was blocked, gave up and planned the same
   * route again, and then `leaveBy` took him indoors from the middle of the
   * plaza.
   */
  private holdOn(state: State, now: number): boolean {
    if (!state.heldSince) state.heldSince = now;
    if (now - state.heldSince < MAKE_WAY_MS) return false;
    state.heldSince = 0;
    if (this.stepAside(state)) return false;
    state.target = null;
    state.legs = [];
    state.pauseUntil = now + PAUSE_MS[0];
    return false;
  }

  /**
   * A step out of the way of whoever will not move, and a new course after.
   *
   * Across the line to them rather than back down it: sideways is the one
   * direction that gives up none of the journey and still clears the way,
   * and one space of it is enough, since what is in the way is a person
   * rather than a wall. The course is dropped with it, so the next tick
   * plans again from where they now stand — at the door for somebody
   * leaving, anywhere for somebody wandering.
   *
   * `stand` has the same idea for two people coming out of one door. That
   * one goes along the front of the door because a doorstep has a building
   * above it and its own path below; this one is anywhere on a map.
   */
  private stepAside(state: State): boolean {
    const bodies = this.bodies(state);
    let closest: Point | null = null;
    let least = Infinity;
    for (const body of bodies) {
      const d = Math.hypot(body.x - state.x, body.y - state.y);
      if (d >= least) continue;
      least = d;
      closest = body;
    }
    if (!closest) return false;
    const length = least || 1;
    const across = { x: -(closest.y - state.y) / length, y: (closest.x - state.x) / length };
    for (const step of ASIDE) {
      const beside = {
        x: state.x + across.x * step * PERSONAL_SPACE_PX,
        y: state.y + across.y * step * PERSONAL_SPACE_PX,
      };
      if (!this.standable(state, beside) || !roomToStand(beside, bodies)) continue;
      state.legs = [];
      state.target = beside;
      return true;
    }
    return false;
  }

  /**
   * Whether a resident could be sent to this point at all: inside the bounds
   * where a room is what they have, and on the map's own open ground where
   * they are outside. Nothing collides a resident, so this is the only thing
   * between one and a wall.
   */
  private standable(state: State, at: Point): boolean {
    if (state.room === WORLD_ROOM_SLUG) {
      return openGround({ width: WORLD_WIDTH, height: WORLD_HEIGHT }, worldSolids(), at);
    }
    const area = wanderArea(state.haunt, state.resident);
    return !area || inside(area, at);
  }
}

/** Whether a point is within some bounds. */
function inside(area: Rect, at: Point) {
  return (
    at.x >= area.x && at.y >= area.y && at.x <= area.x + area.width && at.y <= area.y + area.height
  );
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
