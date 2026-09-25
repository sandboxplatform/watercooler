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
 * How far out a place can be zoomed: until the whole of it is in view, and
 * never past the game's least zoom.
 *
 * One rule for every place, the world map included. It used to be two — a
 * room stopped at the lobby's fit and a map at the zoom that just filled
 * the viewport — and both were the wrong answer for somewhere long and
 * thin. An Operations floor is seventy-three tiles by twenty-eight, so it
 * fills a screen from top to bottom long before its far end is on it, and
 * zooming out to see the corridor was exactly what neither rule allowed.
 *
 * Past the whole place being in view there is nothing further to see, only
 * background, which is why this stops there rather than at `min` outright.
 * The lobby's fit is in it too, because every place opens at that: a room
 * smaller than the lobby is already whole on screen there, and a floor
 * above the zoom a room opens at would snap it in on the first turn of the
 * wheel.
 */
export function zoomFloor(
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  min: number,
  max: number,
): number {
  const whole = Math.min(
    fitZoom(viewW, viewH, ROOM_FRAME.width, ROOM_FRAME.height),
    fitZoom(viewW, viewH, mapW, mapH),
  );
  return Math.min(max, Math.max(min, whole));
}

/**
 * The zoom to hold through a resize: the one somebody chose, kept inside
 * what the new viewport allows, and the fit only if they never chose one.
 *
 * A resize is not an arrival. It is the People column opening on Tab, the
 * handle being dragged, a phone turned on its side — and refitting on every
 * one of them threw away a zoom the person was in the middle of using. On
 * Operations that meant pulling back to see the whole corridor, opening the
 * column to see who was about, and being snapped straight back in.
 *
 * Clamped rather than kept exactly, because the floor comes off the
 * viewport: a narrow window has to stand further back to get the whole of a
 * floor on it, so a zoom chosen there is past where a wider one stops —
 * where the whole floor is already on screen. The choice itself is the
 * caller's to keep, held unclamped, so a window that grows and shrinks
 * again gives it back.
 *
 * @param chosen the zoom the wheel or a pinch last settled on, or null
 * @param fitted the zoom this place would open at on its own
 */
export function resizedZoom(
  chosen: number | null,
  fitted: number,
  floor: number,
  max: number,
): number {
  if (chosen === null) return fitted;
  return Math.min(max, Math.max(floor, chosen));
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
 * the viewport, so a zoom saved on one window can be further out than
 * another is allowed to go, and a stored value is whatever was in the browser —
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
