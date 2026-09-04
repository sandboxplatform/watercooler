/**
 * Which way a character is facing, from the way they are moving.
 *
 * There are four sheets to choose between and movement comes in every
 * direction, so something has to decide. The rule is the **dominant axis**:
 * whichever of the two you are doing more of is the way you are pointed.
 *
 * The obvious alternative — take horizontal whenever there is any of it —
 * looks the same on a keyboard and falls apart everywhere else. Tap a spot
 * straight below you and the route there is not perfectly vertical: it
 * carries a pixel or two of sideways drift, which under that rule is enough
 * to turn the character side-on and keep them there for the whole walk. It is
 * why walking by touch used to leave everyone permanently in profile.
 *
 * An exact diagonal is a tie, and a tie goes to horizontal — that is the
 * keyboard's case, where holding two keys should show a side view rather than
 * a back. Nothing is decided when nothing is moving: the answer is null and
 * the character keeps the way they were already facing, which is what makes
 * walking left and stopping leave them looking left.
 */

import type { Facing } from "./presence-types";

export function facingFor(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
