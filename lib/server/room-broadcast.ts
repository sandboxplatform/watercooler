/**
 * The way anything on the server pushes a message into a room.
 *
 * The socket owns the sockets. Everything else that needs to speak into a
 * room — the resident simulation, for one — cannot import it to do so,
 * because the socket already imports them: `presence-socket` builds the
 * `ResidentSimulation`, so an import back the other way is a cycle.
 *
 * One box, filled when the socket attaches and read through a getter, keeps
 * the arrow pointing one way. It hangs off a global symbol rather than a
 * module-level variable because dev reloads can leave two copies of a
 * module in play, and a broadcaster only the stale copy can see is a
 * broadcaster that silently does nothing.
 *
 * Null before the socket is attached, and in any test that does not attach
 * one — callers check, and skipping the message is the right answer there.
 */

import type { ServerMessage } from "../presence-types";

export type RoomBroadcast = (slug: string, message: ServerMessage) => void;

const KEY = Symbol.for("watercooler.presence.broadcast");

export function setRoomBroadcast(fn: RoomBroadcast | null): void {
  (globalThis as Record<symbol, unknown>)[KEY] = fn;
}

export function currentBroadcast(): RoomBroadcast | null {
  return ((globalThis as Record<symbol, unknown>)[KEY] as RoomBroadcast | null) ?? null;
}
