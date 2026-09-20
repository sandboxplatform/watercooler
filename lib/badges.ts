/**
 * The badge catalogue.
 *
 * Shared by client and server, so it must stay free of imports.
 *
 * Three rules run through it, and the last two are the ones the old
 * catalogue got wrong.
 *
 * **A badge is a place you went or a thing you did**, never a tally. There
 * is nothing here you get for the hundredth of anything: each keys on a
 * moment, or on a *set* of distinct moments — every organisation, every
 * cabinet, every resident — which is a map of the world rather than a
 * grind through it.
 *
 * **A badge belongs to the person, not to the room.** The old ones were
 * filed under a room slug, so walking one floor up meant earning Walked In
 * again in the new place and the wall read "7 of 4 earned in this room".
 * They hang on a profile now, and a profile is one person wherever they
 * are standing.
 *
 * **Nothing here is granted on a browser's word.** Every rule in
 * lib/server/badge-rules.ts fires off something the server saw for itself:
 * a room joined, a microphone switched on, a score recorded, a stroke
 * drawn, a resident standing next to somebody. Walking up to a board and
 * pressing E is a fine thing to do in this world and it is *not* in here,
 * because the only way to know about it would be to let the page say so —
 * and a badge a client can claim is a badge worth nothing.
 */

export type BadgeGroup = "about" | "playing" | "together" | "locals" | "eggs" | "curios";

export interface BadgeGroupInfo {
  id: BadgeGroup;
  title: string;
}

/** In the order they are shown, which is roughly the order they are found. */
export const BADGE_GROUPS: readonly BadgeGroupInfo[] = [
  { id: "about", title: "Getting about" },
  { id: "playing", title: "Playing" },
  { id: "together", title: "Together" },
  { id: "locals", title: "The locals" },
  // After the locals, because every one of these starts with startling
  // Michael, and before the curios, which is where the odds and ends go.
  { id: "eggs", title: "Eggs" },
  { id: "curios", title: "Curios" },
];

export interface Badge {
  code: string;
  group: BadgeGroup;
  title: string;
  /**
   * What they did, in the past tense.
   *
   * One line rather than two, and written so it reads both ways: beside an
   * earned badge it says what happened, and in the list of what is still
   * out there it says what to go and do.
   */
  description: string;
  icon: string;
}

export const BADGES: readonly Badge[] = [
  // ── Getting about ───────────────────────────────────────
  {
    code: "walked-in",
    group: "about",
    title: "Walked In",
    description: "Turned up in the world for the first time",
    icon: "🚪",
  },
  {
    code: "going-up",
    group: "about",
    title: "Going Up",
    description: "Rode a lift to a floor above a lobby",
    icon: "🛗",
  },
  {
    code: "third-floor",
    group: "about",
    title: "Third Floor",
    description: "Got as far as somebody's Operations floor",
    icon: "📋",
  },
  {
    code: "sea-legs",
    group: "about",
    title: "Sea Legs",
    description: "Took the ferry across to the island",
    icon: "⛴️",
  },
  {
    code: "back-of-house",
    group: "about",
    title: "Back of House",
    description: "Been in a store, a warehouse and a garage",
    icon: "📦",
  },
  {
    code: "grand-tour",
    group: "about",
    title: "Grand Tour",
    description: "Called in on every organisation in the world",
    icon: "🗺️",
  },

  // ── Playing ─────────────────────────────────────────────
  {
    code: "insert-coin",
    group: "playing",
    title: "Insert Coin",
    description: "Put a score on a machine in somebody's lobby",
    icon: "🕹️",
  },
  {
    code: "played-the-lot",
    group: "playing",
    title: "Played the Lot",
    description: "Put a score on every machine in the world",
    icon: "🎮",
  },
  {
    code: "top-of-the-board",
    group: "playing",
    title: "Top of the Board",
    description: "Took first place on a high score table",
    icon: "👑",
  },
  {
    code: "volley",
    group: "playing",
    title: "Volley",
    description: "Played a game of ping pong against somebody",
    icon: "🏓",
  },
  {
    code: "swish",
    group: "playing",
    title: "Swish",
    description: "Sank a basket on the court in the park",
    icon: "🏀",
  },

  // ── Together ────────────────────────────────────────────
  {
    code: "on-mic",
    group: "together",
    title: "On Mic",
    description: "Switched a microphone on and joined Global Chat",
    icon: "🎙️",
  },
  {
    code: "round-table",
    group: "together",
    title: "Round Table",
    description: "Was in Global Chat with three other people at once",
    icon: "🗣️",
  },
  {
    code: "full-house",
    group: "together",
    title: "Full House",
    description: "Was in a room when it filled up",
    icon: "🏠",
  },
  {
    code: "called-to-order",
    group: "together",
    title: "Called to Order",
    description: "Called a meeting at a boardroom table",
    icon: "📣",
  },
  {
    code: "took-a-seat",
    group: "together",
    title: "Took a Seat",
    description: "Sat in on a meeting somebody else had called",
    icon: "💺",
  },

  // ── The locals ──────────────────────────────────────────
  {
    code: "cluck",
    group: "locals",
    title: "Cluck",
    description: "Stood close enough to Michael to startle him",
    icon: "🐔",
  },
  {
    code: "ticket-raised",
    group: "locals",
    title: "Ticket Raised",
    description: "Caught up with Doc, at his desk or out on his break",
    icon: "🎧",
  },
  {
    code: "knows-everybody",
    group: "locals",
    title: "Knows Everybody",
    description: "Stood beside every resident in the world",
    icon: "🤝",
  },

  // ── Eggs ────────────────────────────────────────────────
  //
  // Four, and not one of them a count of eggs. The Whole Clutch is the
  // catalogue's usual answer to wanting more than one of something: a set
  // of distinct things, one of every kind there is, with the target read
  // off the ladder rather than written down here.
  {
    code: "finders-keepers",
    group: "eggs",
    title: "Finders Keepers",
    description: "Picked up an egg Michael left in the grass",
    icon: "🥚",
  },
  {
    code: "ruffled-feathers",
    group: "eggs",
    title: "Ruffled Feathers",
    description: "Startled Michael badly enough that he laid one",
    // A feather would be the obvious one and it is not drawn on every
    // machine — it measures as tofu here, which is a badge that reads as
    // a blank box. The bolt away is the other half of the moment anyway.
    icon: "💨",
  },
  {
    code: "over-the-rainbow",
    group: "eggs",
    title: "Over the Rainbow",
    description: "Found the rainbow egg, which nobody can account for",
    icon: "🌈",
  },
  {
    code: "whole-clutch",
    group: "eggs",
    title: "The Whole Clutch",
    description: "Found an egg of every kind there is to find",
    icon: "🧺",
  },

  // ── Curios ──────────────────────────────────────────────
  {
    code: "left-a-mark",
    group: "curios",
    title: "Left a Mark",
    description: "Drew on a whiteboard",
    icon: "🖊️",
  },
  {
    code: "night-shift",
    group: "curios",
    title: "Night Shift",
    description: "Was in the world in the small hours",
    icon: "🌙",
  },
  {
    code: "holding-the-fort",
    group: "curios",
    title: "Holding the Fort",
    description: "Was the only person in the whole world",
    icon: "🕯️",
  },
];

const BY_CODE = new Map(BADGES.map((b) => [b.code, b]));

export function badgeFor(code: string): Badge | undefined {
  return BY_CODE.get(code);
}

/** Every badge in a group, in catalogue order. */
export function badgesIn(group: BadgeGroup): Badge[] {
  return BADGES.filter((b) => b.group === group);
}

/** One earned badge, as the store keeps it and the socket announces it. */
export interface EarnedBadge {
  /** Whose: a persona's identity, or `guest:<name>` for somebody on the shared code. */
  person: string;
  /** What they were called when they earned it, so a row reads without the roster. */
  name: string;
  code: string;
  earnedAt: string;
}

/**
 * Who a badge belongs to.
 *
 * A personal code names exactly one person, so the identity *is* the
 * holder and their badges follow them to any browser they open. The shared
 * code names nobody, so the only handle on a visitor is what they typed
 * into the welcome screen — which is a weak identity and deliberately
 * marked as one: two people who both call themselves Guest share a shelf.
 * Sign-in is the finer-grained answer, exactly as it is for the door.
 */
export function badgeHolder(identity: string, name: string): string {
  if (identity && identity !== "visitor") return identity;
  const trimmed = name.trim().toLowerCase();
  return `guest:${trimmed || "guest"}`;
}

/** Whether a holder id is a visitor's rather than somebody the world knows. */
export function isGuestHolder(person: string): boolean {
  return person.startsWith("guest:");
}
