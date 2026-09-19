import { describe, it, expect } from "vitest";
import {
  BALL_RADIUS,
  CENTRE_SPOT,
  COURT_PX,
  FEET_BELOW_CENTRE,
  HOOPS,
  RIM_RADIUS,
  RIM_Z,
  ballAtRest,
  carriedAt,
  stepBall,
  throwReach,
  throwVelocity,
  withinReach,
  type BallState,
} from "./basketball";
import { PROPS, SCENERY, groundTiles, propPicture, worldSolids } from "./scenery";
import { TILE, WORLD_HEIGHT, WORLD_WIDTH, type Rect } from "./tenants";

const TICK = 50;

/** Run the ball on until it settles, or give up after a minute of it. */
function settle(ball: BallState, blocked: readonly Rect[] = worldSolids()) {
  let state = ball;
  let scored = 0;
  for (let i = 0; i < 1200; i++) {
    const step = stepBall(state, TICK, blocked);
    state = step.ball;
    if (step.scored) scored++;
    if (!step.live) return { ball: state, scored, ticks: i };
  }
  return { ball: state, scored, ticks: 1200 };
}

/** Throw from a standing position, the way the server does. */
function thrown(
  from: { x: number; y: number },
  facing: "left" | "right",
  power: number,
): BallState {
  const at = carriedAt(from, facing);
  return { ...at, ...throwVelocity(facing, power), heldBy: null };
}

/**
 * Somebody standing with their feet on a given patch of ground.
 *
 * A person's `y` is the middle of their frame and a ball's is the tarmac,
 * so a test that stands a shooter at the rim's own y is a test of somebody
 * standing forty pixels off the line they meant to be on.
 */
const standingOn = (at: { x: number; y: number }) => ({ x: at.x, y: at.y - FEET_BELOW_CENTRE });

describe("the court", () => {
  it("stands on ground with nothing already on it", () => {
    // Every prop's picture, not just its footprint: a bench half under the
    // centre circle is a court with a bench drawn through it, and only the
    // pictures would say so.
    const hoops = new Set(HOOPS.map((h) => `${h.post.x},${h.post.y}`));
    const others = SCENERY.filter((p) => !hoops.has(`${p.x},${p.y}`));
    for (const prop of others) {
      const pic = propPicture(prop);
      const clear =
        pic.x + pic.width <= COURT_PX.x ||
        pic.x >= COURT_PX.x + COURT_PX.width ||
        pic.y + pic.height <= COURT_PX.y ||
        pic.y >= COURT_PX.y + COURT_PX.height;
      expect({ kind: prop.kind, x: prop.x, y: prop.y, clear }).toEqual({
        kind: prop.kind,
        x: prop.x,
        y: prop.y,
        clear: true,
      });
    }
  });

  it("is laid as its own ground, every tile of it", () => {
    const tiles = groundTiles();
    for (let y = COURT_PX.y / TILE; y < (COURT_PX.y + COURT_PX.height) / TILE; y++) {
      for (let x = COURT_PX.x / TILE; x < (COURT_PX.x + COURT_PX.width) / TILE; x++) {
        expect(tiles[y][x]).toBe("court");
      }
    }
  });

  it("puts a hoop at each end, facing in", () => {
    const [west, east] = HOOPS;
    expect(west.rim.x).toBeGreaterThan(west.post.x);
    expect(east.rim.x).toBeLessThan(east.post.x);
    // Both rims on the court's own centre line, which is what makes lining
    // up on it the thing a player does.
    expect(west.rim.y).toBe(CENTRE_SPOT.y);
    expect(east.rim.y).toBe(CENTRE_SPOT.y);
  });

  it("walls off the poles and nothing else", () => {
    // The board is over your head and the rim is out over the court, so a
    // hoop must not take a tile and a half of the end line out of play.
    for (const kind of ["hoopWest", "hoopEast"] as const) {
      expect(PROPS[kind].footprint.width).toBeLessThan(PROPS[kind].width / 4);
    }
  });
});

describe("picking it up", () => {
  it("is refused from across the court and allowed from over it", () => {
    const ball = ballAtRest();
    expect(withinReach(ball, standingOn(ball))).toBe(true);
    expect(withinReach(ball, standingOn({ x: ball.x + 300, y: ball.y }))).toBe(false);
  });

  it("is refused for a ball over your head", () => {
    // Or a throw could be plucked out of the air by standing under it.
    expect(withinReach({ ...ballAtRest(), z: 120 }, standingOn(CENTRE_SPOT))).toBe(false);
  });

  it("carries it at the hand, on the side they are facing", () => {
    const at = { x: 500, y: 500 };
    expect(carriedAt(at, "right").x).toBeGreaterThan(at.x);
    expect(carriedAt(at, "left").x).toBeLessThan(at.x);
    expect(carriedAt(at, "up").z).toBeGreaterThan(0);
  });

  it("carries it at the carrier's own feet, not over their head", () => {
    // A person's y is the middle of their frame; height is measured up from
    // the tarmac. Muddling the two put a carried ball above its carrier.
    const at = { x: 500, y: 500 };
    expect(carriedAt(at, "down").y).toBeGreaterThan(at.y);
  });
});

describe("a throw", () => {
  it("takes the power it is given and nothing more", () => {
    // The one thing a browser has a say in, so it is clamped rather than
    // trusted: asking for a thousand is a full-strength throw.
    expect(throwVelocity("right", 50).vx).toBe(throwVelocity("right", 1).vx);
    expect(throwVelocity("right", -5).vx).toBe(throwVelocity("right", 0).vx);
    expect(throwVelocity("right", Number.NaN).vx).toBe(throwVelocity("right", 0).vx);
  });

  it("goes further the harder it is thrown, the whole way up the meter", () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const reach = throwReach(p);
      expect(reach).toBeGreaterThan(last);
      last = reach;
    }
  });

  it("can reach a rim from anywhere on the court, and not from the next county", () => {
    const [, east] = HOOPS;
    // Standing on the far end line, which is the longest shot the court has.
    const longest = east.rim.x - COURT_PX.x;
    expect(throwReach(1)).toBeGreaterThan(longest);
    // And the shortest throw is a lay-up rather than a drop at the feet.
    expect(throwReach(0)).toBeGreaterThan(TILE);
    expect(throwReach(1)).toBeLessThan(COURT_PX.width * 1.5);
  });

  it("comes to rest, and not on the other side of a wall", () => {
    const { ball, ticks } = settle(thrown(CENTRE_SPOT, "right", 1));
    expect(ticks).toBeLessThan(1200);
    expect(ball.z).toBe(0);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);
    expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(ball.x).toBeLessThanOrEqual(WORLD_WIDTH - BALL_RADIUS);
    expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(ball.y).toBeLessThanOrEqual(WORLD_HEIGHT - BALL_RADIUS);
  });

  it("stays inside the world however hard it is thrown at the edge", () => {
    for (const facing of ["left", "right"] as const) {
      const { ball } = settle(thrown({ x: 40, y: 40 }, facing, 1));
      expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS);
      expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS);
    }
  });
});

describe("a basket", () => {
  /** Stand where a throw at this power comes down on the rim, and throw. */
  const shoot = (hoop: (typeof HOOPS)[number], power: number) => {
    const facing = hoop.side === "west" ? "left" : "right";
    const back = hoop.side === "west" ? throwReach(power) : -throwReach(power);
    return settle(thrown(standingOn({ x: hoop.rim.x + back, y: hoop.rim.y }), facing, power));
  };

  it("is scored where the ball falls through a rim", () => {
    for (const hoop of HOOPS) {
      expect(shoot(hoop, 0.5).scored).toBe(1);
    }
  });

  it("is scored for a well aimed throw at any power the meter offers", () => {
    // The frames are fifty milliseconds apart and the ball covers up to
    // twenty-six pixels in one, so a rim tested at the frame's own position
    // drops a good shot whenever the crossing falls between two of them —
    // more often the harder it is thrown, and indistinguishable on screen
    // from having missed.
    const [, east] = HOOPS;
    for (let power = 0; power <= 1.0001; power += 0.05) {
      const at = standingOn({ x: east.rim.x - throwReach(power), y: east.rim.y });
      expect({
        power: power.toFixed(2),
        scored: settle(thrown(at, "right", power)).scored,
      }).toEqual({ power: power.toFixed(2), scored: 1 });
    }
  });

  it("is judged where the ball crossed, not where the frame left it", () => {
    // A ball dropping through the near edge of the rim and carrying on out
    // the far side inside one frame: it went in, and the frame ends with it
    // clear of the hoop. Asking the frame's own position calls that a miss.
    const [, east] = HOOPS;
    const through: BallState = {
      x: east.rim.x - 5,
      y: east.rim.y,
      z: RIM_Z + 2,
      vx: 520,
      vy: 0,
      vz: -400,
      heldBy: null,
    };
    const step = stepBall(through, TICK, worldSolids());
    expect(Math.hypot(step.ball.x - east.rim.x, step.ball.y - east.rim.y)).toBeGreaterThan(
      RIM_RADIUS,
    );
    expect(step.scored?.side).toBe("east");
  });

  it("is scored once, not again on the way to the ground", () => {
    // The ball carries on down out of the net, and a rule asking only
    // "is it at rim height inside the rim" would count that too.
    expect(shoot(HOOPS[1], 0.7).scored).toBe(1);
  });

  it("is not scored for a throw that misses", () => {
    const [, east] = HOOPS;
    // Lined up, but nowhere near hard enough to get there.
    const at = standingOn({ x: east.rim.x - throwReach(0.9), y: east.rim.y });
    expect(settle(thrown(at, "right", 0.2)).scored).toBe(0);
  });

  it("is not scored for a ball going up through the rim", () => {
    // Which is the ball hitting the underside of the net, and no points.
    const [, east] = HOOPS;
    const rising: BallState = {
      x: east.rim.x,
      y: east.rim.y,
      z: RIM_Z - 8,
      vx: 0,
      vy: 0,
      vz: 400,
      heldBy: null,
    };
    expect(stepBall(rising, TICK, worldSolids()).scored).toBeNull();
  });

  it("is not scored by a ball nobody threw rolling under the hoop", () => {
    // It never leaves the ground, so it never crosses the rim's height.
    const [, east] = HOOPS;
    const rolling: BallState = {
      x: east.rim.x - 100,
      y: east.rim.y,
      z: 0,
      vx: 400,
      vy: 0,
      vz: 0,
      heldBy: null,
    };
    expect(settle(rolling).scored).toBe(0);
  });
});

describe("a ball in somebody's hands", () => {
  it("is not moved by the physics at all", () => {
    const held: BallState = { ...ballAtRest(), heldBy: "someone", z: 40 };
    const step = stepBall(held, TICK, worldSolids());
    expect(step.ball).toBe(held);
    expect(step.live).toBe(true);
  });

  it("costs the room nothing once it is lying still", () => {
    expect(stepBall(ballAtRest(), TICK, worldSolids()).live).toBe(false);
  });
});
