import * as Phaser from "phaser";
import { keepLegible } from "../systems/legible";

/**
 * The labels hung around a room: over a door, on a wall, above a fixture.
 *
 * Lifted out of `OfficeScene` so `systems/FixtureManager` can hang a
 * fixture's sign without reaching back into the scene for a private method.
 * The scene still calls it for doors, wall names and the help desk counter.
 *
 * A sign is a **container**, not two loose objects, and that is what lets it
 * grow when the camera stands well back: `systems/legible` scales it as one
 * thing, so the chip and the arrow bouncing over it keep their spacing. Two
 * objects each scaled about their own anchor would have the arrow drift into
 * the lettering at every zoom but the one they were laid out at.
 */

/** Text and arrow sit at this depth: over the props, under the prompts. */
const SIGN_DEPTH = 12;

/**
 * `edge` is the top of whatever is being labelled. "above" hangs the sign
 * over it with the arrow pointing down at it; "below" puts the sign under
 * it, which only the lobby's help desk counter wants — above its art is
 * where whoever works the counter stands, and above them is the whiteboard,
 * so a sign up there labels the wrong thing twice.
 */
export function addSign(
  scene: Phaser.Scene,
  at: { x: number; y: number },
  label: string,
  edge: number,
  side: "above" | "below" = "above",
) {
  // The container sits on the labelled thing and everything hangs off it, so
  // the offsets below are the layout at scale 1 and the scale does the rest.
  const sign = scene.add.container(at.x, edge).setDepth(SIGN_DEPTH);
  const textY = side === "above" ? -8 : 0;
  const arrowY = side === "above" ? -36 : -30;

  const text = scene.add
    .text(0, textY, label, {
      fontFamily: '"ArkPixel", "Press Start 2P", monospace',
      fontSize: "10px",
      color: "#ffe9a8",
      backgroundColor: "rgba(27,27,42,0.85)",
      padding: { x: 6, y: 3 },
    })
    .setOrigin(0.5, 1)
    .setResolution(2);
  sign.add(text);

  if (scene.textures.exists("boss-arrow")) {
    if (!scene.anims.exists("boss-arrow-bounce")) {
      scene.anims.create({
        key: "boss-arrow-bounce",
        frames: scene.anims.generateFrameNumbers("boss-arrow", { start: 0, end: 5 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    sign.add(scene.add.sprite(0, arrowY, "boss-arrow", 0).play("boss-arrow-bounce"));
  }

  keepLegible(scene, sign);
  return sign;
}
