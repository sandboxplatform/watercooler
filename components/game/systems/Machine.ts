import * as Phaser from "phaser";
import { ink, MARKER_DARK, MARKER_EDGE, type FloorMarkerSpec } from "./FloorMarker";

/**
 * The machine second along a project room's production line: work in
 * hand, being made.
 *
 * The five things standing in a row across the middle of the floor are
 * what happens to work — it waits, it is made, it stops, it is checked, it
 * goes out — and this is the second of them, taking its stock off the rack
 * at the head of the line. The barrier beside it and the crates at the far
 * end are on the floor because no bay on the wall could say what they say;
 * this one is on the floor for the opposite reason — it is a stage of the
 * pipeline, and the wall gave up its bay to it (`wallLanes`) rather than
 * print the same number twice. Two more stages have since done the same,
 * either side of it.
 *
 * **It is the lane less what is roadblocked in it** — see `countUnblocked`,
 * which all three of the line's stages are under.
 * The barrier a foot to its right is work that has stopped, and a card
 * that has stopped is not a card being worked on, so a stuck card standing
 * in this lane was being counted by both of them. Hammer Time is the board
 * that showed it.
 *
 * What the wall cannot do is **move**. Five bays draw exactly the same
 * picture whether the room is turning work out or sitting on it, and a
 * number is a number whether it has been that number since March or has
 * changed twice this morning. A machine running is the one thing in this
 * building that says work is happening here rather than reporting how much
 * of it there is — which is why this is a machine at all, and why a bay on
 * the wall was never going to be enough on its own.
 *
 * Two things move and no more, which is the line `CountBoard` draws: a
 * press that strokes, and parts riding the belt out of the machine toward
 * the rest of the line. Both are *work being done*. Nothing flashes,
 * nothing breathes and no light comes on — a thing that pulses while you
 * watch it reads as a fault in the app, and this is a room where an actual
 * fault has a beacon of its own in the corner.
 *
 * The press is **phased to the belt**, so a part is under the head when the
 * head comes down. Worked out from the constants rather than written down,
 * because the alternative is a stamp landing on empty belt the first time
 * anybody changes how fast the line runs, which is the sort of thing only
 * standing in the room would catch.
 *
 * Purple, because that is the colour the third bay lit before this stage
 * came off the wall — the rack before it is the second bay's blue and the
 * rig beyond the barrier is the last one's green, all three by the same
 * argument. The crates are the exception and say why: a despatch was never
 * a lane, so it is off the plate's scale altogether.
 *
 * Nothing is up when nothing is in hand, which is the rule all six of
 * these are under: a machine standing idle with a 0 over it is a thing
 * somebody has to walk up to in order to find out there is nothing in it.
 *
 * The plate over it, the timer under it and the beat when the figure moves
 * are `systems/FloorMarker`, as they are for the other five.
 */

/** The colour the WIP bay lights in on the plate over the machine. */
const WORKING = 0xa78bfa;

/**
 * Three tones, and the crates' argument for them exactly.
 *
 * The plate is the HUD's own dark with a coloured edge, so anything drawn
 * the same way directly under it reads as the plate's own pedestal rather
 * than as a thing the plate is about — which is what this was, first time
 * out: a dark box on a dark base, one silhouette, standing next to a
 * barrier in hazard stripes that could be read from the corridor. So the
 * machine is a shade lighter than the plate, the frame it stands on a
 * shade darker than the machine, and the purple is kept for the parts and
 * the rollers — the moving bits, which is where it says what it is.
 */
const SHELL = MARKER_EDGE;
const FRAME = 0x2a2a3e;

/**
 * The picture, measured up from the floor it stands on.
 *
 * Fifty-six tall under a forty-pixel plate, which is what every other
 * thing on this floor stands: they are the same height on purpose, and
 * five of them in a row is exactly when that starts to matter — a line
 * whose middle is taller than its ends reads as five objects rather than
 * as one line.
 *
 * What fills that height is a **hopper on the left and a press portal over
 * the belt**, which is the silhouette a machine has. The first attempt
 * spent it on one wide box and a gantry tucked up under the plate, where
 * the plate covered most of the gantry — so what was left was a low slab
 * with a lump on it, and it read as a desk with a monitor. Nothing about
 * this drawing is hidden behind the plate now; the tallest thing in it is
 * the hopper, out to the left of where the plate hangs.
 */
const BODY = 56;

const LEG_W = 8;
const LEG_H = 10;
const LEG_X = 42;

/** The belt: the machine's own base, running the width of the picture. */
const BELT_W = 104;
const BELT_H = 10;
const BELT_TOP = -(LEG_H + BELT_H);

/** A roller at each end, and the treads between them. */
const ROLLER_W = 6;
const ROLLER_X = BELT_W / 2 - ROLLER_W / 2;
const TREAD_W = 3;
const TREAD_H = 2;
const TREAD_GAP = 10;

/** The housing, standing on the belt at the left-hand end. */
const HOUSE_W = 40;
const HOUSE_H = 27;
const HOUSE_X = -32;
const HOUSE_TOP = BELT_TOP - HOUSE_H;
const HOUSE_RIGHT = HOUSE_X + HOUSE_W / 2;

/** The word on its face, and the vents under it. */
const WORD_UP = 9;
const VENT_W = 22;
const VENT_H = 2;
const VENT_GAP = 4;
const VENT_UP = 10;

/**
 * The hopper on top of it: three courses narrowing upward.
 *
 * Stepped rather than tapered, because a taper at this size is either two
 * pixels of slope or an antialiased edge, and everything else on this
 * floor is drawn in whole pixels. Three courses is what it takes to read
 * as a funnel rather than as a smaller box parked on a bigger one.
 */
const HOPPER = [30, 22, 14] as const;
const HOPPER_COURSE = 3;
const HOPPER_H = HOPPER.length * HOPPER_COURSE;

/**
 * The press portal over the belt: two uprights and the beam across them.
 *
 * A portal rather than an arm off the housing, so the press stands on its
 * own legs and the eye has somewhere to put it. It carries the beam to the
 * full height of the picture, which puts something under the plate — the
 * other three all have their tallest point at the middle, where the plate
 * hangs, and a plate with clear air under it reads as floating rather than
 * as a sign on a machine.
 *
 * The parts are drawn before it, so one riding out of the machine passes
 * **behind** the far upright, which is where it leaves the picture.
 */
const LEG_UP = 0;
const LEG_DOWN = 40;
const PORTAL_W = 6;
const BEAM_H = 6;
const BEAM_TOP = -BODY;

/**
 * The ram hanging off the beam, and how far it strokes.
 *
 * At rest it clears the top of a part by a couple of pixels and at the
 * bottom of the stroke it is a couple of pixels into one, which is what
 * makes it a press rather than a block waving over a belt.
 */
const HEAD_X = (LEG_UP + LEG_DOWN) / 2;
const HEAD_W = 22;
const HEAD_H = 9;
const HEAD_TOP = -40;
const STROKE = 4;
const ROD_W = 6;
const ROD_TOP = BEAM_TOP + BEAM_H;

/** What rides the belt: how big, how far, how many, and how long it takes. */
const PART_W = 12;
const PART_H = 9;
const PART_FROM = HOUSE_RIGHT + 6;
const PART_TO = LEG_DOWN + 6;
const PARTS = 3;
const BELT_MS = 2200;

/**
 * How long a part takes to fade in at the head of the belt and out at the
 * foot of it, as a share of the run.
 *
 * A belt is a loop and this one is a straight line, so the three parts on
 * it are the same three parts going round for ever — which is honest
 * enough, since what the machine says is "work is being done here" rather
 * than "here are three particular cards". What would not be honest is the
 * jump: a box vanishing off the right-hand end and reappearing at the left
 * in the same frame is the one thing in this picture that would read as
 * the drawing being broken. Faded, each one comes out of the machine and
 * is carried off down the line, which is what a part on a belt does.
 */
const FADE = 0.16;

/** The stroke, in milliseconds: down, held at the bottom, and back up. */
const PRESS_DOWN = 260;
const PRESS_HOLD = 90;

/** One part every third of the belt, and one stroke to go with it. */
const STEP_MS = BELT_MS / PARTS;

/**
 * When a part is under the head, counted from the moment it sets off — and
 * from that, when the press has to start its down-stroke to meet it.
 *
 * The press repeats every `STEP_MS` and so do the parts, so one phase
 * offset holds for the life of the scene. Worked out rather than written
 * down: every number above is a tuning value somebody will move, and the
 * failure when one of them does is a machine stamping the empty belt
 * between two parts — which nothing about the room being right would
 * catch.
 */
const UNDER_MS = ((HEAD_X - PART_FROM) / (PART_TO - PART_FROM)) * BELT_MS;
const PRESS_DELAY = (((UNDER_MS - PRESS_DOWN) % STEP_MS) + STEP_MS) % STEP_MS;
const PRESS_WAIT = Math.max(0, STEP_MS - PRESS_DOWN * 2 - PRESS_HOLD);

/** Stencilled on the housing, where the other three carry their own word. */
const WORD = "WIP";

export const MACHINE: FloorMarkerSpec = {
  ink: WORKING,
  body: BODY,
  count: (flow) => flow.wip,
  build(scene, into) {
    // The legs and the belt everything else stands on, in the darkest of
    // the three tones: what is underneath is furniture, and the machine
    // above it is what the eye is meant to land on.
    for (const side of [-1, 1]) {
      into.add(scene.add.rectangle(side * LEG_X, -LEG_H, LEG_W, LEG_H, FRAME).setOrigin(0.5, 0));
    }
    into.add(scene.add.rectangle(0, BELT_TOP, BELT_W, BELT_H, FRAME).setOrigin(0.5, 0));
    // A roller at each end, in the bay's own colour. The two ends of the
    // belt are where the eye is told what this machine is, and there is
    // nothing else down here for the purple to be.
    for (const side of [-1, 1]) {
      into.add(
        scene.add.rectangle(side * ROLLER_X, BELT_TOP, ROLLER_W, BELT_H, WORKING).setOrigin(0.5, 0),
      );
    }
    // Treads along the stretch the parts ride, so the belt is a belt in the
    // moment between two of them. Drawn still: the parts are what carries
    // the motion, and a second thing moving at a second speed is a picture
    // nobody can read.
    for (let x = HOUSE_RIGHT + TREAD_GAP; x < ROLLER_X - ROLLER_W; x += TREAD_GAP) {
      into.add(
        scene.add.rectangle(x, BELT_TOP + BELT_H / 2, TREAD_W, TREAD_H, SHELL).setOrigin(0.5, 0.5),
      );
    }

    const parts = ride(scene, into);

    // The housing, drawn after the parts so one coming out of it passes
    // behind the machine rather than in front of it.
    const house = scene.add
      .rectangle(HOUSE_X, HOUSE_TOP, HOUSE_W, HOUSE_H, SHELL)
      .setOrigin(0.5, 0);
    house.setStrokeStyle(2, WORKING);
    into.add(house);
    into.add(
      scene.add
        .text(HOUSE_X, HOUSE_TOP + WORD_UP, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: ink(WORKING),
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );
    for (let i = 0; i < 3; i++) {
      into.add(
        scene.add
          .rectangle(HOUSE_X, HOUSE_TOP + HOUSE_H - VENT_UP + i * VENT_GAP, VENT_W, VENT_H, FRAME)
          .setOrigin(0.5, 0),
      );
    }
    HOPPER.forEach((width, i) => {
      into.add(
        scene.add
          .rectangle(HOUSE_X, HOUSE_TOP - (i + 1) * HOPPER_COURSE, width, HOPPER_COURSE, SHELL)
          .setOrigin(0.5, 0),
      );
    });

    // The portal, drawn after the parts so one leaving passes behind the
    // far upright, and the press hanging off its beam.
    for (const x of [LEG_UP, LEG_DOWN]) {
      into.add(
        scene.add.rectangle(x, BEAM_TOP, PORTAL_W, BELT_TOP - BEAM_TOP, SHELL).setOrigin(0.5, 0),
      );
    }
    into.add(
      scene.add
        .rectangle(HEAD_X, BEAM_TOP, LEG_DOWN - LEG_UP + PORTAL_W, BEAM_H, SHELL)
        .setOrigin(0.5, 0),
    );
    into.add(
      scene.add
        .rectangle(HEAD_X, ROD_TOP, ROD_W, HEAD_TOP + STROKE - ROD_TOP, FRAME)
        .setOrigin(0.5, 0),
    );
    const head = scene.add.rectangle(HEAD_X, HEAD_TOP, HEAD_W, HEAD_H, SHELL).setOrigin(0.5, 0);
    head.setStrokeStyle(2, WORKING);
    into.add(head);

    const press = scene.tweens.add({
      targets: head,
      y: HEAD_TOP + STROKE,
      duration: PRESS_DOWN,
      ease: "Quad.easeIn",
      hold: PRESS_HOLD,
      yoyo: true,
      delay: PRESS_DELAY,
      repeat: -1,
      repeatDelay: PRESS_WAIT,
    });

    // A tween outlives what it is pointed at — a destroyed object goes on
    // being written to — and every marker in this room is torn down on a
    // lift ride, so they are handed back rather than left running.
    return () => {
      press.remove();
      for (const part of parts) part.remove();
    };
  },
};

/**
 * The parts on the belt: `PARTS` of them, evenly spaced along one run.
 *
 * One tween each rather than a container of them moved together, because
 * the fade is a function of where a part is rather than of how long it has
 * been going — which is what keeps the two ends of the belt looking alike
 * whatever anybody does to the timings above.
 */
function ride(scene: Phaser.Scene, into: Phaser.GameObjects.Container): Phaser.Tweens.Tween[] {
  const tweens: Phaser.Tweens.Tween[] = [];
  for (let i = 0; i < PARTS; i++) {
    const box = scene.add
      .rectangle(PART_FROM, BELT_TOP, PART_W, PART_H, WORKING)
      .setOrigin(0.5, 1)
      .setAlpha(0);
    into.add(box);
    tweens.push(
      scene.tweens.add({
        targets: box,
        x: { from: PART_FROM, to: PART_TO },
        duration: BELT_MS,
        ease: "Linear",
        delay: i * STEP_MS,
        repeat: -1,
        onUpdate: () => box.setAlpha(carried((box.x - PART_FROM) / (PART_TO - PART_FROM))),
      }),
    );
  }
  return tweens;
}

/** How solid a part is at a given point along the belt. */
function carried(along: number): number {
  if (along < FADE) return Math.max(0, along / FADE);
  if (along > 1 - FADE) return Math.max(0, (1 - along) / FADE);
  return 1;
}
