/**
 * Camera fitting.
 *
 * The game is a menu as much as a place: the door, the lift and the games
 * should all be on screen at once, so a click reaches any of them. The zoom
 * is therefore the one that fits the whole lobby inside the viewport, with
 * background around it where the shape does not match — and it is fitted to
 * the lobby's size whatever room is on screen, so a smaller room is drawn
 * at the same scale (a fractional zoom-in makes the pixels uneven and the
 * sprites look blurred) and simply sits centred with more room around it.
 */

import { HEIGHT, TILE, WIDTH } from "./map/office";

/** The room every zoom is fitted to: the lobby. */
export const ROOM_FRAME = { width: WIDTH * TILE, height: HEIGHT * TILE };

/** The largest zoom at which a room of this size fits inside the viewport. */
export function fitZoom(viewW: number, viewH: number, mapW: number, mapH: number): number {
  if (mapW <= 0 || mapH <= 0 || viewW <= 0 || viewH <= 0) return 1;
  return Math.min(viewW / mapW, viewH / mapH);
}

/** The zoom that fits the lobby in this viewport — used for every room, within limits. */
export function frameZoom(viewW: number, viewH: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, fitZoom(viewW, viewH, ROOM_FRAME.width, ROOM_FRAME.height)));
}

/**
 * How far out a map can be zoomed: until it just fills the viewport, so the
 * camera never looks past its edge, and never below the game's least zoom.
 * A room stops at the lobby's fit; a map is bigger than a screen, and
 * seeing more of it is the point of zooming out.
 */
export function coverZoom(
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  min: number,
  max: number,
): number {
  const fill = mapW > 0 && mapH > 0 ? Math.max(viewW / mapW, viewH / mapH) : 0;
  return Math.min(max, Math.max(min, fill));
}

/**
 * The zoom to open a place at: the one the person left it on, if it still
 * fits, and otherwise the fitted one.
 *
 * Only the world map remembers. A room is fitted so the door, the lift and
 * the games are all reachable at once, and re-fitting it every time is the
 * point; the map is bigger than a screen, so how far out to stand is a
 * choice somebody makes, and making it again after every errand is a chore.
 *
 * Clamped rather than trusted, because the floor moves: it is derived from
 * the viewport, so a zoom saved on a wide window is further out than a
 * narrow one can go, and a stored value is whatever was in the browser —
 * another tab, an older build, or somebody with the console open.
 *
 * @param saved what was stored, or null for nothing usable
 * @param fitted the zoom this place would open at on its own
 * @returns null when there is nothing to restore, so the caller fits
 */
export function reopenZoom(
  saved: number | null,
  fitted: number,
  floor: number,
  max: number,
): number | null {
  if (saved === null || !Number.isFinite(saved) || saved <= 0) return null;
  const room = Math.min(max, Math.max(floor, saved));
  // Within a hair of the fitted zoom is the fitted zoom: restoring a value
  // that rounds to it only invites floating-point drift to accumulate over
  // a session of doors.
  return Math.abs(room - fitted) < 0.001 ? null : room;
}
