/**
 * The shape every piece of the room socket has, and what it is handed.
 *
 * The socket was one sixteen-hundred-line closure: every feature's state,
 * every message's handling and every timer's work in a single function, with
 * a chain of `if (parsed.type === …)` to find the right part. Each feature
 * is a module of its own now — the ball, the eggs, the road, the blob, the
 * meetings, the board, the relays, the microphone — and says for itself
 * which room it belongs to, which messages it answers, what it does on a
 * tick, what an arrival needs to be told and what a departure leaves behind.
 * The socket builds a context once per message and dispatches on a map.
 */

import type { WebSocket } from "ws";
import type { AccessIdentity } from "../access";
import type { ClientMessage, PresencePlayer } from "../../presence-types";
import type { ConnectionLimiter } from "../rate-limit";
import type { BadgeDesk } from "./badges";
import type { OnlineList } from "./online";
import type { Outbox } from "./outbox";
import type { Room, SocketState } from "./state";

/** What every feature is built with: the socket's state and the ways out of it. */
export interface SocketContext {
  state: SocketState;
  out: Outbox;
  badges: BadgeDesk;
  online: OnlineList;
}

/** Everything about one message's sender, looked up once before it is dispatched. */
export interface MessageContext {
  id: string;
  ws: WebSocket;
  identity: AccessIdentity;
  /** The room they are standing in. */
  slug: string;
  room: Room;
  /** The room's own record of them, taken when the message arrived. */
  player: PresencePlayer;
  limiter: ConnectionLimiter;
}

export type ClientType = Exclude<ClientMessage["type"], "join">;
export type MessageOf<K extends ClientType> = Extract<ClientMessage, { type: K }>;

export type Handlers = {
  [K in ClientType]?: (message: MessageOf<K>, ctx: MessageContext) => void;
};

export interface Feature {
  /** A short name, for the log when one of its handlers throws. */
  readonly name: string;
  /**
   * The one room its messages mean anything in, or null for anywhere. A
   * hand on the ball from a lobby is a browser asking for something that
   * does not exist where it is standing, so the dispatcher never passes it on.
   */
  readonly room: string | null;
  readonly onMessage?: Handlers;
  /** Once a tick, off the socket's one timer. */
  tick?(now: number): void;
  /** What somebody walking into `slug` needs to be told that is not news. */
  catchUp?(slug: string, id: string, socket: WebSocket): void;
  /** Somebody has just walked into `slug`, and the room has been told. */
  onJoin?(slug: string, id: string): void;
  /** A connection left `slug` (or nowhere, if it never joined). */
  onDrop?(id: string, slug: string | null): void;
}
