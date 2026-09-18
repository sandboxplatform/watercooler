import * as Phaser from "phaser";

/**
 * The mic over somebody's head: they are in Global Chat.
 *
 * Up for as long as their microphone is on rather than only while they are
 * talking, because being in the chat is the fact worth showing over a head —
 * somebody standing there silently can still hear you, and a mark that only
 * appears mid-sentence never says who is listening.
 *
 * **Drawn rather than lettered.** It was a 🔊, and an emoji's colour belongs
 * to the font rather than to us: there is no tinting one from grey to green.
 * Eight pixels by twelve of rectangles is the same picture, crisp at any
 * zoom, and its colour is the one thing about it that has to change.
 */

/** In the chat, saying nothing. */
export const MIC_QUIET = 0x9aa0a6;

/** Their voice is coming through. The green the HUD's own pill goes. */
export const MIC_SPEAKING = 0x4ade80;

/** How far the glyph reaches above its anchor, before the legible scale. */
export const MIC_HEIGHT = 14;

/**
 * Where the mark hangs, measured down from the top of a character's frame.
 *
 * The frame is 96 tall and the figure in it is drawn from row 28 — so
 * anchoring to the top of the frame leaves the mark floating a good half a
 * body above the hair, with a gap nothing in the picture explains. The
 * tallest heads in the cast start at about row 21, which is what this
 * clears; the shorter ones get a little more air, which is the right way
 * round for a mark that must never sit *on* somebody.
 *
 * Shared by the local character and everybody else, because two people
 * standing side by side with their marks at different heights is exactly
 * the sort of thing nobody sees until it ships.
 */
export const MARK_ABOVE_HEAD = 20;

/**
 * Draw the mic into `g`, in `colour`, growing upward from the object's own
 * position — so the anchor is the bottom of the mark and a rescale keeps it
 * clear of the head it hangs over.
 */
export function drawMic(g: Phaser.GameObjects.Graphics, colour: number) {
  g.clear();
  // The same black plate the name tags sit on, so the mark reads over a pale
  // floor as well as a dark one.
  g.fillStyle(0x000000, 0.65);
  g.fillRoundedRect(-6, -MIC_HEIGHT, 12, MIC_HEIGHT + 1, 2);
  g.fillStyle(colour, 1);
  // Head, cradle, stem, base.
  g.fillRoundedRect(-2, -12, 4, 7, 2);
  g.fillRect(-4, -8, 1, 4);
  g.fillRect(3, -8, 1, 4);
  g.fillRect(-4, -4, 8, 1);
  g.fillRect(-1, -3, 2, 2);
  g.fillRect(-3, -1, 6, 1);
}
