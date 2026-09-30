import * as Phaser from "phaser";
import { dialogOpen } from "@/lib/gamepad/dialogs";
import type { Player } from "../entities/Player";
import type { GamepadInput } from "./GamepadInput";
import { isTap } from "./TapNavigator";

/**
 * What a room and a place out of doors both do to walk the character about:
 * where their feet are, what the pad is asking for, and telling a tap on the
 * ground from a drag of the camera. Each scene had its own copy of all three.
 */

/** Standing still, handed out rather than a fresh zero every frame. */
const STILL = Object.freeze({ vx: 0, vy: 0 });

/**
 * Where the character actually stands, written into `out` and handed back.
 *
 * The sprite is a whole person tall and its middle is around their chest;
 * the physics body is a small box at their feet, a good two-thirds of a
 * tile lower. Routes are walked by the body, so they have to be planned and
 * steered from it — measuring from the sprite instead puts the feet below
 * the path, and in a tight spot that means walking into the wall.
 *
 * One point per scene, filled in again each time it is asked, since this is
 * asked several times a frame; read it and let it go.
 */
export function feetOf(player: Player, out: { x: number; y: number }): { x: number; y: number } {
  const body = player.sprite.body as Phaser.Physics.Arcade.Body;
  out.x = body.center.x;
  out.y = body.center.y;
  return out;
}

/** The pad's push on the character; nothing while a dialog has the screen. */
export function padVelocity(player: Player, gamepad: GamepadInput): { vx: number; vy: number } {
  return dialogOpen() ? STILL : gamepad.velocity(player.speed);
}

/**
 * Call `walk` with the world point of every tap on the scene.
 *
 * A tap has to be told apart from dragging the camera, which uses the same
 * pointer: anything that wandered or was held is a drag. And a pinch is two
 * fingers Phaser reports as ordinary pointers, one of which barely moves —
 * which is a tap, and would send the character walking off while somebody
 * is only trying to look closer.
 */
export function onTap(
  scene: Phaser.Scene,
  pinching: () => boolean,
  walk: (world: { x: number; y: number }) => void,
  onDown?: () => void,
) {
  let down: { x: number; y: number; at: number } | null = null;
  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    down = { x: pointer.x, y: pointer.y, at: pointer.downTime };
    onDown?.();
  });
  scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
    const start = down;
    down = null;
    if (!start || pinching()) return;
    if (!isTap(start, { x: pointer.x, y: pointer.y, at: pointer.upTime })) return;
    const world = pointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
    walk({ x: world.x, y: world.y });
  });
}
