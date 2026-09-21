/**
 * The one basketball, and the server holding it.
 *
 * There is a single ball for the whole world, on the court on the world
 * map, and this is the only thing that knows where it is. A browser asks to
 * pick it up, asks to throw it and says how hard, and is told what happened;
 * it never says where the ball went. That is the same rule as everywhere
 * else in here — a look is clamped on the socket, a private floor is
 * refused on the socket — and it is what makes the basket worth a badge:
 * nobody can claim one, they can only sink one.
 *
 * The arithmetic itself is `lib/world/basketball.ts`, which is pure and
 * shared. What is here is the part that needs a room: who has it, whether
 * they are near enough to take it, and letting go of it when they walk away.
 */

import {
  ballAtRest,
  carriedAt,
  fromTheFarEnd,
  onCourt,
  stepBall,
  throwVelocity,
  withinReach,
  type BallState,
  type Hoop,
} from "../world/basketball";
import { worldSolids } from "../world/scenery";
import type { Facing } from "../presence-types";
import { createLogger } from "../logger";

const log = createLogger("Basketball");

/**
 * How long a ball lying still off the court is left before it goes back.
 *
 * A throw at full stretch carries the ball clean over the end line and the
 * avenue beyond it, and there it stays: the court is then a court with no
 * ball on it, and the only way to put that right is for somebody to
 * happen to walk past wherever it came to rest. So it finds its own way
 * back — but not quickly, because somebody who has seen where it went and
 * is walking over to fetch it should get there first and find it where
 * they are looking. A minute and a half is longer than that walk from any
 * corner of the map.
 *
 * Only off the court. A ball lying on the tarmac is where whoever last
 * played left it, and tidying that up is moving somebody's things.
 */
const ABANDONED_MS = 90_000;

/** Where a carrier is standing, as the room knows it. */
export interface Carrier {
  x: number;
  y: number;
  facing: Facing;
}

/**
 * What a basket was.
 *
 * Both of these are the shot rather than the ball, so they are settled
 * here and not in `stepBall`: a flight is a dozen ticks and the two facts
 * belong to the whole of it — the board is usually struck a tick or two
 * before the ball comes down through the rim, and where it was thrown from
 * stopped being knowable the moment it left the hand.
 */
export interface Shot {
  /** It went in off the backboard, which is the court's second way in. */
  banked: boolean;
  /** It was thrown from the far end, which is the top of the meter. */
  far: boolean;
}

/** What a tick came to, for the socket to pass on. */
export interface BasketballTick {
  ball: BallState;
  /** The hoop it fell through, who threw it and what kind of shot it was. */
  scored: { hoop: Hoop; by: string; shot: Shot } | null;
  /** Whether anything moved, so a ball lying still costs the room nothing. */
  live: boolean;
}

export class Basketball {
  private ball: BallState = ballAtRest();
  /**
   * Who threw the one in the air.
   *
   * Kept past the throw, because a basket is the thrower's and by the time
   * it goes in the ball is nobody's — `heldBy` was cleared the moment it
   * left their hand. Cleared when somebody next picks it up, so a ball that
   * rolls into a hoop after being knocked about belongs to whoever last
   * threw it and to nobody at all before that.
   */
  private thrower: string | null = null;
  /**
   * Where the ball left the hand, and whether it has touched a board since.
   *
   * Both are facts about the throw rather than about the ball, so neither
   * can be read off it once it is in the air: by the time it drops through
   * a rim it is several ticks past the pane it came off and it has no
   * memory of where it set out from. Kept beside `thrower` and cleared
   * with it, which is what makes them the same shot's.
   */
  private thrownFrom: { x: number; y: number } | null = null;
  private bankedInFlight = false;
  /** How long it has lain where it is, for `ABANDONED_MS`. */
  private idleMs = 0;

  /** The ball as it stands, for a browser that has just walked into the world. */
  get state(): BallState {
    return this.ball;
  }

  /** Whether this connection is the one carrying it. */
  heldBy(id: string): boolean {
    return this.ball.heldBy === id;
  }

  /**
   * Somebody asked to pick it up.
   *
   * Refused unless they are actually standing over it: the browser says
   * "take", and where they are is the room's to know. A ball already in
   * somebody's hands cannot be taken off them — you wait for them to throw
   * it, which is the one thing they can always do.
   */
  take(id: string, at: Carrier): boolean {
    if (this.ball.heldBy) return false;
    if (!withinReach(this.ball, at)) return false;
    this.ball = { ...this.ball, ...carriedAt(at, at.facing), vx: 0, vy: 0, vz: 0, heldBy: id };
    this.forgetShot();
    return true;
  }

  /**
   * Thrown, at the power the meter was on.
   *
   * From where they stand and along the way they face, both taken from the
   * room rather than from the message. The power is theirs and is the only
   * part that is — clamped in `throwVelocity`, so a browser asking for a
   * thousand gets a full-strength throw and nothing more.
   */
  release(id: string, at: Carrier, power: number): boolean {
    if (this.ball.heldBy !== id) return false;
    const from = carriedAt(at, at.facing);
    this.ball = { ...from, ...throwVelocity(at.facing, power), heldBy: null };
    this.thrower = id;
    // Where it left the hand rather than where the thrower is standing: a
    // person is a tall picture and a ball is a point, and it is the ball's
    // journey the badge is about.
    this.thrownFrom = { x: from.x, y: from.y };
    this.bankedInFlight = false;
    return true;
  }

  /**
   * Put it down where they are, without throwing it.
   *
   * What a closed tab, a timeout and a walk through a door all come to: a
   * carried ball that is nobody's would otherwise hang wherever its carrier
   * was last seen and never be reachable again, since only the person
   * holding it can let it go.
   */
  drop(id: string, at?: Carrier): void {
    if (this.ball.heldBy !== id) return;
    const where = at ? carriedAt(at, at.facing) : { x: this.ball.x, y: this.ball.y, z: 0 };
    this.ball = { ...where, z: 0, vx: 0, vy: 0, vz: 0, heldBy: null };
    this.forgetShot();
  }

  /** No shot in the air: nobody threw this one and nothing came off a board. */
  private forgetShot(): void {
    this.thrower = null;
    this.thrownFrom = null;
    this.bankedInFlight = false;
  }

  /**
   * Move it on.
   *
   * `carrier` answers where the person holding it is standing, if anybody
   * is; a carried ball rides at their hand and no physics is run on it.
   * Somebody whose connection has gone is treated as having dropped it,
   * which is the same thing from the ball's point of view.
   */
  step(dtMs: number, carrier: (id: string) => Carrier | null): BasketballTick {
    const held = this.ball.heldBy;
    if (held) {
      const at = carrier(held);
      if (!at) {
        this.drop(held);
        return { ball: this.ball, scored: null, live: true };
      }
      this.ball = { ...this.ball, ...carriedAt(at, at.facing) };
      return { ball: this.ball, scored: null, live: true };
    }

    const { ball, scored, banked, live } = stepBall(this.ball, dtMs, worldSolids());
    this.ball = ball;
    // A pane struck now and a rim crossed three ticks later are the same
    // shot, so this is remembered across the flight rather than reported
    // with the basket it is not in the same tick as.
    if (banked) this.bankedInFlight = true;

    // Lying still, and a long way from where it belongs.
    if (live) this.idleMs = 0;
    else if (!onCourt(ball)) {
      this.idleMs += dtMs;
      if (this.idleMs >= ABANDONED_MS) {
        this.idleMs = 0;
        this.ball = ballAtRest();
        log.info("the ball found its own way back to the court");
        return { ball: this.ball, scored: null, live: true };
      }
    }

    if (!scored || !this.thrower) return { ball, scored: null, live };

    const by = this.thrower;
    const shot: Shot = {
      banked: this.bankedInFlight,
      far: this.thrownFrom ? fromTheFarEnd(this.thrownFrom, scored) : false,
    };
    // One basket per throw: the ball is on its way down out of the net and
    // must not be judged again on the way to the ground.
    this.forgetShot();
    log.info(`a basket at the ${scored.side} hoop`);
    return { ball, scored: { hoop: scored, by, shot }, live };
  }
}
