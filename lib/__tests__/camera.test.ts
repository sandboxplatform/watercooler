import { describe, it, expect } from "vitest";
import { ROOM_FRAME, fitZoom, frameZoom, reopenZoom } from "../camera";

// The lobby is 20x19 tiles at 48px.
const MAP_W = 960;
const MAP_H = 912;

describe("fitZoom", () => {
  it("fits the room inside the viewport rather than covering it", () => {
    // A wide viewport is limited by height; a tall one by width.
    expect(fitZoom(1600, 672, MAP_W, MAP_H)).toBeCloseTo(672 / MAP_H);
    expect(fitZoom(960, 1200, MAP_W, MAP_H)).toBeCloseTo(960 / MAP_W);
  });

  it("is 1 when the viewport matches the room", () => {
    expect(fitZoom(MAP_W, MAP_H, MAP_W, MAP_H)).toBe(1);
  });

  it("survives a zero-sized viewport during layout", () => {
    expect(fitZoom(0, 0, MAP_W, MAP_H)).toBe(1);
    expect(fitZoom(800, 600, 0, 0)).toBe(1);
  });
});

describe("frameZoom", () => {
  it("is the lobby's fit, whatever room is on screen, within the limits", () => {
    expect(ROOM_FRAME).toEqual({ width: MAP_W, height: MAP_H });
    expect(frameZoom(MAP_W, MAP_H, 0.5, 2)).toBe(1);
    // A floor is the same size as the lobby, so it fits the same; a smaller
    // room would too, without zooming in on it.
    expect(frameZoom(1920, 1824, 0.5, 2)).toBe(2);
    expect(frameZoom(6000, 4000, 0.5, 2)).toBe(2);
    expect(frameZoom(200, 100, 0.5, 2)).toBe(0.5);
  });

  it("grows when the chat column collapses and the viewport widens", () => {
    const open = frameZoom(800, 1000, 0.5, 2);
    const collapsed = frameZoom(1500, 1000, 0.5, 2);
    expect(collapsed).toBeGreaterThan(open);
  });
});

/**
 * The world map opens where it was left.
 *
 * A room is fitted every time on purpose — the door, the lift and the games
 * all reachable at once. The map is bigger than a screen, so how far out to
 * stand is a choice, and an errand into a building should not undo it.
 */
describe("reopenZoom", () => {
  const FLOOR = 0.5;
  const MAX = 4;

  it("has nothing to say when nothing was saved", () => {
    expect(reopenZoom(null, 1, FLOOR, MAX)).toBeNull();
  });

  it("gives back a saved zoom that still fits", () => {
    expect(reopenZoom(2, 1, FLOOR, MAX)).toBe(2);
  });

  /**
   * The floor comes off the viewport, so a zoom saved on a wide window can
   * be further out than a narrow one is allowed to go.
   */
  it("pulls a zoom from a wider window up to this window's floor", () => {
    expect(reopenZoom(0.2, 1, FLOOR, MAX)).toBe(FLOOR);
  });

  it("caps one that is too far in", () => {
    expect(reopenZoom(99, 1, FLOOR, MAX)).toBe(MAX);
  });

  /** Whatever is in the browser is whatever somebody put there. */
  it("ignores nonsense rather than trusting it", () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -2]) {
      expect(reopenZoom(bad, 1, FLOOR, MAX), String(bad)).toBeNull();
    }
  });

  /**
   * A value that rounds to the fitted zoom is the fitted zoom. Restoring it
   * would let floating-point drift accumulate across a session of doors.
   */
  it("treats a hair off the fitted zoom as the fitted zoom", () => {
    expect(reopenZoom(1.0000001, 1, FLOOR, MAX)).toBeNull();
    expect(reopenZoom(1.5, 1, FLOOR, MAX)).toBe(1.5);
  });

  /** Clamping happens first, so a saved value below a fitted floor is not "the fit". */
  it("clamps before comparing, so the floor can be the answer", () => {
    expect(reopenZoom(0.1, 2, 1, MAX)).toBe(1);
  });
});
