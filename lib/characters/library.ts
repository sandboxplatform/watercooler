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

/** Whether this look is one a visitor may choose. */
export function inSharedCast(key: string): boolean {
  return SHARED_CAST.some((character) => character.key === key);
}

/** The public file behind a library id, or null for anything else. */
export function librarySheetPath(id: string): string | null {
  const entry = LIBRARY_CHARACTERS.find((c) => c.id === id);
  return entry ? entry.sheetUrl : null;
}

/** Texture key for a character: library keys as-is, uploads namespaced. */
export function textureKeyFor(character: Pick<RosterCharacter, "id" | "key" | "source">): string {
  return character.source === "library" ? character.key : `generated:${character.id}`;
}
