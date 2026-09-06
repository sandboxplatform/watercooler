"use client";

/**
 * Moving between rooms without reloading the page.
 *
 * A room is a URL, so changing room was a navigation: `location.assign`, and
 * the whole client comes up again. Measured on a warm cache in production
 * that is about 1.2s to ride one floor — 232ms to first paint, then half a
 * second of Phaser parsing and booting before the new map is so much as
 * asked for, and only 7KB of it actually off the network. Nothing is being
 * fetched; the app is being rebuilt around a room that is next door.
 *
 * The lift makes it feel like it should be cheap. This makes it cheap: push
 * the URL, say so, and let the scene swap its map while the game, both
 * sockets and the whole HUD stay up.
 *
 * Only for rooms the running scene can become. A lift's stops are all in one
 * building and all drawn by `OfficeScene`, which is why the lift uses this
 * and the front door does not — walking out onto the world map is a
 * different scene, and `location.assign` is still the honest way to do that.
 */

import { gameEvents } from "./events";
import { roomFromLocation } from "./rooms";

/**
 * The room the address bar last named.
 *
 * Kept so a push or a pop that leaves the room alone — a query parameter,
 * a fragment — is not announced as a move. Everything downstream reacts by
 * throwing a scene away and refetching the room, which is not free.
 */
let here: string | null = null;

function announce(): void {
  const now = roomFromLocation(window.location);
  if (now === here) return;
  here = now;
  gameEvents.emit("room-changed", now);
}

/** Go to another room of the same building, in the page. */
export function travelTo(url: string): void {
  if (typeof window === "undefined") return;
  here ??= roomFromLocation(window.location);
  window.history.pushState({}, "", url);
  announce();
}

/**
 * Back and forward are room changes too.
 *
 * Without this the address bar would say one room and the game would draw
 * another — and the back button is how a person leaves a floor they did not
 * mean to press.
 */
export function watchRoomHistory(): () => void {
  if (typeof window === "undefined") return () => {};
  here ??= roomFromLocation(window.location);
  const onPop = () => announce();
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}

/** Test seam: forget which room we were in. */
export function resetRoomTravel(): void {
  here = null;
}
