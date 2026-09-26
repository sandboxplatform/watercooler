import * as Phaser from "phaser";
import { blobClock, onBlob, punchBlob, type BlobNews } from "@/lib/blob-client";
import { getSelfId } from "@/lib/presence-self";
import { landed, leapAt, withinPunch, type Leap } from "@/lib/world/blob";
import { PRESS_E_STYLE } from "@/lib/constants";
import type { Facing } from "@/lib/presence-types";
import { PROPS_KEY } from "../scenes/outdoors";
import { keepLegible, legible } from "./legible";

/**
 * The blob in the volcano's cave: the drawing of it, and the punch.
 *
 * Where it is going is the server's — every hop, and where a punch sends
 * it, arrives as a leap (`lib/world/blob.ts`) and this runs the arc against
 * its own clock, so every screen in the cave has it in the same place
 * without a message a frame. What lives here is everything that makes a
 * jelly on a parabola look alive: it squashes before it jumps and when it
 * lands, stretches in the air, wobbles while it sits, tumbles when it is
 * punched and sits there seeing stars afterwards.
 *
 * The punch is E, the pad's A or the HUD's button — whichever the scene
 * gathered — and the prompt says whichever of the first two you are
 * holding. Keyboard A walks left, so the key is E there like every other
 * `Press` in the world; on a controller A *is* the button, which is what the
 * prompt then says.
 */

/** Over everything out of doors, as the basketball's prompt is — see there. */
const OVER_EVERYTHING = 10_000;
/** How big it is drawn: the picture is 44 by 36. */
const BLOB_H = 36;
/** The squash on landing, and how long it takes to spring back. */
const LAND_MS = 160;
/** The crouch before a hop, for this long at the end of a rest. */
const CROUCH_MS = 180;
/** How long it flashes white when a punch lands. */
const FLASH_MS = 90;
/** How long the POW hangs over it. */
const POW_MS = 650;
/** The shadow shrinks as it rises, which is what reads as height — the ball's arrangement. */
const SHADOW_FADE_Z = 120;
const SHADOW_ALPHA = 0.45;

export class BlobHop {
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private prompt: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Graphics;
  private leap: Leap | null = null;
  /** How far into the leap it was when the server said, and when that arrived. */
  private elapsedThen = 0;
  private heardAt = 0;
  private flashUntil = 0;
  private unsub: () => void;

  /**
   * `padLabel` is what the pad's confirm button is called when one is
   * plugged in, and null when not — the scene knows, and this only prints it.
   */
  constructor(
    private scene: Phaser.Scene,
    private padLabel: () => string | null,
  ) {
    this.shadow = scene.add.ellipse(0, 0, 40, 12, 0x14121a, SHADOW_ALPHA).setVisible(false);
    this.body = scene.add.image(0, 0, PROPS_KEY, "blob").setVisible(false);
    this.stars = scene.add.graphics().setVisible(false);
    this.prompt = scene.add
      .text(0, 0, "Press E to punch", PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING)
      .setVisible(false);
    this.prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    keepLegible(scene, this.prompt);
    this.unsub = onBlob((news, at) => this.receive(news, at));
  }

  private receive(news: BlobNews, receivedAt: number) {
    this.leap = news.leap;
    this.elapsedThen = news.elapsed;
    this.heardAt = receivedAt;
    if (news.punched) this.struck(news.punched);
  }

  /** How far into the current leap it is by now. */
  private get elapsed(): number {
    return this.elapsedThen + (blobClock() - this.heardAt);
  }

  /**
   * A punch landed: a flash, a POW over it on everybody's screen, and — for
   * whoever threw it — the camera jolting, which is what makes a hit feel
   * like one rather than like a message arriving.
   */
  private struck(punched: NonNullable<BlobNews["punched"]>) {
    this.flashUntil = this.scene.time.now + FLASH_MS;
    if (!this.leap) return;
    const { x, y } = this.leap.from;
    const pow = this.scene.add
      .text(x, y - BLOB_H - 6, "POW!", {
        ...(PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle),
        color: "#ffe08a",
        fontSize: "18px",
      })
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING + 1);
    keepLegible(this.scene, pow);
    this.scene.tweens.add({
      targets: pow,
      y: pow.y - 28,
      alpha: 0,
      duration: POW_MS,
      ease: "Cubic.easeOut",
      onComplete: () => {
        legible(this.scene).forget(pow);
        pow.destroy();
      },
    });
    if (punched.id === getSelfId()) this.scene.cameras.main.shake(110, 0.006);
  }

  update(_deltaMs: number, at: { x: number; y: number; facing: Facing }, pressed: boolean) {
    const leap = this.leap;
    if (!leap) return;
    const elapsed = this.elapsed;
    const now = leapAt(leap, elapsed);
    const down = landed(leap, elapsed);
    const knocked = leap.kind === "knocked";
    const time = this.scene.time.now;

    // Squash and stretch, off where it is in its leap. Stretched in the air
    // by how fast it is rising or falling; squashed flat for a moment on
    // landing; crouched at the very end of a rest, which is the tell that a
    // hop is coming; and otherwise wobbling where it sits, because a jelly
    // that holds perfectly still is a picture of one.
    let sx = 1;
    let sy = 1;
    if (!down) {
      const speed = Math.abs(1 - 2 * now.t);
      sy = 1 + 0.2 * speed;
      sx = 1 - 0.12 * speed;
    } else {
      const sinceLanding = elapsed - leap.ms;
      const toGo = leap.ms + leap.rest - elapsed;
      if (sinceLanding < LAND_MS && leap.ms > 0) {
        const k = 1 - sinceLanding / LAND_MS;
        sy = 1 - 0.32 * k;
        sx = 1 + 0.26 * k;
      } else if (toGo < CROUCH_MS && toGo > 0) {
        const k = 1 - toGo / CROUCH_MS;
        sy = 1 - 0.22 * k;
        sx = 1 + 0.16 * k;
      } else {
        const wobble = Math.sin(time / 260) * 0.035;
        sy = 1 + wobble;
        sx = 1 - wobble;
      }
    }

    // A punched blob tumbles, one turn over the flight, the way it was hit.
    const spin =
      knocked && !down ? now.t * Math.PI * 2 * Math.sign(leap.to.x - leap.from.x || 1) : 0;
    const hurt = knocked;
    this.body
      .setFrame(hurt ? "blob-hurt" : "blob")
      .setScale(sx, sy)
      .setRotation(spin)
      // Centred, so a tumble turns about its middle; lifted by half its own
      // squashed height so its bottom sits on the floor, or `z` above it.
      .setPosition(now.x, now.y - now.z - (BLOB_H * sy) / 2)
      .setDepth(now.y + 1)
      .setVisible(true);
    if (time < this.flashUntil) this.body.setTintFill(0xffffff);
    else this.body.clearTint();

    const shrink = Math.max(0.45, 1 - now.z / SHADOW_FADE_Z);
    this.shadow
      .setPosition(now.x, now.y - 2)
      .setScale(shrink * sx, shrink)
      .setAlpha(SHADOW_ALPHA * shrink)
      .setDepth(now.y - 1)
      .setVisible(true);

    this.starsFor(knocked && down, now, time);

    // A blob still sailing from the last punch cannot be punched again —
    // the server's rule, and the prompt keeps to it rather than offering a
    // punch that is going to be refused.
    const reachable = !(knocked && !down) && withinPunch(now, at);
    if (reachable) {
      this.prompt
        .setText(`Press ${this.padLabel() ?? "E"} to punch`)
        .setPosition(now.x, now.y - now.z - BLOB_H - 12)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
    if (pressed && reachable) punchBlob();
  }

  /** Three stars going round over its head while it sits there dazed. */
  private starsFor(dazed: boolean, at: { x: number; y: number }, time: number) {
    this.stars.clear();
    if (!dazed) {
      this.stars.setVisible(false);
      return;
    }
    const top = at.y - BLOB_H - 4;
    for (let i = 0; i < 3; i++) {
      const angle = time / 220 + (i * Math.PI * 2) / 3;
      const x = at.x + Math.cos(angle) * 16;
      const y = top + Math.sin(angle) * 5;
      this.stars.fillStyle(0x1b1b2a, 1);
      this.stars.fillRect(x - 3, y - 1, 7, 3);
      this.stars.fillRect(x - 1, y - 3, 3, 7);
      this.stars.fillStyle(0xffe08a, 1);
      this.stars.fillRect(x - 2, y, 5, 1);
      this.stars.fillRect(x, y - 2, 1, 5);
    }
    // In front of the blob when a star is on the near side of its orbit
    // would be truer; over it always is what reads at this size.
    this.stars.setDepth(at.y + 2).setVisible(true);
  }

  destroy() {
    this.unsub();
    legible(this.scene).forget(this.prompt);
    this.prompt.destroy();
    this.stars.destroy();
    this.body.destroy();
    this.shadow.destroy();
  }
}
