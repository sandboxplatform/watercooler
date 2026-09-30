/**
 * The socket's side of the badges: whose shelf a connection writes to, the
 * chatty rules settled once a run, and telling the world what was earned.
 *
 * The rules themselves are `../badge-rules` and fire only off things the
 * server saw for itself. What is here is the bookkeeping around them.
 */

import { badgeFor, badgeHolder, isGuestHolder, type EarnedBadge } from "../../badges";
import { WORLD_ROOM_SLUG } from "../../rooms";
import { inTheWood } from "../../world/wood";
import { inTheWilderness } from "../../world/wilderness";
import { OUTDOOR_BADGE, onOutdoors, type ChattyCode, type Holder } from "../badge-rules";
import type { Outbox } from "./outbox";
import type { SocketState } from "./state";

export class BadgeDesk {
  /**
   * The chatty badges already settled this run, as `person:code`.
   *
   * Volley fires on every relayed paddle position and Holding the Fort on
   * every refresh of the online list; `awardBadge` would answer false to all
   * of them, but answering costs a write. Keyed by holder rather than by
   * connection so it survives a reload, and never cleared — it is bounded by
   * the cast times the catalogue.
   */
  private readonly settled = new Set<string>();

  constructor(
    private readonly state: SocketState,
    private readonly out: Outbox,
  ) {}

  /**
   * Run a chatty rule unless it is already settled for this person, and
   * settle it once the rule has run to the end.
   *
   * Settled *after*, not before: it used to be marked the moment it was
   * asked, so a store that threw on the one attempt — a locked file, a full
   * disk — left the badge settled and never tried again for the rest of the
   * run. A rule that throws now leaves it to the next occasion.
   */
  once(person: string, code: ChattyCode, rule: () => EarnedBadge[]): EarnedBadge[] {
    const key = `${person}:${code}`;
    if (this.settled.has(key)) return [];
    const earned = rule();
    this.settled.add(key);
    return earned;
  }

  /**
   * Whose badge shelf and egg basket a connection writes to.
   *
   * The identity from the cookie, which is the person; the name from the
   * room, which is what they are called today. Null before they have joined
   * anywhere, since there is nothing to call them yet — and null for a
   * guest, who keeps nothing (`isGuestHolder`). Every badge rule and the egg
   * in the grass go through here, so that one answer is what turns the lot
   * off for them: no rule fires, nothing is announced, and an egg a guest
   * bends down for stays where it is for somebody who can keep it.
   */
  holderOf(id: string): Holder | null {
    const slug = this.state.roomOf.get(id);
    const player = slug ? this.state.rooms.get(slug)?.hub.get(id) : null;
    if (!player) return null;
    const person = badgeHolder(this.state.identityOf(id), player.name);
    if (isGuestHolder(person)) return null;
    return { person, name: player.name };
  }

  /** Everybody standing in a room, as badge holders. */
  holdersIn(slug: string): Holder[] {
    const room = this.state.rooms.get(slug);
    if (!room) return [];
    const holders: Holder[] = [];
    for (const id of room.sockets.keys()) {
      const holder = this.holderOf(id);
      if (holder) holders.push(holder);
    }
    return holders;
  }

  /**
   * Tell the world about badges just earned.
   *
   * Everyone rather than the room, because a badge is the person's and the
   * panel that lists them lists the world — a list that only updates for
   * whoever happened to be standing there is a list that is wrong everywhere
   * else until a reload. The room travels with the message so the toast can
   * be the narrower thing the broadcast is not.
   */
  announce(slug: string, earned: readonly EarnedBadge[]): void {
    for (const item of earned) {
      this.out.broadcastAll({
        type: "badge",
        code: item.code,
        person: item.person,
        name: item.name,
        room: slug,
        at: item.earnedAt,
      });
      this.celebrate(slug, item);
    }
  }

  /**
   * Put the badge over the earner's head, where they are standing.
   *
   * An ordinary `said`, so the room draws it the way it draws a resident's
   * remark and nothing in the scene has to know a badge from a hello. It is
   * the server's job rather than the scene's because only this side holds
   * both halves of it — the holder, which is a code's identity, and the
   * connection, which is a uuid.
   *
   * Their own browser does not draw it — a room's bubbles are everybody
   * else's — which is right: they have the toast, and the people around
   * them have the moment.
   */
  private celebrate(slug: string, item: EarnedBadge): void {
    const badge = badgeFor(item.code);
    const room = this.state.rooms.get(slug);
    if (!badge || !room) return;
    for (const id of room.sockets.keys()) {
      const player = room.hub.get(id);
      if (!player) continue;
      if (badgeHolder(this.state.identityOf(id), player.name) !== item.person) continue;
      this.out.broadcast(slug, {
        type: "said",
        id: `badge:${item.code}:${item.earnedAt}`,
        from: { id, name: player.name },
        text: `${badge.icon} ${badge.title}`,
        at: item.earnedAt,
      });
      return;
    }
  }

  /**
   * Two corners of the world map that are worth having got to.
   *
   * Off a `move` rather than a join, because neither is a room: the wood and
   * the wilderness are stretches of the one outdoor room, so the only thing
   * that says somebody is standing in either is a position — and the
   * position it is asked of is **the one the hub kept**, not the one the
   * message carried. `move` clamps a step against the sprint, so the
   * difference between the two is exactly a teleport.
   *
   * What that does not close, and neither does anything else here, is a
   * client that lies about where it *arrived*: a join is placed where it
   * says it is, because that is how walking out of a door works. Every
   * positional badge in the catalogue stands on that same footing.
   *
   * Runs on every move of everybody on the map, so it costs two comparisons
   * against a rectangle in the ordinary case, and `once` settles each badge
   * per run before the store is asked.
   */
  wentTo(slug: string, id: string, at: { x: number; y: number }): void {
    if (slug !== WORLD_ROOM_SLUG) return;
    const wood = inTheWood(at);
    const wild = inTheWilderness(at);
    // Both, where both are true: the wood runs along the top of all three
    // stretches, so the north-east corner of the map is up among the trees
    // *and* well past the last of the town.
    if (!wood && !wild) return;
    const holder = this.holderOf(id);
    if (!holder) return;
    if (wood) {
      this.announce(
        slug,
        this.once(holder.person, OUTDOOR_BADGE.wood, () => onOutdoors(holder, "wood")),
      );
    }
    if (wild) {
      this.announce(
        slug,
        this.once(holder.person, OUTDOOR_BADGE.wilderness, () => onOutdoors(holder, "wilderness")),
      );
    }
  }
}
