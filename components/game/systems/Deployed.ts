import { ink, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The crates stacked in the far corner of a project room: work that has
 * shipped.
 *
 * The roadblock's opposite number, and it exists for the same reason. The
 * bays on the wall are the stages work is spread over, so they can say
 * where the work in flight is standing and nothing at all about the work
 * that has left — a board that shipped nine things this month and one that
 * shipped none draw the same bars. Another bay would have read as another
 * stage, which is exactly what this is not: these cards are not standing
 * anywhere any more.
 *
 * So it is a thing in the room instead, and where it stands is half of
 * what it says: the far end of the line, which is the end of the pipeline
 * at the end of the row. It stood in the far corner of the floor before
 * there was a line to stand at the end of — diagonally across from the
 * board it came off, which said "out of the way" and nothing else, where
 * the end of a line says what it is the end *of*.
 *
 * **Green, and off the flow plate's scale altogether** — `FLOW_COLOURS`
 * ends in Testing's yellow, so this green is on none of the lanes. It has
 * been green before, borrowed from the plate's last bay while the scale
 * ended there; then Testing came off the wall to stand on this line and
 * owned that green — a lane's colour is assigned by position and the panel
 * behind the plate prints it, so a station and its own lane answering
 * differently would be the same board read twice — and the crates went
 * brass to stay out of its way. Testing is yellow now, its lane with it,
 * so green is nobody's lane and the crates have it back without being
 * painted in a stage's colour.
 *
 * That keeps the rule `systems/Incident` wrote: the station off the
 * pipeline is lit in a colour none of the lanes use, and a despatch is off
 * the pipeline by the identical argument. Green rather than anything else
 * because it is what done is everywhere else in the HUD — a finished
 * card's due date, the shipped line in the panel's legend — and it is not
 * the beacon's red, so it is not a second alarm. If green ever goes back
 * onto the scale, it is these that move again, not the lane.
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

/** Green: done, and on none of the flow plate's scale. */
const SHIPPED = 0x4bce97;

/**
 * The crates are filled a shade lighter than the plate over them, and the
 * pallet a shade darker than the crates.
 *
 * Not decoration: the plate is the HUD's own dark with a coloured edge,
 * and a crate drawn the same way sat directly under it read as the plate's
 * own pedestal — one tall sign on a post rather than a sign standing on a
 * stack of something. Three tones, lightest in the middle, is what makes
 * the stack a stack from across the room.
 */
const CRATE = MARKER_EDGE;
const PALLET = 0x2a2a3e;

/**
 * The picture, measured up from the floor it stands on.
 *
 * Fifty-six tall under a forty-pixel plate, which is exactly what the
 * other four things on the line stand: they are the same height on purpose,
 * so none of them dwarfs its neighbours and the row reads as one line
 * rather than as five objects that happen to share a floor.
 */
const PALLET_H = 12;
const DECK_H = 5;
const FOOT_W = 14;
const FOOT_X = 32;

/**
 * The lower crate is as wide as the barrier along the row is, and the word
 * on it is why.
 *
 * It was 88, which held DEPLOYED at eight characters with room to spare.
 * PRODUCTION is ten of them — eighty pixels of an eight-pixel font — and
 * inside 88 with a two-pixel frame that leaves three clear pixels either
 * side, which reads as a word jammed into a box rather than stencilled on
 * one. Ninety-six is two tiles, which is what the barrier and the
 * refined rack stand as well: the line alternates 96, 104, 96, 104, 96,
 * so that every seam along it closes to nothing. Its neighbour is the
 * testing rig now rather than the barrier, and the four pixels these two
 * used to sit apart have gone with the change. Draw this one past
 * ninety-six and `LINE_STEP` has to follow it, since the rig beside it is
 * a hundred and four.
 */
const LOW_W = 96;
const LOW_H = 26;
const HIGH_W = 62;
const HIGH_H = 18;
const LID_H = 3;
const STRAP_W = 4;
const STRAP_X = 16;

const LOW_TOP = -(PALLET_H + LOW_H);
const HIGH_TOP = LOW_TOP - HIGH_H;

const BODY = PALLET_H + LOW_H + HIGH_H;

/**
 * Stencilled on the side of the lower crate, where a crate carries one.
 *
 * The board's own word for the thing, which is Production on all three of
 * Sandbox ERP's now: two of them said Deployed and have been renamed, and
 * a crate still stencilled DEPLOYED is the room calling the end of the
 * board by a name the board has stopped using. What is counted is
 * untouched — `isDeployed` holds a net rather than a word, which is what
 * made that rename a non-event to begin with — so this is only the label
 * catching up, and the day a board says something else again it is this
 * line that follows it and not the counting.
 */
const WORD = "PRODUCTION";

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
