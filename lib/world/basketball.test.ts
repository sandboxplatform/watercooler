import { describe, it, expect } from "vitest";
import {
  BALL_RADIUS,
  BOARD_BOTTOM_Z,
  BOARD_HALF_WIDTH,
  BOARD_TOP_Z,
  CENTRE_SPOT,
  COURT_PX,
  FEET_BELOW_CENTRE,
  GRAVITY_PX_S2,
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

  /**
   * Every throw the meter offers, from all over the court, comes to rest.
   *
   * The sweep is the point: the ball used to end almost every throw in a
   * two-tick cycle a quarter of a pixel off the tarmac — bouncing off a
   * speed that had a whole tick of gravity in it, so each bounce put back
   * more than it took out — and it settled there from any throw, which is
   * why one throw at one power is not a test of this. What it costs is in
   * `Basketball.step`: a ball that is never still is broadcast to the room
   * on every tick for as long as the server runs, and never accrues the
   * idle time that would send it back to the centre spot.
   */
  it("comes to rest from every power, all over the court", () => {
    const blocked = worldSolids();
    let slowest = 0;
    for (let px = 0; px <= 8; px++) {
      for (let py = 0; py <= 4; py++) {
        const from = standingOn({
          x: COURT_PX.x + (COURT_PX.width * px) / 8,
          y: COURT_PX.y + (COURT_PX.height * py) / 4,
        });
        for (let p = 0; p <= 20; p++) {
          for (const facing of ["left", "right"] as const) {
            const { ball, ticks } = settle(thrown(from, facing, p / 20), blocked);
            const where = `from (${from.x}, ${from.y}) ${facing} at ${p / 20}`;
            // Well inside the cap rather than merely inside it: a throw that
            // takes a minute of ticks to stop has not stopped.
            expect(ticks, where).toBeLessThan(300);
            expect(ball.z, where).toBe(0);
            expect(ball.vz, where).toBe(0);
            expect(ball.vx, where).toBe(0);
            expect(ball.vy, where).toBe(0);
            slowest = Math.max(slowest, ticks);
          }
        }
      }
    }
    // And the slowest of them is seconds rather than minutes.
    expect(slowest).toBeLessThan(200);
  });

  it("stops rather than hopping, once a bounce is too small to see", () => {
    // The state the old arithmetic settled in: a quarter of a pixel up,
    // coming down at 17px/s. A bounce off that is 12px/s, which lifts it a
    // tenth of a pixel and is over before the tick is.
    const hopping: BallState = { ...ballAtRest(), z: 0.2716, vz: -17.07 };
    const { ball, ticks } = settle(hopping);
    expect(ticks).toBeLessThan(5);
    expect(ball.z).toBe(0);
    expect(ball.vz).toBe(0);
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

  it("is scored for a well aimed throw at any power the court has room for", () => {
    // The frames are fifty milliseconds apart and the ball covers up to
    // twenty-six pixels in one, so a rim tested at the frame's own position
    // drops a good shot whenever the crossing falls between two of them —
    // more often the harder it is thrown, and indistinguishable on screen
    // from having missed.
    //
    // The top of the meter is left out because there is nowhere on the
    // court to take it from: a perfect shot at full power is thrown from
    // eight hundred pixels out, which on the centre line is behind the
    // other hoop and its board. That is the board doing its job rather
    // than the rim failing at it, and it is asserted as such below.
    const [, east] = HOOPS;
    let taken = 0;
    for (let power = 0; power <= 1.0001; power += 0.05) {
      const from = { x: east.rim.x - throwReach(power), y: east.rim.y };
      if (from.x < COURT_PX.x) continue;
      taken++;
      expect({
        power: power.toFixed(2),
        scored: settle(thrown(standingOn(from), "right", power)).scored,
      }).toEqual({ power: power.toFixed(2), scored: 1 });
    }
    // Most of the meter, not a token few of it.
    expect(taken).toBeGreaterThan(15);
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

describe("the backboard", () => {
  const [west, east] = HOOPS;

  /**
   * One tick of a ball flying at the east board at a given height and a
   * given distance off the centre line.
   *
   * It starts twenty pixels out and covers thirty in the tick, so the pane
   * is met in the middle of a frame rather than at the end of one — which
   * is how it is met in play, and the only way the arithmetic either side
   * of the bounce is exercised at all.
   */
  const atTheBoard = (z: number, offCentre = 0) =>
    stepBall(
      { x: east.board.x - 20, y: east.rim.y + offCentre, z, vx: 600, vy: 0, vz: 0, heldBy: null },
      TICK,
      worldSolids(),
    );

  /**
   * Shoot along the centre line from a fixed distance and say what became
   * of it: whether it went in, and whether the board was what turned it.
   *
   * A bank is read off the ball rather than reported by `stepBall`, since
   * nothing in the game needs telling and the board is only a wall.
   */
  const outcome = (from: number, power: number) => {
    let ball = thrown(standingOn({ x: east.rim.x - from, y: east.rim.y }), "right", power);
    let scored = 0;
    let banked = false;
    // A ball can only score while it is in the air, and no throw on the
    // meter stays up for six seconds — so there is nothing to learn from
    // watching it roll.
    for (let i = 0; i < 120; i++) {
      const was = ball.vx;
      const step = stepBall(ball, TICK, worldSolids());
      if (step.ball.vx * was < 0 && step.ball.z > RIM_Z) banked = true;
      ball = step.ball;
      if (step.scored) scored++;
      if (!step.live) break;
    }
    return { scored, banked };
  };

  it("hangs behind each rim and above it", () => {
    // Behind, from the court: a shot has to pass the hole to reach the board.
    expect(west.board.x).toBeGreaterThan(west.post.x);
    expect(west.board.x).toBeLessThan(west.rim.x);
    expect(east.board.x).toBeLessThan(east.post.x);
    expect(east.board.x).toBeGreaterThan(east.rim.x);
    // And above: the foot of the board clears the rim, so a ball dropping
    // through the hole is never judged against the pane as well.
    expect(BOARD_BOTTOM_Z).toBeGreaterThan(RIM_Z);
    expect(BOARD_TOP_Z).toBeGreaterThan(BOARD_BOTTOM_Z);
  });

  it("sends a ball back the way it came, and keeps it in front of itself", () => {
    const step = atTheBoard((BOARD_BOTTOM_Z + BOARD_TOP_Z) / 2);
    expect(step.ball.vx).toBeLessThan(0);
    expect(step.ball.x).toBeLessThan(east.board.x);
  });

  it("takes a share of the speed across it and none of the rest", () => {
    // A flat wall reverses the one component that meets it. Height and the
    // way along the board are the ball's own business.
    const flying = { x: east.board.x - 20, y: east.rim.y, z: 100, vx: 600, vy: 40, vz: -50 };
    const step = stepBall({ ...flying, heldBy: null }, TICK, worldSolids());
    expect(Math.abs(step.ball.vx)).toBeLessThan(600);
    expect(step.ball.vy).toBe(40);
    // Falling as it was, less the tick of gravity every ball pays.
    expect(step.ball.vz).toBeCloseTo(-50 - (GRAVITY_PX_S2 * TICK) / 1000, 6);
  });

  it("is not there under the rim, nor over the top of the board", () => {
    // Between the hole and the foot of the pane is a gap a flat shot goes
    // clean through, and a lobbed one sails over. Both are honest misses.
    expect(atTheBoard(RIM_Z - 2).ball.vx).toBe(600);
    expect(atTheBoard(BOARD_TOP_Z + 2).ball.vx).toBe(600);
  });

  it("is no wider than its own picture", () => {
    const z = (BOARD_BOTTOM_Z + BOARD_TOP_Z) / 2;
    expect(atTheBoard(z, BOARD_HALF_WIDTH - 2).ball.vx).toBeLessThan(0);
    expect(atTheBoard(z, BOARD_HALF_WIDTH + 2).ball.vx).toBe(600);
  });

  it("gives a shot that was too long a chance at the rim", () => {
    // The point of the whole thing: past the power that drops the ball
    // straight through, there is more of the meter that puts it in off the
    // board. Every banked basket is harder than every swish, which is what
    // makes the board the second chance rather than the easy way.
    for (const from of [200, 300, 400, 500]) {
      const swished: number[] = [];
      const banked: number[] = [];
      for (let power = 0; power <= 1.0001; power += 0.025) {
        const { scored, banked: off } = outcome(from, power);
        if (scored) (off ? banked : swished).push(power);
      }
      expect({ from, swished: swished.length > 0, banked: banked.length > 0 }).toEqual({
        from,
        swished: true,
        banked: true,
      });
      expect(Math.min(...banked)).toBeGreaterThan(Math.max(...swished));
    }
  });

  it("is a chance and not a certainty", () => {
    // Plenty of board hits come straight back out: too high on the pane and
    // the rebound clears the rim on the way down, which is a miss with the
    // board in plain sight to explain it.
    let hitAndMissed = 0;
    for (let power = 0; power <= 1.0001; power += 0.025) {
      const { scored, banked } = outcome(150, power);
      if (banked && !scored) hitAndMissed++;
    }
    expect(hitAndMissed).toBeGreaterThan(2);
  });

  it("stops a shot taken from behind the other hoop", () => {
    // The longest throws on the meter are taken from off the court, and on
    // the centre line that is behind the far board — which the ball meets
    // from the back, exactly as it would from the front.
    const behind = standingOn({ x: west.board.x - 120, y: east.rim.y });
    const { scored } = settle(thrown(behind, "right", 1));
    expect(scored).toBe(0);
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
