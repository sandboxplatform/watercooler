import * as Phaser from "phaser";
import { asset } from "@/lib/assets";
import { onBaskets } from "@/lib/eggs-client";
import { EGG_KINDS } from "@/lib/world/eggs";
import type { EggTally } from "@/lib/world/eggs";
import { PROPS_KEY } from "../scenes/outdoors";

/**
 * The shelf of eggs in a cubicle, on a building's People floor.
 *
 * One rung of the ladder to a slot, in the ladder's own order, and only
 * the kinds its occupant has actually found are standing there. So a shelf
 * is read the way a collection is: what is on it, and what the gaps are.
 * Six hen's eggs and six rainbows look identical from the corridor, which
 * is the point — this says what somebody has found, not how much of it.
 *
 * **Fixed slots rather than the eggs pushed up together**, because the gaps
 * are half of what a shelf says. Shuffled along, a shelf with four eggs on
 * it says only "four"; in their own places it says which four, and that
 * somebody has the gilded one and not the jade.
 *
 * The plank is drawn and the eggs are not: they are the props atlas's own
 * `egg-<tier>` frames, the same picture lying in the grass on the world
 * map. A third drawing of an egg is what this codebase warns about twice
 * over — the sprite and the HUD's are already two — so the one place an
 * egg is drawn for a scene is the atlas.
 */

/** With the room's other props. People walk in front of it. */
const DEPTH = 4;

/** How far above the footprint's bottom edge the shelf's surface sits. */
const SURFACE = 24;

/** The plank, and the cabinet it stands on. */
const TOP = 0xc2a878;
const BODY = 0x6b5640;
const EDGE = 0x3a3a50;
const TOP_ROWS = 6;

/** The atlas the eggs are cut from, loaded by whoever wants a shelf. */
const FRAMES = "world-props-frames";

/**
 * Load the eggs' atlas, in a scene that has none.
 *
 * Only the props sheet and its frame list — not `loadOutdoorArt`, which is
 * the ground, the water, the ferry and the buildings besides. It is a
 * 2304x128 picture, which is a room loading the sheet it needs rather than
 * the whole outdoors.
 */
export function loadEggArt(scene: Phaser.Scene): void {
  scene.load.image(PROPS_KEY, asset("/sprites/world/props.png"));
  scene.load.json(FRAMES, asset("/sprites/world/props.json"));
}

/**
 * Name the eggs' rectangles on it.
 *
 * Deliberately not `cutOutdoorFrames`, which also sets up the fountain and
 * the sea — both of which animate between textures this scene has never
 * loaded, and a Phaser animation naming a missing key is an error rather
 * than a thing that quietly does not run.
 */
export function cutEggFrames(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PROPS_KEY)) return;
  const props = scene.textures.get(PROPS_KEY);
  const frames = scene.cache.json.get(FRAMES) as
    | Record<string, { x: number; y: number; width: number; height: number }>
    | undefined;
  for (const kind of EGG_KINDS) {
    const name = `egg-${kind.id}`;
    const rect = frames?.[name];
    if (rect && !props.has(name)) props.add(name, 0, rect.x, rect.y, rect.width, rect.height);
  }
}

export class EggShelf {
  private container: Phaser.GameObjects.Container | null = null;
  /** One image per rung, made once and shown when its kind turns up. */
  private eggs = new Map<string, Phaser.GameObjects.Image>();
  private unsub: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {}

  /**
   * Stand one on the tiles `at` names, for the person `person` — null in a
   * cubicle nobody has yet, which gets the shelf and no eggs.
   *
   * Hands back a teardown, like every other thing a room stands: the scene
   * restarts on a lift ride, and a subscription that outlives it goes on
   * drawing into a container that has been destroyed.
   */
  place(
    at: { tx: number; ty: number; tw: number; th: number },
    tile: number,
    person: string | null,
  ): () => void {
    const width = at.tw * tile;
    const container = this.scene.add
      .container((at.tx + at.tw / 2) * tile, (at.ty + at.th) * tile)
      .setDepth(DEPTH);
    this.container = container;

    // The cabinet under it, then the plank across the top of that: the
    // eggs stand on the plank's own line, which is where their baked-in
    // shadow lands.
    const body = this.scene.add.rectangle(0, -SURFACE, width, SURFACE, BODY).setOrigin(0.5, 0);
    body.setStrokeStyle(2, EDGE);
    const plank = this.scene.add
      .rectangle(0, -SURFACE, width + 8, TOP_ROWS, TOP)
      .setOrigin(0.5, 0.5);
    plank.setStrokeStyle(2, EDGE);
    container.add([body, plank]);

    // A slot per rung, in the ladder's order, so the gaps read.
    const pitch = width / EGG_KINDS.length;
    EGG_KINDS.forEach((kind, i) => {
      const egg = this.scene.add
        .image((i + 0.5) * pitch - width / 2, -SURFACE, PROPS_KEY, `egg-${kind.id}`)
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      container.add(egg);
      this.eggs.set(kind.id, egg);
    });

    // A cubicle with nobody in it is furnished and empty: the shelf is the
    // room's, the eggs are the occupant's.
    if (!person) return () => this.destroy();

    this.unsub = onBaskets((all) => this.show(all, person));
    return () => this.destroy();
  }

  private show(all: readonly EggTally[], person: string) {
    if (!this.container?.active) return;
    const held = new Set<string>(
      all.filter((t) => t.person === person && t.count > 0).map((t) => t.tier),
    );
    for (const [tier, egg] of this.eggs) egg.setVisible(held.has(tier));
  }

  private destroy() {
    this.unsub?.();
    this.unsub = null;
    this.container?.destroy(true);
    this.container = null;
    this.eggs.clear();
  }
}
