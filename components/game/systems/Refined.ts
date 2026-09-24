import { ink, MARKER_DARK, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The rack of blanks at the head of a project room's production line: work
 * that has been written up and is waiting to be made.
 *
 * The first of the five things standing in a row across the middle of the
 * floor, and the first of the three that are **stages the wall gave up**.
 * A bay can say how much work is refined and waiting; what it cannot say
 * is that this is the stuff the machine next along is about to take, which
 * is the whole of what a rack of stock standing beside a machine says
 * without a word on it.
 *
 * **It does not move, and that is the point of it.** The machine strokes
 * and the rig beyond the barrier crosses its work, because something is
 * being done at both; here nothing is, and the stillness is the fact
 * rather than an omission. It is also what makes the other two legible — a
 * line where everything moves is a line where nothing in particular is
 * happening.
 *
 * **It is the machine's own feedstock**, and that is a fact about the
 * numbers rather than a resemblance: a blank is `BLANK_W` by `BLANK_H`,
 * which is `PART_W` by `PART_H` in `systems/Machine` — the identical
 * object that rides the belt a hundred pixels to the right. Blue blanks
 * stand waiting, purple parts come out on the belt, and what happens in
 * between is the housing. Nothing enforces that agreement, so it is two
 * pairs of numbers and this line saying where they came from.
 *
 * **Deliberately not a stack of boxes.** The crates are two closed boxes
 * on a pallet with a lid and straps, standing four stations along the same
 * row, and the test of this line is that a stranger can name each station
 * from the doorway — silhouette is what carries down a corridor where
 * colour is what carries across a room. A rectangular rack with horizontal
 * courses showing through it shares nothing with a stepped pyramid of
 * lids, while saying the same thing about the same kind of object:
 * material, stacked, waiting.
 *
 * **It rakes toward the machine** — six blanks, then five, then four, all
 * flush to the left, so the right-hand end steps down twice in the
 * direction the whole row reads. One still gesture doing the work an
 * animation would otherwise have to do, and it costs nothing: the counts
 * *are* the rake, so there is no second set of coordinates to keep in
 * step. It also keeps the rack off being a symmetrical ziggurat, which is
 * the crates' family and the one shape it must not be.
 *
 * Blue, because that is the colour the second bay lit before it came off
 * the wall — the machine's argument for its purple exactly, one stage
 * earlier. The word on the band is a constant rather than the building's
 * own lane name, as WIP and PRODUCTION are: a building whose second lane
 * is called something else still gets a rack stencilled REFINED.
 *
 * Its picture is **ninety-six wide and no more**, because the machine
 * beside it is a hundred and four and the line steps by a hundred — see
 * `LINE_STEP` in `lib/map/floor.ts`. The plate over it, the timer under
 * it and the beat when the figure moves are `systems/FloorMarker`.
 */

/** The colour the Refined bay lit on the plate, before it came off it. */
const READY = 0x579dff;

/**
 * Three tones, the crates' arrangement exactly: the rack is furniture, the
 * stock is what the eye lands on, and the accent is only ever the cut
 * edge. A picture drawn in the plate's own dark, directly under the plate,
 * reads as the plate's pedestal rather than as a thing the plate is about.
 */
const SHELL = MARKER_EDGE;
const FRAME = 0x2a2a3e;

/** How wide the picture is, and the feet and band under the rack. */
const WIDTH = 96;
const FOOT_W = 8;
const FOOT_H = 6;
const FOOT_X = 40;
const BAND_H = 14;
const BAND_TOP = -(FOOT_H + BAND_H);

/**
 * The stock: the machine's own parts, waiting.
 *
 * Twelve by nine is `PART_W` by `PART_H` in `systems/Machine`. `CAP_H` is
 * the cut edge — the two rows of blue along the top of each blank, which
 * is what makes a piece of stock *refined* and what reads from the
 * corridor as a row of blue lines across a grey rack. Solid blue blanks
 * would be fifteen hundred square pixels of accent standing next to a
 * frankly purple machine, which is the row's closest adjacent pair drawn
 * at its worst.
 *
 * `PITCH` leaves two pixels of dark between neighbours, or fifteen blanks
 * merge into three bars.
 */
const BLANK_W = 12;
const BLANK_H = 9;
const CAP_H = 2;
const PITCH = BLANK_W + 2;

/** A rail, and the course of stock standing on it. */
const RAIL_H = 3;
const LEVEL_H = RAIL_H + BLANK_H;
const STOCK = [6, 5, 4] as const;

/**
 * How tall the rack stands: the plate sits on top of this.
 *
 * A sum rather than a number, which is the crates' arrangement — moving a
 * course or a rail moves the picture and cannot leave `BODY` disagreeing
 * with it, which would be a rack poking through its own plate and only
 * standing in the room would catch it. It comes to fifty-six, which is
 * what all five things on this line stand: a row whose ends are shorter
 * than its middle reads as five objects rather than as one line.
 */
const BODY = FOOT_H + BAND_H + STOCK.length * LEVEL_H;

/**
 * The uprights, and the rails spanning between them.
 *
 * `POST_X` puts their outer faces on the picture's own edge, so the rack
 * is exactly as wide as the band under it; `RAIL_W` is the clear span
 * between them, so a rail meets both on the pixel.
 */
const POST_W = 6;
const POST_X = WIDTH / 2 - POST_W / 2;
const POST_TOP = -BODY;
const POST_H = BODY + BAND_TOP;
const RAIL_W = 2 * (POST_X - POST_W / 2);

/**
 * Flush to the left and drawn down to the right, toward the machine. The
 * bottom course is centred and every course above starts at the same
 * left-hand blank, so the rake falls out of the counts.
 */
const LEFT = -(PITCH * (STOCK[0] - 1)) / 2;

const WORD = "REFINED";

/** Where a course's rail sits, counted from the bottom one. */
function railTop(level: number): number {
  return BAND_TOP - (level + 1) * RAIL_H - level * BLANK_H;
}

export const REFINED: FloorMarkerSpec = {
  ink: READY,
  body: BODY,
  count: (flow) => flow.refined,
  /**
   * A refined-and-waiting queue is the one stage on this line that grows
   * while nobody is looking at it, so it takes the crates' extra rung: a
   * board with a hundred and thirty things written up and unstarted is an
   * ordinary board having a quiet month, where a hundred and thirty things
   * in hand is a board nobody is using.
   */
  sizes: [22, 17, 13, 10],
  build(scene, into) {
    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * FOOT_X, -FOOT_H, FOOT_W, FOOT_H, FRAME).setOrigin(0.5, 0),
      );
    }

    // The uprights go down before the rails, so a rail reads as spanning
    // between them rather than as a bar laid across their front.
    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * POST_X, POST_TOP, POST_W, POST_H, SHELL).setOrigin(0.5, 0),
      );
    }

    const band = scene.add.rectangle(0, BAND_TOP, WIDTH, BAND_H, MARKER_DARK).setOrigin(0.5, 0);
    band.setStrokeStyle(2, SHELL);
    into.add(band);
    into.add(
      scene.add
        .text(0, BAND_TOP + BAND_H / 2, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: ink(READY),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    STOCK.forEach((count, level) => {
      const top = railTop(level);
      // The rail first and in the darker tone, so each course has a seam
      // under it: fifteen shell-coloured blanks on shell-coloured rails
      // would merge into one grey slab.
      into.add(scene.add.rectangle(0, top, RAIL_W, RAIL_H, FRAME).setOrigin(0.5, 0));
      for (let i = 0; i < count; i++) {
        const x = LEFT + i * PITCH;
        into.add(scene.add.rectangle(x, top - BLANK_H, BLANK_W, BLANK_H, SHELL).setOrigin(0.5, 0));
        // The cut edge over the blank's own top rows, so it is an edge
        // rather than a bar balanced on the stock.
        into.add(scene.add.rectangle(x, top - BLANK_H, BLANK_W, CAP_H, READY).setOrigin(0.5, 0));
      }
    });
  },
};
