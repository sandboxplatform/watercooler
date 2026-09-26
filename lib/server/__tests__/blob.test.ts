import { describe, expect, it } from "vitest";
import { CaveBlob } from "../blob";
import { VOLCANO_CAVE, VOLCANO_ISLAND, solidsOf } from "../../world/volcano";
import { REST_MAX_MS, clearFor, landed, leapAt } from "../../world/blob";
import { FEET_BELOW_CENTRE } from "../../world/basketball";

const TICK = 50;
const arena = VOLCANO_CAVE.arena!;
const clear = clearFor(arena, solidsOf(VOLCANO_CAVE));

/** A roll that hands back a fixed list, round and round. */
const rolling = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** Somebody with their feet on a spot. */
const standingOn = (at: { x: number; y: number }, facing: "up" | "down" | "left" | "right") => ({
  x: at.x,
  y: at.y - FEET_BELOW_CENTRE,
  facing,
});

describe("the blob in the cave", () => {
  it("starts sitting in the middle of the chamber, somewhere it can sit", () => {
    const blob = new CaveBlob(rolling([0.5]));
    expect(blob.position).toMatchObject({
      x: arena.x + arena.width / 2,
      y: arena.y + arena.height / 2,
      z: 0,
    });
    expect(clear(blob.position)).toBe(true);
  });

  it("refuses a floor with no chamber in it", () => {
    expect(() => new CaveBlob(Math.random, VOLCANO_ISLAND)).toThrow(/no floor/);
  });

  it("sits out its rest, then hops on from where it landed — and says so only then", () => {
    const blob = new CaveBlob(rolling([0.2, 0.7, 0.4, 0.9, 0.1]));
    const before = blob.state.leap;
    let ticks = 0;
    while (!blob.step(TICK)) ticks++;
    expect(ticks * TICK).toBeGreaterThanOrEqual(before.ms + before.rest - TICK);
    expect(blob.state.leap.from).toEqual(before.to);
    expect(blob.state.leap.kind).toBe("hop");
    expect(blob.state.elapsed).toBe(0);
    // The arc in between is nobody's news: nothing to say until the next one.
    expect(blob.step(TICK)).toBe(false);
  });

  it("can be punched from arm's length, and goes flying away from the puncher", () => {
    const blob = new CaveBlob(rolling([0.5]));
    const at = blob.position;
    const leap = blob.punch(standingOn({ x: at.x - 40, y: at.y }, "right"));
    expect(leap).not.toBeNull();
    expect(leap!.kind).toBe("knocked");
    expect(leap!.to.x).toBeGreaterThan(at.x);
    expect(blob.state.leap).toBe(leap);
    expect(clear(leap!.to)).toBe(true);
  });

  it("cannot be punched from across the cave", () => {
    const blob = new CaveBlob(rolling([0.5]));
    const at = blob.position;
    expect(blob.punch(standingOn({ x: at.x - 200, y: at.y }, "right"))).toBeNull();
    expect(blob.state.leap.kind).toBe("hop");
  });

  it("cannot be punched again while it is still sailing, and can once it has landed", () => {
    const blob = new CaveBlob(rolling([0.5]));
    const first = blob.punch(standingOn(blob.position, "right"))!;
    // Chase it and swing again mid-air: refused, whoever is standing there.
    blob.step(TICK);
    const midair = blob.position;
    expect(blob.punch(standingOn(midair, "left"))).toBeNull();
    // Once it is down, dazed on the floor, it is fair game again.
    while (!landed(blob.state.leap, blob.state.elapsed)) blob.step(TICK);
    expect(blob.state.leap).toBe(first);
    expect(blob.punch(standingOn(first.to, "left"))).not.toBeNull();
  });

  it("can be punched out of the air in an ordinary hop", () => {
    const blob = new CaveBlob(rolling([0.3, 0.6, 0.5, 0.2]));
    while (!blob.step(TICK));
    blob.step(TICK * 3);
    const hopping = leapAt(blob.state.leap, blob.state.elapsed);
    expect(hopping.z).toBeGreaterThan(0);
    const leap = blob.punch(standingOn(hopping, "up"));
    expect(leap?.kind).toBe("knocked");
    expect(leap?.from).toEqual({ x: Math.round(hopping.x), y: Math.round(hopping.y) });
  });

  /**
   * Nothing collides the blob but the rules, so this is the test that says
   * it stays in the cave: ten minutes of hopping with somebody following it
   * about and punching it whenever it will let them, and every landing on
   * clear floor inside the chamber.
   */
  it("never lands anywhere it could not sit, however it is punched about", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const blob = new CaveBlob(random);
    const facings = ["up", "down", "left", "right"] as const;
    let punches = 0;
    for (let t = 0; t < 10 * 60_000; t += TICK) {
      blob.step(TICK);
      if (random() < 0.05) {
        const at = blob.position;
        const from = { x: at.x + (random() - 0.5) * 60, y: at.y + (random() - 0.5) * 60 };
        if (blob.punch(standingOn(from, facings[Math.floor(random() * 4)]))) punches++;
      }
      const { leap } = blob.state;
      expect(clear(leap.to), `${leap.kind} to ${leap.to.x},${leap.to.y}`).toBe(true);
    }
    expect(punches).toBeGreaterThan(20);
  });

  it("does not sit still for longer than its longest rest", () => {
    const blob = new CaveBlob(rolling([0.99, 0.5, 0.5, 0.99, 0.99]));
    let ticks = 0;
    while (!blob.step(TICK)) ticks++;
    while (!blob.step(TICK)) ticks++;
    expect(ticks * TICK).toBeLessThanOrEqual(REST_MAX_MS * 2 + 2_000);
  });
});
