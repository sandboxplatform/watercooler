/**
 * The meeting under way in each room, by room slug.
 *
 * In memory rather than in the room store, because a meeting is something
 * happening rather than something kept: a server that restarts has ended
 * every meeting it was hosting. Who called it is kept as a name rather than
 * as a connection, because a meeting outlives the person who called it.
 *
 * The notice crosses rooms — the people it is news to are the ones not in
 * the room yet — and stops where the floor's door does: each connection is
 * told only of meetings in rooms it could walk into (`mayEnterRoom`).
 */

import type { WebSocket } from "ws";
import type { AccessIdentity } from "../../access";
import { onMeetingCalled, onMeetingJoined } from "../../badge-rules";
import { describeRoom, hasBoardroom, mayEnterRoom } from "../../../world/floors";
import type { MeetingNotice } from "../../../presence-types";
import { createLogger } from "../../../logger";
import type { Feature, SocketContext } from "../feature";

const log = createLogger("Presence");

export function meetingsFeature({ state, out, badges }: SocketContext): Feature {
  const meetings = new Map<string, { host: string; since: string }>();

  /** The meetings a given identity is allowed to know about. */
  const noticesFor = (identity: AccessIdentity): MeetingNotice[] => {
    const notices: MeetingNotice[] = [];
    for (const [room, meeting] of meetings) {
      if (!mayEnterRoom(room, identity)) continue;
      notices.push({ room, where: describeRoom(room), host: meeting.host, since: meeting.since });
    }
    return notices;
  };

  const tell = (id: string, socket: WebSocket) => {
    out.send(socket, { type: "meetings", meetings: noticesFor(state.identityOf(id)) });
  };

  /** Everyone, wherever they are, each with their own filtered list. */
  const tellEveryone = () => {
    for (const room of state.rooms.values()) {
      for (const [id, socket] of room.sockets) tell(id, socket);
    }
  };

  return {
    name: "meetings",
    room: null,

    onMessage: {
      meeting(message, { id, slug, player }) {
        // A meeting is held at a table, so it can only be called in a room
        // that has one. The panel only opens at the table, but `?meeting=1`
        // opens it anywhere and a panel is decoration either way.
        if (!hasBoardroom(slug)) return;
        const running = meetings.get(slug);
        if (message.on === true) {
          // Already under way: the second person to press E at the table is
          // joining a meeting rather than calling another one.
          if (running) return;
          meetings.set(slug, { host: player.name, since: new Date().toISOString() });
          log.info(`${player.name} called a meeting in "${slug}"`);
          // Whoever called it, and everybody already at the table.
          const host = badges.holderOf(id);
          if (host) {
            const others = badges.holdersIn(slug).filter((h) => h.person !== host.person);
            badges.announce(slug, onMeetingCalled(host, others));
          }
        } else {
          if (!running) return;
          meetings.delete(slug);
          log.info(`the meeting in "${slug}" ended`);
        }
        tellEveryone();
      },
    },

    /** What is being held: a meeting is most useful to somebody not in the room yet. */
    catchUp(_slug, id, socket) {
      tell(id, socket);
    },

    /**
     * A meeting already under way is one they have walked into — unless it
     * is theirs, which it is when they called it, rode away and came back.
     */
    onJoin(slug, id) {
      const running = meetings.get(slug);
      const holder = running ? badges.holderOf(id) : null;
      if (holder && running && running.host !== holder.name) {
        badges.announce(slug, onMeetingJoined(holder));
      }
    },

    /**
     * A meeting in an empty room is over. Whoever called it may leave and it
     * carries on for the people still at the table; when the last of them
     * goes the notice would otherwise hang over a private floor with nobody
     * left who can reach the table to take it down. Humans only, which is
     * what `hub.count` counts: Doc standing about in Support is not somebody
     * still in the meeting.
     */
    onDrop(_id, slug) {
      if (!slug || !meetings.has(slug)) return;
      const hub = state.rooms.get(slug)?.hub;
      if (hub && hub.count > 0) return;
      meetings.delete(slug);
      log.info(`the meeting in "${slug}" ended: the room is empty`);
      tellEveryone();
    },
  };
}
