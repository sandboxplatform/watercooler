import * as Phaser from "phaser";
import { ink, MARKER_DARK, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The roadblock standing on a project room's floor.
 *
 * Work that has stopped is the one thing about a board that nobody is
 * looking for and everybody needs to know. The five counts on the wall
 * cannot say it: they are the stages work is spread over, and a card that
 * is stuck is still standing in one of them — so a roadblocked board and
 * a healthy one draw the same five bars. A sixth bay would have read as
 * more of the same.
 *
 * So it is not on the wall at all. It is a striped barrier standing in
 * the middle of the room, with the number of stuck cards on a plate over
 * it: walking the corridor past three rooms says which of them is in
 * trouble without going in, and standing in the room you cannot look at
 * the board without it in shot.
 *
 * Nothing is up when nothing is stuck. A barrier reading 0 is a barrier
 * somebody has to walk round to find out there is nothing wrong, which is
 * the opposite of the point.
 *
 * It is drawn rather than delivered as art for the reason `CountBoard` is:
 * the figure on it is live, and a picture with a number baked into it is a
 * second, wrong copy of the number.
 *
 * The plate over it, the timer under it and the beat when the figure moves
 * are `systems/FloorMarker`, which the crates in the corner of the same
 * room are also. What is particular to this one is the barrier, and that
 * the number on it is the board's roadblocks.
 */

/** Hazard orange, and the leg grey to stripe it against. */
const HAZARD = 0xfaa53d;
const LEG = MARKER_EDGE;

/** The picture, measured up from the floor it stands on. */
const WIDTH = 96;
const LEG_W = 7;
const LEG_H = 22;
const LEG_X = 34;
const BAND_H = 14;
const PLANK_H = 20;

const BAND_TOP = -(LEG_H + BAND_H);
const PLANK_TOP = BAND_TOP - PLANK_H;

/** How tall the barrier stands: the plate sits on top of this. */
const BODY = LEG_H + BAND_H + PLANK_H;

/** A stripe and its gap, in pixels, at forty-five degrees. */
const STRIPE = 12;

/** The word under the plank. */
const WORD = "ROADBLOCK";

export const ROADBLOCK: FloorMarkerSpec = {
  ink: HAZARD,
  body: BODY,
  count: (flow) => flow.blocked,
  build(scene, into) {
    for (const side of [-1, 1]) {
      into.add(scene.add.rectangle(side * LEG_X, -LEG_H, LEG_W, LEG_H, LEG).setOrigin(0.5, 0));
    }

    const band = scene.add.rectangle(0, BAND_TOP, WIDTH, BAND_H, MARKER_DARK).setOrigin(0.5, 0);
    band.setStrokeStyle(2, LEG);
    into.add(band);
    into.add(
      scene.add
        .text(0, BAND_TOP + BAND_H / 2, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: ink(HAZARD),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    into.add(plank(scene));
  },
};

/**
 * The striped plank, a pixel row at a time.
 *
 * A row at a time because the stripes are at forty-five degrees and a
 * parallelogram would hang off both ends of the plank: every row is its
 * own set of runs, clamped to the plank, which is both the clipping and
 * the staircase a diagonal is in pixel art. Drawn once and left alone.
 */
function plank(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const left = -WIDTH / 2;
  g.fillStyle(MARKER_DARK, 1);
  g.fillRect(left, PLANK_TOP, WIDTH, PLANK_H);
  g.fillStyle(HAZARD, 1);
  for (let row = 0; row < PLANK_H; row++) {
    // Orange where (x + y) falls in the first half of a period, which is
    // what makes the stripes lean the same way all the way down.
    for (let start = -(row % STRIPE); start < WIDTH; start += STRIPE) {
      const from = Math.max(0, start);
      const to = Math.min(WIDTH, start + STRIPE / 2);
      if (to > from) g.fillRect(left + from, PLANK_TOP + row, to - from, 1);
    }
  }
  g.lineStyle(2, LEG, 1);
  g.strokeRect(left, PLANK_TOP, WIDTH, PLANK_H);
  return g;
}
