/**
 * The cars on the highway: what one is, how fast it goes, and where the
 * road puts it.
 *
 * Shared by all three layers, like the basketball's flight and the ladder of
 * eggs: the server decides when a car sets off and how far down the road it
 * has got, the browser draws it, and both work it out from the same three
 * numbers so neither has an opinion of its own.
 *
 * **A car is not a person and not a prop.** Nothing collides with one — you
 * can stand in the middle of the road and a car goes through you — and that
 * is deliberate rather than unfinished: the alternative is a lane of tarmac
 * somebody can be pinned in by scenery they have no way of hearing coming,
 * on a road at the far edge of a map with nothing on the other side of it.
 * The traffic is the view, not the hazard.
 */

import { TILE } from "./tenants";
import { HIGHWAY_LANES, HIGHWAY_PX } from "./wilderness";

/** Which way a car is going, which is also which lane it is in. */
export type Heading = "north" | "south";

/**
 * Which of the three pictures a car is drawn from.
 *
 * Three rather than one, because one is a car that passes again and again
 * and three is traffic. They are colours rather than kinds — the same shape
 * painted three ways — so nothing anywhere has to know what a car *is*.
 */
export const CAR_COLOURS = ["red", "blue", "pale"] as const;
export type CarColour = (typeof CAR_COLOURS)[number];

/** A car, as the wire carries it. */
export interface Car {
  id: string;
  heading: Heading;
  colour: CarColour;
  /** The middle of its picture, in world pixels down the map. */
  y: number;
}

/** The car's picture, as the props sheet holds it. */
export const CAR = { width: 44, height: 88 };

/**
 * How fast they go, in pixels a second.
 *
 * Measured against a person rather than picked: this is about four times a
 * sprint, which is what a road is for. It also decides the whole feel of the
 * thing — the road is sixty-nine rows deep, so a car is on the map for
 * eleven seconds and crossing it is an event rather than a fixture.
 */
export const CAR_SPEED_PX_S = 300;

/** Where a car's middle starts and ends, far enough off the map to be out of sight. */
const OFF_MAP = CAR.height;

/** Which way down the map a heading moves a car. */
export const goes = (heading: Heading): 1 | -1 => (heading === "south" ? 1 : -1);

/** Where a car of this heading comes onto the road. */
export function entryY(heading: Heading): number {
  return heading === "south" ? HIGHWAY_PX.y - OFF_MAP : HIGHWAY_PX.y + HIGHWAY_PX.height + OFF_MAP;
}

/** Whether a car has driven off the end of the road. */
export function goneBy(car: Car): boolean {
  return car.heading === "south"
    ? car.y > HIGHWAY_PX.y + HIGHWAY_PX.height + OFF_MAP
    : car.y < HIGHWAY_PX.y - OFF_MAP;
}

/**
 * Where a car sits across the road, in world pixels.
 *
 * Off `HIGHWAY_LANES`, which is what puts a northbound car in the eastern
 * lane and a southbound one in the western — drive on the right. A car nudges
 * a few pixels off the middle of its own lane so that two of them passing are
 * not mirror images: which side it nudges comes off the id, so it is the same
 * car on every screen rather than a wobble each browser invents.
 */
export function laneX(car: Car): number {
  const nudge = car.id.charCodeAt(0) % 2 === 0 ? TILE / 8 : -TILE / 8;
  return HIGHWAY_LANES[car.heading] + nudge;
}

/** A car moved on by however long has passed. */
export function drive(car: Car, deltaMs: number): Car {
  return { ...car, y: car.y + goes(car.heading) * CAR_SPEED_PX_S * (deltaMs / 1000) };
}
