/**
 * When a badge is earned.
 *
 * Every rule here fires off something the **server** saw for itself: a room
 * joined, a microphone switched on, a stroke drawn, a score recorded, a
 * resident standing next to somebody. Nothing is granted on a browser's
 * word, because a browser can say anything it likes — which is the same
 * reason a look is clamped on the socket rather than in the picker.
 *
 * Each function hands back the badges that were *new*, so a caller can
 * treat a non-empty answer as "announce this" without keeping any state of
 * its own. Everything below that costs more than a single statement goes
 * through `mark`: the set of distinct things somebody has done, which is
 * how a badge can want every organisation or every machine without the
 * store keeping a history nobody reads.
 *
 * Cheap on purpose. `onArrival` runs on every join, which is every door in
 * the world, and `onMingle` runs whenever somebody first stands next to a
 * resident.
 */

import { getRoomStore } from "./room-store";
import { badgeFor, type EarnedBadge } from "../badges";
import { RESIDENT_COUNT } from "../world/cast";
import { ORGANISATIONS, TENANTS, type Tenant } from "../world/tenants";
import { tenantInRoom } from "../world/floors";
import { parseFloorRoomSlug } from "../rooms";
import { isArcadeGameId } from "../arcade/types";
import { createLogger } from "../logger";

const log = createLogger("Badges");

/** Who a badge is being hung on: the holder id, and what they are called. */
export interface Holder {
  person: string;
  name: string;
}

/** The three kinds of premises that are not an office, for Back of House. */
const BACK_OF_HOUSE = ["store", "warehouse", "garage"] as const;

/**
 * Every machine in the world that keeps a score, by the game it runs.
 *
 * Read off the tenant list rather than off the arcade's catalogue, and the
 * difference is the whole point: three of the five arcade games stand in no
 * building at all, so a badge for "every arcade game" would be one nobody
 * could ever finish. What a person can actually walk up to is what a lobby
 * declares — and ping pong is left out because it keeps no score and takes
 * two people, which is its own badge.
 */
export const SCORED_MACHINES: readonly string[] = [
  ...new Set(
    TENANTS.flatMap((t) =>
      t.game && (t.game === "pinball" || isArcadeGameId(t.game)) ? [t.game as string] : [],
    ),
  ),
];

/** The hours that count as the small hours, on the server's own clock. */
const SMALL_HOURS = 5;

/** How many people on mic at once makes it a round table rather than a call. */
const ROUND_TABLE = 4;

function grant(holder: Holder, code: string, into: EarnedBadge[]): void {
  const badge = badgeFor(code);
  if (!badge) return;
  if (!getRoomStore().awardBadge(holder.person, code, holder.name)) return;
  log.info(`${holder.name} earned "${badge.title}"`);
  into.push({
    person: holder.person,
    name: holder.name,
    code,
    earnedAt: new Date().toISOString(),
  });
}

/** Note one distinct thing done, and say whether it had not been done before. */
function mark(holder: Holder, what: string): boolean {
  return getRoomStore().mark(holder.person, what);
}

function backOfHouseKind(tenant: Tenant | null): string | null {
  const kind = tenant?.kind;
  return kind && (BACK_OF_HOUSE as readonly string[]).includes(kind) ? kind : null;
}

/**
 * Somebody walked into a room.
 *
 * The one rule that runs on every door, so it is written to do as little as
 * possible until something is actually new: the marks are `INSERT OR
 * IGNORE`, and the two counting badges are only re-checked on a mark that
 * had not been set before.
 *
 * `at` is taken rather than read, so the Night Shift boundary can be tested
 * without waiting until half past two in the morning.
 */
export function onArrival(holder: Holder, room: string, at: Date = new Date()): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "walked-in", earned);
  if (at.getHours() < SMALL_HOURS) grant(holder, "night-shift", earned);

  // A floor is a lift ride: nothing else reaches one, and the lift is the
  // only way up even for whoever's building it is.
  const floor = parseFloorRoomSlug(room);
  if (floor) {
    grant(holder, "going-up", earned);
    if (floor.level === 3) grant(holder, "third-floor", earned);
  }

  // A campus is an organisation's yard, and the island is one of them —
  // reached by the ferry and by nothing else, which is what makes standing
  // on it proof of the crossing.
  const campus = room.startsWith("campus-") ? room.slice("campus-".length) : null;
  if (campus === "apeiron-media") grant(holder, "sea-legs", earned);

  const tenant = tenantInRoom(room);
  const org =
    tenant?.org ?? (campus && ORGANISATIONS.some((o) => o.slug === campus) ? campus : null);
  if (org && mark(holder, `org:${org}`)) {
    if (getRoomStore().countMarks(holder.person, "org:") >= ORGANISATIONS.length) {
      grant(holder, "grand-tour", earned);
    }
  }

  const kind = backOfHouseKind(tenant);
  if (kind && mark(holder, `kind:${kind}`)) {
    if (getRoomStore().countMarks(holder.person, "kind:") >= BACK_OF_HOUSE.length) {
      grant(holder, "back-of-house", earned);
    }
  }

  return earned;
}

/**
 * Nobody else is in the world.
 *
 * Asked whenever the online list changes, which is the only moment it can
 * become true — and it is true of exactly one person, so there is nothing
 * to loop over.
 */
export function onAlone(holder: Holder): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "holding-the-fort", earned);
  return earned;
}

/** The room hit its limit: everybody standing in it shares the moment. */
export function onRoomFull(holders: readonly Holder[]): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const holder of holders) grant(holder, "full-house", earned);
  return earned;
}

/**
 * A microphone went on.
 *
 * `onMic` is everybody in Global Chat *after* the change, the newcomer
 * included — the count is what decides Round Table, and it is awarded to
 * all of them rather than to whoever happened to arrive last. Being in a
 * conversation with three others is the same fact for each of the four.
 */
export function onMicOn(who: Holder, onMic: readonly Holder[]): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(who, "on-mic", earned);
  if (onMic.length >= ROUND_TABLE) {
    for (const holder of onMic) grant(holder, "round-table", earned);
  }
  return earned;
}

/** Somebody called a meeting; everyone else at the table sat in on it. */
export function onMeetingCalled(host: Holder, others: readonly Holder[]): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(host, "called-to-order", earned);
  for (const holder of others) grant(holder, "took-a-seat", earned);
  return earned;
}

/** Somebody walked into a room where a meeting was already under way. */
export function onMeetingJoined(holder: Holder): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "took-a-seat", earned);
  return earned;
}

/** A finished stroke on a room's whiteboard. */
export function onWhiteboard(holder: Holder): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "left-a-mark", earned);
  return earned;
}

/** A ping pong move crossed between two people; both of them are playing. */
export function onPingPong(holders: readonly Holder[]): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const holder of holders) grant(holder, "volley", earned);
  return earned;
}

/**
 * A throw went through a hoop on the court in the park.
 *
 * The server watched it happen: it holds the ball, it ran the flight, and
 * it is the one that saw the ball cross the rim on the way down. There is
 * deliberately no count kept — one basket is the badge, and a hundred is
 * the same badge, which is the catalogue's own rule.
 */
export function onBasket(holder: Holder): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "swish", earned);
  return earned;
}

/**
 * A score went on a machine's board.
 *
 * `machine` is the game, which is also the building — no two lobbies hold
 * the same one. `first` says whether it went in at the top, which the
 * caller already knows: the store hands the table back from the write.
 */
export function onScore(holder: Holder, machine: string, first: boolean): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  grant(holder, "insert-coin", earned);
  if (first) grant(holder, "top-of-the-board", earned);
  if (mark(holder, `machine:${machine}`)) {
    if (getRoomStore().countMarks(holder.person, "machine:") >= SCORED_MACHINES.length) {
      grant(holder, "played-the-lot", earned);
    }
  }
  return earned;
}

/**
 * Somebody is standing next to a resident.
 *
 * Reported on the edge — when they were not there a moment ago — because
 * the simulation asks this of every room on every tick, and a badge is not
 * worth a write twenty times a second per person leaning on a counter.
 */
export function onMingle(holder: Holder, residentId: string): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  if (!mark(holder, `met:${residentId}`)) return earned;
  if (residentId === "michael") grant(holder, "cluck", earned);
  if (residentId === "doc") grant(holder, "ticket-raised", earned);
  if (getRoomStore().countMarks(holder.person, "met:") >= RESIDENT_COUNT) {
    grant(holder, "knows-everybody", earned);
  }
  return earned;
}
