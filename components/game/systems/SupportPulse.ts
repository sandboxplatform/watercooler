import * as Phaser from "phaser";
import {
  PULSE_METRICS,
  pulseBars,
  pulseFigure,
  type Pulse,
  type PulseId,
  type PulseMetric,
} from "@/lib/zoho/pulse";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";

const log = createLogger("SupportPulse");

/**
 * The five counts, lit up on the wall of Support.
 *
 * The one fixture whose picture is its numbers. Everything else you walk up
 * to is a sprite with a panel behind it; this has to be legible from the
 * doorway without pressing anything, because the whole point of it is the
 * glance — how much work is standing, and which way today went.
 *
 * So it is drawn here rather than delivered as art: a plate, five bays, and
 * text this system keeps current. `systems/FixtureManager` still owns the
 * `Press E` and the panel, from the registry entry, which is where the
 * readable version of the same five numbers lives — a wall in a room the
 * camera has scaled to fit a lobby is about half size on a phone, and no
 * amount of care with the lettering fixes that.
 */

/** Stands with the room's other props, over the wall it hangs on. */
const DEPTH = 4;

/** The plate, in the HUD's own colours: this is a screen on a wall. */
const PLATE = 0x1b1b2a;
const EDGE = 0x3a3a50;
const TRACK = 0x2a2a3e;
const LABEL = "#8f8aa8";
const DEAD = "#5c5f7a";

/** Inside the plate's border, and between the two banks. */
const PAD = 6;
const BORDER = 2;
const BAR_H = 4;

/** The widest the figure is drawn, and the sizes it falls back through. */
const FIGURE_SIZES = [22, 18, 14, 11] as const;
const LABEL_SIZE = 8;

/** What a bay shows while nothing has been read yet, or cannot be. */
const NO_FIGURE = "—";

interface Bay {
  metric: PulseMetric;
  figure: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  /** The track the bar fills, so the fill can be sized against it. */
  width: number;
  x: number;
}

/**
 * The largest size at which a figure fits its bay.
 *
 * Press Start 2P is monospace and advances by its own size, so the width is
 * the character count times the size — no measuring needed, and a three
 * digit count shrinks rather than running over the bay next to it.
 */
function figureSize(figure: string, room: number): number {
  const fits = FIGURE_SIZES.find((size) => figure.length * size <= room);
  return fits ?? FIGURE_SIZES[FIGURE_SIZES.length - 1];
}

export class SupportPulse {
  private container: Phaser.GameObjects.Container | null = null;
  private bays = new Map<PulseId, Bay>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counts = new Map<PulseId, number>();
  /**
   * Whether anything has been painted yet. The flash is for a number that
   * moved, and on the first read every number has "moved" — five figures
   * pulsing at once reads as a fault rather than as news.
   */
  private painted = false;

  constructor(private scene: Phaser.Scene) {}

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

    // Two banks, one above the other: what is standing now, and what moved
    // today. Three bays across the top and two across the bottom, because
    // the bottom pair carry the longer headings.
    const bankH = (height - PAD * 2) / 2;
    const banks = [
      { bank: "standing" as const, y: PAD },
      { bank: "today" as const, y: PAD + bankH },
    ];
    const divider = this.scene.add
      .rectangle(PAD, PAD + bankH, width - PAD * 2, 1, EDGE)
      .setOrigin(0, 0.5);
    container.add(divider);

    for (const { bank, y } of banks) {
      const metrics = PULSE_METRICS.filter((metric) => metric.bank === bank);
      const bayW = (width - PAD * 2) / metrics.length;
      for (const [i, metric] of metrics.entries()) {
        const x = PAD + i * bayW;
        container.add(this.bay(metric, x, y, bayW, bankH));
      }
    }

    void this.read();
    this.timer = setInterval(() => void this.read(), PULSE_REFRESH_MS);
    return () => this.destroy();
  }

  /** One bay: its heading, its figure, and the bar under both. */
  private bay(
    metric: PulseMetric,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.GameObject[] {
    const centre = x + width / 2;
    const heading = this.scene.add
      .text(centre, y + 2, metric.short, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${LABEL_SIZE}px`,
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

    this.bays.set(metric.id, { metric, figure, bar, width: trackW, x: centre - trackW / 2 });
    return [heading, figure, track, bar];
  }

  /**
   * Read the counts and light the board.
   *
   * A desk that is not configured, or one that cannot be reached, leaves
   * every bay showing a dash rather than a zero — five zeros is a quiet
   * Monday, and this is neither.
   */
  private async read() {
    let answer: { configured?: boolean; pulse?: Pulse } | null = null;
    try {
      const response = await fetch("/api/zoho/pulse", { cache: "no-store" });
      answer = (await response.json()) as { configured?: boolean; pulse?: Pulse };
    } catch (err) {
      log.warn("could not count the desk:", (err as Error).message);
    }
    // The scene may have restarted while we were waiting.
    if (!this.container?.active) return;
    this.paint(answer?.pulse ?? null);
  }

  private paint(pulse: Pulse | null) {
    const bars = pulse ? pulseBars(pulse.counts) : null;
    for (const bay of this.bays.values()) {
      if (!pulse || !bars) {
        bay.figure.setText(NO_FIGURE).setFontSize(FIGURE_SIZES[0]).setColor(DEAD);
        bay.bar.setDisplaySize(0, BAR_H);
        continue;
      }
      const value = pulse.counts[bay.metric.id];
      const figure = pulseFigure(value, pulse.capped.includes(bay.metric.id));
      bay.figure
        .setFontSize(figureSize(figure, bay.width))
        .setText(figure)
        .setColor(bay.metric.colour);
      bay.bar.setFillStyle(Phaser.Display.Color.HexStringToColor(bay.metric.colour).color);
      bay.bar.setDisplaySize(Math.round(bars[bay.metric.id] * bay.width), BAR_H);
      // A number that just moved says so, once. It is the only animation on
      // the board, and it is the thing worth noticing from across the room.
      if (this.painted && this.counts.get(bay.metric.id) !== value) this.flash(bay.figure);
      this.counts.set(bay.metric.id, value);
    }
    if (pulse) this.painted = true;
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
