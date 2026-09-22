import * as Phaser from "phaser";
import { EGG_KINDS, eggKind, type EggTier } from "@/lib/world/eggs";

/**
 * The mark over an egg lying in the grass: a glow, a beam and an arrow
 * pointing down at it.
 *
 * An egg is fourteen pixels of shell lying on the ground, and everything
 * out of doors sorts by the bottom of its own picture — so a tree standing
 * one row south of it is drawn straight across it, canopy and all. In the
 * town that is a nuisance; in the wood, where two cells in five are a
 * trunk and Michael is sent along the walk on the river bank, it is the
 * difference between an egg somebody can go and get and an egg that was
 * never there. The fireworks say one has been laid and then they are gone,
 * and the walk over takes longer than they last.
 *
 * So every egg lying on the map carries this, from the moment it is laid
 * until somebody pockets it or it goes stale. Three decisions:
 *
 * - **Over everything**, which is the whole of the point: the beacon is
 *   drawn above the canopy at the prompt's own depth, so the one thing you
 *   can see through a wood is the mark saying what is behind it.
 * - **The same mark for every rung.** Its job is "there is an egg here",
 *   which is equally true of a hen's egg and a rainbow, and a beacon that
 *   only showed the good ones would be a beacon nobody could trust. What
 *   it takes from the ladder is the *colour* — so it says which kind from
 *   across a field without saying how much it is worth coming for.
 * - **Drawn, not lettered.** Rectangles and a stepped chevron, for the
 *   reason the mic over somebody's head is: a glyph's colour belongs to
 *   the font, and this one has to be the egg's.
 *
 * It is registered with `keepLegible`, because it is a label floating over
 * the world rather than lettering painted into it — standing well back on
 * a map this size is exactly when an egg needs finding.
 */

/** How far the arrow's tip hangs above the ground the egg lies on. */
const TIP_ABOVE = 22;

/** The arrow, in pixels: half its width, and how deep the chevron steps. */
const ARROW_HALF = 8;
const ARROW_DEEP = 8;

/**
 * The beam between the glow and the arrow: three bars, fading upward.
 *
 * A pixel either side of the middle and no more. It was twice that, which
 * from across the map — where this has to work — put a stem as wide as the
 * arrow's own base under a glow as wide again, and the three of them read
 * as one pale vase rather than as a mark pointing at something.
 */
const BEAM_BARS = [
  { y: -10, half: 1, alpha: 0.55 },
  { y: -14, half: 1, alpha: 0.38 },
  { y: -18, half: 1, alpha: 0.22 },
];

/** How far the arrow rides up and down, and how long a round trip takes. */
const BOB_PX = 4;
const BOB_MS = 820;

/** The glow at the egg's own feet: a stepped diamond, pulsed. */
const GLOW_REACH = 8;

/** `#rrggbb` as the number a fill takes. */
function tone(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/**
 * The glow: a diamond a row at a time, brightest in the middle.
 *
 * Stepped rather than an ellipse for the reason everything else drawn in
 * this world is — a smooth curve is the one shape in the picture that
 * would not belong to it.
 */
function drawGlow(g: Phaser.GameObjects.Graphics, colour: number) {
  g.clear();
  for (let d = 0; d <= GLOW_REACH; d++) {
    const half = GLOW_REACH - d;
    if (half <= 0) continue;
    // Half the height of the width, so it lies on the ground rather than
    // standing up off it: this is light on grass, seen from above.
    const rows = Math.max(1, Math.round(half / 2));
    g.fillStyle(colour, 0.12 + (1 - d / GLOW_REACH) * 0.26);
    g.fillRect(-half, -rows, half * 2, rows * 2);
  }
}

/** The beam and the arrow over it, growing upward from the anchor. */
function drawMark(g: Phaser.GameObjects.Graphics, colour: number) {
  g.clear();
  for (const bar of BEAM_BARS) {
    g.fillStyle(colour, bar.alpha);
    g.fillRect(-bar.half, bar.y, bar.half * 2, 3);
  }

  // A chevron stepped down to a point, on a dark one a pixel proud of it —
  // the same plate the name tags carry, for the same reason: pale shell
  // colours on a sunlit lawn are otherwise a mark you cannot see.
  const tip = -TIP_ABOVE;
  for (const [offset, shade, alpha] of [
    [1, 0x000000, 0.55],
    [0, colour, 1],
  ] as const) {
    g.fillStyle(shade, alpha);
    for (let row = 0; row < ARROW_DEEP; row++) {
      const half = Math.max(1, ARROW_HALF - row);
      g.fillRect(-half - offset, tip - ARROW_DEEP + row - offset, (half + offset) * 2, 1);
    }
  }
}

/** The mark over one egg, and how to take it down. */
export interface EggBeacon {
  destroy(): void;
  /** The container, so the caller can hand it to `keepLegible`. */
  readonly object: Phaser.GameObjects.Container;
}

/**
 * Hang one over the patch of grass at `at`.
 *
 * `depth` is the caller's: the beacon belongs over whatever that scene
 * calls everything, and it is the one thing here with an opinion about the
 * rest of the map.
 */
export function addBeacon(
  scene: Phaser.Scene,
  at: { x: number; y: number },
  tier: EggTier,
  depth: number,
): EggBeacon {
  const shell = (eggKind(tier) ?? EGG_KINDS[0]).shell;
  const colour = tone(shell.lit);

  const container = scene.add.container(at.x, at.y).setDepth(depth);

  const glow = scene.add.graphics();
  drawGlow(glow, colour);
  container.add(glow);

  const mark = scene.add.graphics();
  drawMark(mark, colour);
  container.add(mark);

  // Two tweens rather than one: the arrow rides and the glow breathes, and
  // a mark whose every part moved together would read as the egg itself
  // bobbing about in the grass.
  const bob = scene.tweens.add({
    targets: mark,
    y: -BOB_PX,
    duration: BOB_MS,
    ease: "Sine.easeInOut",
    yoyo: true,
    repeat: -1,
  });
  const breathe = scene.tweens.add({
    targets: glow,
    alpha: 0.45,
    duration: BOB_MS,
    ease: "Sine.easeInOut",
    yoyo: true,
    repeat: -1,
  });

  return {
    object: container,
    destroy() {
      bob.remove();
      breathe.remove();
      container.destroy();
    },
  };
}
