import * as Phaser from "phaser";
import { onEggs, takeEgg, type EggNews, type EggTaken } from "@/lib/eggs-client";
import { eggKind, eggWithinReach, type LaidEgg } from "@/lib/world/eggs";
import { PRESS_E_STYLE } from "@/lib/constants";
import type { Facing } from "@/lib/presence-types";
import { PROPS_KEY } from "../scenes/outdoors";
import { keepLegible, legible } from "./legible";
import { addBeacon, type EggBeacon } from "../utils/egg-beacon";
import { burstAt, type EggBurst } from "../utils/egg-burst";

/**
 * The eggs lying in the grass on the world map.
 *
 * Michael leaves one behind now and then when somebody startles him. They
 * are the server's — where each one is and what kind it is were decided
 * there, and picking one up is asking rather than taking — so what lives
 * here is the drawing of them, the `Press E` when you are standing over
 * one, and the shout when somebody finds a good one.
 *
 * It is the second thing the world map runs of its own, beside the
 * basketball, and it deliberately reads a press the same way: E, the pad's
 * button and the HUD's action button all arrive as one boolean and are
 * acted on only when something of ours is within reach. Two things a step
 * apart never argue over a press, because neither claims one it has
 * nothing to do with.
 *
 * **Two things are drawn over an egg rather than at it**, and they answer
 * the same complaint from either end of it. Out of doors everything sorts
 * by the bottom of its own picture, so an egg in the wood is behind
 * whatever tree stands a row south of it:
 *
 * | What                     | Says                                        | For        |
 * | ------------------------ | ------------------------------------------- | ---------- |
 * | `utils/egg-burst`        | Michael has just laid one, and of what kind | A moment   |
 * | `utils/egg-beacon`       | There is one here                           | Until gone |
 *
 * The burst needs the field to say *which* egg is new, because the message
 * carrying it is the whole list and a browser walking onto the map is sent
 * the same list — see `EggNews`.
 */

/** Over everything, which out of doors is a bigger number than it looks. */
const OVER_EVERYTHING = 10_000;

/** How long the shout hangs over an egg somebody has just pocketed. */
const FOUND_MS = 2_200;

/**
 * How far the picture is lifted in front of its own patch of grass.
 *
 * The egg's frame is centred on the ground it lies on, so its depth is
 * that ground — but a person standing on the same row should be drawn in
 * front of it, and a person's depth is the bottom of their collision body,
 * a little below their feet line. A couple of pixels back settles it.
 */
const EGG_DEPTH_DROP = 6;

/**
 * Which finds are worth interrupting the map about.
 *
 * Every egg is announced to its finder by the panel and the badge toast;
 * a shout over the grass is for the people standing about, and a hen's egg
 * is not news to them. So the two commonest kinds pass quietly and the
 * rest are called out, which is what makes the call mean something.
 */
const SHOUT_ABOUT = new Set(["copper", "jade", "gilded", "ruby", "obsidian", "rainbow"]);

/** The picture of one egg, and the mark hanging over it. */
interface Drawn {
  image: Phaser.GameObjects.Image;
  beacon: EggBeacon;
}

export class EggPatch {
  /** One picture and one beacon per egg out there, by the egg's own id. */
  private drawn = new Map<string, Drawn>();
  /** Whatever fireworks are still in the air. */
  private bursts = new Set<EggBurst>();
  private lying: readonly LaidEgg[] = [];
  private prompt: Phaser.GameObjects.Text;
  private shout: Phaser.GameObjects.Text;
  private shoutUntil = 0;
  private unsub: () => void;

  constructor(private scene: Phaser.Scene) {
    this.prompt = scene.add
      .text(0, 0, "Press E", PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING)
      .setVisible(false);
    this.prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.shout = scene.add
      .text(0, 0, "", {
        ...(PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle),
        color: "#e0b870",
      })
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING + 2)
      .setVisible(false);
    this.shout.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Both are labels floating over the world, so they keep the size they
    // were written however far out the camera stands.
    keepLegible(scene, this.prompt, this.shout);

    this.unsub = onEggs((eggs, news) => this.receive(eggs, news));
  }

  /**
   * The field, as the server last had it.
   *
   * The whole list every time rather than one egg arriving and another
   * going — see `EggsBroadcast` — so this is a reconcile: whatever is new
   * gets a picture, whatever has gone loses one, and the ones that were
   * already there are left exactly as they are rather than being torn
   * down and rebuilt every time somebody two fields away finds one.
   *
   * Which is why the fireworks cannot be hung off "an egg this screen has
   * not drawn before": arriving on the map is a list of everything lying
   * there, and that would set one off over every egg in the park. `news`
   * names the one that was actually just laid, and it is null on every
   * other message.
   */
  private receive(eggs: readonly LaidEgg[], news: EggNews) {
    this.lying = eggs;
    const here = new Set(eggs.map((egg) => egg.id));
    for (const [id, drawn] of this.drawn) {
      if (here.has(id)) continue;
      this.forget(drawn);
      this.drawn.delete(id);
    }
    for (const egg of eggs) {
      if (this.drawn.has(egg.id)) continue;
      const image = this.scene.add
        .image(egg.x, egg.y, PROPS_KEY, `egg-${egg.tier}`)
        .setDepth(egg.y - EGG_DEPTH_DROP);
      const beacon = addBeacon(this.scene, egg, egg.tier, OVER_EVERYTHING - 1);
      keepLegible(this.scene, beacon.object);
      this.drawn.set(egg.id, { image, beacon });
      if (news.laid === egg.id) this.celebrate(egg, image);
    }
    if (news.taken) this.mark(news.taken);
  }

  /**
   * Michael has just left this one: let the fireworks off over it.
   *
   * The egg lands with them rather than being there already — it is thrown
   * out of the middle of the burst and settles, which is a tenth of a
   * second of work and the difference between an egg that was laid and an
   * egg that was always lying there under the bang.
   */
  private celebrate(egg: LaidEgg, image: Phaser.GameObjects.Image) {
    const burst = burstAt(this.scene, egg, egg.tier, OVER_EVERYTHING);
    this.bursts.add(burst);
    // Tracked so a shutdown can take it down, and dropped when it has run
    // its course — a scene that never let go would hold every firework of
    // the session.
    this.scene.time.delayedCall(2_000, () => {
      burst.destroy();
      this.bursts.delete(burst);
    });

    image.setScale(0.2);
    this.scene.tweens.add({
      targets: image,
      scale: 1,
      duration: 420,
      ease: "Back.easeOut",
    });
  }

  /**
   * Say what somebody just found, over the grass they found it in.
   *
   * The spot comes on the message rather than being remembered here: by
   * the time this runs the egg is out of the list and its picture is
   * gone, and it is the *egg's* spot anyway — a screen that has never
   * drawn the finder still puts the words where the thing was.
   */
  private mark(taken: EggTaken) {
    if (!SHOUT_ABOUT.has(taken.tier)) return;
    const kind = eggKind(taken.tier);
    if (!kind) return;
    this.shout
      .setText(`${taken.by.toUpperCase()} FOUND A ${kind.name.toUpperCase()}`)
      .setPosition(taken.x, taken.y - 44)
      .setVisible(true);
    this.shoutUntil = this.scene.time.now + FOUND_MS;
  }

  /**
   * A frame.
   *
   * `at` is where our own character is standing, which is the whole of
   * what this needs: whether anything is within bending distance, and
   * where to hang the prompt.
   */
  update(_deltaMs: number, at: { x: number; y: number; facing: Facing }, pressed: boolean) {
    if (this.shoutUntil && this.scene.time.now > this.shoutUntil) {
      this.shout.setVisible(false);
      this.shoutUntil = 0;
    }

    const nearest = this.nearest(at);
    if (nearest) this.prompt.setPosition(nearest.x, nearest.y - 30).setVisible(true);
    else this.prompt.setVisible(false);

    // Only ever on something within reach, so a press meant for the ball
    // a step away is not swallowed here — and the server checks the same
    // distance again, because this side is a convenience and not a rule.
    if (pressed && nearest) takeEgg();
  }

  /** The one we would pick up, by the rule the server will apply. */
  private nearest(at: { x: number; y: number }): LaidEgg | null {
    let best = Infinity;
    let found: LaidEgg | null = null;
    for (const egg of this.lying) {
      if (!eggWithinReach(egg, at)) continue;
      const d2 = (egg.x - at.x) ** 2 + (egg.y - at.y) ** 2;
      if (d2 >= best) continue;
      best = d2;
      found = egg;
    }
    return found;
  }

  /** One egg's picture and its mark, taken down together. */
  private forget(drawn: Drawn) {
    legible(this.scene).forget(drawn.beacon.object);
    drawn.beacon.destroy();
    drawn.image.destroy();
  }

  destroy() {
    this.unsub();
    legible(this.scene).forget(this.prompt, this.shout);
    this.prompt.destroy();
    this.shout.destroy();
    for (const burst of this.bursts) burst.destroy();
    this.bursts.clear();
    for (const drawn of this.drawn.values()) this.forget(drawn);
    this.drawn.clear();
  }
}
