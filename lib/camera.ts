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
 * How far out a room's camera may stand: until the widest room in the world
 * is whole on screen, and no further — the same stop in every room.
 *
 * One stop for every room rather than one per room, and that is the part to
 * keep. Stopping each room at its own size was tried, and a lobby opens
 * whole on a desktop, so its wheel did nothing at all — which reads as the
 * zoom being broken. With nothing stopping it the other way, a room could be
 * pulled back to a quarter and left a picture the size of a stamp in a
 * screen of black. The whole of Operations is the most anybody standing
 * indoors needs to see, so that is where every room stops: a lobby still
 * has a wheel, and a floor seen end to end is as far as it goes.
 *
 * Off the viewport rather than a number, so it is the same sight on any
 * screen — a monitor stops a little over half, a phone well down at `min`.
 * Never past the lobby's fit, which is the zoom a room opens at: a stop
 * above that would snap the camera in on the first turn of the wheel.
 *
 * @param frame the widest room, in pixels (`widestRoom` in `lib/world/floors`)
 */
export function zoomFloor(
  viewW: number,
  viewH: number,
  frame: { width: number; height: number },
  min: number,
  max: number,
): number {
  const whole = Math.min(
    fitZoom(viewW, viewH, frame.width, frame.height),
    fitZoom(viewW, viewH, ROOM_FRAME.width, ROOM_FRAME.height),
  );
  return Math.min(max, Math.max(min, whole));
}

/**
 * How far out a place out of doors may stand back: until another of its
 * edges comes onto the screen, and no further.
 *
 * On the world map that is the top and the bottom. It is wider than it is
 * deep against any ordinary screen, so pulling back brings the wood's top
 * edge and the sea's bottom one on together, long before either end of the
 * map — and every turn of the wheel past that point is a band of background
 * above the trees and another under the water, with nothing more of the
 * world in either. It used to go all the way to `min`, which on a 1080p
 * monitor was a strip of black at the top and the bottom of the map.
 *
 * "Another" edge, because a small place already shows some of its edges
 * where it opens. The island is narrower than a monitor and taller than one,
 * so it opens with background either side and its top and bottom off screen:
 * it may stand back until those are on too, which is the whole island, and
 * then stops. A campus or the cave opens whole, so there is nothing further
 * to bring into view and it stays where it opened.
 *
 * Never past the zoom a place opens at, for the reason `zoomFloor` gives: a
 * stop above that would snap the camera in on the first turn of the wheel.
 *
 * @param place the place's own size, in pixels
 * @param opens the zoom this place opens at in this viewport
 */
export function outdoorFloor(
  viewW: number,
  viewH: number,
  place: { width: number; height: number },
  opens: number,
  min: number,
  max: number,
): number {
  const clamp = (zoom: number) => Math.min(max, Math.max(min, zoom));
  if (place.width <= 0 || place.height <= 0 || viewW <= 0 || viewH <= 0) return clamp(opens);
  // The zoom at which each side of the place meets the screen's, for the
  // sides that are still off it where the place opens.
  const offScreen = [viewW / place.width, viewH / place.height].filter((meets) => meets < opens);
  return clamp(offScreen.length ? Math.max(...offScreen) : opens);
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
 * Clamped rather than trusted, because a stored value is whatever was in
 * the browser — another tab, an older build with other limits (the range
 * has moved before, and will again), or somebody with the console open.
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
