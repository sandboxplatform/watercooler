/**
 * The eggs lying about on the world map, and the server holding them.
 *
 * Michael leaves one behind now and then when somebody startles him, and
 * from that moment it is an object in the world like the basketball: the
 * server says where it is and what kind it is, a browser asks to pick the
 * nearest one up, and is told what it got. The tier is rolled here and
 * never anywhere else — an egg whose rarity a browser could name would be
 * a rainbow anybody could claim.
 *
 * In memory, beside the ball and the meetings, and for the same reason: an
 * egg lying in the grass is something happening rather than something
 * kept, and a server that restarts has tidied the field. What was *picked
 * up* is a different matter and goes in the room store, where it stays.
 */

import { randomUUID } from "crypto";
import { eggSpot, eggWithinReach, tierFromRoll, type LaidEgg } from "../world/eggs";
import { createLogger } from "../logger";

const log = createLogger("Eggs");

/**
 * How long an egg lies there before it is gone.
 *
 * Long enough that somebody who saw where it landed can finish what they
 * were doing and walk over, and short enough that an afternoon of clucking
 * does not leave a field nobody can cross without treading on one. The
 * ball goes home after ninety seconds because there is one of it and the
 * court wants it back; an egg belongs to whoever finds it, so it is given
 * a great deal longer.
 */
export const EGG_SPOILS_MS = 10 * 60_000;

/**
 * How many may lie about at once.
 *
 * A ceiling rather than a rule anybody feels: at one egg in a hundred
 * clucks nothing short of a siege reaches it. When it is reached the oldest
 * goes, not the newest — the one somebody has walked past twice already is
 * the one least likely to be collected, and refusing to lay a new one
 * instead would silently switch the whole feature off for as long as the
 * field stayed full.
 */
export const NEST_LIMIT = 12;

/** An egg, and when it was laid, which is the only part the wire never sees. */
interface Kept extends LaidEgg {
  laidAt: number;
}

export class Nest {
  private eggs: Kept[] = [];

  /**
   * Everything lying about, for the wire and for a browser just arriving.
   *
   * Copied down to the four fields the wire carries rather than handed
   * over as it is kept: `laidAt` is how long it has lain there, which is
   * this side's business and went out on every broadcast when the kept
   * shape was published directly. Nothing was ever going to notice — the
   * type says `LaidEgg` and the extra field is simply along for the ride
   * — which is exactly why it is worth doing here rather than trusting
   * every call site to remember.
   */
  get lying(): LaidEgg[] {
    return this.eggs.map(({ id, tier, x, y }) => ({ id, tier, x, y }));
  }

  get count(): number {
    return this.eggs.length;
  }

  /**
   * Michael left one here.
   *
   * `roll` is a number in [0, 1) from the caller's own randomness, for the
   * reason `tierFromRoll` takes one: the simulation is driven by hand in
   * its tests, and a tier picked out of `Math.random` in here would be the
   * one part of a cluck that could not be replayed.
   */
  lay(at: { x: number; y: number }, roll: number, now: number): LaidEgg {
    const egg: Kept = {
      id: randomUUID(),
      tier: tierFromRoll(roll),
      x: Math.round(at.x),
      y: Math.round(at.y),
      laidAt: now,
    };
    this.eggs.push(egg);
    // The oldest first: it is the one people have already walked past.
    if (this.eggs.length > NEST_LIMIT) this.eggs.shift();
    log.info(`Michael left a ${egg.tier} egg in the grass`);
    return egg;
  }

  /**
   * Somebody bent down where they are standing.
   *
   * The nearest egg within reach, and nothing the browser said: a message
   * naming an egg would be a message that could name one across the map,
   * and where the person is standing is the room's to know. Null when
   * there is nothing there, which is the ordinary answer to a stray press
   * of E.
   */
  take(at: { x: number; y: number }): LaidEgg | null {
    // Against their feet rather than their middle, which is the line an
    // egg lies on — the same crossing `eggWithinReach` makes, and picking
    // the nearest against the other line would now and then hand somebody
    // the further of two eggs.
    const feet = eggSpot(at);
    let best = Infinity;
    let found = -1;
    for (let i = 0; i < this.eggs.length; i++) {
      const egg = this.eggs[i];
      if (!eggWithinReach(egg, at)) continue;
      const d2 = (egg.x - feet.x) ** 2 + (egg.y - feet.y) ** 2;
      if (d2 >= best) continue;
      best = d2;
      found = i;
    }
    if (found < 0) return null;
    const [egg] = this.eggs.splice(found, 1);
    return egg;
  }

  /**
   * Forget the ones nobody came for. Answers whether any went, which is
   * the only reason to put the field on the wire again.
   */
  spoil(now: number): boolean {
    // Asked on every tick of the room, so the ordinary answer has to be
    // free. The field is in the order it was laid — `lay` pushes and drops
    // from the front — so if the oldest is still good, none of them has
    // gone, and nothing is allocated.
    const oldest = this.eggs[0];
    if (!oldest || now - oldest.laidAt < EGG_SPOILS_MS) return false;
    const before = this.eggs.length;
    this.eggs = this.eggs.filter((egg) => now - egg.laidAt < EGG_SPOILS_MS);
    const gone = before - this.eggs.length;
    if (gone > 0) log.info(`${gone} egg${gone === 1 ? "" : "s"} nobody came for`);
    return gone > 0;
  }
}
