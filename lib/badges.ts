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
 *
 * The nearest thing to an exception is a handful that key on **where
 * somebody is standing** — the two stretches of the map, and the three
 * that want a resident beside you. A position does arrive in a `move`,
 * but the hub clamps every one of them against the sprint, so the only
 * way to be somewhere is to have walked there. What a browser cannot do
 * is arrive.
 *
 * Every entry also carries a `hint`, which is the half a list has no room
 * for: what to go and do. `BadgeCard` is the only thing that shows it.
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
  /**
   * Where to go, or what to do, for somebody who has not got it yet.
   *
   * `description` is the past tense and reads both ways, which is enough
   * for a row in a list. This is the other half and only the card shows
   * it: the sentence that turns "that exists" into something somebody can
   * set out to do this afternoon. Written for the person who has *not*
   * earned it — an earned badge is a memory, and nobody needs directions
   * to a place they have been.
   */
  hint: string;
  icon: string;
}

export const BADGES: readonly Badge[] = [
  // ── Getting about ───────────────────────────────────────
  {
    code: "walked-in",
    group: "about",
    title: "Walked In",
    description: "Turned up in the world for the first time",
    hint: "Opening the world at all is the whole of it.",
    icon: "🚪",
  },
  {
    code: "going-up",
    group: "about",
    title: "Going Up",
    description: "Rode a lift to a floor above a lobby",
    hint: "Every building with floors has a lift in its lobby. Step into the car and press a number.",
    icon: "🛗",
  },
  {
    code: "third-floor",
    group: "about",
    title: "Third Floor",
    description: "Got as far as somebody's Operations floor",
    hint: "Only some buildings run one — Sandbox ERP and Castle Atlantic do. It is the floor with the corridor and the boards on the wall.",
    icon: "📋",
  },
  {
    code: "sea-legs",
    group: "about",
    title: "Sea Legs",
    description: "Took the ferry across to the island",
    hint: "The ferry is moored at the dock on the south shore. Walk aboard and it carries you out to the island.",
    icon: "⛴️",
  },
  // The other crossing, off the second dock. Beside Sea Legs rather than
  // folded into it, because they are two boats to two places and nobody who
  // has been to one has been to the other.
  {
    code: "hot-foot",
    group: "about",
    title: "Hot Foot",
    description: "Took the other ferry, across to Volcano Island",
    hint: "The second dock is at the foot of the east avenue, under a board that says Ferry to Volcano. Walk aboard.",
    icon: "🌋",
  },
  {
    code: "back-of-house",
    group: "about",
    title: "Back of House",
    description: "Been in a store, a warehouse and a garage",
    hint: "Three different kinds of room: the floor of a store, the warehouse behind it, and a garage.",
    icon: "📦",
  },
  {
    code: "grand-tour",
    group: "about",
    title: "Grand Tour",
    description: "Called in on every organisation in the world",
    hint: "Every organisation there is, the four shops out west included. A lobby counts — you need not go upstairs.",
    icon: "🗺️",
  },
  // The two stretches the map grew into. The shops in the west need no
  // badge of their own: all four are organisations, so the Grand Tour
  // already sends you out there and in through every one of their doors.
  // The wood and the wilderness have nothing to call in on, which is what
  // makes going to either of them something somebody has to decide to do.
  {
    code: "into-the-woods",
    group: "about",
    title: "Into the Woods",
    description: "Walked up the trail into the wood above the town",
    hint: "The trail leaves the north edge of the plaza, through a gap in the tree line. Follow it up.",
    icon: "🌲",
  },
  {
    code: "out-in-the-wild",
    group: "about",
    title: "Out in the Wild",
    description: "Kept walking east, past the last of the town",
    hint: "Walk east out of the car park and keep going. Past the last promenade there is meadow, and then the road.",
    icon: "🌾",
  },

  // ── Playing ─────────────────────────────────────────────
  {
    code: "insert-coin",
    group: "playing",
    title: "Insert Coin",
    description: "Put a score on a machine in somebody's lobby",
    hint: "Every lobby has one machine in the corner. Walk up, press E, and play it to the end.",
    icon: "🕹️",
  },
  {
    code: "played-the-lot",
    group: "playing",
    title: "Played the Lot",
    description: "Put a score on every machine in the world",
    hint: "Four buildings, four different machines. Ping pong keeps no score and is not one of them.",
    icon: "🎮",
  },
  {
    code: "top-of-the-board",
    group: "playing",
    title: "Top of the Board",
    description: "Took first place on a high score table",
    hint: "Any machine will do. You have to beat whatever is already at the top of its table.",
    icon: "👑",
  },
  {
    code: "volley",
    group: "playing",
    title: "Volley",
    description: "Played a game of ping pong against somebody",
    hint: "The table is in Castle Atlantic's lobby, and it takes two — somebody else has to accept.",
    icon: "🏓",
  },
  {
    code: "swish",
    group: "playing",
    title: "Swish",
    description: "Sank a basket on the court in the park",
    hint: "The court is in the park. Press E over the ball to pick it up, and press E again to throw.",
    icon: "🏀",
  },
  // Two shots that a basket is not — and neither of them a tally of
  // baskets. The backboard is a second way in and the far end of the court
  // is the top of the meter, and the court answered both with the badge it
  // gives a lay-up.
  {
    code: "off-the-board",
    group: "playing",
    title: "Off the Board",
    description: "Banked one in off the backboard",
    hint: "Overshoot on purpose. A throw too long for the hole can come back off the board and drop through it anyway.",
    // The pool player's word for the same shot, and a ball that is
    // certainly drawn on every machine. The basketball is Swish's.
    icon: "🎱",
  },
  {
    code: "full-court",
    group: "playing",
    title: "Full Court",
    description: "Sank one from the far end of the court",
    hint: "From the far end of the tarmac, near the top of the meter — which is scaled to carry the ball one rim to the other.",
    icon: "🎯",
  },

  // ── Together ────────────────────────────────────────────
  {
    code: "on-mic",
    group: "together",
    title: "On Mic",
    description: "Switched a microphone on and joined Global Chat",
    hint: "The pill in the bottom bar. Switching a microphone on is joining Global Chat, which is one conversation for the whole server.",
    icon: "🎙️",
  },
  {
    code: "round-table",
    group: "together",
    title: "Round Table",
    description: "Was in Global Chat with three other people at once",
    hint: "Four microphones on at once. They need not be in the same room, or the same building.",
    icon: "🗣️",
  },
  {
    code: "full-house",
    group: "together",
    title: "Full House",
    description: "Was in a room when it filled up",
    hint: "A room holds a few people. Be standing in one when the last place goes.",
    icon: "🏠",
  },
  {
    code: "called-to-order",
    group: "together",
    title: "Called to Order",
    description: "Called a meeting at a boardroom table",
    hint: "The boardroom is the far room on an Operations floor. Press E at the table and start one.",
    icon: "📣",
  },
  {
    code: "took-a-seat",
    group: "together",
    title: "Took a Seat",
    description: "Sat in on a meeting somebody else had called",
    hint: "Somebody else has to call it. Walk into the room while it is running, or be at the table when it starts.",
    icon: "💺",
  },

  // ── The locals ──────────────────────────────────────────
  {
    code: "cluck",
    group: "locals",
    title: "Cluck",
    description: "Stood close enough to Michael to startle him",
    hint: "Michael is the rooster, and he walks the map all day. Get close enough and he says his one word.",
    icon: "🐔",
  },
  {
    code: "ran-him-down",
    group: "locals",
    title: "Ran Him Down",
    description: "Caught Michael while he was still running",
    hint: "He bolts at half again a sprint, so out-running him will not do it. Cut the corner instead.",
    icon: "🏃",
  },
  {
    code: "ticket-raised",
    group: "locals",
    title: "Ticket Raised",
    description: "Caught up with Doc, at his desk or out on his break",
    hint: "Doc works the Support room on Sandbox ERP's third floor, and takes his breaks out on the plaza.",
    icon: "🎧",
  },
  {
    code: "knows-everybody",
    group: "locals",
    title: "Knows Everybody",
    description: "Stood beside every resident in the world",
    hint: "The locals are spread over five buildings and the map outside. Stand beside each of them once.",
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
    hint: "He leaves them where a fright ends, out in the grass. Walk over to one and press E.",
    icon: "🥚",
  },
  {
    code: "ruffled-feathers",
    group: "eggs",
    title: "Ruffled Feathers",
    description: "Startled Michael badly enough that he laid one",
    hint: "Four clucks in a hundred leave one behind. It is a chance and not a count, so it is worth startling him whenever you pass.",
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
    hint: "One egg in two hundred and fifty, and there is nothing to do differently for it. You keep startling him, and one day it is there.",
    icon: "🌈",
  },
  {
    code: "whole-clutch",
    group: "eggs",
    title: "The Whole Clutch",
    description: "Found an egg of every kind there is to find",
    hint: "Eight kinds, hen's egg to rainbow. One of every kind, not eight of any.",
    icon: "🧺",
  },

  // ── Curios ──────────────────────────────────────────────
  {
    code: "left-a-mark",
    group: "curios",
    title: "Left a Mark",
    description: "Drew on a whiteboard",
    hint: "The whiteboard hangs on an Operations floor. Press E and draw a line on it.",
    icon: "🖊️",
  },
  {
    code: "right-of-way",
    group: "curios",
    title: "Right of Way",
    description: "Stood in the highway and let a car go straight through",
    hint: "Nothing collides with a car. Stand in a lane of the highway out east and wait for one to come.",
    icon: "🚗",
  },
  // A curio rather than a local: the blob is nobody the cast knows, and
  // Knows Everybody counts the residents, so it has to stay out of that set.
  // Named for what happens to the blob, which is the stars it sits there
  // seeing — the punch is in the icon.
  {
    code: "seeing-stars",
    group: "curios",
    title: "Seeing Stars",
    description: "Punched the blob in the volcano's cave",
    hint: "Walk into the cave at the foot of the volcano. Get close to the blob while it sits still and press E, or A on a controller.",
    icon: "👊",
  },
  {
    code: "night-shift",
    group: "curios",
    title: "Night Shift",
    description: "Was in the world in the small hours",
    hint: "Before five in the morning, on the server's own clock.",
    icon: "🌙",
  },
  {
    code: "holding-the-fort",
    group: "curios",
    title: "Holding the Fort",
    description: "Was the only person in the whole world",
    hint: "Nobody else anywhere in the world. It tends to find you rather than the other way round.",
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
