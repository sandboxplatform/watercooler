"use client";

/**
 * Keeps this client's world in step with everyone else's.
 *
 * Outbound: the store persists on every reducer change, so rather than
 * intercepting each action this diffs collections by object identity — the
 * reducer only builds a new object for something that actually changed, which
 * makes reference equality a reliable "is this new?" test.
 *
 * Inbound: changes from other players are applied with the exact object we
 * received, which lands in state by reference and is therefore recognised as
 * already-known on the next diff. That is what stops a change echoing around
 * the room forever.
 */

import type { PersistedSeatConfig } from "./persistence";
import type { WorldChange } from "./presence-types";
import { sendRoom } from "./room-socket";

/** Objects this client has already sent or received, by entity id. */
const known = new Map<string, unknown>();

function seen(id: string, value: unknown): boolean {
  if (known.get(id) === value) return true;
  known.set(id, value);
  return false;
}

/** Record an object that arrived from the room, so we do not send it back. */
export function markKnown(id: string, value: unknown) {
  known.set(id, value);
}

function send(change: WorldChange) {
  sendRoom({ type: "world", change });
}

export function syncSeats(seats: PersistedSeatConfig[]) {
  for (const seat of seats) {
    if (seen(`seat:${seat.seatId}`, seat)) continue;
    send({ entity: "seat", seat: seat as unknown as Record<string, unknown> });
  }
}

/**
 * Seed the ledger from the opening snapshot. Without this, the first diff
 * after load would treat the entire restored world as new and broadcast it.
 */
export function primeFromSnapshot(snapshot: { seats: PersistedSeatConfig[] }) {
  for (const seat of snapshot.seats) known.set(`seat:${seat.seatId}`, seat);
}

/** Test seam. */
export function resetRoomSync() {
  known.clear();
}
