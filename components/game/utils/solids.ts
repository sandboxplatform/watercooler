import * as Phaser from "phaser";

/**
 * The size of the stand-in a wall used to be made from: a sprite with no
 * texture, which Phaser draws as its 32px default. The body is sized from it
 * and then resized to the rectangle, and doing the same here keeps every
 * body exactly where it was — to the half pixel an odd width rounds by.
 */
const STAND_IN = 32;

/**
 * An invisible wall the size of a rectangle.
 *
 * A zone rather than a sprite, and kept off the display list and the update
 * list. It used to be `walls.create`, which makes a sprite and puts it on
 * both: the world map has two and a half thousand solids, so that was two
 * and a half thousand things sorted with every depth change and run through
 * `preUpdate` every frame, to draw nothing. The body is the same static body
 * in the same group, so the collider and the tree it searches are untouched.
 */
export function addSolid(
  walls: Phaser.Physics.Arcade.StaticGroup,
  r: { x: number; y: number; width: number; height: number },
) {
  const zone = new Phaser.GameObjects.Zone(
    walls.scene,
    r.x + r.width / 2,
    r.y + r.height / 2,
    STAND_IN,
    STAND_IN,
  );
  walls.add(zone);
  (zone.body as Phaser.Physics.Arcade.StaticBody).setSize(r.width, r.height);
}
