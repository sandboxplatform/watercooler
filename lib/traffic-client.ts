"use client";

import { onRoomMessage } from "./room-socket";
import type { Car } from "./world/traffic";

/**
 * The traffic on the highway, from the browser's side.
 *
 * Thin, like the field of eggs and for the same reason: the server decides
 * which cars are on the road, and this passes on what comes back. What it
 * does *not* do is move them — that is the scene's, once a frame, off the
 * shared `drive` — because the server only speaks when the road changes.
 *
 * Kept module-side rather than handed only to whoever was listening when the
 * message came, exactly as the ball and the field are: the scene is built
 * after the message that told it. Walking out of a building onto the map
 * takes a moment, and the road may have said nothing for half a minute.
 */

let road: Car[] = [];
const watchers = new Set<(cars: readonly Car[]) => void>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type !== "traffic") return;
    road = message.cars;
    for (const watcher of watchers) watcher(road);
  });
}

/** Follow the road. What is on it now, if anything, arrives at once. */
export function onTraffic(listener: (cars: readonly Car[]) => void): () => void {
  listen();
  watchers.add(listener);
  listener(road);
  return () => {
    watchers.delete(listener);
  };
}
