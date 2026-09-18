import * as Phaser from "phaser";
import { SPRITE_KEY, FRAME_HEIGHT } from "../config/animations";
import { ensureAnims } from "../utils/sheets";
import { ChatBubble } from "./ChatBubble";
import { keepLegible, legible } from "../systems/legible";
import { MARK_ABOVE_HEAD, MIC_QUIET, MIC_SPEAKING, drawMic } from "../utils/voice-mark";
import type { PresencePlayer } from "@/lib/presence-types";

/**
 * Another human in the office.
 *
 * Positions arrive twenty times a second, which is choppy if applied directly,
 * so the sprite eases toward the last reported position instead of snapping to
 * it. Remote players carry no physics body: the server is the authority on
 * where they are, and colliding with a ghost of stale data feels worse than
 * walking through each other.
 */

/** Whether a texture has been cut into character frames, not just loaded. */
function sliced(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key) && scene.textures.get(key).frameTotal > 1;
}

/** How quickly the sprite closes the gap to its reported position. */
const INTERPOLATION_MS = 100;

/** Beyond this the player is treated as having warped — snap rather than glide. */
const SNAP_DISTANCE = 220;

export class RemotePlayer {
  readonly id: string;
  name: string;
  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  private facing: PresencePlayer["facing"] = "down";
  private moving = false;
  private currentAnim = "";
  /** "<sheet>:" when wearing something other than the default sheet. */
  private prefix = "";
  private bubble: ChatBubble;
  /**
   * The mic above the head: they are in Global Chat.
   *
   * It used to go up only while their voice was actually coming through,
   * which showed talking and never showed membership — a person standing
   * in the chat saying nothing was indistinguishable from one not in it,
   * and they are the person you would most like to know about, since they
   * can hear you. The mark is up for as long as their microphone is, and
   * the colour is what the talking moves.
   */
  private voiceMark: Phaser.GameObjects.Graphics | null = null;
  /** Their microphone is on, as the server's roster says. */
  private micOn = false;
  /**
   * Their voice is coming through *here*.
   *
   * Only ever known of somebody this browser holds a connection to, which
   * means our own microphone has to be on: the audio is what the level is
   * measured from. With it off, everyone in the chat is drawn grey — which
   * is honest, because nothing on this screen has heard them.
   */
  private speaking = false;
  /** Outdoors, where trees and people sort by their feet. */
  private sortByY: boolean;
  /** In the lift, or through a door: nothing of them is drawn. */
  private hidden = false;

  constructor(scene: Phaser.Scene, player: PresencePlayer, options: { sortByY?: boolean } = {}) {
    this.id = player.id;
    this.name = player.name;
    this.targetX = player.x;
    this.targetY = player.y;
    this.sortByY = options.sortByY ?? false;

    this.sprite = scene.add.sprite(player.x, player.y, SPRITE_KEY, 0);
    this.sprite.setDepth(5);
    this.wear(player.spriteKey);

    this.nameTag = scene.add
      .text(player.x, player.y + FRAME_HEIGHT / 2 + 2, player.name, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#ffe9a8",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 4, y: 2 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    // Hangs below the feet with its top on the anchor, so it grows downward
    // and away from the person it names whatever size it is drawn at.
    keepLegible(scene, this.nameTag);

    this.bubble = new ChatBubble(scene);
    this.applyAnimation(player.facing, false);
    this.settle();
    // Already in Global Chat, and already in the lift, when we walked in.
    this.setMic(player.mic === true);
    this.board(player.hidden === true);
  }

  /**
   * Out of sight, or back into it — the lift, or a door.
   *
   * The name tag goes with the sprite, and it is the half that matters: a
   * character standing in the lift doorway is odd, but their name floating
   * on the landing is what actually gives away somebody who is not there.
   *
   * They keep their place in the roster and their position goes on
   * arriving, so stepping back out is a frame rather than a new sprite —
   * and the animation is stopped rather than left running, for the same
   * reason `Player.board` stops it: they walked in, so the cycle would
   * otherwise be resumed mid-stride.
   */
  board(inside: boolean) {
    if (inside === this.hidden) return;
    this.hidden = inside;
    this.sprite.setVisible(!inside);
    this.nameTag.setVisible(!inside);
    this.voiceMark?.setVisible(!inside);
    if (inside) {
      this.sprite.anims.stop();
      this.bubble.hide();
      return;
    }
    // `applyAnimation` short-circuits on the key it last played, which is
    // the one that was stopped, so it has to be told to play again.
    this.currentAnim = "";
    this.applyAnimation(this.facing, this.moving);
  }

  /** They joined Global Chat, or left it. */
  setMic(on: boolean) {
    if (on === this.micOn) return;
    this.micOn = on;
    this.markVoice();
  }

  /** Their voice is coming through, or has stopped. */
  setSpeaking(speaking: boolean) {
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.markVoice();
  }

  /**
   * Put the mark up, take it down, or recolour it.
   *
   * Speaking counts as being in the chat in its own right: hearing somebody
   * is proof their microphone is on, and the roster frame that says so may
   * not have arrived yet. Without that, the first word of a new arrival is
   * spoken over a head with nothing on it.
   */
  private markVoice() {
    const wanted = this.micOn || this.speaking;
    if (!wanted) {
      if (!this.voiceMark) return;
      legible(this.sprite.scene).forget(this.voiceMark);
      this.voiceMark.destroy();
      this.voiceMark = null;
      return;
    }
    if (!this.voiceMark) {
      this.voiceMark = this.sprite.scene.add
        .graphics({ x: this.sprite.x, y: this.sprite.y - FRAME_HEIGHT / 2 + MARK_ABOVE_HEAD })
        .setDepth(21);
      this.voiceMark.setVisible(!this.hidden);
      keepLegible(this.sprite.scene, this.voiceMark);
      this.settle();
    }
    drawMic(this.voiceMark, this.speaking ? MIC_SPEAKING : MIC_QUIET);
  }

  /** Show what this person just said, above their head. */
  say(text: string, ttl = 6000) {
    // Nothing of them is on screen, so there is no head to put it over.
    if (this.hidden) return;
    this.bubble.show(text, this.sprite.x, this.sprite.y - FRAME_HEIGHT * 0.6, ttl);
  }

  /** Latest report from the server. */
  setTarget(player: PresencePlayer) {
    this.targetX = player.x;
    this.targetY = player.y;
    this.moving = player.moving;

    if (player.name !== this.name) {
      this.name = player.name;
      this.nameTag.setText(player.name);
    }
    this.wear(player.spriteKey);
    this.setMic(player.mic === true);

    this.applyAnimation(player.facing, player.moving);
    // Last, because `wear` and `applyAnimation` both start the cycle up.
    this.board(player.hidden === true);
  }

  update(deltaMs: number) {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;

    if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
      this.sprite.setPosition(this.targetX, this.targetY);
    } else {
      const t = Math.min(1, deltaMs / INTERPOLATION_MS);
      this.sprite.setPosition(this.sprite.x + dx * t, this.sprite.y + dy * t);
    }

    this.nameTag.setPosition(this.sprite.x, this.sprite.y + FRAME_HEIGHT / 2 + 2);
    this.voiceMark?.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT / 2 + MARK_ABOVE_HEAD);
    this.bubble.updatePosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * 0.6);
    this.settle();
  }

  /** Whoever's feet are lower stands in front, the way the props do. */
  private settle() {
    if (!this.sortByY) return;
    const feet = this.sprite.y + FRAME_HEIGHT / 2;
    this.sprite.setDepth(feet);
    this.nameTag.setDepth(feet + 1);
    this.voiceMark?.setDepth(feet + 2);
  }

  /**
   * Look like the sheet they chose, when this scene has it loaded. Library
   * sheets always are; a sheet this browser has never fetched falls back to
   * the default look rather than a blank.
   */
  private wear(spriteKey: string) {
    const scene = this.sprite.scene;
    // A sheet counts only once it has been cut into frames: between the
    // loader adding the texture and the frames being cut there is a moment
    // when it exists but has nothing to animate, and wearing it then would
    // fail half-way through, leaving a sprite nobody owns. The default look
    // fills in until the next roster.
    const key = spriteKey !== SPRITE_KEY && sliced(scene, spriteKey) ? spriteKey : SPRITE_KEY;
    const prefix = key === SPRITE_KEY ? "" : `${key}:`;
    if (prefix === this.prefix && this.sprite.texture.key === key) return;
    if (key !== SPRITE_KEY) ensureAnims(scene, key);
    this.prefix = prefix;
    this.currentAnim = "";
    this.sprite.setTexture(key, 0);
    this.applyAnimation(this.facing, this.moving);
  }

  private applyAnimation(facing: PresencePlayer["facing"], moving: boolean) {
    this.facing = facing;
    const key = `${this.prefix}${moving ? "walk" : "idle"}-${facing}`;
    if (key === this.currentAnim) return;
    const anim = this.sprite.scene.anims.get(key);
    if (!anim || anim.frames.length === 0) return;
    this.currentAnim = key;
    this.sprite.anims.play(key, true);
  }

  destroy() {
    const keeper = legible(this.sprite.scene);
    if (this.voiceMark) keeper.forget(this.voiceMark);
    keeper.forget(this.nameTag);
    this.voiceMark?.destroy();
    this.bubble.destroy();
    this.sprite.destroy();
    this.nameTag.destroy();
  }
}
