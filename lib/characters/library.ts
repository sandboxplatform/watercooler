/**
 * The characters that ship with the game, in the same shape as uploaded ones.
 *
 * Until now agents chose from a hard-coded list and the person chose from
 * uploads, and never the twain. One roster means one picker: a library sheet
 * and an uploaded sheet are both just a character with a key, a sheet and a
 * face — where the file lives is a detail the picker does not need to know.
 */

// From lib, not from components/game: the presence socket reaches this file,
// and the server's runtime image carries no components/.
import { BOSS_SPRITE_KEY, BOSS_SPRITE_PATH, WORKER_SPRITES } from "./sprites";
import { RESIDENTS } from "@/lib/world/residents";

export interface RosterCharacter {
  /** Stable id used in URLs. Library ids are `library-<key>`. */
  id: string;
  /** Phaser texture key. Library sheets are preloaded under theirs. */
  key: string;
  name: string;
  /** Where the full sheet is served from. */
  sheetUrl: string;
  /** The 48x96 face, cheap to show in a grid. */
  portraitUrl: string;
  source: "library" | "photo" | "sheet";
  layout?: "exact" | "loose" | "library";
  notes: string;
}

export const LIBRARY_PREFIX = "library-";

/** A resident's look is theirs: it stays in the library for them, but nobody else can pick it. */
const RESERVED = new Set(RESIDENTS.map((r) => r.spriteKey));

const selectable: RosterCharacter[] = WORKER_SPRITES.filter((s) => !RESERVED.has(s.key)).map(
  (s) => ({
    id: `${LIBRARY_PREFIX}${s.key}`,
    key: s.key,
    name: s.label,
    sheetUrl: s.path,
    portraitUrl: `/api/characters/${LIBRARY_PREFIX}${s.key}/portrait`,
    source: "library" as const,
    notes: "Ships with the game.",
  }),
);

const THE_BOSS: RosterCharacter = {
  id: `${LIBRARY_PREFIX}${BOSS_SPRITE_KEY}`,
  key: BOSS_SPRITE_KEY,
  name: "The Boss",
  sheetUrl: BOSS_SPRITE_PATH,
  portraitUrl: `/api/characters/${LIBRARY_PREFIX}${BOSS_SPRITE_KEY}/portrait`,
  source: "library" as const,
  notes: "The default look for a person walking in.",
};

/** A sheet that came with the pack, rather than one built from a source photo. */
const isPremade = (character: RosterCharacter) => character.sheetUrl.includes("Premade_Character");

/**
 * The order the picker shows them in: the premade cast with the boss among
 * them, then the likenesses built from sheets in public/characters/examples.
 * The boss is a premade sheet himself (09), so he belongs with that group
 * rather than tacked on after Coop and Rob, which is where simply appending
 * him used to leave him.
 */
export const LIBRARY_CHARACTERS: RosterCharacter[] = [
  ...selectable.filter(isPremade),
  THE_BOSS,
  ...selectable.filter((character) => !isPremade(character)),
];

/**
 * The looks a visitor may wear: the cast that ships with the game.
 *
 * Coop's and Rob's likenesses are theirs, the way a resident's is theirs —
 * they arrive on their own code already wearing them, and nobody who came in
 * on the shared code may put one on.
 */
export const SHARED_CAST: RosterCharacter[] = LIBRARY_CHARACTERS.filter(
  (character) => isPremade(character) || character.key === BOSS_SPRITE_KEY,
);

/** As much of a persona as the question "what may they wear" needs. */
export interface LookClaim {
  characterKey?: string;
}

/**
 * The looks a given person may wear — their own, or the shared cast.
 *
 * A code that says who you are is no use if it also lets you walk in as
 * somebody else, so somebody whose own code names their sheet wears that and
 * nothing else: there is nothing left to choose between, and the picker is
 * not offered to them at all. Everybody who has no sheet of their own
 * chooses from the shared cast — a visitor, and equally a persona whose
 * likeness has not been drawn yet, since Coop's face is no more Campbell's
 * to put on than a stranger's.
 *
 * Not the list an agent may be given: a seat wears anything uploaded to the
 * room, which is the roster rather than this.
 */
export function looksFor(persona: LookClaim | null | undefined): RosterCharacter[] {
  const own = persona?.characterKey
    ? LIBRARY_CHARACTERS.find((character) => character.key === persona.characterKey)
    : null;
  return own ? [own] : SHARED_CAST;
}

/** Whether this person may wear this look — the socket's question, and the picker's. */
export function mayWear(persona: LookClaim | null | undefined, key: string): boolean {
  return looksFor(persona).some((character) => character.key === key);
}

/** The public file behind a library id, or null for anything else. */
export function librarySheetPath(id: string): string | null {
  const entry = LIBRARY_CHARACTERS.find((c) => c.id === id);
  return entry ? entry.sheetUrl : null;
}

/** What an uploaded character's texture key is namespaced with. */
const GENERATED_PREFIX = "generated:";

/** Texture key for a character: library keys as-is, uploads namespaced. */
export function textureKeyFor(character: Pick<RosterCharacter, "id" | "key" | "source">): string {
  return character.source === "library" ? character.key : `${GENERATED_PREFIX}${character.id}`;
}

/**
 * The sheet behind an uploaded character's texture key, or null for a key
 * that is not one.
 *
 * The other direction of `textureKeyFor`, and here beside it so the two
 * cannot drift. A scene that meets somebody wearing an uploaded look has
 * only the key the presence socket carries — no roster entry, no path — and
 * without this it had nowhere to look: `WORKER_SPRITES` holds the sheets
 * that ship with the game and never an upload, so the fetch was skipped and
 * `RemotePlayer.wear` quietly substituted the default sheet. The person
 * looked like themselves on their own screen and like the generic character
 * on everybody else's, with nothing anywhere to say why.
 */
export function generatedSheetPath(key: string): string | null {
  if (!key.startsWith(GENERATED_PREFIX)) return null;
  const id = key.slice(GENERATED_PREFIX.length);
  return id ? `/api/characters/${id}` : null;
}

/**
 * The sheet behind any texture key at all — one that ships, or an upload.
 *
 * Three places were asking this separately and none of them the same way:
 * the scene dressing somebody in the room, the People panel drawing their
 * portrait, and the browser putting on the look the socket accepted. It
 * belongs where the keys are, so a fourth caller cannot miss the uploaded
 * half of it the way the first one did.
 *
 * Null for a key that names no sheet — the caller decides whether that is a
 * person to leave in the default look or a fetch to skip.
 */
export function sheetPathFor(key: string): string | null {
  if (key === BOSS_SPRITE_KEY) return BOSS_SPRITE_PATH;
  return WORKER_SPRITES.find((sprite) => sprite.key === key)?.path ?? generatedSheetPath(key);
}
