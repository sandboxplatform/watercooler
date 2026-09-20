/**
 * The basketball court on the world map, and the ball on it.
 *
 * There is one ball for the whole world and the server is the one holding
 * it: it decides who has picked it up, where a throw goes and whether it
 * went in. This file is the part both ends need — where the court is, where
 * the hoops are, and the arithmetic of a throw — so it stays free of Phaser,
 * of node built-ins and of anything that knows about a socket.
 *
 * Height is the third number and it is the reason the court is worth having.
 * A ball that only slid about the ground could be thrown at a hoop and never
 * through one, so `z` is how far the ball is off the tarmac: a throw leaves
 * the hand at `HAND_Z`, arcs under `GRAVITY_PX_S2`, and is a basket only
 * where it crosses a rim's height on the way *down*. Up through a rim is the
 * ball hitting the underside of the net, which is not a point.
 */

import { TILE, WOOD_ROWS, WORLD_HEIGHT, WORLD_WIDTH, type Rect } from "./tenants";
import type { Facing } from "../presence-types";

// ── The court ───────────────────────────────────────────

/**
 * The court, in tiles: the middle of the park's east block, which is the
 * grass between the centre avenue and the east one.
 *
 * **Sixteen tiles by eight, with two of grass round it.** The block is
 * twenty by twelve, so the court has most of both and the park keeps a
 * fringe to stand its trees and its lamps in. It was nine by six in a
 * corner of the block, which is a half-court with the park's furniture all
 * round it: the two hoops were seven tiles apart, so a throw from anywhere
 * on it was the same throw, and two people on it were in each other's way.
 * Two tiles all round divides exactly on both axes, which is why the margin
 * is the number it is.
 *
 * Two to one is also about the shape of the real thing — 28 metres by 15 —
 * where nine by six was half as wide again as it should have been, and the
 * markings in `scripts/make-world-art.mjs` are struck off those metres.
 */
export const COURT: Rect = { x: 34, y: WOOD_ROWS + 20, width: 16, height: 8 };

/** The same in world pixels, which is what everything else here is in. */
export const COURT_PX: Rect = {
  x: COURT.x * TILE,
  y: COURT.y * TILE,
  width: COURT.width * TILE,
  height: COURT.height * TILE,
};

/** The middle of the court: where the ball is put back when nobody has it. */
export const CENTRE_SPOT = {
  x: COURT_PX.x + COURT_PX.width / 2,
  y: COURT_PX.y + COURT_PX.height / 2,
};

/** How high a rim stands off the ground. */
export const RIM_Z = 64;

/** How wide a rim is to a falling ball: a shade under half a tile across. */
export const RIM_RADIUS = 20;

/**
 * A hoop: a post on the ground with a board and a rim jutting inward.
 *
 * `post` is the feet, which is what the picture stands on and what is solid;
 * `rim` is the hole, which is what the ball has to fall through. Two points
 * rather than one, because the rim hangs out over the court in front of the
 * board — a throw aimed at the post is a throw at the back of the backboard.
 */
export interface Hoop {
  /** Which end of the court it stands at; the rim faces in from there. */
  side: "west" | "east";
  post: { x: number; y: number };
  rim: { x: number; y: number };
}

/** How far the rim hangs out from the post it is bolted to. */
const RIM_REACH = 30;
/** How far in from the end line the post stands. */
const POST_INSET = 20;

export const HOOPS: readonly Hoop[] = [
  {
    side: "west",
    post: { x: COURT_PX.x + POST_INSET, y: CENTRE_SPOT.y },
    rim: { x: COURT_PX.x + POST_INSET + RIM_REACH, y: CENTRE_SPOT.y },
  },
  {
    side: "east",
    post: { x: COURT_PX.x + COURT_PX.width - POST_INSET, y: CENTRE_SPOT.y },
    rim: { x: COURT_PX.x + COURT_PX.width - POST_INSET - RIM_REACH, y: CENTRE_SPOT.y },
  },
];

/** Whether a point is on the tarmac. */
export function onCourt(at: { x: number; y: number }): boolean {
  return (
    at.x >= COURT_PX.x &&
    at.x <= COURT_PX.x + COURT_PX.width &&
    at.y >= COURT_PX.y &&
    at.y <= COURT_PX.y + COURT_PX.height
  );
}

/** Which picture a hoop is drawn from, since the two ends are mirrored. */
export function hoopProp(hoop: Hoop): "hoopWest" | "hoopEast" {
  return hoop.side === "west" ? "hoopWest" : "hoopEast";
}

// ── The ball ────────────────────────────────────────────

/** How big the ball is drawn, and how near its middle counts as touching it. */
export const BALL_RADIUS = 9;

/** Falling, in px/s². Tuned against the throw below rather than against life. */
export const GRAVITY_PX_S2 = 900;

/** Where the ball leaves the hand, and where it rides while carried. */
export const HAND_Z = 40;

/** How much of its bounce a ball keeps, and how much of its roll each second. */
const BOUNCE = 0.45;
const ROLL_DECAY_PER_S = 0.12;

/** Under this, a ball on the ground has stopped. */
const REST_SPEED = 8;

/**
 * The slowest and the fastest throw, in px/s across the ground, and how
 * hard it is thrown upward — which is what makes the arc an arc.
 *
 * The top of the meter has to carry the ball from one end line to the far
 * rim, or the length of the court is a length nobody can throw and the top
 * third of the swing is a part of it nothing uses. So the two maxima went up
 * with the court: 520 and 420 covered 453px, which crossed a nine-tile
 * court and falls well short of a sixteen-tile one. The minima are
 * untouched — the bottom of the meter is a lay-up at either size.
 */
const THROW_MIN_SPEED = 180;
const THROW_MAX_SPEED = 700;
const THROW_MIN_LIFT = 260;
const THROW_MAX_LIFT = 540;

/**
 * How close you have to stand to pick the ball up, and how low it has to be.
 *
 * A ball over your head is not one you can take. Without the height the
 * throw could be plucked out of the air by standing under it, which is a
 * different game and a much easier one.
 */
export const REACH_PX = 52;
export const REACH_Z = 60;

/**
 * Below this the ball is among the furniture; above it, over the top of it.
 *
 * A thrown ball passing above a bench should not stop dead against it and a
 * rolling one should. One number rather than a height on every prop: what
 * stands out here is a tree, a bench and a lamp, and none of them is a thing
 * a basketball has any business knocking about.
 */
const CLEARS_SCENERY_Z = 48;

/** The ball, as the server holds it and the wire carries it. */
export interface BallState {
  x: number;
  y: number;
  /** Height off the ground. Zero is lying on the tarmac. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** The connection carrying it, or null for a ball nobody has. */
  heldBy: string | null;
}

/** The ball, back on the centre spot with nobody holding it. */
export function ballAtRest(): BallState {
  return { x: CENTRE_SPOT.x, y: CENTRE_SPOT.y, z: 0, vx: 0, vy: 0, vz: 0, heldBy: null };
}

/**
 * How far below a character's own position their feet are.
 *
 * A person's `y` is the middle of their 96px frame and their feet are down
 * near the bottom of it; a ball's `y` is the patch of ground it is lying
 * on. The two are different lines and forgetting it puts a carried ball
 * forty pixels over its carrier's head — which is where it went, because
 * height was being measured up from the middle of somebody rather than up
 * from the tarmac they are standing on.
 *
 * So every crossing between the two goes through `groundUnder`: it is the
 * one place the frames meet, and the rest of this file is in the ball's.
 */
export const FEET_BELOW_CENTRE = 40;

/** The patch of tarmac a character is standing on, from where they are. */
export function groundUnder(at: { x: number; y: number }): { x: number; y: number } {
  return { x: at.x, y: at.y + FEET_BELOW_CENTRE };
}

/** Whether somebody standing there could pick this ball up. */
export function withinReach(ball: BallState, at: { x: number; y: number }): boolean {
  if (ball.z > REACH_Z) return false;
  const feet = groundUnder(at);
  return Math.hypot(ball.x - feet.x, ball.y - feet.y) <= REACH_PX;
}

/** Where a carried ball rides: at the hand, a little ahead of the carrier. */
export function carriedAt(
  at: { x: number; y: number },
  facing: Facing,
): { x: number; y: number; z: number } {
  const lead = 14;
  const dx = facing === "left" ? -lead : facing === "right" ? lead : 0;
  const dy = facing === "down" ? lead / 2 : facing === "up" ? -lead / 2 : 0;
  const feet = groundUnder(at);
  return { x: feet.x + dx, y: feet.y + dy, z: HAND_Z };
}

/**
 * The velocity a throw leaves with.
 *
 * `power` is the only part of this the browser has a say in — the meter over
 * the thrower's head — and it is clamped here rather than trusted. The rest
 * is the server's: where they are standing and which way they are facing
 * come off the room's own record of them, so a throw cannot be aimed from
 * somewhere nobody is.
 */
export function throwVelocity(
  facing: Facing,
  power: number,
): { vx: number; vy: number; vz: number } {
  const p = Math.min(1, Math.max(0, Number.isFinite(power) ? power : 0));
  const speed = THROW_MIN_SPEED + (THROW_MAX_SPEED - THROW_MIN_SPEED) * p;
  const lift = THROW_MIN_LIFT + (THROW_MAX_LIFT - THROW_MIN_LIFT) * p;
  return {
    vx: facing === "left" ? -speed : facing === "right" ? speed : 0,
    vy: facing === "up" ? -speed : facing === "down" ? speed : 0,
    vz: lift,
  };
}

/**
 * How far from the hand a throw at this power comes back down to rim height.
 *
 * Nothing in the game asks: the ball's own flight decides where it lands.
 * But it is what makes the meter a skill rather than a guess — the power is
 * the distance — so the tests that say the court is throwable from end to
 * end ask this rather than simulating and hoping.
 */
export function throwReach(power: number): number {
  const { vx, vz } = throwVelocity("right", power);
  // Back down to rim height: z(t) = HAND_Z + vz·t − g·t²/2 = RIM_Z.
  const disc = vz * vz - 2 * GRAVITY_PX_S2 * (RIM_Z - HAND_Z);
  if (disc < 0) return 0;
  return (vx * (vz + Math.sqrt(disc))) / GRAVITY_PX_S2;
}

/** Whether a point lies in any of the rectangles. */
const inside = (rects: readonly Rect[], x: number, y: number) =>
  rects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);

/** What one step of the ball came to. */
export interface BallStep {
  ball: BallState;
  /** The hoop it just fell through, if it did. */
  scored: Hoop | null;
  /** Whether anything moved, so a ball lying still costs the room nothing. */
  live: boolean;
}

/**
 * Move the ball on by `dtMs`.
 *
 * Pure, and the only copy of these rules: the server runs it to decide what
 * happened and the scene runs nothing at all — it is told the answer and
 * draws towards it. A function rather than a method, so a test can throw a
 * thousand balls without a socket.
 *
 * `blocked` is everything solid out of doors, consulted only while the ball
 * is low: a throw arcs over a bench, a roll stops against it.
 */
export function stepBall(ball: BallState, dtMs: number, blocked: readonly Rect[]): BallStep {
  // Somebody is carrying it. Where it is is a question about where they are,
  // which is the caller's to answer, not this.
  if (ball.heldBy) return { ball, scored: null, live: true };

  const dt = Math.min(dtMs, 100) / 1000;
  const moving = ball.z > 0 || ball.vz !== 0 || Math.hypot(ball.vx, ball.vy) > REST_SPEED;
  if (dt <= 0 || !moving) return { ball, scored: null, live: false };

  const next: BallState = { ...ball };

  // Up and down first, because whether it went through a rim is a question
  // about the height it passed through during this step.
  //
  // The height moves at the speed the ball *had*, less the half of a step's
  // gravity — `z += vz·dt − g·dt²/2` — rather than at the speed it ends
  // with. That is the parabola exactly, at every step boundary and at any
  // frame rate; taking the whole step's gravity off the velocity first and
  // then moving at that loses `g·dt²/2` of height every step, which is a
  // pixel here and twenty-five over a long throw. `throwReach` is solved
  // off the parabola, so the two disagreed by more the harder the ball was
  // thrown — and a shot the meter says is perfect dropped to rim height
  // twenty pixels short of the rim, which is a miss with nothing on screen
  // to explain it.
  const wasZ = ball.z;
  next.z = ball.z + ball.vz * dt - (GRAVITY_PX_S2 * dt * dt) / 2;
  next.vz = ball.vz - GRAVITY_PX_S2 * dt;

  // Along the ground, one axis at a time, so a ball meeting the corner of a
  // bench runs along it rather than stopping dead in front of it.
  const low = next.z < CLEARS_SCENERY_Z;
  const tryX = ball.x + next.vx * dt;
  if (low && inside(blocked, tryX, ball.y)) next.vx = -next.vx * BOUNCE;
  else next.x = tryX;
  const tryY = ball.y + next.vy * dt;
  if (low && inside(blocked, next.x, tryY)) next.vy = -next.vy * BOUNCE;
  else next.y = tryY;

  // The edge of the world is a wall like any other.
  if (next.x < BALL_RADIUS || next.x > WORLD_WIDTH - BALL_RADIUS) {
    next.x = Math.min(Math.max(next.x, BALL_RADIUS), WORLD_WIDTH - BALL_RADIUS);
    next.vx = -next.vx * BOUNCE;
  }
  if (next.y < BALL_RADIUS || next.y > WORLD_HEIGHT - BALL_RADIUS) {
    next.y = Math.min(Math.max(next.y, BALL_RADIUS), WORLD_HEIGHT - BALL_RADIUS);
    next.vy = -next.vy * BOUNCE;
  }

  // Through a rim, falling. Asked of the height it crossed rather than the
  // height it is at: a fast ball drops from above the rim to below it inside
  // one tick, and neither frame on its own has anything in it to say so.
  //
  // And asked at the point it crossed, not at the end of the step. The ball
  // covers up to twenty-six pixels in a tick and a rim is forty across, so
  // testing where the frame happened to leave it throws away a perfectly
  // aimed shot whenever the crossing falls between two frames — which is
  // the one thing a player would not forgive, since there is nothing on
  // screen to tell that apart from a miss.
  let scored: Hoop | null = null;
  if (next.vz < 0 && wasZ >= RIM_Z && next.z < RIM_Z) {
    const through = (wasZ - RIM_Z) / (wasZ - next.z);
    const cx = ball.x + (next.x - ball.x) * through;
    const cy = ball.y + (next.y - ball.y) * through;
    scored = HOOPS.find((h) => Math.hypot(cx - h.rim.x, cy - h.rim.y) <= RIM_RADIUS) ?? null;
  }

  // The ground.
  //
  // A bounce needs the ball to have been *above* it at the start of the
  // step, not merely to be heading down at the end of one. A ball already
  // lying on the tarmac picks up a whole tick of gravity every tick — some
  // forty-five px/s of it — so reading that as an impact gave it a bounce
  // it could never lose, and a ball that never comes to rest is a ball the
  // room goes on broadcasting for as long as the server runs.
  if (next.z <= 0) {
    const landed = wasZ > 0 && next.vz < -REST_SPEED;
    next.z = 0;
    next.vz = landed ? -next.vz * BOUNCE : 0;
    const decay = Math.pow(ROLL_DECAY_PER_S, dt);
    next.vx *= decay;
    next.vy *= decay;
    if (next.vz === 0 && Math.hypot(next.vx, next.vy) <= REST_SPEED) {
      next.vx = 0;
      next.vy = 0;
    }
  }

  return { ball: next, scored, live: true };
}
