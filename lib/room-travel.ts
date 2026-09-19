"use client";

/**
 * Moving between rooms without reloading the page.
 *
 * A room is a URL, so changing room used to be a navigation: `location.assign`,
 * and the whole client comes up again. Measured on a warm cache in production
 * that is about 1.2s to ride one floor — 232ms to first paint, then half a
 * second of Phaser parsing and booting before the new map is so much as
 * asked for, and only 7KB of it actually off the network. Nothing is being
 * fetched; the app is being rebuilt around a room that is next door.
 *
 * That was the cheap half of the cost. The dear half is that a page load is
 * a new WebSocket, a new set of peer connections and a new person as far as
 * the server can tell — so walking through a front door dropped you out of
 * Global Chat mid-sentence, made the Online count flicker down and back up
 * for everybody in the world, and raced your own ghost for your own code:
 * the socket the leaving page left behind still answers a ping, because a
 * pong is the browser's network stack rather than the page's script, so the
 * arriving page was told it was already online and shown the door.
 *
 * So **every** room change comes through here now: push the URL, say so,
 * and let `components/game/systems/scene-router.ts` put up whichever scene
 * the new address names while the game, the socket, the voice chat and the
 * whole HUD stay exactly where they are. One connection for as long as the
 * tab is open, which is what the Online list has always claimed to count.
 */

import { gameEvents, type RoomArrival } from "./events";
import { roomFromLocation } from "./rooms";

/**
 * The room the address bar last named.
 *
 * Kept so a push or a pop that leaves the room alone — a query parameter,
 * a fragment — is not announced as a move. Everything downstream reacts by
 * throwing a scene away and refetching the room, which is not free.
 */
let here: string | null = null;

/**
 * Put an address in the bar and say what it means.
 *
 * `replace` is for an address that is not a place to stand still in — the
 * bare app, which forwards to the world map. Pushing one of those puts it
 * in the history, and the back button then lands on an address that
 * forwards again: a door that opens onto itself.
 *
 * `always` is for an arrival rather than a move. Ordinarily a push that
 * leaves the room alone — a query parameter, a fragment — is not announced,
 * because everything downstream reacts by throwing a scene away and
 * refetching the room, which is not free. Walking into the world for the
 * first time is the one case where that is exactly what is wanted even
 * though the address may not have changed at all.
 */
function go(
  url: string,
  arrival: RoomArrival,
  { replace = false, always = false }: { replace?: boolean; always?: boolean } = {},
): void {
  if (typeof window === "undefined") return;
  here ??= roomFromLocation(window.location);
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  const now = roomFromLocation(window.location);
  if (now === here && !always) return;
  here = now;
  gameEvents.emit("room-changed", now, arrival);
}

/**
 * Go to another room, in the page.
 *
 * `arrival` is what the address bar cannot carry: which building or campus
 * was just left, so the place being arrived at can stand you outside its
 * door rather than wherever it spawns a stranger. A lift ride and a typed
 * URL both leave it empty, which is the road.
 */
export function travelTo(url: string, arrival: RoomArrival = {}): void {
  go(url, arrival);
}

/**
 * Go somewhere in place of where we are, rather than on from it. For an
 * address that forwards: the bare app, which is not a place.
 */
export function redirectTo(url: string, arrival: RoomArrival = {}): void {
  go(url, arrival, { replace: true });
}

/**
 * Walk into the world, as though from outside it.
 *
 * The one move that is an arrival rather than a journey, and the only one
 * that insists on being heard: somebody who finishes the welcome screen
 * while standing on the world map is already at the address they are being
 * walked to, so nothing would happen at all — no scene built, no steps
 * taken, and a loading card left waiting on a place that was never going to
 * say it had arrived. Where they came from is not a place to go back to
 * either, so it replaces rather than pushes.
 */
export function arriveAt(url: string, arrival: RoomArrival = {}): void {
  go(url, arrival, { replace: true, always: true });
}

/**
 * Back and forward are room changes too.
 *
 * Without this the address bar would say one room and the game would draw
 * another — and the back button is how a person leaves a floor they did not
 * mean to press. Nothing is known about where they came from, so they are
 * put down where the place puts a stranger.
 */
export function watchRoomHistory(): () => void {
  if (typeof window === "undefined") return () => {};
  here ??= roomFromLocation(window.location);
  const onPop = () => {
    const now = roomFromLocation(window.location);
    if (now === here) return;
    here = now;
    gameEvents.emit("room-changed", now, {});
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}
/** Test seam: forget which room we were in. */
export function resetRoomTravel(): void {
  here = null;
}
