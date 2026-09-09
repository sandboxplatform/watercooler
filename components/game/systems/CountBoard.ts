import * as Phaser from "phaser";
import { createLogger } from "@/lib/logger";

const log = createLogger("CountBoard");

/**
 * A board on a wall whose picture is its numbers.
 *
 * There are two of them on Sandbox ERP's Operations floor — the support
 * desk's five counts in Support, and the project board's five stages next
 * door — and they are the same object: a plate, a row or two of bays, a
 * heading and a figure and a bar in each, and a timer that keeps them
 * current. Only what the bays are called and where the numbers come from
 * differ, so that is all an adapter passes in.
 *
 * It is drawn rather than delivered as art for the reason the first one
 * was: a static image under live text would be a second, wrong copy of it.
 * `systems/FixtureManager` still owns the `Press E` and the panel, from the
 * registry entry, which is where the readable version lives — a wall in a
 * room the camera has scaled to fit a lobby is about half size on a phone,
 * and no amount of care with the lettering fixes that.
 *
 * The pair of them were nearly two hundred lines apiece of identical
 * geometry, which is the shape of duplication this codebase has been bitten
 * by twice: the copies drift, and a wall that draws is not a wall that is
 * right.
 */

/** Stands with the room's other props, over the wall it hangs on. */
const DEPTH = 4;

/** The plate, in the HUD's own colours: this is a screen on a wall. */
const PLATE = 0x1b1b2a;
const EDGE = 0x3a3a50;
const TRACK = 0x2a2a3e;
const LABEL = "#8f8aa8";
const DEAD = "#5c5f7a";

/** Inside the plate's border, and between the rows. */
const PAD = 6;
const BORDER = 2;
const BAR_H = 4;

/** The widest the figure is drawn, and the sizes it falls back through. */
const FIGURE_SIZES = [22, 18, 14, 11] as const;
/**
 * The same for a heading, which is usually a word rather than a number.
 *
 * Eight is the size these boards were built at and every short heading fits
 * a bay at it. The two below are for a lane somebody has named "Awaiting
 * Deployment": a size down beats a heading drawn over its neighbour's.
 */
const HEADING_SIZES = [8, 7, 6] as const;

/** What a bay shows while nothing has been read yet, or cannot be. */
const NO_FIGURE = "—";

/** One bay on the plate: what it is called, and what colour it lights up. */
export interface CountBay {
  id: string;
  /** As the wall letters it. Short — eighty pixels of bay, eight to a letter. */
  short: string;
  colour: string;
}

/** What a bay shows, once somebody has counted. */
export interface CountReading {
  /** The number as the wall writes it: a floor says so, a gap is a dash. */
  figure: string;
  /** How full the bar stands, 0 to 1. */
  fill: number;
  /**
   * The number itself, for noticing that it moved. Kept apart from the
   * figure so "12" and "12+" are not the same news.
   */
  value: number;
}

export interface CountBoardSpec {
  /**
   * The bays, row by row as they hang. One row or two: three across is what
   * fits a five-tile plate at a size worth calling legible, so five bays
   * wrap the way a line of text does.
   */
  rows: readonly (readonly CountBay[])[];
  /**
   * A line between the rows.
   *
   * On where the rows mean different things — the support board's two are
   * a standing total and a day's traffic, scaled separately, and the line
   * is what says so. Off where they are one thing wrapped, which a line
   * would cut in half.
   */
  divider?: boolean;
  /**
   * Read the numbers. Null — nothing configured, nothing reachable — leaves
   * every bay showing a dash rather than a zero: five zeros is a quiet
   * Monday, and this is neither.
   */
  read: () => Promise<ReadonlyMap<string, CountReading> | null>;
  /** How often to read again. */
  every: number;
  /** For the log line, when a read fails. */
  what: string;
}

interface Bay {
  bay: CountBay;
  figure: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  /** The track the bar fills, so the fill can be sized against it. */
  width: number;
}

/**
 * The largest size at which a string fits the room it has.
 *
 * Press Start 2P is monospace and advances by its own size, so the width is
 * the character count times the size — no measuring needed, and a three
 * digit count shrinks rather than running over the bay next to it.
 */
function sizeFor(text: string, room: number, sizes: readonly number[]): number {
  return sizes.find((size) => text.length * size <= room) ?? sizes[sizes.length - 1];
}

export class CountBoard {
  private container: Phaser.GameObjects.Container | null = null;
  private bays = new Map<string, Bay>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counts = new Map<string, number>();
  /**
   * Whether anything has been painted yet. The flash is for a number that
   * moved, and on the first read every number has "moved" — five figures
   * pulsing at once reads as a fault rather than as news.
   */
  private painted = false;

  constructor(
    private scene: Phaser.Scene,
    private spec: CountBoardSpec,
  ) {}

  /**
   * Build the board at `box` — the tile footprint the map made solid, so
   * the picture lands exactly where the wall says it is.
   *
   * Returns a teardown, because the scene restarts on every lift ride and
   * an interval that outlives it goes on fetching for a room nobody is in.
   */
  place(box: { tx: number; ty: number; tw: number; th: number }, tile: number): () => void {
    const width = box.tw * tile;
    const height = box.th * tile;
    const container = this.scene.add.container(box.tx * tile, box.ty * tile).setDepth(DEPTH);
    this.container = container;

    const plate = this.scene.add.rectangle(0, 0, width, height, PLATE).setOrigin(0, 0);
    plate.setStrokeStyle(BORDER, EDGE);
    container.add(plate);

    const rows = this.spec.rows.filter((row) => row.length > 0);
    const rowH = (height - PAD * 2) / Math.max(1, rows.length);
    for (const [r, row] of rows.entries()) {
      const y = PAD + r * rowH;
      if (r > 0 && this.spec.divider) {
        container.add(this.scene.add.rectangle(PAD, y, width - PAD * 2, 1, EDGE).setOrigin(0, 0.5));
      }
      const bayW = (width - PAD * 2) / row.length;
      for (const [i, bay] of row.entries()) {
        container.add(this.bay(bay, PAD + i * bayW, y, bayW, rowH));
      }
    }

    void this.read();
    this.timer = setInterval(() => void this.read(), this.spec.every);
    return () => this.destroy();
  }

  /** One bay: its heading, its figure, and the bar under both. */
  private bay(
    bay: CountBay,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.GameObject[] {
    const centre = x + width / 2;
    const heading = this.scene.add
      .text(centre, y + 2, bay.short, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${sizeFor(bay.short, width - 4, HEADING_SIZES)}px`,
        color: LABEL,
      })
      .setOrigin(0.5, 0)
      .setResolution(2);

    const figure = this.scene.add
      .text(centre, y + height - BAR_H - 6, NO_FIGURE, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${FIGURE_SIZES[0]}px`,
        color: DEAD,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    const trackW = width - 8;
    const track = this.scene.add
      .rectangle(centre, y + height - BAR_H, trackW, BAR_H, TRACK)
      .setOrigin(0.5, 0);
    const bar = this.scene.add
      .rectangle(centre - trackW / 2, y + height - BAR_H, 0, BAR_H, EDGE)
      .setOrigin(0, 0);

    this.bays.set(bay.id, { bay, figure, bar, width: trackW });
    return [heading, figure, track, bar];
  }

  /** Read the numbers and light the board. */
  private async read() {
    let reading: ReadonlyMap<string, CountReading> | null = null;
    try {
      reading = await this.spec.read();
    } catch (err) {
      log.warn(`could not read ${this.spec.what}:`, (err as Error).message);
    }
    // The scene may have restarted while we were waiting.
    if (!this.container?.active) return;
    this.paint(reading);
  }

  private paint(reading: ReadonlyMap<string, CountReading> | null) {
    for (const bay of this.bays.values()) {
      const value = reading?.get(bay.bay.id);
      if (!value) {
        bay.figure.setText(NO_FIGURE).setFontSize(FIGURE_SIZES[0]).setColor(DEAD);
        bay.bar.setDisplaySize(0, BAR_H);
        continue;
      }
      bay.figure
        .setFontSize(sizeFor(value.figure, bay.width, FIGURE_SIZES))
        .setText(value.figure)
        .setColor(bay.bay.colour);
      bay.bar.setFillStyle(Phaser.Display.Color.HexStringToColor(bay.bay.colour).color);
      bay.bar.setDisplaySize(Math.round(value.fill * bay.width), BAR_H);
      // A number that just moved says so, once. It is the only animation on
      // the board, and it is the thing worth noticing from across the room.
      if (this.painted && this.counts.get(bay.bay.id) !== value.value) this.flash(bay.figure);
      this.counts.set(bay.bay.id, value.value);
    }
    if (reading) this.painted = true;
  }

  /** A single beat on a figure that changed. */
  private flash(figure: Phaser.GameObjects.Text) {
    this.scene.tweens.add({
      targets: figure,
      alpha: { from: 0.25, to: 1 },
      duration: 420,
      ease: "Quad.easeOut",
    });
  }

  private destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.container?.destroy(true);
    this.container = null;
    this.bays.clear();
    this.counts.clear();
    this.painted = false;
  }
}
