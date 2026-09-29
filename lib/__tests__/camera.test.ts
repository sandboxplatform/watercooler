import { describe, it, expect } from "vitest";
import { ROOM_FRAME, fitZoom, frameZoom, outdoorFloor, reopenZoom, zoomFloor } from "../camera";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_OPEN_MIN } from "../constants";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../world/tenants";

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
 * How far out a room may be pulled: the whole of the widest room, and no
 * further. Operations is 73 tiles by 28.
 */
describe("zoomFloor", () => {
  const OPS = { width: 73 * 48, height: 28 * 48 };

  it("stops where the whole of Operations is on screen", () => {
    // A 1080p monitor with the browser's chrome taken off: the floor fills
    // the width, which is as far out as anybody standing indoors needs.
    expect(zoomFloor(1920, 920, OPS, ZOOM_MIN, ZOOM_MAX)).toBeCloseTo(1920 / OPS.width);
  });

  /**
   * The reason it is the widest room and not each room's own size: a lobby
   * opens whole on a desktop, and a stop there is a wheel that does nothing.
   */
  it("leaves a lobby room to pull back from where it opens", () => {
    const opens = frameZoom(1920, 920, ZOOM_OPEN_MIN, ZOOM_MAX);
    expect(zoomFloor(1920, 920, OPS, ZOOM_MIN, ZOOM_MAX)).toBeLessThan(opens * 0.6);
  });

  it("goes no lower than the least zoom, however small the screen", () => {
    expect(zoomFloor(375, 640, OPS, ZOOM_MIN, ZOOM_MAX)).toBe(ZOOM_MIN);
  });

  /** A stop above the zoom a room opens at would snap it in on the first turn. */
  it("is never above the lobby's fit, whatever frame it is handed", () => {
    for (const [w, h] of [
      [1920, 920],
      [800, 1000],
      [3840, 2000],
    ]) {
      const tiny = { width: 100, height: 100 };
      expect(zoomFloor(w, h, tiny, ZOOM_MIN, ZOOM_MAX)).toBeLessThanOrEqual(
        fitZoom(w, h, ROOM_FRAME.width, ROOM_FRAME.height),
      );
    }
  });
});

/**
 * How far out a place out of doors may be pulled: until another of its
 * edges is on screen, and no further.
 */
describe("outdoorFloor", () => {
  const WORLD = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
  /** 28 tiles by 26: narrower than a monitor, taller than one. */
  const ISLAND = { width: 28 * 48, height: 26 * 48 };
  /** A campus is a lobby's size, and opens whole. */
  const CAMPUS = { width: 20 * 48, height: 19 * 48 };
  const floor = (w: number, h: number, place: { width: number; height: number }) =>
    outdoorFloor(w, h, place, frameZoom(w, h, ZOOM_OPEN_MIN, ZOOM_MAX), ZOOM_MIN, ZOOM_MAX);

  /**
   * The screenshot this came from: a 1080p monitor pulled all the way back
   * at a quarter, with a band of background over the wood and under the sea.
   */
  it("stops the world map where it fills a 1080p screen top to bottom", () => {
    const stop = floor(1920, 920, WORLD);
    expect(stop).toBeCloseTo(920 / WORLD.height);
    expect(stop).toBeGreaterThan(ZOOM_MIN);
    // Nothing above or below it, and still more map either side.
    expect(920 / stop).toBeLessThanOrEqual(WORLD.height + 1e-6);
    expect(1920 / stop).toBeLessThan(WORLD.width);
  });

  it("goes no lower than the least zoom on a phone", () => {
    expect(floor(375, 700, WORLD)).toBe(ZOOM_MIN);
  });

  /** Its sides are on screen where it opens; its top and bottom are not. */
  it("lets the island stand back until the whole of it is in view", () => {
    const opens = frameZoom(1920, 920, ZOOM_OPEN_MIN, ZOOM_MAX);
    const stop = floor(1920, 920, ISLAND);
    expect(stop).toBeLessThan(opens);
    expect(stop).toBeCloseTo(920 / ISLAND.height);
  });

  /** Whole where it opens, so there is nothing further out to see. */
  it("keeps a campus where it opens", () => {
    for (const [w, h] of [
      [1920, 920],
      [1280, 700],
    ]) {
      expect(floor(w, h, CAMPUS)).toBeCloseTo(frameZoom(w, h, ZOOM_OPEN_MIN, ZOOM_MAX));
    }
  });

  /** A stop above the zoom a place opens at would snap it in on the first turn. */
  it("is never above the zoom a place opens at", () => {
    for (const [w, h] of [
      [1920, 920],
      [800, 1000],
      [3840, 2000],
      [375, 700],
    ]) {
      const opens = frameZoom(w, h, ZOOM_OPEN_MIN, ZOOM_MAX);
      for (const place of [WORLD, ISLAND, CAMPUS, { width: 100, height: 100 }]) {
        expect(floor(w, h, place)).toBeLessThanOrEqual(opens);
      }
    }
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
   * The range has moved between builds, so a zoom saved by one can be
   * further out than another is allowed to go.
   */
  it("pulls a zoom from a build with a lower floor up to this one's", () => {
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

/** Where the two ends sit relative to each other and to where places open. */
describe("the zoom range", () => {
  it("opens every place inside what the wheel can reach", () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_OPEN_MIN);
    expect(ZOOM_OPEN_MIN).toBeLessThan(ZOOM_MAX);
  });
});
