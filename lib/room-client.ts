"use client";

/**
 * Which room this browser is in.
 *
 * Read off the address bar at call time rather than held anywhere, because a
 * room change is a pushed URL and nothing else: riding the lift changes rooms
 * without rebuilding the HUD, so a slug captured at mount is the floor below's.
 */

import { DEFAULT_ROOM_SLUG, roomFromLocation } from "./rooms";

/** The room this browser is in, from the URL. */
export function currentRoom(): string {
  if (typeof window === "undefined") return DEFAULT_ROOM_SLUG;
  return roomFromLocation(window.location);
}
