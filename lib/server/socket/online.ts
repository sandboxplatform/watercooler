/**
 * Everyone on the server, with where they are — the People panel's list,
 * and the list the voice chat reads to decide who is still in Global Chat.
 *
 * **It goes out at most once a tick.** Anything that changes it — a join, a
 * drop, a microphone — says so with `changed()`, and the socket's ticker
 * publishes whatever is true by then. That is what closes the gap a door
 * used to open: a drop and a join published separately put, in between, a
 * world with the mover missing from it, and every other browser's voice
 * chat tore the audio down on it. A room change, a same-tab reload and a
 * ghost being superseded are all one synchronous stretch of work, so by the
 * time the list is read they have arrived as well as left.
 */

import type { WebSocket } from "ws";
import { badgeHolder, isGuestHolder } from "../../badges";
import type { OnlineMessage } from "../../presence-types";
import { CHATTY, onAlone } from "../badge-rules";
import type { BadgeDesk } from "./badges";
import type { Outbox } from "./outbox";
import type { SocketState } from "./state";

/** How often everyone gets the whole server's list even when nothing changed. */
export const ONLINE_REFRESH_MS = 10_000;

export class OnlineList {
  private due = false;

  constructor(
    private readonly state: SocketState,
    private readonly out: Outbox,
    private readonly badges: BadgeDesk,
  ) {}

  /**
   * The list as it stands.
   *
   * The residents come back in a list of their own rather than mixed in or
   * left out. Out of the count, because the count is a count of people; in
   * the message, because the panel lists the cast whether or not they are
   * online and "Doc is in Support right now" is the one thing about him a
   * browser cannot work out for itself.
   *
   * Read off the hubs as kept (`forEach`) rather than off a snapshot of
   * each, which built a fresh copy of everybody on the server to read four
   * fields off them.
   */
  list(): Pick<OnlineMessage, "people" | "locals"> {
    const people: OnlineMessage["people"] = [];
    const locals: OnlineMessage["locals"] = [];
    for (const [slug, room] of this.state.rooms) {
      room.hub.forEach((player) => {
        const entry = {
          id: player.id,
          name: player.name,
          spriteKey: player.spriteKey,
          room: slug,
          ...(player.mic ? { mic: true } : {}),
        };
        if (player.resident) {
          // `resident:<id>` on the wire; the cast is keyed by the id alone.
          locals.push({ ...entry, person: player.id.replace(/^resident:/, "") });
          return;
        }
        people.push({
          ...entry,
          person: badgeHolder(this.state.identityOf(player.id), player.name),
        });
      });
    }
    return { people, locals };
  }

  /** Something on the list changed; it goes out at the end of this tick. */
  changed(): void {
    this.due = true;
  }

  /** The list to one connection now, for somebody who has just walked in. */
  tell(socket: WebSocket): void {
    this.out.send(socket, { type: "online", ...this.list() });
  }

  /** Publish it, if anything changed since the last time. Once a tick. */
  flush(): void {
    if (!this.due) return;
    this.due = false;
    const { people, locals } = this.list();
    this.out.broadcastAll({ type: "online", people, locals });
    // The one moment Holding the Fort can become true, and the only list
    // that knows: one person in every room the server has open. Read off
    // the list rather than through `holderOf`, so a guest alone in the
    // world is turned away here in so many words.
    if (people.length === 1 && !isGuestHolder(people[0].person)) {
      const alone = people[0];
      const holder = { person: alone.person, name: alone.name };
      this.badges.announce(
        alone.room,
        this.badges.once(alone.person, CHATTY.holdingTheFort, () => onAlone(holder)),
      );
    }
  }
}
