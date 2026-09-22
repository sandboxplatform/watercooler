import * as Phaser from "phaser";
import { ink, MARKER_DARK, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The beacon standing in the near corner of a project room: incidents on
 * the server.
 *
 * The third thing on a project room's floor, and the only one of the three
 * that is not about the work. The barrier in the middle is work that has
 * stopped; the crates in the far corner are work that has gone out; this is
 * the server on fire, which is not a stage of the pipeline, will not wait
 * for one, and is the reason everything else in the room stops mattering
 * for the afternoon. A sixth bay on the wall would have read as a sixth
 * stage — and worse than it does for the other two, because an incident is
 * not somewhere work is standing at all.
 *
 * Where it stands is the other half of what it says. The crates are in the
 * far corner because being finished with is the whole fact about them, so
 * this is the near one: the corner you walk in past, two columns off its
 * own wall exactly as they are off theirs, so the pair reads as a pair from
 * the corridor. A red light by the door and a green stack in the far corner
 * is a room summed up before anybody has looked at the board.
 *
 * Red, and the HUD's own — the one colour in this room that is not on the
 * flow plate's scale at all. The plate runs cool to warm to green across
 * five stages and the barrier is the warm end of it stood on the floor;
 * this is off that scale on purpose, because it is off the pipeline.
 *
 * Nothing is up when nothing is burning, which is the rule both of the
 * others are under and here it is the whole point: a beacon that is always
 * lit is a light nobody looks at. There is no dash to draw either — a thing
 * either stands in a room or it does not.
 *
 * The plate over it, the timer under it and the beat when the figure moves
 * are `systems/FloorMarker`, which the other two are as well. What is
 * particular to this one is the lamp, and that the number on it is the
 * board's incidents.
 */

/** The HUD's own red, and the light behind the glass. */
const ALARM = 0xef4444;
const GLOW = 0xff9b9b;

/** Darker than the band above it, so the plinth reads as what it stands on. */
const PLINTH = 0x2a2a3e;

/**
 * The picture, measured up from the floor it stands on.
 *
 * Fifty-six tall under a forty-pixel plate, which is what the barrier and
 * the crates both stand: the three things on a project room's floor are the
 * same height on purpose, so none of them dwarfs the others from the
 * doorway and the eye reads them as one set of facts about one board.
 */
const PLINTH_W = 52;
const PLINTH_H = 12;

const BAND_W = 80;
const BAND_H = 14;

/** The fitting the dome is seated in, and the dome itself. */
const COLLAR_W = 50;
const COLLAR_H = 4;
const DOME_W = 44;
const DOME_H = 26;

const BAND_TOP = -(PLINTH_H + BAND_H);
const COLLAR_TOP = BAND_TOP - COLLAR_H;
const DOME_BASE = COLLAR_TOP;

const BODY = PLINTH_H + BAND_H + COLLAR_H + DOME_H;

/**
 * The light spilling out either side, as ticks rather than a glow.
 *
 * Three a side, each starting just clear of the dome at its own height and
 * the middle one longest — a burst rather than a fringe. A dome drawn
 * without them is a red thing standing in the corner; with them it is a red
 * thing that is **on**, which is the whole difference between a machine and
 * an alarm.
 *
 * Measured up from the dome's base, so they stay clear of the plate by the
 * whole top of the dome and nothing is ever drawn into it.
 */
const RAYS = [
  { up: 7, len: 10, h: 3 },
  { up: 14, len: 14, h: 4 },
  { up: 21, len: 8, h: 3 },
] as const;

/** Stencilled across the band, where the barrier carries its own word. */
const WORD = "INCIDENT";

export const INCIDENT: FloorMarkerSpec = {
  ink: ALARM,
  body: BODY,
  count: (flow) => flow.incidents,
  build(scene, into) {
    // The plinth, darker than everything above it so the red is only ever
    // the lamp — the crates' pallet is the same argument.
    into.add(scene.add.rectangle(0, -PLINTH_H, PLINTH_W, PLINTH_H, PLINTH).setOrigin(0.5, 0));

    // The band, with the word across it.
    const band = scene.add.rectangle(0, BAND_TOP, BAND_W, BAND_H, MARKER_DARK).setOrigin(0.5, 0);
    band.setStrokeStyle(2, MARKER_EDGE);
    into.add(band);
    into.add(
      scene.add
        .text(0, BAND_TOP + BAND_H / 2, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: ink(ALARM),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    // The collar the dome is seated in: without it the glass sits straight
    // on the sign, which reads as a red shape painted on a box rather than
    // as a lamp fitted to one.
    into.add(scene.add.rectangle(0, COLLAR_TOP, COLLAR_W, COLLAR_H, MARKER_EDGE).setOrigin(0.5, 0));

    // The rays first, so the dome is drawn over the inner end of each one
    // and the light reads as coming out of the glass rather than as bars
    // parked beside it.
    for (const side of [-1, 1]) {
      for (const ray of RAYS) {
        const from = domeHalf(ray.up) + 2;
        into.add(
          scene.add
            .rectangle(side * from, DOME_BASE - ray.up, ray.len, ray.h, ALARM)
            .setOrigin(side < 0 ? 1 : 0, 0.5),
        );
      }
    }

    into.add(dome(scene));
  },
};

/**
 * How wide the dome is at a given height above its base, in pixels either
 * side of the middle.
 *
 * A half-ellipse: flat on the collar and rounded over, which is the shape
 * of every beacon glass there has ever been. Rounded to whole pixels,
 * because that is what makes the edge a staircase rather than a blur — the
 * arithmetic the barrier's stripes are drawn with, for its reason.
 */
function domeHalf(up: number): number {
  const t = Math.min(1, up / DOME_H);
  return Math.round((DOME_W / 2) * Math.sqrt(1 - t * t));
}

/**
 * The dome, a pixel row at a time.
 *
 * Rows rather than one ellipse object, because Phaser's ellipse is drawn
 * smooth and everything else in this room is drawn in whole pixels — an
 * antialiased curve beside the barrier's staircased stripes is the one
 * thing on this floor that would not look like it belongs there.
 *
 * Lit from inside: the alarm red is the glass and the lighter red is what
 * is behind it, a smaller dome standing a few pixels off the collar so a
 * rim of glass is left all the way round. Drawn once and left alone — the
 * beat when the figure moves is the plate's, not the lamp's, for the reason
 * `CountBoard` gives: a thing that pulses while you watch it reads as a
 * fault in the app rather than as news about the board.
 */
function dome(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(ALARM, 1);
  for (let up = 0; up < DOME_H; up++) {
    const half = domeHalf(up + 0.5);
    if (half > 0) g.fillRect(-half, DOME_BASE - up - 1, half * 2, 1);
  }
  const lit = 4;
  g.fillStyle(GLOW, 1);
  for (let up = 0; up < DOME_H / 2; up++) {
    const t = Math.min(1, up / (DOME_H / 2));
    const half = Math.round((DOME_W / 4) * Math.sqrt(1 - t * t));
    if (half > 0) g.fillRect(-half, DOME_BASE - lit - up - 1, half * 2, 1);
  }
  return g;
}
