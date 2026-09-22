import * as Phaser from "phaser";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import type { Flow } from "@/lib/trello/flow";
import { readRoomFlow } from "./room-flow";

/**
 * A thing standing on a project room's floor with a figure on a plate over
 * it.
 *
 * There are four of them in every project room and they are one object.
 * Three stand in a row across the middle of the floor, in the order those
 * things happen to work: the machine making it, the roadblock it stops at,
 * the crates it goes out in. The fourth is the incident beacon, off the
 * line in the near corner, because nothing on the board happens to it.
 *
 * All four are on the floor rather than on the wall, and three of them for
 * one reason: the five bays are the stages work is spread over, so a stuck
 * card is still standing in one, a shipped card has left all five, and an
 * incident was never in any — none of the three could be a sixth bay
 * without reading as a sixth stage. The machine is the exception and the
 * only one repeating a number the wall already has: a bar can say how much
 * work is in hand and cannot say that anything is being done to it, which
 * is what a thing that moves says by moving.
 *
 * What they share is everything except the picture: the plate, the figure
 * and the sizes it falls back through, the read on a timer, the beat when
 * the number moves, standing nothing at all when there is nothing to say,
 * and the teardown that keeps a timer from outliving a lift ride. So an
 * adapter passes in what it is picked out in, how tall it stands, how to
 * draw it, and which number off the room's board is its own.
 *
 * This is `systems/CountBoard`'s arrangement one storey down, and for the
 * same reason: the second of these was written by copying the first, which
 * is the shape of duplication this codebase has been bitten by twice.
 */

/** Stands with the room's other props. People walk in front of it. */
const DEPTH = 4;

/** The plate, in the HUD's own dark — this is a sign, not scenery. */
export const MARKER_DARK = 0x1b1b2a;
export const MARKER_EDGE = 0x3a3a50;

/** The plate the figure sits on, square, over whatever stands below it. */
const PLATE = 40;

/**
 * The sizes the figure falls back through where a marker does not say.
 *
 * Press Start 2P is monospace and advances by its own size, so the width
 * is the character count times the size and nothing has to be measured.
 */
const FIGURE_SIZES = [22, 17, 13] as const;

export interface FloorMarkerSpec {
  /** What it is picked out in: the plate's edge and the figure on it. */
  ink: number;
  /** How tall the thing under the plate stands, in pixels. */
  body: number;
  /**
   * Draws that thing into the container it stands in: origin at the middle
   * of its feet, so everything in it is measured upward from zero.
   *
   * Usually once and then left alone — a thing that moves while you watch
   * it reads as a fault rather than as news, which is the rule the plate
   * over it is under. The machine is the exception and says why in its own
   * file, so this may hand back a teardown: a tween outlives the object it
   * was pointed at, and every one of these is torn down on a lift ride.
   */
  build(scene: Phaser.Scene, into: Phaser.GameObjects.Container): void | (() => void);
  /** Which number off the room's own board is this one's. */
  count(flow: Flow): number;
  /** Its own fallback sizes, where a bigger count than usual is ordinary. */
  sizes?: readonly number[];
}

export class FloorMarker {
  private container: Phaser.GameObjects.Container | null = null;
  private plate: Phaser.GameObjects.Rectangle | null = null;
  private figure: Phaser.GameObjects.Text | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private standing: number | null = null;
  private still: (() => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private spec: FloorMarkerSpec,
  ) {}

  /**
   * Stand one on the tile `at` names — its feet on the bottom of it, so a
   * marker two tiles tall grows up the room rather than down through the
   * floor.
   *
   * Hands back a teardown before the first answer, like the boards do: the
   * scene restarts on every lift ride and an interval that outlives it
   * goes on fetching for a room nobody is in.
   */
  place(at: { tx: number; ty: number }, tile: number, slot: number): () => void {
    const container = this.scene.add
      .container(at.tx * tile, (at.ty + 1) * tile)
      .setDepth(DEPTH)
      .setVisible(false);
    this.container = container;

    this.still = this.spec.build(this.scene, container) ?? null;

    const top = -(this.spec.body + PLATE);
    const plate = this.scene.add.rectangle(0, top, PLATE, PLATE, MARKER_DARK).setOrigin(0.5, 0);
    plate.setStrokeStyle(3, this.spec.ink);
    container.add(plate);
    this.plate = plate;

    this.figure = this.scene.add
      .text(0, top + PLATE / 2, "", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${this.sizes()[0]}px`,
        color: ink(this.spec.ink),
      })
      .setOrigin(0.5, 0.5)
      .setResolution(2);
    container.add(this.figure);

    void this.read(slot);
    // The same interval as the plate on the wall, and deliberately started
    // in the same tick: `./room-flow` holds an answer for a moment, so the
    // three things a project room draws off its board are one request.
    this.timer = setInterval(() => void this.read(slot), PULSE_REFRESH_MS);
    return () => this.destroy();
  }

  private sizes(): readonly number[] {
    return this.spec.sizes ?? FIGURE_SIZES;
  }

  /** What the board says, and whether there is anything to say. */
  private async read(slot: number) {
    const flow = await readRoomFlow(slot);
    // The scene may have restarted while we were waiting.
    if (!this.container?.active) return;
    this.show(flow ? this.spec.count(flow) : 0);
  }

  private show(count: number) {
    const container = this.container;
    const figure = this.figure;
    if (!container || !figure) return;

    // Nothing to say is nothing to look at: a plate reading 0 is a thing
    // somebody has to walk round to find out there is nothing there.
    if (count <= 0) {
      container.setVisible(false);
      this.standing = 0;
      return;
    }

    const text = String(count);
    figure.setFontSize(sizeFor(text, this.sizes())).setText(text);
    container.setVisible(true);
    // A number that moved says so once, the way a count on the wall does —
    // and a marker that has just gone up is the same news.
    if (this.standing !== null && this.standing !== count) this.flash();
    this.standing = count;
  }

  /** One beat on the plate, so a change catches the eye from the corridor. */
  private flash() {
    if (!this.plate || !this.figure) return;
    this.scene.tweens.add({
      targets: [this.plate, this.figure],
      alpha: { from: 0.2, to: 1 },
      duration: 420,
      ease: "Quad.easeOut",
    });
  }

  private destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Before the container goes, since what this stops is pointed at what
    // is in it.
    this.still?.();
    this.still = null;
    this.container?.destroy(true);
    this.container = null;
    this.plate = null;
    this.figure = null;
    this.standing = null;
  }
}

/** A colour written once, as a number for Phaser and a string for text. */
export function ink(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/**
 * The largest size the figure fits the plate at.
 *
 * Monospace, so the width is the character count times the size — a board
 * with a hundred of something is a smaller number rather than one drawn
 * over its own frame.
 */
function sizeFor(text: string, sizes: readonly number[]): number {
  const room = PLATE - 10;
  return sizes.find((size) => text.length * size <= room) ?? sizes[sizes.length - 1];
}
