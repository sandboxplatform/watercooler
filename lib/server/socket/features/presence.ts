/**
 * Walking about, and stepping out of sight: the two messages that are
 * presence itself rather than something done in a room.
 */

import type { Facing } from "../../../presence-types";
import type { Feature, SocketContext } from "../feature";

const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];

export function coerceFacing(value: unknown): Facing {
  return FACINGS.includes(value as Facing) ? (value as Facing) : "down";
}

export function coerceNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function presenceFeature({ badges }: SocketContext): Feature {
  return {
    name: "presence",
    room: null,

    onMessage: {
      move(message, { id, slug, room }) {
        // Where the hub *put* them, not where the message said. The two
        // differ by exactly the thing that makes a place badge worth
        // anything: `move` clamps a step against the sprint, so a browser
        // claiming to be up in the wood is pulled back to a stride from
        // where it was. See `wentTo`.
        const moved = room.hub.move(id, {
          x: coerceNumber(message.x),
          y: coerceNumber(message.y),
          facing: coerceFacing(message.facing),
          moving: message.moving === true,
        });
        if (moved) badges.wentTo(slug, id, moved);
      },

      /**
       * Into the lift, or back out of it. Part of presence so everyone else
       * stops drawing them, and deliberately not remembered by connection
       * the way the microphone is: a ride to another floor is a fresh join,
       * and `place` clears it for a re-join to this one, so nobody can arrive
       * somewhere invisible.
       */
      boarded(message, { id, room }) {
        room.hub.setHidden(id, message.inside === true);
      },
    },
  };
}
