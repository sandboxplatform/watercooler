/**
 * Who has a sheet, and where it is served from.
 *
 * This lives in `lib/` rather than beside the Phaser animation config because
 * the server needs it: the presence socket checks a claimed look against the
 * shared cast, and the roster is built from this table. `lib/` is shared
 * ground; `components/game/` is Phaser, and the server cannot import Phaser's
 * neighbourhood — the runtime image does not even carry it.
 *
 * `components/game/config/animations.ts` re-exports all of this, so game code
 * goes on importing it from there and there is still one list.
 */

// The player's own look, and the default for anyone walking in.
export const BOSS_SPRITE_KEY = "character_09";
export const BOSS_SPRITE_PATH = "/characters/Premade_Character_48x48_09.png";

export interface WorkerSpriteConfig {
  key: string;
  /** Public path of the 48x96 sheet. */
  path: string;
  /** Name shown in the picker and the seat manager. */
  label: string;
}

/**
 * Every sheet the game ships.
 *
 * A **key** outlives its filename: seats and saved profiles are stored against
 * it, so rename the file and the `path`, never the key. That is why Yoshi and
 * Bud still answer to `character_data_scientist` and `character_spud`.
 */
export const WORKER_SPRITES: WorkerSpriteConfig[] = [
  { key: "character_02", path: "/characters/Premade_Character_48x48_02.png", label: "Alice" },
  { key: "character_03", path: "/characters/Premade_Character_48x48_03.png", label: "Bob" },
  { key: "character_04", path: "/characters/Premade_Character_48x48_04.png", label: "Carol" },
  { key: "character_05", path: "/characters/Premade_Character_48x48_05.png", label: "Dave" },
  // Built from the side-view sheets in public/characters/examples by
  // scripts/build-character.ts — looks for the agents and the residents.
  { key: "character_data_scientist", path: "/characters/Yoshi_48x48.png", label: "Yoshi" },
  { key: "character_mark", path: "/characters/Mark_48x48.png", label: "Mark" },
  { key: "character_sara", path: "/characters/Sara_48x48.png", label: "Sara" },
  { key: "character_spud", path: "/characters/Bud_48x48.png", label: "Bud" },
  { key: "character_steve", path: "/characters/Steve_48x48.png", label: "Steve" },
  { key: "character_yash", path: "/characters/Yash_48x48.png", label: "Yash" },
  // Looks for people, built the same way.
  { key: "character_coop", path: "/characters/Coop_48x48.png", label: "Coop" },
  { key: "character_rob", path: "/characters/Rob_48x48.png", label: "Rob" },
  // Michael wanders the world map. Listed here so the scenes can find his
  // sheet; he is a resident, so the picker leaves his look to him.
  { key: "character_michael", path: "/characters/Michael_48x48.png", label: "Michael" },
];
