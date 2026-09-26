import { describe, expect, it } from "vitest";
import {
  BLOB_RADIUS,
  DAZED_MS,
  HOP_MAX_PX,
  HOP_MIN_PX,
  KNOCK_PX,
  PUNCH_REACH_PX,
  PUNCH_REACH_Z,
  REST_MAX_MS,
  REST_MIN_MS,
  clearFor,
  knocked,
  landed,
  leapAt,
  nextHop,
  rested,
  sitting,
  withinPunch,
  type Leap,
} from "./blob";
import { FEET_BELOW_CENTRE } from "./basketball";

/** A roll that hands back a fixed list, round and round. */
const rolling = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const ARENA = { x: 0, y: 0, width: 1000, height: 1000 };

describe("a leap", () => {
  const leap: Leap = {
    from: { x: 100, y: 100 },
    to: { x: 200, y: 140 },
    ms: 500,
    height: 40,
    kind: "hop",
    rest: 800,
  };

  it("sets off from one end and comes down at the other, on the floor both times", () => {
    expect(leapAt(leap, 0)).toMatchObject({ x: 100, y: 100, z: 0 });
    expect(leapAt(leap, 500)).toMatchObject({ x: 200, y: 140, z: 0 });
  });

  it("is at the top of its arc half way, and at the height it was given", () => {
    const top = leapAt(leap, 250);
    expect(top).toMatchObject({ x: 150, y: 120 });
    expect(top.z).toBeCloseTo(40);
    // A parabola, so symmetric about the middle.
    expect(leapAt(leap, 100).z).toBeCloseTo(leapAt(leap, 400).z);
  });

  it("sits where it landed once the leap is over, however long ago that was", () => {
    expect(leapAt(leap, 60_000)).toMatchObject({ x: 200, y: 140, z: 0 });
    expect(landed(leap, 499)).toBe(false);
    expect(landed(leap, 500)).toBe(true);
    expect(rested(leap, 1_299)).toBe(false);
    expect(rested(leap, 1_300)).toBe(true);
  });

  it("is a blob sitting still when it goes nowhere in no time", () => {
    const still = sitting({ x: 50, y: 60 }, 900);
    expect(landed(still, 0)).toBe(true);
    expect(leapAt(still, 0)).toMatchObject({ x: 50, y: 60, z: 0 });
    expect(rested(still, 900)).toBe(true);
  });
});

describe("a hop", () => {
  it("goes a short way off, and lands somewhere clear", () => {
    const clear = clearFor(ARENA, []);
    for (let seed = 0; seed < 40; seed++) {
      const roll = rolling([(seed * 0.37) % 1, (seed * 0.71) % 1, (seed * 0.13) % 1, 0.5]);
      const hop = nextHop({ x: 500, y: 500 }, roll, clear);
      const far = Math.hypot(hop.to.x - 500, hop.to.y - 500);
      expect(far).toBeGreaterThanOrEqual(HOP_MIN_PX - 1);
      expect(far).toBeLessThanOrEqual(HOP_MAX_PX + 1);
      expect(clear(hop.to)).toBe(true);
      expect(hop.rest).toBeGreaterThanOrEqual(REST_MIN_MS);
      expect(hop.rest).toBeLessThanOrEqual(REST_MAX_MS);
      expect(hop.kind).toBe("hop");
    }
  });

  it("hops on the spot when there is nowhere clear to go, rather than not at all", () => {
    const hop = nextHop({ x: 500, y: 500 }, rolling([0.3, 0.6]), () => false);
    expect(hop.to).toEqual({ x: 500, y: 500 });
    expect(hop.ms).toBeGreaterThan(0);
  });

  it("will not land on a wall, or with any of itself over the edge of its floor", () => {
    const wall = { x: 520, y: 0, width: 40, height: 1000 };
    const clear = clearFor(ARENA, [wall]);
    expect(clear({ x: 520 - BLOB_RADIUS - 1, y: 500 })).toBe(true);
    expect(clear({ x: 520 - BLOB_RADIUS + 1, y: 500 })).toBe(false);
    expect(clear({ x: BLOB_RADIUS - 1, y: 500 })).toBe(false);
    expect(clear({ x: 500, y: 1001 })).toBe(false);
  });
});

describe("a punch", () => {
  const clear = clearFor(ARENA, []);
  /** Somebody standing with their feet at a spot. */
  const standingAt = (x: number, y: number, facing: "up" | "down" | "left" | "right" = "down") => ({
    x,
    y: y - FEET_BELOW_CENTRE,
    facing,
  });

  it("reaches as far as an arm, measured from the feet", () => {
    const blob = { x: 500, y: 500, z: 0 };
    expect(withinPunch(blob, standingAt(500 - PUNCH_REACH_PX, 500))).toBe(true);
    expect(withinPunch(blob, standingAt(500 - PUNCH_REACH_PX - 2, 500))).toBe(false);
    // The middle of the character is forty pixels above the feet; measured
    // from there, a blob at your toes would be out of reach of a punch.
    expect(withinPunch(blob, { x: 500, y: 500, facing: "down" } as never)).toBe(true);
  });

  it("cannot reach a blob over your head", () => {
    expect(withinPunch({ x: 500, y: 500, z: PUNCH_REACH_Z + 1 }, standingAt(500, 500))).toBe(false);
    expect(withinPunch({ x: 500, y: 500, z: PUNCH_REACH_Z }, standingAt(500, 500))).toBe(true);
  });

  it("sends it flying away from whoever threw it, a long way and high", () => {
    const leap = knocked({ x: 500, y: 500 }, standingAt(460, 500, "up"), clear);
    expect(leap.kind).toBe("knocked");
    expect(leap.to.y).toBe(500);
    expect(leap.to.x).toBeGreaterThan(500);
    expect(leap.to.x - 500).toBeGreaterThan(KNOCK_PX * 0.9);
    expect(leap.to.x - 500).toBeLessThanOrEqual(KNOCK_PX);
    expect(leap.rest).toBe(DAZED_MS);
    // Higher than any hop, which is most of what makes it read as a punch.
    expect(leap.height).toBeGreaterThan(60);
  });

  it("goes the way you face when you are standing right on top of it", () => {
    const leap = knocked({ x: 500, y: 500 }, standingAt(500, 500, "left"), clear);
    expect(leap.to.x).toBeLessThan(500);
    expect(leap.to.y).toBe(500);
  });

  it("stops against a wall rather than going through it, and sooner for it", () => {
    const wall = { x: 600, y: 0, width: 40, height: 1000 };
    const walled = clearFor(ARENA, [wall]);
    const leap = knocked({ x: 500, y: 500 }, standingAt(460, 500), walled);
    expect(leap.to.x + BLOB_RADIUS).toBeLessThanOrEqual(600);
    expect(walled(leap.to)).toBe(true);
    const open = knocked({ x: 500, y: 500 }, standingAt(460, 500), clear);
    expect(leap.ms).toBeLessThan(open.ms);
  });

  it("comes down on clear floor when it is punched from over something it could not sit on", () => {
    // Caught mid-hop over a crystal: the line out starts inside it, and the
    // blob has to land past it rather than on it.
    const crystal = { x: 480, y: 480, width: 40, height: 40 };
    const beyond = { x: 700, y: 0, width: 40, height: 1000 };
    const walled = clearFor(ARENA, [crystal, beyond]);
    const leap = knocked({ x: 500, y: 500 }, standingAt(460, 500), walled);
    expect(walled({ x: 500, y: 500 })).toBe(false);
    expect(walled(leap.to)).toBe(true);
    expect(leap.to.x).toBeGreaterThan(520);
    expect(leap.to.x + BLOB_RADIUS).toBeLessThanOrEqual(700);
    // And with nothing clear anywhere along the line, where the hop was
    // going to land anyway.
    const nowhere = knocked({ x: 500, y: 500 }, standingAt(460, 500), () => false, { x: 1, y: 2 });
    expect(nowhere.to).toEqual({ x: 1, y: 2 });
  });

  it("goes nowhere, but still goes up, when it is punched into a corner", () => {
    const leap = knocked({ x: 500, y: 500 }, standingAt(460, 500), () => false);
    expect(leap.to).toEqual({ x: 500, y: 500 });
    expect(leap.ms).toBeGreaterThan(0);
    expect(leap.height).toBeGreaterThan(0);
  });
});
