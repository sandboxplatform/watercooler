import { ink, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The crates stacked in the far corner of a project room: work that has
 * shipped.
 *
 * The roadblock's opposite number, and it exists for the same reason. The
 * five bays on the wall are the stages work is spread over, so they can
 * say where the work in flight is standing and nothing at all about the
 * work that has left — a board that shipped nine things this month and one
 * that shipped none draw the same five bars. A sixth bay would have read
 * as a sixth stage, which is exactly what it is not: these cards are not
 * standing anywhere any more.
 *
 * So it is a thing in the room instead, and where it stands is half of
 * what it says. The barrier is in the middle of the floor because being in
 * the way is the whole fact about it; the crates are in the corner
 * furthest from the board because being finished with is the whole fact
 * about them. Walking the corridor past three rooms says which of them is
 * stuck and which is shipping without going into either.
 *
 * Green because the last bay of the flow plate is green: the end of the
 * pipeline is lit the same colour on the wall and on the floor, so the
 * crates read as what happens after the right-hand bay rather than as a
 * separate piece of news.
 *
 * Nothing is up when nothing has gone out, which is the rule the barrier
 * is under and for the same reason — an empty pallet reading 0 is a thing
 * somebody has to walk over to find out there is nothing on it. A board
 * with no such list and a board with an empty one are therefore the same
 * bare corner, and unlike a bay on the wall there is no dash to draw: a
 * thing either stands in a room or it does not, and either way this room
 * has shipped nothing you can see.
 *
 * Drawn rather than delivered as art for the reason the barrier is: the
 * figure on it is live, and a picture with a number baked into it is a
 * second, wrong copy of the number. The plate over it, the timer under it
 * and the beat when the figure moves are `systems/FloorMarker`.
 */

/** The green the flow plate lights its last bay in. */
const SHIPPED = 0x4bce97;

/**
 * The crates are filled a shade lighter than the plate over them, and the
 * pallet a shade darker than the crates.
 *
 * Not decoration: the plate is the HUD's own dark with a green edge, and a
 * crate drawn the same way sat directly under it read as the plate's own
 * pedestal — one tall sign on a post rather than a sign standing on a
 * stack of something. Three tones, lightest in the middle, is what makes
 * the stack a stack from across the room.
 */
const CRATE = MARKER_EDGE;
const PALLET = 0x2a2a3e;

/**
 * The picture, measured up from the floor it stands on.
 *
 * Fifty-six tall under a forty-pixel plate, which is exactly what the
 * barrier stands: the two things on a project room's floor are the same
 * height on purpose, so neither dwarfs the other from the doorway.
 */
const PALLET_H = 12;
const DECK_H = 5;
const FOOT_W = 14;
const FOOT_X = 32;

const LOW_W = 88;
const LOW_H = 26;
const HIGH_W = 62;
const HIGH_H = 18;
const LID_H = 3;
const STRAP_W = 4;
const STRAP_X = 16;

const LOW_TOP = -(PALLET_H + LOW_H);
const HIGH_TOP = LOW_TOP - HIGH_H;

const BODY = PALLET_H + LOW_H + HIGH_H;

/** Stencilled on the side of the lower crate, where a crate carries one. */
const WORD = "DEPLOYED";

export const DEPLOYED: FloorMarkerSpec = {
  ink: SHIPPED,
  body: BODY,
  count: (flow) => flow.deployed,
  /**
   * A running total rather than a handful, so one size further down than
   * the barrier's: a board that has shipped a hundred and thirty things is
   * ordinary, where a hundred and thirty roadblocks is a board nobody is
   * using.
   */
  sizes: [22, 17, 13, 10],
  build(scene, into) {
    // The pallet: a deck with three feet under it, darker than the crates
    // it carries, so what is underneath reads as furniture and the green is
    // only ever the crates.
    into.add(scene.add.rectangle(0, -PALLET_H, LOW_W, DECK_H, PALLET).setOrigin(0.5, 0));
    for (const x of [-FOOT_X, 0, FOOT_X]) {
      into.add(
        scene.add
          .rectangle(x, -(PALLET_H - DECK_H), FOOT_W, PALLET_H - DECK_H, PALLET)
          .setOrigin(0.5, 0),
      );
    }

    // The lower crate, with the word stencilled across it.
    const low = scene.add.rectangle(0, LOW_TOP, LOW_W, LOW_H, CRATE).setOrigin(0.5, 0);
    low.setStrokeStyle(2, SHIPPED);
    into.add(low);
    // The lid, which is what makes a box a crate at this size.
    into.add(scene.add.rectangle(0, LOW_TOP, LOW_W, LID_H, SHIPPED).setOrigin(0.5, 0));
    into.add(
      scene.add
        .text(0, LOW_TOP + LOW_H / 2, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: ink(SHIPPED),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    // The upper crate, narrower and strapped: two crates rather than one
    // tall box is what makes it a stack, and the straps are what make it a
    // crate rather than a screen standing on a pallet.
    const high = scene.add.rectangle(0, HIGH_TOP, HIGH_W, HIGH_H, CRATE).setOrigin(0.5, 0);
    high.setStrokeStyle(2, SHIPPED);
    into.add(high);
    for (const x of [-STRAP_X, STRAP_X]) {
      into.add(scene.add.rectangle(x, HIGH_TOP, STRAP_W, HIGH_H, SHIPPED).setOrigin(0.5, 0));
    }
  },
};
