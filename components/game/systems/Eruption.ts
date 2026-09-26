import * as Phaser from "phaser";

/**
 * The volcano, being a volcano: smoke going up out of the crater, a glow in
 * it, and every so often a rumble — the camera shakes, the smoke comes out
 * in a rush and embers are thrown up and fall back onto the mountain.
 *
 * **The rumble is timed off the wall clock rather than a timer of this
 * scene's**, which is what makes it the same rumble on everybody's screen.
 * Everything else in this world that more than one person looks at is the
 * server's — the ball, the traffic, the blob — so two people standing on the
 * beach watching the volcano go off at different moments would be the odd
 * one out. It does not need the server to agree: a rumble falls on every
 * whole multiple of `RUMBLE_EVERY_MS` since the epoch, and two browsers'
 * clocks are within a second of each other, which is near enough for a
 * mountain.
 *
 * Nothing here is solid and nothing here is anybody's business but the eye's,
 * so it is drawn rather than delivered as art — a puff of smoke is a grey
 * ellipse, and a PNG of one is a file to keep in step with nothing.
 */

/** How often a puff of smoke leaves the crater, in the ordinary way. */
const PUFF_EVERY_MS = 320;
/** How long a puff takes to rise and thin out. */
const PUFF_MS = 2_600;
/** How far it rises in that time. */
const PUFF_RISE = 150;
/** How often the mountain rumbles. */
export const RUMBLE_EVERY_MS = 24_000;
/** How long the camera shakes for, and how hard. */
const SHAKE_MS = 700;
const SHAKE = 0.0035;
/**
 * Over the people and the mountain alike. The smoke is up in the sky over
 * the summit, where nobody can stand, so anybody it is drawn across is
 * somebody it is in front of.
 */
const SKY_DEPTH = 2_000;

export class Eruption {
  private since = 0;
  /** Which rumble it was last frame, so the change is the rumble. Null before the first frame. */
  private beat: number | null = null;
  private glow: Phaser.GameObjects.Ellipse;
  private live = new Set<Phaser.GameObjects.GameObject>();

  constructor(
    private scene: Phaser.Scene,
    private crater: { x: number; y: number },
    private now: () => number = Date.now,
  ) {
    this.glow = scene.add
      .ellipse(crater.x, crater.y, 120, 30, 0xff8a3c, 0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(SKY_DEPTH - 1);
    scene.tweens.add({
      targets: this.glow,
      alpha: 0.6,
      scaleX: 1.08,
      duration: 1_400,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  update(deltaMs: number) {
    this.since += deltaMs;
    while (this.since >= PUFF_EVERY_MS) {
      this.since -= PUFF_EVERY_MS;
      this.puff(1);
    }
    const beat = Math.floor(this.now() / RUMBLE_EVERY_MS);
    if (this.beat !== null && beat !== this.beat) this.rumble();
    this.beat = beat;
  }

  /** One puff of smoke, from somewhere across the crater, drifting as it goes. */
  private puff(force: number) {
    const x = this.crater.x + Phaser.Math.Between(-40, 40);
    const shade = Phaser.Math.Between(0x6a, 0x9a);
    const colour = (shade << 16) | (shade << 8) | (shade + 8);
    const smoke = this.scene.add
      .ellipse(x, this.crater.y - 4, 26, 20, colour, 0.7)
      .setDepth(SKY_DEPTH);
    this.live.add(smoke);
    this.scene.tweens.add({
      targets: smoke,
      x: x + Phaser.Math.Between(-30, 50),
      y: smoke.y - PUFF_RISE * force,
      scale: 2.4 + force,
      alpha: 0,
      duration: PUFF_MS / Math.sqrt(force),
      ease: "Sine.easeOut",
      onComplete: () => this.gone(smoke),
    });
  }

  /** An ember thrown up out of the crater, falling back onto the flank. */
  private ember() {
    const spark = this.scene.add
      .rectangle(this.crater.x, this.crater.y, 3, 3, Phaser.Math.RND.pick([0xffe07a, 0xfaa030]))
      .setDepth(SKY_DEPTH + 1);
    this.live.add(spark);
    const duration = Phaser.Math.Between(500, 800);
    this.scene.tweens.add({
      targets: spark,
      x: spark.x + Phaser.Math.Between(-130, 130),
      duration: duration * 2,
      ease: "Linear",
    });
    // Up, and back down along the same curve: `yoyo` plays the ease in
    // reverse on the way back, which is gravity near enough.
    this.scene.tweens.add({
      targets: spark,
      y: spark.y - Phaser.Math.Between(60, 130),
      duration,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => this.gone(spark),
    });
  }

  private rumble() {
    this.scene.cameras.main.shake(SHAKE_MS, SHAKE);
    for (let i = 0; i < 8; i++) this.puff(1.6);
    for (let i = 0; i < 14; i++) this.ember();
  }

  private gone(thing: Phaser.GameObjects.GameObject) {
    this.live.delete(thing);
    thing.destroy();
  }

  destroy() {
    for (const thing of this.live) thing.destroy();
    this.live.clear();
    this.glow.destroy();
  }
}
