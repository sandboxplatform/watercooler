/**
 * The traffic on the highway, and the server holding it.
 *
 * Cars come down the road and go up it now and then, and which cars are on
 * it is decided here for the same reason the basketball's flight and the
 * chicken's wandering are: everybody standing on the world map is looking at
 * the same road, and a road each browser invented for itself would have two
 * people beside each other watching different traffic.
 *
 * **It is published when it changes, not on every tick.** A car travels in a
 * straight line at a speed both sides know, so between one car setting off
 * and the next there is nothing to say — `drive` in `lib/world/traffic.ts`
 * is the whole of it, and the browser runs it against its own clock. That is
 * the opposite of the ball, which is published twenty times a second, and
 * the reason is the same in both cases: the ball is somebody's throw and
 * nobody can work out where it goes next, while a car is a car on a road.
 *
 * In memory, beside the eggs lying in the grass and the meetings: traffic is
 * something happening rather than something kept, and a server that restarts
 * has an empty road for a few seconds.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger";
import { CAR_COLOURS, drive, entryY, goneBy, type Car, type Heading } from "../world/traffic";

/**
 * How many may be on the road at once.
 *
 * "A car or two", which is what the wilderness wants: this is the far edge
 * of a map nobody has any business at, and a stream of traffic would turn a
 * quiet road into the busiest thing in the world.
 */
export const ON_THE_ROAD = 3;

/** How long between one car and the next, at the least and at the most. */
export const GAP_MS = { least: 9_000, most: 45_000 };

const log = createLogger("Traffic");

export class Traffic {
  private cars: Car[] = [];
  /** When the next one sets off. Zero until the road has been stepped once. */
  private nextAt = 0;

  /**
   * `random` is taken rather than reached for, exactly as the nest takes a
   * roll: a road that can only be driven by `Math.random` is a road whose
   * tests have to wait for it.
   */
  constructor(private readonly random: () => number = Math.random) {}

  /** What is on the road, for the wire and for a browser just arriving. */
  get onTheRoad(): Car[] {
    return this.cars.map(({ id, heading, colour, y }) => ({
      id,
      heading,
      colour,
      y: Math.round(y),
    }));
  }

  /**
   * Move the road on, and answer whether anything about it is now news.
   *
   * News is a car setting off or a car leaving; everything in between is a
   * straight line at a known speed, which every browser is already drawing
   * for itself.
   */
  step(deltaMs: number, now: number): boolean {
    // Through `drive`, which is the browser's own step: the speed is written
    // down once and the two sides cannot disagree about where a car has got
    // to between the messages that say anything at all.
    const before = this.cars.length;
    this.cars = this.cars.map((car) => drive(car, deltaMs)).filter((car) => !goneBy(car));
    let changed = this.cars.length !== before;

    if (this.nextAt === 0) this.nextAt = now + this.gap();
    if (now >= this.nextAt) {
      this.nextAt = now + this.gap();
      // The ceiling drops the car rather than delaying it, so a road that is
      // busy stays quiet afterwards instead of owing a queue of them.
      if (this.cars.length < ON_THE_ROAD) {
        const car = this.setOff();
        this.cars.push(car);
        // Debug rather than info: this is every few tens of seconds for as
        // long as anybody is standing on the map, which is a great deal
        // oftener than a chicken lays an egg.
        log.debug(`a ${car.colour} car heading ${car.heading} on the highway`);
        changed = true;
      }
    }
    return changed;
  }

  private gap(): number {
    return GAP_MS.least + this.random() * (GAP_MS.most - GAP_MS.least);
  }

  private setOff(): Car {
    const heading: Heading = this.random() < 0.5 ? "north" : "south";
    return {
      id: randomUUID(),
      heading,
      colour: CAR_COLOURS[Math.floor(this.random() * CAR_COLOURS.length) % CAR_COLOURS.length],
      y: entryY(heading),
    };
  }
}
