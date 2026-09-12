import * as Phaser from "phaser";
import { PULSE_METRICS, pulseBars, pulseFigure, type Pulse } from "@/lib/zoho/pulse";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { CountBoard, type CountBay, type CountReading } from "./CountBoard";

const log = createLogger("SupportPulse");

/**
 * The desk's numbers, in the two places they hang.
 *
 * `SupportPulse` is the plate on Support's own wall: five counts, the
 * standing three and the day's two. `DeskWeek` is the week, lettered on the
 * corridor wall outside the room, where the floor writes its own name.
 * Same desk, one read each, and both of them read the room's own server
 * rather than Zoho.
 *
 * The plate, the bays and the timer are `systems/CountBoard`, which the
 * project board's stage counts next door are drawn by too. What is here is
 * the part that is this board and not that one: two banks rather than one
 * row, the desk as where the numbers come from, and the dash that a desk
 * nobody has configured leaves behind.
 *
 * Two banks with a line between them, because the split is what makes the
 * bars mean anything: three numbers standing on the desk right now, and two
 * that are a day's traffic. One scale across all five would measure a
 * standing total against a day's flow, which is not a comparison — see
 * `pulseBars`.
 */

/**
 * The bays on the plate, in the order they hang: one row per bank.
 *
 * The week's two are named here by their absence. They are the same desk
 * and they come off the same read, but the plate is five tiles of wall with
 * two rows on it — a third bank would take every figure down a size to make
 * room for one nobody asked the wall for. They hang outside instead.
 */
const ROWS: readonly (readonly CountBay[])[] = ["standing", "today"].map((bank) =>
  PULSE_METRICS.filter((metric) => metric.bank === bank).map((metric) => ({
    id: metric.id,
    short: metric.short,
    colour: metric.colour,
  })),
);

/**
 * The counts, from the room's own server.
 *
 * A desk that is not configured, or one that cannot be reached, answers
 * null — and both things that draw them show that as a dash rather than as
 * a zero, since a quiet desk and no desk at all must not look alike.
 */
async function readDesk(): Promise<Pulse | null> {
  try {
    const response = await fetch("/api/zoho/pulse", { cache: "no-store" });
    const answer = (await response.json()) as { configured?: boolean; pulse?: Pulse };
    return answer?.pulse ?? null;
  } catch (err) {
    log.warn("could not count the desk:", (err as Error).message);
    return null;
  }
}

async function readPulse(): Promise<ReadonlyMap<string, CountReading> | null> {
  const pulse = await readDesk();
  if (!pulse) return null;

  const bars = pulseBars(pulse.counts);
  const reading = new Map<string, CountReading>();
  for (const metric of PULSE_METRICS) {
    const value = pulse.counts[metric.id];
    reading.set(metric.id, {
      figure: pulseFigure(value, pulse.capped.includes(metric.id)),
      fill: bars[metric.id],
      value,
    });
  }
  return reading;
}

export class SupportPulse {
  private board: CountBoard;

  constructor(scene: Phaser.Scene) {
    this.board = new CountBoard(scene, {
      rows: ROWS,
      divider: true,
      read: readPulse,
      every: PULSE_REFRESH_MS,
      what: "the desk",
    });
  }

  /** Build it at the footprint the map made solid; hands back its teardown. */
  place(box: { tx: number; ty: number; tw: number; th: number }, tile: number): () => void {
    return this.board.place(box, tile);
  }
}

/**
 * The week, lettered on the corridor wall outside Support.
 *
 * Painted lettering rather than a board, which is the whole of the
 * difference from the plate inside: no plate, no bays, no bars, and the
 * wall's own two colours rather than the HUD's. The corridor wall already
 * carries the floor's name at this size — this is two more things written
 * on it, and it has to read as part of the building rather than as a screen
 * somebody hung there.
 *
 * Which is also why nothing here flashes when a number moves. A board is a
 * display and news on it is news; paint does not change while you watch it,
 * and a wall that pulses reads as a fault.
 *
 * The counts are `opened-week` and `closed-week` off the same read the
 * plate uses, on the same beat, which the server holds them for — see
 * `PULSE_REFRESH_MS`.
 */

/** The two, in the order they are lettered. Left to right, as written. */
const WEEK = PULSE_METRICS.filter((metric) => metric.bank === "week");

/** What the wall says before anything has been counted, or when it cannot be. */
const NO_FIGURE = "—";

/** The wall's own lettering: the name's colour, and the line under it. */
const FONT = '"Press Start 2P", monospace';
const INK = "#3a3a50";
const LABEL = "#565972";

/** With the room's props, over the wall it is painted on — as a board is. */
const DEPTH = 4;

/**
 * Off the wall's top row, at the offsets the floor's own name uses against
 * it — so the headings sit on the line the building's name sits on and the
 * figures on the line under it, and the three read as one row of lettering
 * rather than as two things that happen to share a wall.
 */
const HEADING_Y = 92;
const FIGURE_Y = 100;

export class DeskWeek {
  private container: Phaser.GameObjects.Container | null = null;
  private figures = new Map<string, Phaser.GameObjects.Text>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private scene: Phaser.Scene) {}

  /**
   * Letter it at `at` — the two columns and the wall row `opsWeekCounts`
   * gives, which are tiles rather than a footprint because nothing here is
   * solid: it is paint on a wall that already is.
   *
   * Returns a teardown, because the scene restarts on every lift ride and
   * an interval that outlives it goes on fetching for a room nobody is in.
   */
  place(at: { tx: readonly number[]; ty: number }, tile: number): () => void {
    const container = this.scene.add.container(0, at.ty * tile).setDepth(DEPTH);
    this.container = container;

    for (const [i, metric] of WEEK.entries()) {
      const x = (at.tx[i] ?? at.tx[at.tx.length - 1]) * tile;
      container.add(
        this.scene.add
          .text(x, HEADING_Y, metric.short, {
            fontFamily: FONT,
            fontSize: "12px",
            color: LABEL,
          })
          .setOrigin(0.5, 1)
          .setResolution(2),
      );
      const figure = this.scene.add
        .text(x, FIGURE_Y, NO_FIGURE, { fontFamily: FONT, fontSize: "22px", color: INK })
        .setOrigin(0.5, 0)
        .setResolution(2);
      container.add(figure);
      this.figures.set(metric.id, figure);
    }

    void this.read();
    this.timer = setInterval(() => void this.read(), PULSE_REFRESH_MS);
    return () => this.destroy();
  }

  private async read() {
    const pulse = await readDesk();
    // The scene may have restarted while we were waiting.
    if (!this.container?.active) return;
    for (const metric of WEEK) {
      this.figures
        .get(metric.id)
        ?.setText(
          pulse
            ? pulseFigure(pulse.counts[metric.id], pulse.capped.includes(metric.id))
            : NO_FIGURE,
        );
    }
  }

  private destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.container?.destroy(true);
    this.container = null;
    this.figures.clear();
  }
}
