import * as Phaser from "phaser";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import { readRoomFlow } from "./room-flow";

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
 */

/** Stands with the room's other props. People walk in front of it. */
const DEPTH = 4;

/** Hazard orange, and the HUD's own dark to stripe it against. */
const HAZARD = 0xfaa53d;
const HAZARD_INK = "#faa53d";
const DARK = 0x1b1b2a;
const LEG = 0x3a3a50;

/** The picture, measured up from the floor it stands on. */
const WIDTH = 96;
const LEG_W = 7;
const LEG_H = 22;
const LEG_X = 34;
const BAND_H = 14;
const PLANK_H = 20;
const PLATE = 40;

const BAND_TOP = -(LEG_H + BAND_H);
const PLANK_TOP = BAND_TOP - PLANK_H;
const PLATE_TOP = PLANK_TOP - PLATE;

/** A stripe and its gap, in pixels, at forty-five degrees. */
const STRIPE = 12;

/** The word under the plank, and the sizes the figure falls back through. */
const WORD = "ROADBLOCK";
const FIGURE_SIZES = [22, 17, 13] as const;

export class Roadblock {
  private container: Phaser.GameObjects.Container | null = null;
  private plate: Phaser.GameObjects.Rectangle | null = null;
  private figure: Phaser.GameObjects.Text | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private standing: number | null = null;

  constructor(private scene: Phaser.Scene) {}

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

    for (const side of [-1, 1]) {
      container.add(
        this.scene.add.rectangle(side * LEG_X, -LEG_H, LEG_W, LEG_H, LEG).setOrigin(0.5, 0),
      );
    }

    const band = this.scene.add.rectangle(0, BAND_TOP, WIDTH, BAND_H, DARK).setOrigin(0.5, 0);
    band.setStrokeStyle(2, LEG);
    container.add(band);
    container.add(
      this.scene.add
        .text(0, BAND_TOP + BAND_H / 2, WORD, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: HAZARD_INK,
        })
        .setOrigin(0.5, 0.5)
        .setResolution(2),
    );

    container.add(this.plank());

    const plate = this.scene.add.rectangle(0, PLATE_TOP, PLATE, PLATE, DARK).setOrigin(0.5, 0);
    plate.setStrokeStyle(3, HAZARD);
    container.add(plate);
    this.plate = plate;

    this.figure = this.scene.add
      .text(0, PLATE_TOP + PLATE / 2, "", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${FIGURE_SIZES[0]}px`,
        color: HAZARD_INK,
      })
      .setOrigin(0.5, 0.5)
      .setResolution(2);
    container.add(this.figure);

    void this.read(slot);
    this.timer = setInterval(() => void this.read(slot), PULSE_REFRESH_MS);
    return () => this.destroy();
  }

  /**
   * The striped plank, a pixel row at a time.
   *
   * A row at a time because the stripes are at forty-five degrees and a
   * parallelogram would hang off both ends of the plank: every row is its
   * own set of runs, clamped to the plank, which is both the clipping and
   * the staircase a diagonal is in pixel art. Drawn once and left alone.
   */
  private plank(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const left = -WIDTH / 2;
    g.fillStyle(DARK, 1);
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

  /** What the board says is stuck, and whether anything is. */
  private async read(slot: number) {
    const flow = await readRoomFlow(slot);
    // The scene may have restarted while we were waiting.
    if (!this.container?.active) return;
    this.show(flow?.blocked ?? 0);
  }

  private show(blocked: number) {
    const container = this.container;
    const figure = this.figure;
    if (!container || !figure) return;

    // Nothing stuck is nothing to look at: the room is clear and says so
    // by having no barrier in it.
    if (blocked <= 0) {
      container.setVisible(false);
      this.standing = 0;
      return;
    }

    const text = String(blocked);
    figure.setFontSize(sizeFor(text)).setText(text);
    container.setVisible(true);
    // A number that moved says so once, the way a count on the wall does —
    // and a barrier that has just gone up is the same news.
    if (this.standing !== null && this.standing !== blocked) this.flash();
    this.standing = blocked;
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
    this.container?.destroy(true);
    this.container = null;
    this.plate = null;
    this.figure = null;
    this.standing = null;
  }
}

/**
 * The largest size the figure fits the plate at.
 *
 * Press Start 2P is monospace and advances by its own size, so the width
 * is the character count times the size — a board with a hundred stuck
 * cards is a smaller number rather than one drawn over its own frame.
 */
function sizeFor(text: string): number {
  const room = PLATE - 10;
  return (
    FIGURE_SIZES.find((size) => text.length * size <= room) ?? FIGURE_SIZES[FIGURE_SIZES.length - 1]
  );
}
