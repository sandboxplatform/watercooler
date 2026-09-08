import { describe, it, expect } from "vitest";
import { LEGIBLE_MAX_SCALE, legibleScale } from "../legible";
import { ZOOM_MAX, ZOOM_MIN } from "../constants";
import { frameZoom } from "../camera";

/**
 * The rule that keeps in-world lettering readable.
 *
 * Worth pinning because it is one line with three separate jobs, and two of
 * them fail quietly: a rule without the floor shrinks every sign on every
 * desktop, and a rule without the cap would put a sign across a room the
 * next time somebody lowers the zoom floor. Neither looks like a bug in the
 * code.
 */

describe("legibleScale", () => {
  it("leaves lettering alone at natural size", () => {
    expect(legibleScale(1)).toBe(1);
  });

  it("blows it up by exactly as much as the camera shrank it", () => {
    expect(legibleScale(0.5)).toBe(2);
    expect(legibleScale(0.8)).toBeCloseTo(1.25);
  });

  /**
   * The floor, and the reason the rule is not simply `1 / zoom`. A room's
   * zoom is fitted to a lobby, which is nearly square, so a wide monitor
   * opens zoomed *in* and signs there are already magnified; making them
   * "constant size" would be making them smaller, which nobody asked for.
   */
  it("never shrinks anything, however far in the camera stands", () => {
    for (const zoom of [1.0001, 1.3, 1.5, 2, ZOOM_MAX]) {
      expect(legibleScale(zoom), `zoom ${zoom}`).toBe(1);
    }
  });

  it("stops at the cap", () => {
    expect(legibleScale(0.1)).toBe(LEGIBLE_MAX_SCALE);
    expect(legibleScale(0.0001)).toBe(LEGIBLE_MAX_SCALE);
  });

  /** A zoom of zero is not a camera anybody is looking through. */
  it("leaves lettering alone rather than dividing by nonsense", () => {
    for (const zoom of [0, -1, NaN, Infinity, -Infinity]) {
      expect(legibleScale(zoom), `zoom ${zoom}`).toBe(1);
    }
  });

  it("only ever magnifies, at every zoom the game allows", () => {
    for (let zoom = ZOOM_MIN; zoom <= ZOOM_MAX; zoom += 0.01) {
      const scale = legibleScale(zoom);
      expect(scale, `zoom ${zoom}`).toBeGreaterThanOrEqual(1);
      expect(scale, `zoom ${zoom}`).toBeLessThanOrEqual(LEGIBLE_MAX_SCALE);
    }
  });

  /**
   * The cap is only ever reached because the zoom floor is where it is. If
   * `ZOOM_MIN` drops, the cap starts biting and lettering stops being
   * readable on the smallest screens — so the two are checked together
   * rather than left to be noticed on a phone.
   */
  it("reaches natural size at the zoom floor without hitting the cap", () => {
    expect(legibleScale(ZOOM_MIN)).toBe(1 / ZOOM_MIN);
    expect(legibleScale(ZOOM_MIN)).toBeLessThanOrEqual(LEGIBLE_MAX_SCALE);
  });
});

describe("what a real viewport asks for", () => {
  const scaleAt = (w: number, h: number) => legibleScale(frameZoom(w, h, ZOOM_MIN, ZOOM_MAX));

  /** A phone is the case this exists for: the zoom floor, so double size. */
  it("doubles lettering on a handset", () => {
    expect(scaleAt(375, 812)).toBe(2);
    expect(scaleAt(390, 844)).toBe(2);
  });

  /** A wide monitor opens zoomed in on a nearly square lobby: nothing to do. */
  it("changes nothing on a wide monitor", () => {
    expect(scaleAt(1920, 1080)).toBe(1);
    expect(scaleAt(2560, 1440)).toBe(1);
  });

  /**
   * A laptop is short enough to fit the lobby at under 1, so it gains a
   * little — which is the point. It is one rule, not a phone special case.
   */
  it("gives a laptop a little", () => {
    const laptop = scaleAt(1280, 800);
    expect(laptop).toBeGreaterThan(1);
    expect(laptop).toBeLessThan(1.3);
  });
});
