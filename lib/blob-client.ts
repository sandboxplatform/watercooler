"use client";

/**
 * The blob in the volcano's cave, from the browser's side.
 *
 * Thin on purpose, the way `basketball-client.ts` is. The server decides
 * every leap the blob makes and whether a punch landed; this passes on what
 * it says and asks for the one thing a person can do, which is throw a
 * punch. Where the blob is *between* two messages is the scene's to work
 * out, off the leap and the clock — see `lib/world/blob.ts`.
 */

import { onRoomMessage, sendRoom } from "./room-socket";
import type { BlobBroadcast } from "./presence-types";

export type BlobNews = BlobBroadcast;

/**
 * The last leap the server announced, and when it arrived here.
 *
 * Kept module-side for the basketball's reason: the scene is built a moment
 * after walking into the cave, and the message saying where the blob is may
 * have landed first. Without this the cave would be empty until its next
 * hop. The arrival time is what lets a late listener work out how much
 * further into the leap it has got since.
 */
let latest: { news: BlobNews; at: number } | null = null;

type Listener = (news: BlobNews, receivedAt: number) => void;
const listeners = new Set<Listener>();
let listening = false;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type !== "blob") return;
    latest = { news: message, at: now() };
    for (const listener of listeners) listener(message, latest.at);
  });
}

/**
 * Follow the blob. The last leap heard of, if there is one, arrives at once —
 * without its `punched`, which was a moment and is over.
 */
export function onBlob(listener: Listener): () => void {
  listen();
  listeners.add(listener);
  if (latest) listener({ ...latest.news, punched: undefined }, latest.at);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Throw a punch. Where from, which way and whether it lands are all the
 * server's: this says only that the button was pressed.
 */
export function punchBlob(): void {
  sendRoom({ type: "blob", action: "punch" });
}

/** The clock the arrival times are on, for working out how far into a leap it is. */
export function blobClock(): number {
  return now();
}

/** Test seam: forget the last leap between cases. */
export function resetBlob(): void {
  latest = null;
  listeners.clear();
}
