import * as Phaser from "phaser";

/**
 * The labels hung around a room: over a door, on a wall, above a fixture.
 *
 * Lifted out of `OfficeScene` so `systems/FixtureManager` can hang a
 * fixture's sign without reaching back into the scene for a private method.
 * The scene still calls it for doors, wall names and the help desk counter.
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
  const textY = side === "above" ? edge - 8 : edge;
  const arrowY = side === "above" ? edge - 36 : edge - 30;
  scene.add
    .text(at.x, textY, label, {
      fontFamily: '"ArkPixel", "Press Start 2P", monospace',
      fontSize: "10px",
      color: "#ffe9a8",
      backgroundColor: "rgba(27,27,42,0.85)",
      padding: { x: 6, y: 3 },
    })
    .setOrigin(0.5, 1)
    .setDepth(SIGN_DEPTH)
    .setResolution(2);
  if (!scene.textures.exists("boss-arrow")) return;
  if (!scene.anims.exists("boss-arrow-bounce")) {
    scene.anims.create({
      key: "boss-arrow-bounce",
      frames: scene.anims.generateFrameNumbers("boss-arrow", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
  }
  scene.add.sprite(at.x, arrowY, "boss-arrow", 0).setDepth(SIGN_DEPTH).play("boss-arrow-bounce");
}
