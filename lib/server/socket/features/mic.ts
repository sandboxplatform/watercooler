/**
 * Whose microphone is on — which is who is in Global Chat.
 *
 * Two messages switch one: `mic`, which the pill sends, and the voice
 * handshake's `hello`, `hi` and `bye`, which say the same thing about the
 * sender. They used to do different amounts of it: `mic` told the world and
 * ran the badges, while a greeting only flipped the flag, so whether the
 * online list heard about somebody joining the chat depended on which of the
 * two arrived first. Both come through `set` now, and only a change is news.
 */

import { CHATTY, ROUND_TABLE, onMicOn, onRoundTable, type Holder } from "../../badge-rules";
import type { Feature, SocketContext } from "../feature";

export interface MicFeature extends Feature {
  /** A microphone went on or off, by whichever message said so. */
  set(id: string, on: boolean): void;
}

export function micFeature({ state, badges, online }: SocketContext): MicFeature {
  /**
   * Everybody in Global Chat, wherever they are standing, with the room each
   * is in. The whole server, because Global Chat is one conversation for the
   * whole server.
   */
  const onMicNow = (): { holder: Holder; room: string }[] => {
    const seats: { holder: Holder; room: string }[] = [];
    for (const [room, { sockets }] of state.rooms) {
      for (const id of sockets.keys()) {
        if (!state.micOf.get(id)) continue;
        const holder = badges.holderOf(id);
        if (holder) seats.push({ holder, room });
      }
    }
    return seats;
  };

  /**
   * Switching a microphone on *is* joining Global Chat. On Mic is theirs,
   * once; Round Table is asked of everybody in the chat on every microphone
   * that goes on, because the fourth person arriving is news for all four —
   * it used to be asked only inside the first person's On Mic, so it could
   * never be earned by anybody who had been on mic before.
   */
  const wentOn = (id: string, slug: string) => {
    const holder = badges.holderOf(id);
    if (holder) {
      badges.announce(
        slug,
        badges.once(holder.person, CHATTY.onMic, () => onMicOn(holder)),
      );
    }
    const table = onMicNow();
    if (table.length < ROUND_TABLE) return;
    for (const seat of table) {
      badges.announce(
        seat.room,
        badges.once(seat.holder.person, CHATTY.roundTable, () =>
          onRoundTable(seat.holder, table.length),
        ),
      );
    }
  };

  const set = (id: string, on: boolean) => {
    state.micOf.set(id, on);
    const slug = state.roomOf.get(id);
    const room = slug ? state.rooms.get(slug) : undefined;
    // Part of presence, so the room can count it and a late arrival sees it
    // without a handshake. Only a change goes any further: a `hello` goes to
    // every peer, and each one after the first says nothing new.
    if (!slug || !room?.hub.setMic(id, on)) return;
    online.changed();
    if (on) wentOn(id, slug);
  };

  return {
    name: "mic",
    room: null,
    set,
    onMessage: {
      mic(message, { id }) {
        set(id, message.on === true);
      },
    },
  };
}
