import * as Phaser from "phaser";
import { EGG_KINDS, EGG_TIER_COUNT, eggKind, type EggTier } from "@/lib/world/eggs";

/**
 * The fireworks when Michael leaves an egg behind.
 *
 * A fright that pays out is the one moment in this world worth
 * interrupting somebody for: it is a chase that ended in something, it
 * happens a handful of times an hour, and until now the whole of it was an
 * egg quietly appearing in the grass — which, in the wood, behind two rows
 * of canopy, is nothing appearing anywhere. So it goes off: a flash, a
 * shockwave, a plume of sparks in the egg's own colours and, for the rungs
 * worth crossing the park for, a pop or two after it.
 *
 * Four decisions in it:
 *
 * - **Over everything.** The burst is drawn at the prompts' own depth
 *   rather than at the ground's, because the place it most has to be seen
 *   is exactly the place the egg cannot be: everything outdoors sorts by
 *   the bottom of its own picture, so a tree a row south of the egg is
 *   drawn across it. A burst that sorted with the scenery would be a
 *   firework let off inside a bush.
 * - **The colours are the egg's.** The three `shell` tones off the ladder,
 *   so the fireworks have already said what kind it is by the time
 *   anybody is near enough to read the shout over it. Nothing else in this
 *   feature tells you from across a field.
 * - **A rarer one goes off harder**, read off the rung rather than written
 *   per tier — more sparks, faster, for longer, and the pops after it
 *   start at copper. A seventh kind of egg needs nothing here.
 * - **Squares, not smoke.** The two textures are generated on first use
 *   rather than delivered as art, for the reason the count boards' plates
 *   are drawn rather than painted: this is a white pixel and a four-point
 *   star, and a PNG of either is a file to keep in step with nothing.
 *
 * It is self-cleaning and it also hands back a handle, because a scene's
 * shutdown takes its timers with it: a burst still in the air when
 * somebody walks into a building would otherwise be waiting on a
 * `delayedCall` that is never going to arrive.
 */

/** A single spark: four pixels, white, tinted per emitter. */
const SPARK_KEY = "egg-spark";

/** The flash at the middle of it: a four-point star, tapered. */
const FLASH_KEY = "egg-flash";

const SPARK_PX = 4;

/** The star's reach from its middle, and how thick its spikes start. */
const FLASH_REACH = 30;
const FLASH_THICK = 7;
const FLASH_PX = FLASH_REACH * 2 + 1;

/** How long the longest thing in a burst can be in the air. */
const BURST_MS = 1_600;

function ensureTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, SPARK_PX, SPARK_PX);
    g.generateTexture(SPARK_KEY, SPARK_PX, SPARK_PX);
    g.destroy();
  }
  if (!scene.textures.exists(FLASH_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    // A spike a pixel at a time, thinning away from the middle — the same
    // argument the incident lamp's dome is under: a smooth curve beside
    // this world's staircased art is the one thing in the picture that
    // does not belong to it.
    for (let d = 0; d <= FLASH_REACH; d++) {
      const away = 1 - d / FLASH_REACH;
      const half = Math.max(1, Math.round(FLASH_THICK * away * away));
      g.fillRect(FLASH_REACH + d, FLASH_REACH - half, 1, half * 2);
      g.fillRect(FLASH_REACH - d, FLASH_REACH - half, 1, half * 2);
      g.fillRect(FLASH_REACH - half, FLASH_REACH + d, half * 2, 1);
      g.fillRect(FLASH_REACH - half, FLASH_REACH - d, half * 2, 1);
    }
    g.generateTexture(FLASH_KEY, FLASH_PX, FLASH_PX);
    g.destroy();
  }
}

/** `#rrggbb` as the number Phaser tints with. */
function tone(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/** Whatever a burst put on the display list, so a shutdown can take it down. */
export interface EggBurst {
  destroy(): void;
}

/**
 * Let one off, at the patch of grass the egg is lying on.
 *
 * `depth` is the caller's, because the burst belongs over whatever that
 * scene calls everything — it is the one thing here with an opinion about
 * the rest of the map.
 */
export function burstAt(
  scene: Phaser.Scene,
  at: { x: number; y: number },
  tier: EggTier,
  depth: number,
): EggBurst {
  ensureTextures(scene);

  const shell = (eggKind(tier) ?? EGG_KINDS[0]).shell;
  const base = tone(shell.base);
  const shade = tone(shell.shade);
  const lit = tone(shell.lit);

  // Where on the ladder this one sits: 0 for a hen's egg and 1 for the
  // rainbow. Everything below leans on that rather than being written per
  // tier, so a seventh rung needs nothing here.
  const rung = Math.max(
    0,
    EGG_KINDS.findIndex((kind) => kind.id === tier),
  );
  const grand = EGG_TIER_COUNT > 1 ? rung / (EGG_TIER_COUNT - 1) : 0;

  const parts: Phaser.GameObjects.GameObject[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  let done = false;

  // The flash. Short, white-hot and gone before the sparks have spread,
  // which is what makes the sparks look like they came out of something.
  const flash = scene.add
    .image(at.x, at.y, FLASH_KEY)
    .setDepth(depth + 2)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.35)
    .setTint(lit);
  parts.push(flash);
  scene.tweens.add({
    targets: flash,
    scale: 1.3 + grand * 0.7,
    alpha: 0,
    angle: 28,
    duration: 260,
    ease: "Quad.easeOut",
  });

  // The shockwave: one tight ring at a single speed, so it reads as an
  // edge going out rather than as more of the plume.
  const ring = scene.add
    .particles(at.x, at.y, SPARK_KEY, {
      speed: 165 + grand * 70,
      lifespan: 280,
      quantity: 0,
      scale: { start: 1.1, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: lit,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    })
    .setDepth(depth + 1);
  parts.push(ring);
  ring.explode(16 + Math.round(grand * 14));

  // The plume: the body of it, in all three of the shell's tones, with
  // enough gravity under it to droop rather than hang.
  const plume = scene.add
    .particles(at.x, at.y, SPARK_KEY, {
      speed: { min: 40, max: 180 + grand * 90 },
      lifespan: { min: 420, max: 820 + grand * 260 },
      gravityY: 240,
      quantity: 0,
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [base, shade, lit],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    })
    .setDepth(depth + 1);
  parts.push(plume);
  plume.explode(26 + Math.round(grand * 34));

  // Embers and the pops after it, on the rarer half. What turns a bang
  // into a firework is the part still coming down after the noise — and a
  // hen's egg is not an occasion, so it gets the bang and no encore.
  if (rung >= 2) {
    const embers = scene.add
      .particles(at.x, at.y, SPARK_KEY, {
        speed: { min: 12, max: 70 },
        lifespan: { min: 800, max: 1_400 },
        gravityY: 60,
        quantity: 0,
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [lit, base],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(depth + 1);
    parts.push(embers);
    embers.explode(8 + rung * 3);

    // Thrown clear of the middle, so the eye has somewhere new to go.
    for (let i = 0; i < rung - 1; i++) {
      timers.push(
        scene.time.delayedCall(140 + i * 130, () => {
          const angle = Math.random() * Math.PI * 2;
          const away = 26 + Math.random() * 34;
          const pop = scene.add
            .particles(at.x + Math.cos(angle) * away, at.y + Math.sin(angle) * away, SPARK_KEY, {
              speed: { min: 30, max: 110 },
              lifespan: { min: 320, max: 620 },
              gravityY: 180,
              quantity: 0,
              scale: { start: 1, end: 0 },
              alpha: { start: 1, end: 0 },
              tint: [base, lit],
              blendMode: Phaser.BlendModes.ADD,
              emitting: false,
            })
            .setDepth(depth + 1);
          parts.push(pop);
          pop.explode(8 + rung * 2);
        }),
      );
    }
  }

  const burst: EggBurst = {
    destroy() {
      if (done) return;
      done = true;
      for (const timer of timers) timer.remove();
      for (const part of parts) part.destroy();
      parts.length = 0;
    },
  };

  // Tidied by the clock rather than by watching every emitter empty: the
  // longest thing in here is written down above, and what is left after it
  // is a handful of dead emitters sitting on the display list.
  timers.push(scene.time.delayedCall(BURST_MS, () => burst.destroy()));

  return burst;
}
