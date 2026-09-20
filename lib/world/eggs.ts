/**
 * The eggs Michael leaves behind, and what kind each one is.
 *
 * Startle the chicken and now and then — `EGG_CHANCE` — he leaves an egg
 * in the grass where he was standing before he bolts. Anybody out on the
 * map can walk up to it and pocket it, and it goes on their shelf beside
 * their badges.
 *
 * Pure and shared, like `lib/world/basketball.ts` beside it: the server
 * rolls the tier and holds the eggs lying about, the browser draws them
 * and the HUD lists them, and all three read the ladder from here. Nothing
 * in this file knows about a room, a socket or a store.
 *
 * **Rarity is one number, written once.** A tier declares a `weight` and
 * everything else is read off it — the share of eggs that come out that
 * kind, the "1 in 50" the panel prints, the order the ladder is shown in.
 * A second field saying "rare" is a second thing to be wrong the next time
 * a weight moves.
 */

import { groundUnder } from "./basketball";

/** The kinds of egg there are, commonest first. */
export type EggTier = "plain" | "speckled" | "copper" | "jade" | "gilded" | "rainbow";

export interface EggKind {
  id: EggTier;
  name: string;
  /**
   * How often this one turns up, against the other tiers.
   *
   * A weight rather than a percentage so that adding a tier does not mean
   * re-typing every other number, and so the share is always exactly one
   * whole: see `shareOf`.
   */
  weight: number;
  /** A line for the panel — what it looks like, not how rare it is. */
  note: string;
  /**
   * The shell's three tones, for the HUD.
   *
   * The same colours are drawn into the sprite by
   * `scripts/make-world-art.mjs`, which is a `.mjs` and cannot import this
   * — the same arrangement the basketball's board and rim are under, where
   * the numbers here are the picture's. Change one, change both.
   */
  shell: { base: string; shade: string; lit: string };
}

/**
 * The ladder, commonest first.
 *
 * Six rungs, each about half the one above it until the top two, which are
 * pulled apart a little further: the point of a ladder is that the last
 * step is worth telling somebody about. The weights total two thousand, so
 * a share reads straight off — a rainbow is forty of them, which is one
 * egg in fifty and, at `EGG_CHANCE`, one cluck in five thousand.
 */
export const EGG_KINDS: readonly EggKind[] = [
  {
    id: "plain",
    name: "Hen's Egg",
    weight: 1000,
    note: "An ordinary egg, warm, from an ordinary chicken in a necktie",
    shell: { base: "#e8dcc0", shade: "#c2b191", lit: "#f6f0de" },
  },
  {
    id: "speckled",
    name: "Speckled Egg",
    weight: 500,
    note: "Freckled all over, as though it had been left out in the rain",
    shell: { base: "#ddd0ae", shade: "#8a6f4a", lit: "#efe6cc" },
  },
  {
    id: "copper",
    name: "Copper Egg",
    weight: 250,
    note: "Heavier than it ought to be, and warm on the side you are not holding",
    shell: { base: "#c07a44", shade: "#8e5326", lit: "#e2a46e" },
  },
  {
    id: "jade",
    name: "Jade Egg",
    weight: 120,
    note: "Cool, green, and faintly lit from the inside",
    shell: { base: "#6fae9a", shade: "#48796c", lit: "#a2d6c2" },
  },
  {
    id: "gilded",
    name: "Gilded Egg",
    weight: 90,
    note: "Gold leaf, apparently laid on rather than laid",
    shell: { base: "#e0b870", shade: "#b08c3e", lit: "#f7e3a8" },
  },
  {
    id: "rainbow",
    name: "Rainbow Egg",
    weight: 40,
    note: "Nobody has a good explanation for this one, Michael least of all",
    shell: { base: "#7aa8e0", shade: "#b45ea8", lit: "#f2e07a" },
  },
];

/** How many rungs there are, which is what the Whole Clutch counts. */
export const EGG_TIER_COUNT = EGG_KINDS.length;

const BY_TIER = new Map(EGG_KINDS.map((kind) => [kind.id, kind]));

export function eggKind(tier: string): EggKind | undefined {
  return BY_TIER.get(tier as EggTier);
}

export function isEggTier(value: unknown): value is EggTier {
  return typeof value === "string" && BY_TIER.has(value as EggTier);
}

/** Every weight added up, which is the denominator of every share. */
export const EGG_WEIGHT_TOTAL = EGG_KINDS.reduce((sum, kind) => sum + kind.weight, 0);

/** What share of eggs come out this kind, as a fraction of one. */
export function shareOf(tier: EggTier): number {
  return (eggKind(tier)?.weight ?? 0) / EGG_WEIGHT_TOTAL;
}

/**
 * How rare one is, in the only words that need no glossary: one in *n*.
 *
 * Read off the weight rather than written beside it, so a tier that is
 * made rarer says so everywhere at once.
 */
export function oneIn(tier: EggTier): number {
  const share = shareOf(tier);
  return share > 0 ? Math.round(1 / share) : 0;
}

/**
 * Which kind this egg is, from a roll in [0, 1).
 *
 * Takes the roll rather than a random function so the caller's own source
 * of randomness is the only one in play — the simulation is driven by hand
 * in its tests, and an egg that picked its own tier out of `Math.random`
 * would be the one thing about a cluck that could not be replayed.
 *
 * Walks the ladder from the common end, so the cheap comparisons are the
 * ones made most often. A roll at or past the total — which floating point
 * can just about manage — falls through to the last rung rather than to
 * nothing.
 */
export function tierFromRoll(roll: number): EggTier {
  let seen = 0;
  const target = Math.min(Math.max(roll, 0), 1) * EGG_WEIGHT_TOTAL;
  for (const kind of EGG_KINDS) {
    seen += kind.weight;
    if (target < seen) return kind.id;
  }
  return EGG_KINDS[EGG_KINDS.length - 1].id;
}

/**
 * How often a fright leaves an egg behind: one cluck in a hundred.
 *
 * **Odds, not a count.** It is drawn afresh on every cluck
 * (`this.random() >= EGG_CHANCE` in `lib/server/residents.ts`) and
 * nothing anywhere counts clucks — so a hundred of them may pass with
 * nothing to show, and two eggs in a row is a thing that happens. An egg
 * on every hundredth fright would be a rhythm somebody could learn, and
 * then walking up to Michael would be a chore with a payout at the end of
 * it rather than a chance.
 *
 * A fact about the world rather than about the simulation, so the one
 * number is here beside the ladder it feeds. It is rolled where the
 * fright is, because that is where the seeded randomness lives.
 */
export const EGG_CHANCE = 1 / 100;

/**
 * How close you have to be standing to pick one up.
 *
 * A tile and a half, which is the reach of everything else in this world
 * you walk up to and press E at. Deliberately shorter than the
 * basketball's — a ball is a thing you scoop up on the move, an egg is a
 * thing you bend down for.
 */
export const EGG_REACH_PX = 44;

/** One egg lying in the grass, as the server holds it and the wire carries it. */
export interface LaidEgg {
  id: string;
  tier: EggTier;
  /** The patch of ground it is lying on — a ball's line, not a person's. */
  x: number;
  y: number;
}

/**
 * Where an egg lands when somebody standing there lays it.
 *
 * A person's `y` is the middle of their 96px frame and a thing lying on
 * the ground has the ground's own line, so the two have to be crossed
 * somewhere. `groundUnder` is that somewhere and it is no more the
 * basketball's than the egg's — it is imported rather than copied for the
 * reason it exists at all: a second constant for how far below a character
 * their feet are is one drift away from an egg hovering at Michael's
 * waist.
 */
export function eggSpot(at: { x: number; y: number }): { x: number; y: number } {
  return groundUnder(at);
}

/** Whether somebody standing there could pick this egg up. */
export function eggWithinReach(egg: { x: number; y: number }, at: { x: number; y: number }) {
  const feet = groundUnder(at);
  return Math.hypot(egg.x - feet.x, egg.y - feet.y) <= EGG_REACH_PX;
}

/**
 * Somebody's basket, tallied: how many of each kind they have found.
 *
 * A tally rather than a list of every egg, because that is what every
 * question anybody asks of a basket wants — how many, of what, and which
 * is the best one — and it is bounded by people times six where a list is
 * bounded by nothing at all.
 */
export interface EggTally {
  person: string;
  name: string;
  tier: EggTier;
  count: number;
  /** When the most recent of that kind was found. */
  latest: string;
}

/** How many eggs a basket holds in total. */
export function basketSize(tallies: readonly EggTally[]): number {
  return tallies.reduce((sum, tally) => sum + tally.count, 0);
}

/** The best kind in a basket, or null for an empty one. */
export function bestIn(tallies: readonly EggTally[]): EggKind | null {
  let best: EggKind | null = null;
  for (const tally of tallies) {
    const kind = eggKind(tally.tier);
    if (!kind) continue;
    if (!best || kind.weight < best.weight) best = kind;
  }
  return best;
}
