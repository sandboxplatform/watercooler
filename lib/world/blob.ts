/**
 * The blob in the volcano's cave: how it hops, and what a punch does to it.
 *
 * Everything the blob does is a **leap** — from one patch of cave floor to
 * another, over a known arc in a known time, and then a rest of a known
 * length before the next one. A hop of its own accord is a short leap and a
 * punch is a long, high one; nothing else ever moves it. That is what lets
 * the server say where it is going once, when it sets off, rather than
 * twenty times a second while it is in the air: every browser in the cave
 * runs the same arc against its own clock and draws it in the same place.
 * It is the traffic's arrangement rather than the basketball's, for the
 * traffic's reason — a car is a straight line at a known speed, and a hop is
 * a parabola between two known points.
 *
 * Pure and shared: the server decides the leaps (`lib/server/blob.ts`), the
 * scene draws them (`components/game/systems/Blob.ts`), and both ask this
 * where along one the blob has got to.
 */

import type { Facing } from "../presence-types";
import type { Rect } from "./tenants";
import { groundUnder } from "./basketball";

export interface Point {
  x: number;
  y: number;
}

/** One leap: off one patch of floor, through the air, onto another. */
export interface Leap {
  from: Point;
  to: Point;
  /** How long it is in the air, in milliseconds. Zero for a blob sitting still. */
  ms: number;
  /** How high the top of the arc is, in pixels off the floor. */
  height: number;
  /** A hop of its own accord, or sent flying by a punch. */
  kind: "hop" | "knocked";
  /** How long it sits once it has landed, before it hops again. */
  rest: number;
}

/** Half the blob's width on the ground: how close it may come to a wall. */
export const BLOB_RADIUS = 18;

/**
 * How far one hop goes, and how long and high it is.
 *
 * Short on purpose. A blob covering the chamber in three bounds is a blob
 * nobody can get a hand on, and the point of it is being punched; a tile or
 * two at a time is something to walk up to.
 */
export const HOP_MIN_PX = 40;
export const HOP_MAX_PX = 110;
const HOP_MS_MIN = 420;
const HOP_MS_MAX = 600;
const HOP_HEIGHT_MIN = 20;
const HOP_HEIGHT_MAX = 38;
/** How long it sits between hops, which is the window for a punch. */
export const REST_MIN_MS = 700;
export const REST_MAX_MS = 1_700;

/**
 * How far a punch reaches: from the puncher's feet to where the blob is.
 *
 * Measured off the feet rather than off the middle of the character, which
 * is the basketball's lesson — a person's `y` is the middle of a 96px frame
 * and the blob's is the patch of floor it sits on. A bit more than the
 * ball's reach, because a punch is at arm's length and a pick-up is at the
 * toes.
 */
export const PUNCH_REACH_PX = 64;
/** Higher than this and it is over your head, out of reach of a punch. */
export const PUNCH_REACH_Z = 48;

/**
 * What a punch does: sends it this far, this high, over this long, and
 * leaves it sitting dazed for this long where it lands.
 *
 * Dazed long enough to be seen to be — the stars go round for as long as it
 * sits — and short enough that it is back to hopping before anybody has
 * walked over to it again.
 */
export const KNOCK_PX = 230;
const KNOCK_MS = 620;
const KNOCK_HEIGHT = 72;
export const DAZED_MS = 1_800;

/** How finely a knock's path is checked against the walls, in pixels. */
const STEP_PX = 6;

/** A blob sitting still at a spot, for a given while. */
export function sitting(at: Point, rest = REST_MIN_MS): Leap {
  return { from: at, to: at, ms: 0, height: 0, kind: "hop", rest };
}

/**
 * Where along a leap the blob is, `elapsed` milliseconds after it set off.
 *
 * On the ground in a straight line between the two ends, and up off it on a
 * parabola peaking half way — `4h·t·(1−t)`, which is the arc a thrown thing
 * actually follows and needs no integrating. Past the end it is sitting at
 * `to`, which is resting.
 */
export function leapAt(leap: Leap, elapsed: number): Point & { z: number; t: number } {
  const t = leap.ms <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / leap.ms));
  return {
    x: leap.from.x + (leap.to.x - leap.from.x) * t,
    y: leap.from.y + (leap.to.y - leap.from.y) * t,
    z: 4 * leap.height * t * (1 - t),
    t,
  };
}

/** Whether it has come down, and is sitting. */
export function landed(leap: Leap, elapsed: number): boolean {
  return elapsed >= leap.ms;
}

/** Whether the rest after landing is over, and it is time for another hop. */
export function rested(leap: Leap, elapsed: number): boolean {
  return elapsed >= leap.ms + leap.rest;
}

/**
 * Whether a blob could sit here: inside its patch of floor, and with none of
 * its footprint on anything solid.
 *
 * The footprint is a box as wide as the blob and half as deep, on the floor
 * under it — which is what stands on the ground, the rest of it being the
 * round top of a jelly.
 */
export function clearFor(arena: Rect, solids: readonly Rect[]): (at: Point) => boolean {
  return (at) => {
    if (at.x - BLOB_RADIUS < arena.x || at.x + BLOB_RADIUS > arena.x + arena.width) return false;
    if (at.y - BLOB_RADIUS < arena.y || at.y > arena.y + arena.height) return false;
    const box = {
      x: at.x - BLOB_RADIUS,
      y: at.y - BLOB_RADIUS / 2,
      width: BLOB_RADIUS * 2,
      height: BLOB_RADIUS,
    };
    return !solids.some(
      (r) =>
        box.x < r.x + r.width &&
        box.x + box.width > r.x &&
        box.y < r.y + r.height &&
        box.y + box.height > r.y,
    );
  };
}

const between = (roll: () => number, min: number, max: number) => min + roll() * (max - min);

/**
 * The next hop from where it is sitting: somewhere a short way off in any
 * direction, clear to land on.
 *
 * Only the landing is checked. It is in the air in between, and a blob
 * hopping clean over a stalagmite is a better thing to have happen than a
 * blob that will not go anywhere near one. A dozen tries and then a hop on
 * the spot — a blob wedged in a corner still hops, which is the one thing
 * about it that must not stop.
 */
export function nextHop(from: Point, roll: () => number, clear: (at: Point) => boolean): Leap {
  const ms = Math.round(between(roll, HOP_MS_MIN, HOP_MS_MAX));
  const height = Math.round(between(roll, HOP_HEIGHT_MIN, HOP_HEIGHT_MAX));
  const rest = Math.round(between(roll, REST_MIN_MS, REST_MAX_MS));
  for (let i = 0; i < 12; i++) {
    const angle = roll() * Math.PI * 2;
    const reach = between(roll, HOP_MIN_PX, HOP_MAX_PX);
    const to = {
      x: Math.round(from.x + Math.cos(angle) * reach),
      y: Math.round(from.y + Math.sin(angle) * reach),
    };
    if (clear(to)) return { from, to, ms, height, kind: "hop", rest };
  }
  return { from, to: from, ms, height, kind: "hop", rest };
}

const FACING_VECTORS: Record<Facing, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Whether somebody standing there could punch it. */
export function withinPunch(blob: Point & { z: number }, puncher: Point): boolean {
  if (blob.z > PUNCH_REACH_Z) return false;
  const feet = groundUnder(puncher);
  return Math.hypot(blob.x - feet.x, blob.y - feet.y) <= PUNCH_REACH_PX;
}

/**
 * Sent flying: away from whoever threw the punch, as far as `KNOCK_PX` or
 * the first thing in the way.
 *
 * Away along the line from their feet to the blob, which is the direction a
 * punch actually lands in; along the way they face only when they are
 * standing so nearly on top of it that the line says nothing. Unlike a hop
 * the whole path is checked, because this one is low and fast and it stops
 * against a wall rather than sailing over it — a punch into a corner sends
 * it a stride, not through the rock.
 *
 * **It may be punched from somewhere it could not sit.** A hop checks only
 * its landing, so a blob caught mid-air is as likely as not over a crystal
 * or the lava. So the walk out along the line skips whatever is under it to
 * begin with and stops at the first thing in the way *after* it has found
 * clear floor; and if there is none anywhere along the line, it comes down
 * at `fallback` — for a blob caught mid-hop, where that hop was going to
 * land, which is clear because a hop only ever lands somewhere clear. The
 * soak test in `blob.test.ts` is what found this: a blob punched over a
 * crystal and knocked no distance at all came down inside it.
 */
export function knocked(
  from: Point,
  puncher: Point & { facing: Facing },
  clear: (at: Point) => boolean,
  fallback: Point = from,
): Leap {
  const feet = groundUnder(puncher);
  let dx = from.x - feet.x;
  let dy = from.y - feet.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) {
    ({ x: dx, y: dy } = FACING_VECTORS[puncher.facing]);
  } else {
    dx /= length;
    dy /= length;
  }
  let reached: Point | null = clear(from) ? from : null;
  for (let d = STEP_PX; d <= KNOCK_PX; d += STEP_PX) {
    const next = { x: Math.round(from.x + dx * d), y: Math.round(from.y + dy * d) };
    if (clear(next)) reached = next;
    else if (reached) break;
  }
  const to = reached ?? fallback;
  // As long in the air as the distance it covers, near enough: a punch into
  // a wall is a short flight rather than a slow one.
  const share = Math.hypot(to.x - from.x, to.y - from.y) / KNOCK_PX;
  return {
    from,
    to,
    ms: Math.round(KNOCK_MS * (0.5 + share / 2)),
    height: Math.round(KNOCK_HEIGHT * (0.6 + share * 0.4)),
    kind: "knocked",
    rest: DAZED_MS,
  };
}
