/**
 * The blob in the volcano's cave, and the server holding it.
 *
 * One blob for the whole world, in the one cave, and this is the only thing
 * that knows where it is going. It hops of its own accord, and a browser can
 * ask to punch it — and is told what happened, the same as a hand on the
 * basketball is. A browser never says where the blob went, or how hard it
 * hit it: where the puncher is standing and which way they face are the
 * room's own record of them, and the rest is arithmetic in
 * `lib/world/blob.ts`.
 *
 * What is here is the part that needs a clock and a room: when the next hop
 * is due, whether a punch landed, and not letting it be punched again while
 * it is still sailing from the last one.
 */

import {
  clearFor,
  knocked,
  landed,
  leapAt,
  nextHop,
  rested,
  sitting,
  withinPunch,
  type Leap,
  type Point,
} from "../world/blob";
import { VOLCANO_CAVE, solidsOf, type VolcanoPlace } from "../world/volcano";
import type { Facing } from "../presence-types";
import { createLogger } from "../logger";

const log = createLogger("Blob");

/** Where a puncher is standing, as the room knows them. */
export interface Puncher {
  x: number;
  y: number;
  facing: Facing;
}

export class CaveBlob {
  private leap: Leap;
  /** How long since the current leap set off. */
  private elapsed = 0;
  private readonly clear: (at: Point) => boolean;

  /**
   * `roll` is the randomness every hop is drawn from, so a test can hand in
   * a sequence and know where it will land; `place` is the cave, which a
   * test can also swap for a floor of its own.
   */
  constructor(
    private readonly roll: () => number = Math.random,
    place: VolcanoPlace = VOLCANO_CAVE,
  ) {
    const arena = place.arena;
    if (!arena) throw new Error(`${place.room} has no floor for a blob`);
    this.clear = clearFor(arena, solidsOf(place));
    // In the middle of the chamber, sitting, which is where anybody walking
    // in for the first time will be looking.
    this.leap = sitting({
      x: Math.round(arena.x + arena.width / 2),
      y: Math.round(arena.y + arena.height / 2),
    });
  }

  /** The leap it is on and how far into it, as a browser walking in is told. */
  get state(): { leap: Leap; elapsed: number } {
    return { leap: this.leap, elapsed: this.elapsed };
  }

  /** Where it is right now, and how high. */
  get position(): Point & { z: number } {
    const { x, y, z } = leapAt(this.leap, this.elapsed);
    return { x, y, z };
  }

  /**
   * Move it on. True when it has set off on a new hop, which is the only
   * time the cave needs telling anything: the arc in between is the same
   * arithmetic on every screen.
   */
  step(dtMs: number): boolean {
    this.elapsed += dtMs;
    if (!rested(this.leap, this.elapsed)) return false;
    this.leap = nextHop(this.leap.to, this.roll, this.clear);
    this.elapsed = 0;
    return true;
  }

  /**
   * Somebody threw a punch. The leap it sent the blob on, or null for a
   * punch that landed on nothing.
   *
   * Two ways to miss. Too far away, or it is over your head — by the same
   * reach the scene offers the prompt at. Or it is still sailing from the
   * last punch: a blob in flight is somebody else's moment, and letting a
   * second punch land mid-air would let two people standing either side of
   * it juggle it between them without its ever touching the floor. A blob
   * hopping of its own accord can be punched out of the air, which is the
   * satisfying way to catch one.
   */
  punch(at: Puncher): Leap | null {
    if (this.leap.kind === "knocked" && !landed(this.leap, this.elapsed)) return null;
    const now = this.position;
    if (!withinPunch(now, at)) return null;
    // Where the leap it is on was always going to end, for a punch that
    // finds no clear floor along its line: see `knocked`.
    const from = { x: Math.round(now.x), y: Math.round(now.y) };
    this.leap = knocked(from, at, this.clear, this.leap.to);
    this.elapsed = 0;
    log.info(`punched ${Math.round(Math.hypot(this.leap.to.x - now.x, this.leap.to.y - now.y))}px`);
    return this.leap;
  }
}
