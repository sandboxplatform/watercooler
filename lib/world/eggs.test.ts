import { describe, expect, it } from "vitest";
import {
  EGG_CHANCE,
  EGG_KINDS,
  EGG_REACH_PX,
  EGG_TIER_COUNT,
  EGG_WEIGHT_TOTAL,
  basketSize,
  bestIn,
  eggKind,
  eggSpot,
  eggWithinReach,
  isEggTier,
  oneIn,
  shareOf,
  tierFromRoll,
  type EggTally,
  type EggTier,
} from "./eggs";
import { FEET_BELOW_CENTRE } from "./basketball";

describe("the ladder", () => {
  it("has unique ids, resolves each of them, and gives every one a weight", () => {
    const ids = EGG_KINDS.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of EGG_KINDS) {
      expect(eggKind(kind.id)?.id).toBe(kind.id);
      expect(kind.weight).toBeGreaterThan(0);
      expect(kind.name).not.toBe("");
      expect(kind.note).not.toBe("");
    }
    expect(EGG_TIER_COUNT).toBe(EGG_KINDS.length);
  });

  /**
   * The ladder has to *be* a ladder: the point of a rainbow egg is that it
   * is rarer than a copper one, and a catalogue listed commonest first with
   * a weight out of order would read as a rarity that is not one.
   */
  it("runs from commonest to rarest, with no two rungs level", () => {
    for (let i = 1; i < EGG_KINDS.length; i++) {
      expect(EGG_KINDS[i].weight).toBeLessThan(EGG_KINDS[i - 1].weight);
    }
  });

  it("is rare enough at the top to be worth telling somebody about", () => {
    // Not a number pinned for its own sake: what matters is that the last
    // rung is the sort of thing that turns up once in a long while, and
    // that the first is the ordinary one.
    expect(oneIn("rainbow")).toBeGreaterThanOrEqual(25);
    expect(shareOf("plain")).toBeGreaterThan(0.25);
  });

  it("adds up to one whole, and reports each share off its own weight", () => {
    const total = EGG_KINDS.reduce((sum, kind) => sum + shareOf(kind.id), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(EGG_WEIGHT_TOTAL).toBe(EGG_KINDS.reduce((sum, kind) => sum + kind.weight, 0));
    for (const kind of EGG_KINDS) {
      expect(oneIn(kind.id)).toBe(Math.round(EGG_WEIGHT_TOTAL / kind.weight));
    }
  });

  it("knows a tier from anything else", () => {
    expect(isEggTier("rainbow")).toBe(true);
    expect(isEggTier("golden")).toBe(false);
    expect(isEggTier(7)).toBe(false);
    expect(eggKind("golden")).toBeUndefined();
  });

  /**
   * Deliberately rare, and a bound rather than the number itself: what
   * has to hold is that an egg is a thing that happens now and then to
   * somebody who was not waiting for one. A chance loose enough to farm
   * turns walking up to Michael into a chore with a payout at the end.
   */
  it("leaves a fright worth waiting for, and not one worth farming", () => {
    expect(EGG_CHANCE).toBeGreaterThan(0);
    expect(EGG_CHANCE).toBeLessThanOrEqual(0.01);
  });
});

describe("rolling a tier", () => {
  it("gives the commonest at the bottom of the range and the rarest at the top", () => {
    expect(tierFromRoll(0)).toBe(EGG_KINDS[0].id);
    expect(tierFromRoll(0.999999)).toBe(EGG_KINDS[EGG_KINDS.length - 1].id);
  });

  it("answers every roll, including ones outside the range", () => {
    for (const roll of [-1, 0, 0.5, 1, 2, Number.EPSILON]) {
      expect(isEggTier(tierFromRoll(roll))).toBe(true);
    }
  });

  /**
   * Each kind's slice is exactly its own weight wide. Walked rather than
   * sampled, because the boundary between two rungs is the one place this
   * can be wrong and a sample of a million would still land either side of
   * it by luck.
   */
  it("gives each kind a slice the width of its weight", () => {
    let seen = 0;
    for (const kind of EGG_KINDS) {
      const from = seen / EGG_WEIGHT_TOTAL;
      seen += kind.weight;
      const to = seen / EGG_WEIGHT_TOTAL;
      expect(tierFromRoll(from)).toBe(kind.id);
      // A hair inside the top of the slice is still this kind; the top
      // itself belongs to the next one along.
      expect(tierFromRoll(to - 1e-9)).toBe(kind.id);
    }
  });

  it("comes out in roughly the declared proportions over a long run", () => {
    const counts = new Map<EggTier, number>();
    const runs = 120_000;
    for (let i = 0; i < runs; i++) {
      // A settled sweep rather than a random one: the proportions are the
      // thing being checked, so the rolls must not be what varies.
      const tier = tierFromRoll((i + 0.5) / runs);
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    for (const kind of EGG_KINDS) {
      expect((counts.get(kind.id) ?? 0) / runs).toBeCloseTo(shareOf(kind.id), 3);
    }
  });
});

describe("reaching for one", () => {
  /**
   * The one crossing between a person's line and the ground's. A person's
   * `y` is the middle of their 96px frame; an egg lies on the grass under
   * their feet, and forgetting it is what once put a carried basketball
   * over its carrier's head.
   */
  it("lays an egg at the layer's feet rather than at their middle", () => {
    expect(eggSpot({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 + FEET_BELOW_CENTRE });
  });

  it("is within reach when it is at your feet, and not across the path", () => {
    const standing = { x: 500, y: 400 };
    const feet = eggSpot(standing);
    expect(eggWithinReach(feet, standing)).toBe(true);
    expect(eggWithinReach({ x: feet.x + EGG_REACH_PX - 1, y: feet.y }, standing)).toBe(true);
    expect(eggWithinReach({ x: feet.x + EGG_REACH_PX + 1, y: feet.y }, standing)).toBe(false);
  });

  /**
   * The circle is centred on the feet rather than on the sprite, which is
   * only visible above and below: an egg the reach below the *feet* is in,
   * and the same distance below the middle of the character — which is
   * nearer the top of their head than the grass — is out.
   */
  it("draws its reach round the feet, not round the character", () => {
    const standing = { x: 500, y: 400 };
    const feet = eggSpot(standing);
    expect(eggWithinReach({ x: feet.x, y: feet.y + EGG_REACH_PX - 1 }, standing)).toBe(true);
    expect(eggWithinReach({ x: feet.x, y: standing.y + EGG_REACH_PX + 1 }, standing)).toBe(true);
    expect(eggWithinReach({ x: feet.x, y: standing.y - EGG_REACH_PX }, standing)).toBe(false);
  });
});

describe("a basket", () => {
  const tally = (tier: EggTier, count: number): EggTally => ({
    person: "coop",
    name: "Coop",
    tier,
    count,
    latest: "2026-01-01T00:00:00.000Z",
  });

  it("counts every egg in it, not every kind", () => {
    expect(basketSize([tally("plain", 4), tally("jade", 2)])).toBe(6);
    expect(basketSize([])).toBe(0);
  });

  it("names the rarest kind in it, and nothing for an empty one", () => {
    expect(bestIn([tally("plain", 9), tally("jade", 1)])?.id).toBe("jade");
    expect(bestIn([tally("rainbow", 1), tally("gilded", 3)])?.id).toBe("rainbow");
    expect(bestIn([])).toBeNull();
  });
});
