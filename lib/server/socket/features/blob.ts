/**
 * The blob in the volcano's cave.
 *
 * In memory beside the ball, and for its reason: where a blob is hopping is
 * something happening rather than something kept. Everything it does is a
 * leap, so it is published when it sets off and never in between — the arc
 * is the same arithmetic on every screen.
 */

import { CaveBlob } from "../../blob";
import { CHATTY, onPunch } from "../../badge-rules";
import { TICK_MS, type ServerMessage } from "../../../presence-types";
import { CAVE_ROOM_SLUG } from "../../../rooms";
import type { Feature, SocketContext } from "../feature";

export function blobFeature({ state, out, badges }: SocketContext): Feature {
  const blob = new CaveBlob();

  /** The blob's leap, as the wire carries it. */
  const blobMessage = (punched?: { by: string; id: string }): ServerMessage => ({
    type: "blob",
    ...blob.state,
    elapsed: Math.round(blob.state.elapsed),
    ...(punched ? { punched } : {}),
  });

  return {
    name: "blob",
    room: CAVE_ROOM_SLUG,

    onMessage: {
      blob(_message, { id, player }) {
        // Where they stand and which way they face, off the room's own
        // record of them — the message says only that a punch was thrown.
        const leap = blob.punch({ x: player.x, y: player.y, facing: player.facing });
        // A swing at nothing, or at a blob still sailing from the last
        // punch. Nothing happened, so nothing is published.
        if (!leap) return;
        out.broadcast(CAVE_ROOM_SLUG, blobMessage({ by: player.name, id }));
        // A crowd round the blob lands a punch every time it comes down, and
        // the badge is only ever new once.
        const holder = badges.holderOf(id);
        if (holder) {
          badges.announce(
            CAVE_ROOM_SLUG,
            badges.once(holder.person, CHATTY.seeingStars, () => onPunch(holder)),
          );
        }
      },
    },

    /** Hop it on while somebody is in there to see; an empty cave waits. */
    tick() {
      const room = state.rooms.get(CAVE_ROOM_SLUG);
      if (!room || room.sockets.size === 0) return;
      if (blob.step(TICK_MS)) out.broadcast(CAVE_ROOM_SLUG, blobMessage());
    },

    /**
     * The blob, for somebody walking into the cave: it is published when it
     * sets off, so an arrival while it sits would otherwise see an empty cave
     * until its next hop.
     */
    catchUp(slug, _id, socket) {
      if (slug === CAVE_ROOM_SLUG) out.send(socket, blobMessage());
    },
  };
}
