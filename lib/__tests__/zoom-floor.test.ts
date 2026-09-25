import { describe, expect, it } from "vitest";
import { frameZoom, zoomFloor } from "../camera";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_OPEN_MIN } from "../constants";

/**
 * How far out a place can be zoomed — one rule for every place.
 *
 * Sizes are the real maps': a lobby, a store, Sandbox ERP's Operations floor
 * and the world map. The viewports are a desktop with the column open, a
 * laptop, and a phone.
 */
const LOBBY = { w: 960, h: 912 };
const STORE = { w: 960, h: 672 };
const OPERATIONS = { w: 3504, h: 1344 };
const WORLD = { w: 8928, h: 3312 };

const DESKTOP = { w: 1500, h: 950 };
const LAPTOP = { w: 1280, h: 720 };
const PHONE = { w: 390, h: 700 };

const floorOf = (view: { w: number; h: number }, map: { w: number; h: number }) =>
  zoomFloor(view.w, view.h, map.w, map.h, ZOOM_MIN, ZOOM_MAX);
const openingOf = (view: { w: number; h: number }) =>
  frameZoom(view.w, view.h, ZOOM_OPEN_MIN, ZOOM_MAX);

describe("zoomFloor", () => {
  /**
   * The complaint that started this: Operations stopped at the lobby's fit,
   * so seventy-three tiles of corridor were only ever a lobby's width at a
   * time. It goes out until the whole floor is on screen.
   */
  it("lets a long floor go out until the whole of it is in view", () => {
    for (const view of [DESKTOP, LAPTOP]) {
      const floor = floorOf(view, OPERATIONS);
      expect(floor).toBeLessThan(openingOf(view));
      expect(OPERATIONS.w * floor).toBeLessThanOrEqual(view.w + 1e-9);
      expect(OPERATIONS.h * floor).toBeLessThanOrEqual(view.h + 1e-9);
    }
  });

  /** Past the whole place being on screen there is only background to see. */
  it("stops a room that is already whole on screen where it opens", () => {
    expect(floorOf(DESKTOP, LOBBY)).toBeCloseTo(openingOf(DESKTOP));
    expect(floorOf(DESKTOP, STORE)).toBeCloseTo(openingOf(DESKTOP));
  });

  /**
   * A phone opened at the least opening zoom and could go no further out,
   * anywhere. Now every place bigger than the phone's screen can.
   */
  it("gives a phone somewhere further out to go, in a room and on the map", () => {
    const opening = openingOf(PHONE);
    expect(opening).toBe(ZOOM_OPEN_MIN);
    for (const map of [LOBBY, OPERATIONS, WORLD]) {
      expect(floorOf(PHONE, map), `${map.w}x${map.h}`).toBeLessThan(opening);
    }
    // Far enough on a lobby to see the whole of it.
    expect(LOBBY.w * floorOf(PHONE, LOBBY)).toBeLessThanOrEqual(PHONE.w + 1e-9);
  });

  /** One range everywhere: what differs is only how big the place is. */
  it("goes as far out on Operations as on the world map, given room to", () => {
    expect(floorOf(PHONE, OPERATIONS)).toBe(ZOOM_MIN);
    expect(floorOf(PHONE, WORLD)).toBe(ZOOM_MIN);
    expect(floorOf(DESKTOP, WORLD)).toBe(ZOOM_MIN);
  });

  /**
   * A floor above the zoom a place opens at would snap it in on the first
   * turn of the wheel. The lobby's fit is in the rule so it never is.
   */
  it("is never above the zoom a place opens at", () => {
    for (const view of [DESKTOP, LAPTOP, PHONE, { w: 3000, h: 400 }, { w: 300, h: 2000 }]) {
      for (const map of [LOBBY, STORE, OPERATIONS, WORLD, { w: 200, h: 200 }]) {
        expect(floorOf(view, map), `${view.w}x${view.h} on ${map.w}x${map.h}`).toBeLessThanOrEqual(
          openingOf(view),
        );
      }
    }
  });

  it("stays inside the limits, and copes with a place or a view of no size", () => {
    expect(zoomFloor(1200, 800, 100_000, 100_000, ZOOM_MIN, ZOOM_MAX)).toBe(ZOOM_MIN);
    expect(zoomFloor(40_000, 40_000, 100, 100, ZOOM_MIN, ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomFloor(1200, 800, 0, 0, ZOOM_MIN, ZOOM_MAX)).toBeCloseTo(
      frameZoom(1200, 800, ZOOM_MIN, ZOOM_MAX),
    );
    expect(zoomFloor(0, 0, LOBBY.w, LOBBY.h, ZOOM_MIN, ZOOM_MAX)).toBe(1);
  });
});

describe("the range", () => {
  /** Where the two ends sit relative to each other and to where places open. */
  it("opens inside what the wheel can reach", () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_OPEN_MIN);
    expect(ZOOM_OPEN_MIN).toBeLessThan(ZOOM_MAX);
  });
});
