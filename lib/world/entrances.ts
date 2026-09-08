/**
 * Tapping a building to go into it.
 *
 * Out of doors this is a menu as much as a place: the buildings *are* the
 * options, and pointing at one has to mean "take me there". It used to mean
 * "walk to the pixel I pointed at", and a building is solid, so the
 * pathfinder snapped the destination to the nearest open ground — which is
 * against the side wall. You picked Sandbox ERP and got a character standing
 * in the flowerbed beside it, with nothing to say what went wrong.
 *
 * So a tap anywhere on the picture is a tap on the front door. The walk ends
 * *in* the doorway rather than in front of it, because walking into a doorway
 * is already what goes inside (`DoorLatch`) — the route just does on its own
 * what the arrow keys would have done, and no second way into a building
 * exists to disagree with the first.
 *
 * Plain geometry, so `__tests__/entrances.test.ts` can hold the arithmetic
 * down without a scene: the frame is what a tap has to hit, and a route that
 * stops short of the doorway is a walk that arrives and does nothing.
 */

import type { Rect } from "./tenants";

export interface Point {
  x: number;
  y: number;
}

/**
 * Something on an outdoor map you can go into.
 *
 * Both `Building` (the world map) and `CampusBuilding` already have these
 * three, and so does the moored ferry, which is why this is a shape rather
 * than a class: a place hands over what it has already laid out.
 */
export interface Enterable {
  /** The whole picture. Not `solid` — the point is that a tap anywhere counts. */
  frame: Rect;
  /** The doorway. Walking into this is what actually goes inside. */
  door: Rect;
  /** Standing room outside the door: known walkable, and clear of the doorway. */
  outside: Point;
}

function contains(rect: Rect, at: Point): boolean {
  return (
    at.x >= rect.x && at.x < rect.x + rect.width && at.y >= rect.y && at.y < rect.y + rect.height
  );
}

export function centreOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The building a tap landed on, or null for open ground.
 *
 * The first match wins and the frames do not overlap — `tenants.test.ts` and
 * `campus.test.ts` both insist on that, since two buildings sharing pixels
 * would be two menu items under one finger.
 */
export function enterableAt(at: Point, all: readonly Enterable[]): Enterable | null {
  return all.find((e) => contains(e.frame, at)) ?? null;
}

/**
 * How a walk into a building ends: the standing room in front of the door,
 * then the doorway itself.
 *
 * Two waypoints rather than one because the pathfinder cannot be asked for
 * the second. It inflates every solid by half a body width so a route keeps
 * the sprite clear of walls, and the doorway sits directly against the
 * building — inside that padding, so the grid calls it blocked and snaps the
 * destination somewhere else. `outside` is the part it can plan to; the last
 * step is walked straight, which is safe precisely because the doorway is a
 * gap in nothing: it is open ground under the wall.
 */
export function walkInTo(target: Enterable): [Point, Point] {
  return [target.outside, centreOf(target.door)];
}
