/**
 * The two post boxes: ping pong moves, and the voice handshake.
 *
 * The server checks the envelope, finds the one person it is addressed to,
 * and passes it on — rebuilt from the fields its kind is known to carry
 * (`../../relays`) rather than forwarded as it arrived, and through the
 * outbox, so a relay minds the far end's queue like everything else.
 */

import { CHATTY, onPingPong } from "../../badge-rules";
import { relayablePong, relayableVoice } from "../../relays";
import { isVoiceSignal } from "../../../presence-types";
import type { Feature, SocketContext } from "../feature";
import type { MicFeature } from "./mic";

/** A connection id is a uuid; anything much longer is not one of ours. */
const MAX_ADDRESS_LENGTH = 64;

const addressOf = (value: unknown): string =>
  typeof value === "string" && value.length <= MAX_ADDRESS_LENGTH ? value : "";

export function relaysFeature({ state, out, badges }: SocketContext, mic: MicFeature): Feature {
  return {
    name: "relays",
    room: null,

    onMessage: {
      /**
       * A ping pong move, to the other player in this room. What the two of
       * them do with it is between them.
       */
      pong(message, { id, slug, room, player }) {
        const to = addressOf(message.to);
        if (!to || state.roomOf.get(to) !== slug) return;
        const target = room.sockets.get(to);
        const payload = relayablePong(message.payload);
        if (!target || !payload) return;
        out.send(target, { type: "pong", from: { id, name: player.name }, payload });
        // Both ends of the table, settled once each: this fires on every
        // paddle position of a rally.
        for (const holder of [badges.holderOf(id), badges.holderOf(to)]) {
          if (!holder) continue;
          badges.announce(
            slug,
            badges.once(holder.person, CHATTY.volley, () => onPingPong([holder])),
          );
        }
      },

      /**
       * A voice handshake step, to one person anywhere on the server —
       * because voice is one conversation for the whole server rather than
       * one per room. It used to be delivered only within the sender's room,
       * which made it a room's conversation: two people a floor apart would
       * say hello and neither would hear an answer.
       */
      voice(message, { id, player }) {
        const to = addressOf(message.to);
        if (!to || to === id || !isVoiceSignal(message.signal)) return;
        const signal = relayableVoice(message.signal);
        if (!signal) return;
        // Both halves of the greeting say the same thing about the sender: a
        // microphone is on over there. Counting only the "hello" left whoever
        // answered one reading as off until their own tick.
        if (signal.kind === "hello" || signal.kind === "hi") mic.set(id, true);
        if (signal.kind === "bye") mic.set(id, false);
        const target = state.socketFor(to);
        if (!target) return;
        out.send(target, { type: "voice", from: { id, name: player.name }, signal });
      },
    },
  };
}
