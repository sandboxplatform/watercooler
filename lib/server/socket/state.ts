/**
 * Who is connected, which room each is standing in, and what the door let
 * them in as — the state every part of the room socket reads.
 *
 * Rooms are separate worlds: presence is keyed by room and never crosses
 * between them. What does cross is kept here by connection rather than by
 * room — the microphone, the identity, the tab — because a connection walks
 * from one room to the next and those things walk with it.
 */

import type { WebSocket } from "ws";
import { PresenceHub } from "../presence-hub";
import type { AccessIdentity } from "../access";
import { describeRoom } from "../../world/places";
import { OPEN_AIR_CAPACITY } from "../../presence-types";
import { createLogger } from "../../logger";

const log = createLogger("Presence");

export interface Room {
  hub: PresenceHub;
  sockets: Map<string, WebSocket>;
  /** When the room was last sent a snapshot, for the keepalive under the dirty flag. */
  presenceAt: number;
}

/**
 * The world map, a campus yard, the volcano and its cave: the places with no
 * room's six on them. See `OPEN_AIR_CAPACITY` for why. Only a campus that is
 * one — `describeRoom` names a campus only when the organisation exists — so
 * typing `/r/campus-anything` makes an ordinary room.
 */
export function isOpenAir(slug: string): boolean {
  const kind = describeRoom(slug).kind;
  return kind === "world" || kind === "campus" || kind === "volcano";
}

export class SocketState {
  readonly rooms = new Map<string, Room>();
  /** Which room each connection is in, so later messages can be routed. */
  readonly roomOf = new Map<string, string>();
  /** Whose microphone is on, by connection: it stays on through a door. */
  readonly micOf = new Map<string, boolean>();
  /**
   * What the door let each connection in as, taken from its cookie.
   *
   * Kept per connection so a join can look for the same person already in
   * the world, which the connection itself cannot be asked about.
   */
  readonly identityByConnection = new Map<string, AccessIdentity>();
  /**
   * Which browser tab each connection came from, when it says.
   *
   * The one thing that tells a person coming back from a second person
   * arriving. See `session` on `JoinMessage`: the ping that decides a
   * contested claim cannot do it, because a pong comes from the browser's
   * network stack and a page being torn down answers one just as a live
   * page does — which is how a reload came to be refused as a ghost of
   * itself.
   */
  readonly sessionByConnection = new Map<string, string>();
  /**
   * Every connection that has upgraded, whether or not it has said where it
   * is standing. The heartbeat walks this rather than the rooms, or a socket
   * that never joined — or was taken out of its room — is swept by nothing.
   */
  readonly connections = new Map<string, WebSocket>();

  /** A room's hub and sockets, opening the room if it is not. */
  roomFor(slug: string): Room {
    let room = this.rooms.get(slug);
    if (!room) {
      const capacity = isOpenAir(slug) ? OPEN_AIR_CAPACITY : undefined;
      room = { hub: new PresenceHub({ capacity }), sockets: new Map(), presenceAt: 0 };
      this.rooms.set(slug, room);
      log.info(`opened room "${slug}"`);
    }
    return room;
  }

  /**
   * Forget a room with nobody in it — nobody at all, residents included.
   *
   * It used to ask about humans alone, so a room with Doc standing in it was
   * forgotten the moment its last person left and opened again on his next
   * step, a fresh hub and an "opened room" in the log for every such exit.
   */
  forgetIfEmpty(slug: string): void {
    const room = this.rooms.get(slug);
    if (room && room.sockets.size === 0 && room.hub.size === 0) this.rooms.delete(slug);
  }

  /**
   * One person's socket, wherever on the server they are.
   *
   * A connection is indexed by the room it is in, so reaching somebody
   * means finding their room first. Voice needs this: everything else is
   * addressed to a room, and this one thing is addressed to a person.
   */
  socketFor(id: string): WebSocket | undefined {
    const slug = this.roomOf.get(id);
    return slug ? this.rooms.get(slug)?.sockets.get(id) : undefined;
  }

  identityOf(id: string): AccessIdentity {
    return this.identityByConnection.get(id) ?? "visitor";
  }
}
