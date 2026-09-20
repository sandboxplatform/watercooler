import { describe, expect, it } from "vitest";
import { GAP_MS, ON_THE_ROAD, Traffic } from "../traffic";
import { CAR_SPEED_PX_S, entryY, goneBy, laneX } from "../../world/traffic";
import { HIGHWAY_LANES, HIGHWAY_PX } from "../../world/wilderness";

/**
 * A roll that says what it is told to, so a road can be driven by hand.
 *
 * The order the `Traffic` asks in is: the gap to the first car, then — each
 * time one is due — the gap to the next, that car's heading, and its colour.
 * So the third value is which way the first car goes.
 */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** Run the road on for this long, a tick at a time, counting what it said. */
function run(traffic: Traffic, ms: number, tick = 50, from = 0) {
  let said = 0;
  for (let t = 0; t < ms; t += tick) if (traffic.step(tick, from + t)) said++;
  return said;
}

describe("the traffic on the highway", () => {
  it("says nothing until the first car sets off", () => {
    const traffic = new Traffic(rolls(1));
    expect(traffic.onTheRoad).toEqual([]);
    // The longest gap there is, less a tick: nothing has happened yet.
    expect(run(traffic, GAP_MS.most - 100)).toBe(0);
    expect(traffic.onTheRoad).toEqual([]);
  });

  it("sets one off, and says so exactly once", () => {
    const traffic = new Traffic(rolls(0));
    // The shortest gap: one car, one message.
    expect(run(traffic, GAP_MS.least + 100)).toBe(1);
    expect(traffic.onTheRoad).toHaveLength(1);
  });

  /**
   * The whole reason this is published on change rather than on every tick:
   * a car travels in a straight line at a speed both sides have written
   * down, so between one setting off and the next there is nothing to say.
   */
  it("says nothing at all while a car simply drives", () => {
    const traffic = new Traffic(rolls(0));
    run(traffic, GAP_MS.least + 100);
    const started = traffic.onTheRoad[0].y;
    // A second and a half, well inside the next gap.
    expect(run(traffic, 1_500, 50, GAP_MS.least + 100)).toBe(0);
    const moved = Math.abs(traffic.onTheRoad[0].y - started);
    expect(moved).toBeGreaterThan(CAR_SPEED_PX_S);
    expect(moved).toBeLessThan(CAR_SPEED_PX_S * 2);
  });

  it("drives a car the length of the road and off the end of it", () => {
    const traffic = new Traffic(rolls(0));
    run(traffic, GAP_MS.least + 100);
    const [car] = traffic.onTheRoad;
    expect(goneBy(car)).toBe(false);
    // Long enough to cross the map. Others will have set off behind it by
    // then — the crossing is longer than the shortest gap — so it is this
    // car that has to be gone rather than the road that has to be empty.
    const crossing = ((HIGHWAY_PX.height + 400) / CAR_SPEED_PX_S) * 1000;
    run(traffic, crossing, 50, GAP_MS.least + 100);
    expect(traffic.onTheRoad.map((c) => c.id)).not.toContain(car.id);
  });

  /**
   * A ceiling rather than a queue: it drops the car it would have started
   * instead of owing one, so a road that has been busy goes quiet
   * afterwards rather than catching up.
   */
  it("keeps a car or two on it and no more", () => {
    // Always the shortest gap, so cars come as fast as they ever will.
    const traffic = new Traffic(rolls(0));
    for (let t = 0; t < GAP_MS.least * 20; t += 50) {
      traffic.step(50, t);
      expect(traffic.onTheRoad.length).toBeLessThanOrEqual(ON_THE_ROAD);
    }
  });

  it("puts a northbound car in the east lane and a southbound one in the west", () => {
    const north = new Traffic(rolls(0, 0, 0.1, 0));
    run(north, GAP_MS.least + 100);
    expect(north.onTheRoad[0].heading).toBe("north");
    const south = new Traffic(rolls(0, 0, 0.9, 0));
    run(south, GAP_MS.least + 100);
    expect(south.onTheRoad[0].heading).toBe("south");

    // Each within its own lane, a nudge off the middle either way.
    for (const car of [...north.onTheRoad, ...south.onTheRoad]) {
      expect(Math.abs(laneX(car) - HIGHWAY_LANES[car.heading])).toBeLessThan(12);
    }
    // A southbound car comes on at the top and a northbound one at the foot.
    expect(entryY("south")).toBeLessThan(HIGHWAY_PX.y);
    expect(entryY("north")).toBeGreaterThan(HIGHWAY_PX.y + HIGHWAY_PX.height);
  });

  /** Whole pixels are plenty for something a quarter of a mile away. */
  it("carries whole pixels on the wire", () => {
    const traffic = new Traffic(rolls(0));
    run(traffic, GAP_MS.least + 175, 25);
    for (const car of traffic.onTheRoad) expect(car.y).toBe(Math.round(car.y));
  });
});
