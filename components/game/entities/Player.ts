import * as Phaser from "phaser";
import {
  SPRITE_KEY,
  MOVE_SPEED,
  SPRINT_SPEED,
  ALL_ANIMS,
  FRAME_WIDTH,
  FRAME_HEIGHT,
} from "../config/animations";
import { ensureAnims } from "../utils/sheets";
import { ChatBubble } from "./ChatBubble";
import { facingFor } from "@/lib/facing";
import { dialogOpen, typingInAField } from "@/lib/gamepad/dialogs";
import { togglesSprint } from "@/lib/sprint";

type Direction = "down" | "up" | "left" | "right";

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Direction;
  private bubble: ChatBubble | null = null;
  /**
   * Prefix for this player's animation keys.
   *
   * The library characters were built before generated ones existed and use
   * bare keys ("idle-down"); every other sheet namespaces its own ("ada:idle-
   * down") so two characters on the same screen cannot share an animation.
   * Empty means the original, unprefixed set.
   */
  private animPrefix = "";
  /**
   * Sprinting rather than walking.
   *
   * A mode, not a held key: left Shift switches between the two and it stays
   * where it was put, so crossing the world map does not mean holding a key
   * for twenty seconds. It survives a scene change only as far as the Player
   * does — walking through a door builds a new one, which starts off walking.
   */
  private sprinting = false;

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Direction = "left") {
    this.facing = facing;
    this.createAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, SPRITE_KEY, 0);
    this.sprite.setDepth(5);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(FRAME_WIDTH * 0.5, FRAME_HEIGHT * 0.2);
    body.setOffset(FRAME_WIDTH * 0.25, FRAME_HEIGHT * 0.75);

    const kb = scene.input.keyboard;
    if (!kb) throw new Error("Keyboard plugin not available");
    this.cursors = kb.createCursorKeys();
    kb.clearCaptures();
    this.wasd = kb.addKeys(
      {
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
      },
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    // Phaser's keyboard is attached to the window, so this fires wherever the
    // focus is; see lib/sprint.ts for which presses count.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!togglesSprint(event, typingInAField() || dialogOpen())) return;
      this.sprinting = !this.sprinting;
    };
    kb.on("keydown", onKeyDown);
    // Dropped when the scene goes, or a walk through a door would leave the
    // old scene's listener behind and every character built since would
    // toggle together. React's development double-mount makes two of these
    // on the first load, which is how the pile-up showed itself.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off("keydown", onKeyDown));

    this.sprite.anims.play(this.animKey("idle"));
    this.bubble = new ChatBubble(scene);
  }

  /**
   * How fast this character travels now.
   *
   * Read by whatever is driving them — the keys, the pad, a tapped route —
   * so every way of moving obeys the toggle and none of them has to know
   * about it.
   */
  get speed(): number {
    return this.sprinting ? SPRINT_SPEED : MOVE_SPEED;
  }

  /** Whether the toggle is on, for anything that wants to show it. */
  get isSprinting(): boolean {
    return this.sprinting;
  }

  private animKey(prefix: "idle" | "walk"): string {
    return this.animPrefix
      ? `${this.animPrefix}:${prefix}-${this.facing}`
      : `${prefix}-${this.facing}`;
  }

  /**
   * Wear a different sprite sheet.
   *
   * The texture must already be loaded. Animations are created on first use
   * for that sheet and then reused, so switching back and forth costs nothing.
   */
  wearSprite(scene: Phaser.Scene, spriteKey: string) {
    if (!scene.textures.exists(spriteKey)) return;

    ensureAnims(scene, spriteKey);

    this.animPrefix = spriteKey;
    this.sprite.setTexture(spriteKey, 0);
    this.sprite.anims.play(this.animKey("idle"));
  }

  /** Show what this player just said, above their own head. */
  say(text: string, ttl = 6000) {
    this.bubble?.show(text, this.sprite.x, this.sprite.y - FRAME_HEIGHT * 0.6, ttl);
  }

  private createAnimations(scene: Phaser.Scene) {
    if (scene.anims.exists("idle-down")) return;

    for (const anim of ALL_ANIMS) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: SPRITE_KEY, frame: i });
      }
      scene.anims.create({
        key: anim.key,
        frames,
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  /** Current facing, for reporting this character's pose to other players. */
  get direction(): Direction {
    return this.facing;
  }

  isMoving(): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return body.velocity.x !== 0 || body.velocity.y !== 0;
  }

  /**
   * True while the player is working the keys themselves.
   *
   * Anything walking the character somewhere — a tap on the floor — gives way
   * to this: taking hold of the keys means taking over.
   */
  hasKeyboardInput(): boolean {
    return (
      this.cursors.left.isDown ||
      this.cursors.right.isDown ||
      this.cursors.up.isDown ||
      this.cursors.down.isDown ||
      this.wasd.A.isDown ||
      this.wasd.D.isDown ||
      this.wasd.W.isDown ||
      this.wasd.S.isDown
    );
  }

  /**
   * @param padVelocity movement from a connected gamepad; used when the
   * keyboard is idle, so either input can drive the player at any time.
   */
  /** What the keys, or failing them the pad, are asking for. */
  inputVelocity(padVelocity?: { vx: number; vy: number }): { vx: number; vy: number } {
    const speed = this.speed;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const factor = Math.SQRT1_2;
      vx *= factor;
      vy *= factor;
    }

    if (vx === 0 && vy === 0 && padVelocity) {
      vx = padVelocity.vx;
      vy = padVelocity.vy;
    }
    return { vx, vy };
  }

  update(padVelocity?: { vx: number; vy: number }) {
    const { vx, vy } = this.inputVelocity(padVelocity);
    this.move(vx, vy);
  }

  /** Walk at exactly this velocity, whatever the keys say — for scripted steps. */
  drive(velocity: { vx: number; vy: number }) {
    this.move(velocity.vx, velocity.vy);
  }

  private move(vx: number, vy: number) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);

    const moving = vx !== 0 || vy !== 0;

    if (moving) {
      // Whichever axis they are doing more of; an exact diagonal goes
      // sideways. Standing still leaves the facing as it was, so stopping
      // shows the way they were last walking. See lib/facing.ts.
      this.facing = facingFor(vx, vy) ?? this.facing;

      const walkKey = this.animKey("walk");
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey);
      }
      // Legs to match the ground. Taken from the velocity rather than from
      // the sprint toggle, so it is right for every way of moving: a pad's
      // half-pushed stick, a tapped route, and the scripted walk out of a
      // doorway, which goes at walking pace whatever the toggle says. Left
      // at 1 a sprinter slides along as if on ice.
      this.sprite.anims.timeScale = Math.max(0.5, Math.hypot(vx, vy) / MOVE_SPEED);
    } else {
      const idleKey = this.animKey("idle");
      this.sprite.anims.timeScale = 1;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey);
      }
    }
  }
}
