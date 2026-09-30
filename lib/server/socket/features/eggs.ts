/**
 * The eggs lying in the grass on the world map.
 *
 * Beside the ball, in memory, for the same reason: an egg nobody has picked
 * up yet is something happening rather than something kept, and a server
 * that restarts has tidied the field. A basket is the other half of it and
 * lives in the room store, because that is a person's and outlives any
 * server.
 */

import { getRoomStore } from "../../room-store";
import { Nest } from "../../eggs";
import { onEggFound, onEggLaid } from "../../badge-rules";
import { WORLD_ROOM_SLUG } from "../../../rooms";
import { eggSpot, type EggTier } from "../../../world/eggs";
import { createLogger } from "../../../logger";
import type { Feature, SocketContext } from "../feature";

const log = createLogger("Presence");

export interface EggsFeature extends Feature {
  /** The resident simulation's `laid`: a fright left an egg behind. */
  laid(
    residentId: string,
    room: string,
    at: { x: number; y: number },
    startledBy: string | null,
  ): void;
}

export function eggsFeature({ out, badges }: SocketContext, nest = new Nest()): EggsFeature {
  /**
   * What is lying in the grass, to everybody on the world map. The whole
   * list every time, because it is a handful of eggs changing a few times an
   * hour — see `EggsBroadcast` for why one appearing and another going would
   * be the wrong shape.
   */
  const publish = (news?: {
    taken?: { tier: EggTier; by: string; x: number; y: number };
    /** The id of one Michael has just left, for the burst over it. */
    laid?: string;
  }) => {
    out.broadcast(WORLD_ROOM_SLUG, {
      type: "eggs",
      eggs: nest.lying,
      ...(news?.taken ? { taken: news.taken } : {}),
      ...(news?.laid ? { laid: news.laid } : {}),
    });
  };

  return {
    name: "eggs",
    room: WORLD_ROOM_SLUG,

    onMessage: {
      egg(_message, { id, slug, player }) {
        // Asked before anything is taken rather than after, because a guest
        // has no basket: an egg lifted out of the grass for somebody with
        // nowhere to put it is an egg taken from whoever could have kept it.
        const holder = badges.holderOf(id);
        if (!holder) return;
        // Nothing within reach is the ordinary answer to a stray press of E,
        // and nothing is published, because nothing happened.
        const egg = nest.nearest({ x: player.x, y: player.y });
        if (!egg) return;
        // Into the basket first and out of the grass second. It was the
        // other way round, so a write that failed took the egg out of the
        // park and put it nowhere; now it throws with the egg still lying
        // there for the next press.
        const kept = getRoomStore().collectEgg(holder.person, holder.name, egg.tier, egg.id);
        nest.remove(egg.id);
        if (!kept) {
          // Already in a basket under that id, which the field should never
          // allow. Gone from the grass either way, and nobody's find.
          log.warn(`an egg (${egg.id}) was already collected; tidying it away`);
          publish();
          return;
        }
        const at = new Date().toISOString();
        // Two messages for one event, which is the badges' arrangement: the
        // field is a fact about a room and goes to that room, and a basket is
        // a fact about a person and goes to everybody.
        out.broadcastAll({
          type: "egg-found",
          person: holder.person,
          name: holder.name,
          tier: egg.tier,
          at,
        });
        badges.announce(slug, onEggFound(holder, egg.tier));
        publish({ taken: { tier: egg.tier, by: holder.name, x: egg.x, y: egg.y } });
      },
    },

    /**
     * Eggs nobody came for. Free unless one has actually gone: the field is
     * kept in the order it was laid, so this is one comparison. Not gated on
     * anybody being out there, since spoiling is a clock rather than a sight.
     */
    tick(now) {
      if (nest.spoil(now)) publish();
    },

    /** What is lying in the grass, for somebody walking onto the map. */
    catchUp(slug, _id, socket) {
      if (slug === WORLD_ROOM_SLUG) out.send(socket, { type: "eggs", eggs: nest.lying });
    },

    /**
     * A fright left an egg behind.
     *
     * The simulation has already rolled whether; what kind it is, and what
     * becomes of it, is this side's — the chicken does not choose what he
     * lays, and a tier the browser had a hand in would be a rainbow anybody
     * could claim.
     *
     * The world map only. Nothing draws an egg indoors and nothing should: a
     * wanderer never goes in, so an egg in a lobby would be one nobody could
     * ever see. The day a second layer turns up with a desk, this is the line
     * that has to change.
     */
    laid(_residentId, room, at, startledBy) {
      if (room !== WORLD_ROOM_SLUG) return;
      const egg = nest.lay(eggSpot(at), Math.random(), Date.now());
      // Named on the way out, because the list alone cannot say which of it
      // is new and a browser arriving is sent the same list.
      publish({ laid: egg.id });
      // Whoever walked up to him gets the credit, which is a badge nobody can
      // hand themselves. A guest's fright still lays one — the egg is the
      // park's, for whoever comes along — and earns the guest nothing.
      const holder = startledBy ? badges.holderOf(startledBy) : null;
      if (holder) badges.announce(room, onEggLaid(holder));
    },
  };
}
