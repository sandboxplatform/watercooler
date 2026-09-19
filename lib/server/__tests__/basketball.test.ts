import { describe, it, expect, beforeEach } from "vitest";
import { Basketball } from "../basketball";
import {
  CENTRE_SPOT,
  COURT_PX,
  FEET_BELOW_CENTRE,
  HOOPS,
  REACH_PX,
  throwReach,
} from "../../world/basketball";

const TICK = 50;
const nobody = () => null;

/**
 * Somebody standing with their feet on a patch of ground, facing a way.
 *
 * A person's own position is the middle of their frame and a ball's is the
 * tarmac, so a test that puts somebody at the ball's own y has them
 * standing forty pixels short of it.
 */
const standingOn = (at: { x: number; y: number }, facing: "left" | "right" | "up" | "down") => ({
  x: at.x,
  y: at.y - FEET_BELOW_CENTRE,
  facing,
});

/** Standing on the centre spot, which is where the ball starts. */
const onIt = standingOn(CENTRE_SPOT, "right");

describe("picking the ball up", () => {
  let ball: Basketball;
  beforeEach(() => {
    ball = new Basketball();
  });

  it("is refused from across the court, however politely asked", () => {
    const away = standingOn({ x: CENTRE_SPOT.x + REACH_PX * 4, y: CENTRE_SPOT.y }, "right");
    expect(ball.take("coop", away)).toBe(false);
    expect(ball.state.heldBy).toBeNull();
  });

  it("is allowed from over it, and it rides at the hand", () => {
    expect(ball.take("coop", onIt)).toBe(true);
    expect(ball.state.heldBy).toBe("coop");
    expect(ball.state.z).toBeGreaterThan(0);
  });

  it("cannot be taken off somebody who already has it", () => {
    ball.take("coop", onIt);
    expect(ball.take("rob", onIt)).toBe(false);
    expect(ball.state.heldBy).toBe("coop");
  });
});

describe("throwing it", () => {
  let ball: Basketball;
  beforeEach(() => {
    ball = new Basketball();
  });

  it("is refused to anybody who is not holding it", () => {
    ball.take("coop", onIt);
    expect(ball.release("rob", onIt, 1)).toBe(false);
    expect(ball.state.heldBy).toBe("coop");
  });

  it("lets go of it and sends it the way the thrower faces", () => {
    ball.take("coop", onIt);
    expect(ball.release("coop", onIt, 1)).toBe(true);
    expect(ball.state.heldBy).toBeNull();
    expect(ball.state.vx).toBeGreaterThan(0);
    expect(ball.state.vz).toBeGreaterThan(0);
  });

  it("aims from where the room says they are, not from where the message does", () => {
    // The only thing the browser gets a say in is the power. Standing them
    // on the far side of the court is the server's own record moving, and
    // the ball has to leave from there.
    const far = standingOn({ x: CENTRE_SPOT.x + 200, y: CENTRE_SPOT.y }, "left");
    ball.take("coop", onIt);
    ball.release("coop", far, 0.5);
    expect(ball.state.x).toBeGreaterThan(CENTRE_SPOT.x + 150);
    expect(ball.state.vx).toBeLessThan(0);
  });
});

describe("a basket", () => {
  /** Stand at the range a throw at this power carries, and shoot. */
  const shoot = (ball: Basketball, power: number) => {
    const [, east] = HOOPS;
    const at = standingOn({ x: east.rim.x - throwReach(power), y: east.rim.y }, "right");
    // Picked up on the centre spot, then walked to the line and thrown.
    ball.take("coop", onIt);
    ball.release("coop", at, power);
    for (let i = 0; i < 200; i++) {
      const step = ball.step(TICK, nobody);
      if (step.scored) return step.scored;
      if (!step.live) return null;
    }
    return null;
  };

  it("is credited to whoever threw it", () => {
    const ball = new Basketball();
    const scored = shoot(ball, 0.6);
    expect(scored?.by).toBe("coop");
    expect(scored?.hoop.side).toBe("east");
  });

  it("is credited to nobody for a ball that went in on its own", () => {
    // Nothing threw it, so there is nobody for the badge to hang on — and a
    // basket with no thrower must not be credited to whoever last had it.
    const ball = new Basketball();
    ball.take("coop", onIt);
    ball.drop("coop", onIt);
    const [, east] = HOOPS;
    // Drop it straight down through the rim, untouched by anybody.
    const state = ball.state;
    Object.assign(state, { x: east.rim.x, y: east.rim.y, z: 120, vz: 0 });
    let seen = false;
    for (let i = 0; i < 60; i++) if (ball.step(TICK, nobody).scored) seen = true;
    expect(seen).toBe(false);
  });
});

describe("letting go of it", () => {
  it("puts it down where the carrier stood, so it can be picked up again", () => {
    const ball = new Basketball();
    const over = standingOn({ x: CENTRE_SPOT.x + 200, y: CENTRE_SPOT.y + 80 }, "down");
    ball.take("coop", onIt);
    ball.drop("coop", over);
    expect(ball.state.heldBy).toBeNull();
    expect(ball.state.z).toBe(0);
    expect(ball.take("rob", over)).toBe(true);
  });

  it("happens on its own when the carrier's connection has gone", () => {
    // Only the person holding it can let go of it, so a ball still in the
    // hands of a closed tab would hang there for as long as the server runs.
    const ball = new Basketball();
    ball.take("coop", onIt);
    const step = ball.step(TICK, nobody);
    expect(step.ball.heldBy).toBeNull();
  });

  it("brings a ball left off the court back to the centre spot", () => {
    // A throw at full stretch carries it over the end line and the avenue
    // beyond, and a court with no ball on it is the feature switched off
    // until somebody happens to walk past wherever it stopped.
    const ball = new Basketball();
    const away = standingOn({ x: CENTRE_SPOT.x + 900, y: CENTRE_SPOT.y }, "right");
    ball.take("coop", onIt);
    ball.drop("coop", away);
    for (let i = 0; i < 60_000 / TICK; i++)
      expect(ball.step(TICK, nobody).ball.x).toBeGreaterThan(CENTRE_SPOT.x + 500);
    for (let i = 0; i < 40_000 / TICK; i++) ball.step(TICK, nobody);
    expect(ball.state.x).toBe(CENTRE_SPOT.x);
    expect(ball.state.y).toBe(CENTRE_SPOT.y);
  });

  it("leaves a ball lying on the court where somebody left it", () => {
    // Tidying that away is moving somebody's things.
    const ball = new Basketball();
    const corner = standingOn({ x: COURT_PX.x + 30, y: COURT_PX.y + 30 }, "right");
    ball.take("coop", onIt);
    ball.drop("coop", corner);
    const where = { x: ball.state.x, y: ball.state.y };
    for (let i = 0; i < 200_000 / TICK; i++) ball.step(TICK, nobody);
    expect({ x: ball.state.x, y: ball.state.y }).toEqual(where);
  });

  it("keeps it at the hand of a carrier who is still there", () => {
    const ball = new Basketball();
    ball.take("coop", onIt);
    const walked = standingOn({ x: CENTRE_SPOT.x + 120, y: CENTRE_SPOT.y }, "right");
    const step = ball.step(TICK, () => walked);
    expect(step.ball.heldBy).toBe("coop");
    expect(step.ball.x).toBeGreaterThan(walked.x);
  });
});
