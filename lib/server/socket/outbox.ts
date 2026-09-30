/**
 * Every way out of the room socket: to one connection, to a room, to the
 * whole server.
 *
 * Two things are decided here and nowhere else.
 *
 * **A message is serialised once, however many it goes to.** A presence
 * snapshot went through `JSON.stringify` once per person in the room, twenty
 * times a second; a badge once per connection on the server. The same string
 * goes to every socket now.
 *
 * **A connection that is not reading is not written to for ever.** `ws`
 * queues what cannot be sent yet, so a browser on a stalled network — or one
 * that has stopped reading on purpose — grew a buffer on the server with no
 * ceiling. Frames that are superseded a tick later (a snapshot, a ball in
 * flight) are skipped while the queue is past `LOSSY_BUFFER_BYTES`, and a
 * queue past `DEAD_BUFFER_BYTES` is a connection that has gone: it is
 * terminated, and its close takes it out of its room.
 */

import { WebSocket } from "ws";
import type { ServerMessage } from "../../presence-types";
import { createLogger } from "../../logger";
import type { SocketState } from "./state";

const log = createLogger("Presence");

/** Past this much queued, frames a later one will supersede are skipped. */
export const LOSSY_BUFFER_BYTES = 256 * 1024;

/** Past this much queued, the far end is not reading and the connection is ended. */
export const DEAD_BUFFER_BYTES = 2 * 1024 * 1024;

export interface BroadcastOptions {
  /** Everyone but this connection — the author of a change they already drew. */
  except?: string;
  /** A frame the next tick supersedes, which a backed-up connection can do without. */
  lossy?: boolean;
}

export class Outbox {
  constructor(private readonly state: SocketState) {}

  /** One serialised frame to one socket, minding its queue. */
  deliver(socket: WebSocket, data: string, lossy = false): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const queued = socket.bufferedAmount;
    if (queued > DEAD_BUFFER_BYTES) {
      log.warn(`a connection has ${queued} bytes it is not reading; ending it`);
      socket.terminate();
      return;
    }
    if (lossy && queued > LOSSY_BUFFER_BYTES) return;
    try {
      socket.send(data);
    } catch (err) {
      log.warn("send failed:", (err as Error).message);
    }
  }

  send(socket: WebSocket, message: ServerMessage): void {
    this.deliver(socket, JSON.stringify(message));
  }

  /** Everybody standing in one room. */
  broadcast(slug: string, message: ServerMessage, options: BroadcastOptions = {}): void {
    const room = this.state.rooms.get(slug);
    if (!room || room.sockets.size === 0) return;
    const data = JSON.stringify(message);
    for (const [id, socket] of room.sockets) {
      if (id === options.except) continue;
      this.deliver(socket, data, options.lossy);
    }
  }

  /** Everybody in every room: a badge, a basket, the one whiteboard. */
  broadcastAll(message: ServerMessage, except?: string): void {
    const data = JSON.stringify(message);
    for (const room of this.state.rooms.values()) {
      for (const [id, socket] of room.sockets) {
        if (id !== except) this.deliver(socket, data);
      }
    }
  }
}
