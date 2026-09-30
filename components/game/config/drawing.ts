import * as Phaser from "phaser";
import { PRESS_E_STYLE } from "@/lib/constants";

/**
 * The few things every drawing in the game layer agrees on, written once.
 *
 * Each of these was a literal repeated file by file — the font in two dozen
 * places, the prompts' depth in five, the plates' dark in six — and a value
 * repeated is a value that one day disagrees with itself.
 */

/** The pixel font every painted and plated figure is lettered in. */
export const PIXEL_FONT = '"Press Start 2P", monospace';

/**
 * The depth for what floats over everything: prompts, shouts, meters.
 *
 * A flat number, and a big one, because the two kinds of place stack things
 * differently — a room puts its people at one depth and out of doors
 * everyone sorts by their feet, which runs to thousands.
 */
export const OVER_EVERYTHING = 10_000;

/** The HUD's own dark, which every plate and pedestal on a floor is drawn in. */
export const PANEL_DARK = 0x2a2a3e;

/**
 * How big a square of the map the culling files things by, out of doors.
 *
 * About a camera's width at an ordinary zoom: small enough that a view of
 * the plaza leaves most of the map hidden, big enough that walking crosses
 * a boundary every few seconds rather than every few steps.
 */
export const CULL_CHUNK_PX = 768;

/**
 * The largest size at which a string fits the room it has.
 *
 * Press Start 2P is monospace and advances by its own size, so the width is
 * the character count times the size — no measuring needed, and a three
 * digit count shrinks rather than running over the bay next to it.
 */
export function fitFontSize(text: string, room: number, sizes: readonly number[]): number {
  return sizes.find((size) => text.length * size <= room) ?? sizes[sizes.length - 1];
}

/**
 * A floating `Press E` — or anything lettered like one — hidden until wanted.
 *
 * Drawn at twice the screen's density and filtered smoothly, so it stays
 * sharp however far the camera zooms; hung from its bottom edge, so it
 * grows upward away from what it is about. The caller moves it, shows it
 * and — where it floats over the world — keeps it legible.
 */
export function pressPrompt(
  scene: Phaser.Scene,
  text: string,
  options: { depth?: number; style?: Phaser.Types.GameObjects.Text.TextStyle } = {},
): Phaser.GameObjects.Text {
  const prompt = scene.add
    .text(0, 0, text, {
      ...(PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle),
      ...options.style,
    })
    .setResolution(window.devicePixelRatio * 2)
    .setOrigin(0.5, 1)
    .setDepth(options.depth ?? OVER_EVERYTHING)
    .setVisible(false);
  prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return prompt;
}
