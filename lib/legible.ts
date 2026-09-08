/**
 * How much to blow up in-world lettering so it stays readable.
 *
 * A room is drawn at whatever zoom fits a lobby in the viewport, and on a
 * handset that is the zoom floor — half size. Everything the game letters
 * into the world is authored in whole pixels at that world scale, so a 10px
 * sign lands as five pixels of screen and a `Press E` prompt lands as seven.
 * They are not small at that point; they are gone.
 *
 * So text carries a scale of its own, against the camera's: at half zoom it
 * is drawn twice as large in the world and arrives on screen the size it was
 * written.
 *
 * **A floor, not a fixed size.** The obvious rule is `1 / zoom`, which holds
 * lettering at exactly one size on screen however far in or out the camera
 * stands. That is wrong here, because a room's zoom is fitted to a lobby —
 * 960x912, very nearly square — and a wide monitor therefore opens *zoomed
 * in*: 1.18 at 1920x1080. Today's signs are already magnified there, and a
 * true `1 / zoom` would shrink them. Nobody asked for smaller text.
 *
 * So the rule is "never smaller on screen than it was written": `1 / zoom`
 * where that is a magnification, and 1 everywhere else. A big monitor is
 * left exactly as it was, a laptop gains a little (1.14 at 1280x800, which
 * fits the lobby at 0.88), and a handset — pinned to the zoom floor by a
 * viewport nothing like that shape — doubles.
 *
 * Capped, because the scale is applied in the world and the world has other
 * things in it. `ZOOM_MIN` is 0.5, so 2 is the most this can ever ask for
 * anyway; the cap is here so that a change to the zoom floor cannot silently
 * put a sign across a room.
 *
 * Pure and free of Phaser, so the rule can be checked without a canvas —
 * `systems/legible.ts` is what applies it to the objects in a scene.
 */

/** The most any lettering may be blown up. See above for why there is a cap. */
export const LEGIBLE_MAX_SCALE = 2;

/**
 * The scale to draw in-world lettering at, given the camera's zoom.
 *
 * @param zoom the camera's current zoom
 * @returns 1 or more — never less, so this can only ever make text bigger
 */
export function legibleScale(zoom: number): number {
  // A zoom of zero, a negative, or a NaN is not a camera anybody is looking
  // through; leave the text alone rather than dividing by it.
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(LEGIBLE_MAX_SCALE, Math.max(1, 1 / zoom));
}
