import { ink, MARKER_DARK, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The inspection gantry standing between a project room's barrier and its
 * crates: work that has been made and is being checked before it goes out.
 *
 * The fourth of the five things in the row and the last of the three that
 * are **stages the wall gave up**. It stands where the board has it and
 * where a factory has it — made, stuck, checked, gone.
 *
 * **It is the machine inverted, and that is the whole design.** At the
 * machine the frame is fixed and the *work* moves: parts ride the belt out
 * from under a press that stamps at one spot. Here the work is held still
 * and the *machine* moves over it: a carriage crossing the whole width
 * with a probe under it, dipping onto the panel at each end of its run.
 * That is the difference between making and checking said as motion rather
 * than as a caption — in the machine work flows through, in the rig it is
 * pinned down and looked at.
 *
 * It is also why this is a gantry rather than a scanner arch with work
 * passing under it: an arch would be the machine's belt drawn a second
 * time a hundred pixels away, which is the one thing a stranger would
 * notice first and the failure the two animated stations most have to
 * avoid. Side by side the silhouettes share nothing — the machine is lumpy
 * and asymmetric, a hopper up one end and a portal the other, with
 * everything happening at the bottom of the picture; this is a clean
 * rectangle, a bar across the top and a bar across the bottom, with
 * everything happening at the top.
 *
 * **Two things move and no more**, which is the line `CountBoard` draws
 * and the machine holds to: a carriage crossing the work, and a probe
 * touching down on it. Both are inspection being done. Nothing flashes,
 * nothing breathes and no light comes on — the rig has no lamp, and this
 * is a room where an actual fault has a beacon of its own in the corner.
 *
 * Green, because that is the colour the last of the five declared bays lit
 * before it came off the wall. The crates beyond it were never a lane and
 * had only borrowed that green from whichever bay happened to be last, so
 * when the two came to stand shoulder to shoulder it was the borrower that
 * moved — see `systems/Deployed`.
 *
 * Its picture is a hundred and four wide, both its neighbours being
 * ninety-six, which is what closes the seam on either side of it to
 * nothing — see `LINE_STEP` in `lib/map/floor.ts`. The plate over it, the
 * timer under it and the beat when the figure moves are
 * `systems/FloorMarker`.
 */

/** The colour the Testing bay lit on the plate, before it came off it. */
const CHECKING = 0x4bce97;

/**
 * Three tones, the machine's arrangement exactly: the shell is the
 * machine, the frame is what it runs on, and the green is kept for the
 * panel and the probe — the two things that say what the station is for.
 */
const SHELL = MARKER_EDGE;
const FRAME = 0x2a2a3e;

/** The picture, measured up from the floor it stands on. */
const BODY = 56;
const WIDTH = 104;

/** The feet, and the band the word is stencilled on. */
const FOOT_W = 10;
const FOOT_H = 6;
const FOOT_X = 42;
const BAND_H = 14;
const BAND_TOP = -(FOOT_H + BAND_H);

/**
 * The gantry: a column on each edge of the picture and the beam across
 * them.
 *
 * The beam runs the full width along the top, which is what puts something
 * solid directly under the plate — the machine's own file records a first
 * attempt where the plate had clear air beneath it and read as floating.
 */
const POST_W = 6;
const POST_X = WIDTH / 2 - POST_W / 2;
const BEAM_H = 6;
const BEAM_TOP = -BODY;
const POST_TOP = BEAM_TOP + BEAM_H;
const POST_H = BAND_TOP - POST_TOP;
const SPAN = 2 * (POST_X - POST_W / 2);

/** The bench, the panel under test, and the clamps holding it down. */
const BED_H = 4;
const BED_TOP = BAND_TOP - BED_H;
const WORK_W = 72;
const WORK_H = 6;
const WORK_TOP = BED_TOP - WORK_H;
const CLAMP_W = 4;
const CLAMP_X = WORK_W / 2;
const CLAMP_H = WORK_H + 2;
const CLAMP_TOP = WORK_TOP - 2;

/** The guideway under the beam, and the carriage running along it. */
const GUIDE_H = 3;
const GUIDE_TOP = POST_TOP;
const HEAD_W = 20;
const HEAD_H = 8;
const HEAD_TOP = GUIDE_TOP + GUIDE_H;

/**
 * The quill and the probe hanging off the carriage.
 *
 * `QUILL_IN` is how far the quill's top is tucked up inside the carriage,
 * and it is what keeps a hole from opening under the head at the bottom of
 * the stroke: dropped by `DIP` the quill's top arrives flush with the
 * head's underside rather than four pixels below it. A gap that appears
 * for a fifth of a second twice every two and a half seconds is often
 * enough to look like the drawing being broken and rare enough never to be
 * caught in a still.
 */
const QUILL_W = 4;
const QUILL_H = 8;
const QUILL_IN = 4;
const QUILL_TOP = HEAD_TOP + HEAD_H - QUILL_IN;
const TIP_W = 6;
const TIP_H = 3;
const TIP_TOP = QUILL_TOP + QUILL_H;

/**
 * How far the probe drops.
 *
 * At rest the tip clears the top of the panel by two pixels and at the
 * bottom of the stroke it is two pixels into it, which is the machine's
 * own rule for its ram and what makes this a probe taking a reading rather
 * than a block waving about over a bench.
 */
const DIP = 4;

/**
 * How far the carriage runs, derived off the panel and its clamps so that
 * a wider panel carries the traverse with it.
 *
 * The probe has to cross the work end to end and never run off it or into
 * a clamp — a gauge that sweeps past the edge of what it is measuring is
 * exactly the sort of thing only standing in the room would catch. At full
 * travel the tip's outer edge lands a pixel inside the clamp's inner face,
 * and the carriage itself is well clear of the columns:
 * `POST_X - POST_W / 2 - HEAD_W / 2` is 36 against a sweep of 30.
 */
const SWEEP = CLAMP_X - CLAMP_W / 2 - TIP_W / 2 - 1;

/**
 * One traverse, and the stroke that meets it.
 *
 * Sixty pixels in two and a half seconds is 24 px/s, which is the belt's
 * pace next door — 52 pixels in `BELT_MS`, or 23.6. The two moving
 * stations running at one speed is most of what makes the row read as one
 * line. It is written down rather than computed off the machine, which
 * makes it the one number in this file that is an agreement rather than an
 * identity: retune `BELT_MS` and this wants looking at.
 */
const SWEEP_MS = 2500;
const DIP_DOWN = 200;
const DIP_HOLD = 120;

/**
 * When the probe starts down, and how long it waits before going again.
 *
 * **Computed, and this is the part that must never be written down.** The
 * carriage yoyos, so it is at an end of its run at `SWEEP_MS`,
 * `2 * SWEEP_MS` and so on; the probe reaches the bottom of its stroke at
 * `DIP_DELAY + DIP_DOWN`. Making those meet is `PRESS_DELAY` and
 * `PRESS_WAIT` in `systems/Machine`, in the same two lines and for the
 * same reason: every number above is a tuning value somebody will move,
 * and the failure when one of them does is a gauge taking its reading on
 * the fly, half way along the panel, at full speed — which nothing about
 * the room being right would catch. The modular form guards the case where
 * the stroke is made longer than the traverse, since Phaser ignores a
 * negative delay without a word.
 *
 * `DIP_WAIT` closes the cycle exactly: 200 down, 120 held, 200 up and 1980
 * waiting is 2500, so the touch can never drift against the traverse.
 *
 * **And the phase survives a change of ease**, which is worth knowing
 * because the obvious alternative does not. It uses only where the
 * carriage is at the start of its run and at the end of it, and an ease
 * changes the path between two endpoints rather than the endpoints
 * themselves — so the carriage is at its stop at the turn whatever it is
 * eased with. A rig that dipped somewhere part-way along would have to
 * solve for position against a constant speed, and putting a curve on the
 * sweep later would slide the probe off the work with nothing on screen to
 * say so.
 */
const DIP_DELAY = (((SWEEP_MS - DIP_DOWN) % SWEEP_MS) + SWEEP_MS) % SWEEP_MS;
const DIP_WAIT = Math.max(0, SWEEP_MS - DIP_DOWN * 2 - DIP_HOLD);

const WORD = "TESTING";

export const TESTING: FloorMarkerSpec = {
  ink: CHECKING,
  body: BODY,
  count: (flow) => flow.testing,
  build(scene, into) {
    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * FOOT_X, -FOOT_H, FOOT_W, FOOT_H, FRAME).setOrigin(0.5, 0),
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
          color: ink(CHECKING),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    // The bench, the panel lying on it, and the clamps over its ends — the
    // clamps after the panel so they straddle it rather than being buried,
    // standing two pixels proud, which is what turns a bar lying on a bench
    // into a part fixtured for inspection.
    into.add(scene.add.rectangle(0, BED_TOP, SPAN, BED_H, SHELL).setOrigin(0.5, 0));
    into.add(scene.add.rectangle(0, WORK_TOP, WORK_W, WORK_H, CHECKING).setOrigin(0.5, 0));
    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * CLAMP_X, CLAMP_TOP, CLAMP_W, CLAMP_H, SHELL).setOrigin(0.5, 0),
      );
    }

    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * POST_X, POST_TOP, POST_W, POST_H, SHELL).setOrigin(0.5, 0),
      );
    }
    into.add(scene.add.rectangle(0, GUIDE_TOP, SPAN, GUIDE_H, FRAME).setOrigin(0.5, 0));

    // The quill and its tip ride in a container of their own so that one
    // tween can drop them without the carriage: tweening the whole carriage
    // downward would take the head four pixels off its own guideway on every
    // stroke, which is a carriage coming loose from its rail. Built at the
    // start of the traverse rather than at nought, so the first painted frame
    // is already where the tween puts it — which is why the machine's parts
    // are built at `PART_FROM`.
    const ram = scene.add.container(-SWEEP, 0);
    ram.add(scene.add.rectangle(0, QUILL_TOP, QUILL_W, QUILL_H, SHELL).setOrigin(0.5, 0));
    ram.add(scene.add.rectangle(0, TIP_TOP, TIP_W, TIP_H, CHECKING).setOrigin(0.5, 0));
    into.add(ram);

    // The head after the ram, so it covers the quill's tucked-up top.
    const head = scene.add.rectangle(-SWEEP, HEAD_TOP, HEAD_W, HEAD_H, SHELL).setOrigin(0.5, 0);
    head.setStrokeStyle(2, CHECKING);
    into.add(head);

    // The beam last, over the columns' tops, so it reads as sitting on them.
    into.add(scene.add.rectangle(0, BEAM_TOP, WIDTH, BEAM_H, SHELL).setOrigin(0.5, 0));

    // Both targets on one tween because they are one carriage.
    // `Sine.easeInOut` rather than the belt's `Linear` because a gantry has
    // mass: it accelerates off each end and eases into the next, where a belt
    // runs at one speed for ever. It is also what makes the touch honest —
    // the carriage covers about a pixel over the whole of the down-stroke and
    // the hold, so the probe reads as stopping to take a reading rather than
    // being dragged sideways with its tip in the work.
    const traverse = scene.tweens.add({
      targets: [head, ram],
      x: { from: -SWEEP, to: SWEEP },
      duration: SWEEP_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // An absolute `y` rather than a relative step, which is what the
    // sub-container buys: the ram sits at nought and its children carry
    // their own offsets, so one number moves both and the yoyo returns it
    // exactly. `Quad.easeIn` is the press's ease and is right for the same
    // reason — a probe accelerates down onto the work, and on the way back
    // Phaser plays it reversed, so it eases off rather than snapping.
    const touch = scene.tweens.add({
      targets: ram,
      y: { from: 0, to: DIP },
      duration: DIP_DOWN,
      ease: "Quad.easeIn",
      hold: DIP_HOLD,
      yoyo: true,
      delay: DIP_DELAY,
      repeat: -1,
      repeatDelay: DIP_WAIT,
    });

    // A tween outlives what it is pointed at — a destroyed object goes on
    // being written to — and every marker in this room is torn down on a
    // lift ride, so they are handed back rather than left running.
    return () => {
      traverse.remove();
      touch.remove();
    };
  },
};
