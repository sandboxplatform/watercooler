/**
 * The cast: everybody this world knows by name.
 *
 * Two kinds of person are in here and the difference matters everywhere
 * else in the app, so it is a field rather than two lists:
 *
 * - **`person`** — somebody at a keyboard, holding a code of their own
 *   (`PERSONAS` in lib/server/access.ts). They come and go, they earn
 *   badges, and the People panel lists them offline as well as on, because
 *   "who is about?" is only half of "who is there?".
 * - **`resident`** — a character the server walks about on a routine
 *   (`RESIDENTS` in lib/world/residents.ts). They are always in the world
 *   somewhere and they earn nothing: a resident is how a badge is *got*,
 *   not somebody who gets one.
 *
 * What is here and nowhere else is the part that is neither door nor
 * simulation — what they look like away from the sprite sheet, and who
 * they are. `art` is the concept sheet they were drawn from, which is a
 * 1536x1024 two-panel picture of the 8-bit sprite beside a painted
 * portrait; it is the one image in this app that is a *person* rather than
 * a tile, so the profile window leads with it.
 *
 * **It is a fourth place to edit when somebody joins the world**, after the
 * three in CLAUDE.md, and `cast.test.ts` is what makes that survivable: it
 * holds every entry to naming a real persona or resident, to agreeing with
 * them about name, organisation and sprite, and to naming a concept sheet
 * that is actually on disk. A missing entry is a failing test rather than a
 * blank card in the panel.
 *
 * Import-free on purpose — the People panel, the profile window and the
 * server all read it, and two of those are the browser.
 */

export type CastKind = "person" | "resident";

export interface CastMember {
  /**
   * Their id, which is also the handle their badges hang on.
   *
   * For a person it is their `AccessIdentity` — the code names them, so the
   * identity *is* the holder. For a resident it is their `Resident.id`,
   * which is not always their name: Bud's is `spud`.
   */
  id: string;
  name: string;
  kind: CastKind;
  /** What they do, in two or three words. */
  role: string;
  /** The organisation they work for, or null for somebody who works nowhere. */
  org: string | null;
  /** Their sheet in `WORKER_SPRITES`, for the portrait cut out of it. */
  spriteKey: string;
  /** The concept sheet under public/characters/examples, or null if none was drawn. */
  art: string | null;
  /** Who they are, for the profile window. */
  backstory: string;
}

const art = (name: string) => `/characters/examples/${name}.png`;

export const CAST: readonly CastMember[] = [
  // ── People: they hold a code, they come and go, they earn badges ──
  {
    id: "coop",
    name: "Coop",
    kind: "person",
    role: "Founder",
    org: "sandbox-erp",
    spriteKey: "character_coop",
    art: art("Coop"),
    backstory:
      "Built the entire world so that the pinball machine would have somewhere to stand. " +
      "Wears the same blue cap in every timeline, and the lighthouse on his office wall is " +
      "the only thing back there that has never needed a rebuild. Holds the keys to every " +
      "lift on the map, which he mentions rarely and enjoys constantly.",
  },
  {
    id: "rob",
    name: "Rob",
    kind: "person",
    role: "Co-Founder",
    org: "sandbox-erp",
    spriteKey: "character_rob",
    art: art("Rob"),
    backstory:
      "Co-founded the place with Coop, and wears the mirrored sunglasses indoors, at the " +
      "desk and in every photograph anybody has of him. The trophy on the shelf behind him " +
      "is for something he did before all this, and he will tell you the whole story if you " +
      "ask him about it. Holds the keys to every lift on the map, which is what comes of " +
      "having helped put the buildings up.",
  },
  {
    id: "hunter",
    name: "Hunter",
    kind: "person",
    role: "Field Operations",
    org: "castle-atlantic",
    spriteKey: "character_hunter",
    art: art("Hunter"),
    backstory:
      "Wears the hat indoors. His cubicle has a corkboard, two plants and a water cooler " +
      "jug he has been meaning to change since the spring. Rides exactly one lift — his " +
      "own building's — and has been heard to describe the other six as somebody else's " +
      "problem entirely.",
  },
  {
    id: "nathan",
    name: "Nathan",
    kind: "person",
    role: "Software Developer",
    org: "sandbox-erp",
    spriteKey: "character_nathan",
    art: art("Nathan"),
    backstory:
      "Writes the software, in a navy suit and tie that nobody else in the building has " +
      "ever attempted — and it suits him, which is the annoying part. Behind him a city " +
      "skyline through the window and a small gold globe on the shelf, both of them his " +
      "own choice. Rides Sandbox ERP's lift and no other, on the grounds that he has " +
      "never needed another one.",
  },
  {
    id: "sara",
    name: "Sara",
    kind: "person",
    role: "Co-Founder",
    org: "sandbox-erp",
    spriteKey: "character_sara",
    art: art("Sara"),
    backstory:
      "Co-founder, and the one who keeps the org chart on the wall behind her true to the " +
      "company rather than the other way round — it moves most weeks, and she moves it. " +
      "Knows what everybody is working on without looking it up, which is a different " +
      "thing from having written it down. Rides Sandbox ERP's lift all day and is rarely " +
      "on the floor you were told she was on.",
  },
  {
    id: "andrew",
    name: "Andrew",
    kind: "person",
    role: "Customer Success",
    org: "sandbox-erp",
    spriteKey: "character_andrew",
    art: art("Andrew"),
    backstory:
      "Charcoal suit, sage shirt, a tie with a pattern on it, and the only smile in the " +
      "cast that looks like it is being photographed. Behind him: a framed map of the " +
      "world, a shelf of blue binders in strict order, and a flip chart carrying a " +
      "flowchart, four green ticks and a bar chart going the right way. He was drawn as a " +
      "fish finger in a bow tie for a while, which he has agreed never to bring up again.",
  },
  {
    id: "campbell",
    name: "Campbell",
    kind: "person",
    role: "Apprentice",
    org: "homestar",
    spriteKey: "character_campbell",
    art: art("Campbell"),
    backstory:
      "Arrived in a bucket hat and a shirt visible from the ferry. Works the Homestar " +
      "campus, which is three buildings, three lifts and — as far as he is concerned — " +
      "three separate lunch options.",
  },
  {
    id: "nick",
    name: "Nick",
    kind: "person",
    role: "Site Foreman",
    org: null,
    spriteKey: "character_nick",
    art: art("Nick"),
    backstory:
      "Hard hat, safety glasses, a rolled blueprint and a tape measure, for a world in " +
      "which nothing has ever needed building. Works nowhere on purpose: the one person " +
      "here who walks in, studies everybody else's floor plan, and walks back out.",
  },

  // ── Residents: the server walks them about; they hand badges out ──
  {
    id: "yoshi",
    name: "Yoshi",
    kind: "resident",
    role: "Data Scientist",
    org: "castle-atlantic",
    spriteKey: "character_data_scientist",
    art: art("Yoshi"),
    backstory:
      "A green dinosaur in a maroon kimono and reading glasses, employed for insight and " +
      "supplying it steadily. The wall behind his desk reads DATA, INSIGHT, IMPACT in that " +
      "order, and he has never once taken them out of it.",
  },
  {
    id: "spud",
    name: "Bud",
    kind: "resident",
    role: "Support",
    org: "sandbox-erp",
    spriteKey: "character_spud",
    art: art("Bud"),
    backstory:
      "A potato in orange trainers who stands by the water cooler with the enthusiasm of a " +
      "man on his first day, every day. Everybody calls him Bud; the database calls him " +
      "spud, and he has asked about that twice.",
  },
  {
    id: "yash",
    name: "Yash",
    kind: "resident",
    role: "Research",
    org: "mettara",
    spriteKey: "character_yash",
    art: art("Yash"),
    backstory:
      "Attends the lab wearing a lanyard from a conference nobody else went to and carrying " +
      "a fountain drink roughly the size of his own head. Shares a wall with Yoshi, and a " +
      "code snippet that neither of them will claim to have written.",
  },
  {
    id: "steve",
    name: "Steve",
    kind: "resident",
    role: "Store Manager",
    org: "chester",
    spriteKey: "character_steve",
    art: art("Steve"),
    backstory:
      "Runs the store and the warehouse behind it off a kanban board, a checklist and the " +
      "settled calm of a man who has already counted everything. Has no desk upstairs and " +
      "has never once asked for one.",
  },
  {
    id: "mark",
    name: "Mark",
    kind: "resident",
    role: "Sales",
    org: "homestar",
    spriteKey: "character_mark",
    art: art("Mark"),
    backstory:
      "Red polo, folded arms, and a wall of delivery trucks and speedometers behind him. " +
      "Works out of Homestar's Sales block, and would very much like you to know that the " +
      "truck is already on its way.",
  },
  {
    id: "doc",
    name: "Doc",
    kind: "resident",
    role: "Help Desk",
    org: "sandbox-erp",
    spriteKey: "character_doc",
    art: art("Doc"),
    backstory:
      "Lab coat, headset, goggles pushed up on his forehead, permanently one thumb away " +
      "from a fix. He works the Support room on the third floor — the queue on the wall " +
      "beside him is his — and takes his breaks by going all the way outside to stand on " +
      "the plaza. Keeps announcing that he is about to be hooked up to Mettara.",
  },
  {
    id: "michael",
    name: "Michael",
    kind: "resident",
    role: "Wanderer",
    org: null,
    spriteKey: "character_michael",
    art: art("Michael"),
    backstory:
      "A rooster in a teal necktie who works for nobody, goes indoors never, and walks the " +
      "world map from one end of the day to the other. Say hello and he says Cluck, and " +
      "then bolts for five seconds — which is as close as this world gets to small talk.",
  },
];

const BY_ID = new Map(CAST.map((member) => [member.id, member]));

export function castMember(id: string | null | undefined): CastMember | null {
  return (id && BY_ID.get(id)) || null;
}

/** Everybody who holds a code: the people the People panel lists online and off. */
export const CAST_PEOPLE: readonly CastMember[] = CAST.filter((m) => m.kind === "person");

/** The characters the server walks about. */
export const CAST_RESIDENTS: readonly CastMember[] = CAST.filter((m) => m.kind === "resident");

/**
 * How many residents there are to stand beside, for the badge that wants
 * all of them. Read off the cast rather than written down, so adding one
 * moves the target rather than leaving a badge quietly already complete.
 */
export const RESIDENT_COUNT = CAST_RESIDENTS.length;
