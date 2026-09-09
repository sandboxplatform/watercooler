import * as Phaser from "phaser";
import { PULSE_METRICS, pulseBars, pulseFigure, type Pulse } from "@/lib/zoho/pulse";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { CountBoard, type CountBay, type CountReading } from "./CountBoard";

const log = createLogger("SupportPulse");

/**
 * The five counts, lit up on the wall of Support.
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

/** The bays, in the order they hang: one row per bank. */
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
 * null and every bay shows a dash.
 */
async function readPulse(): Promise<ReadonlyMap<string, CountReading> | null> {
  let answer: { configured?: boolean; pulse?: Pulse } | null = null;
  try {
    const response = await fetch("/api/zoho/pulse", { cache: "no-store" });
    answer = (await response.json()) as { configured?: boolean; pulse?: Pulse };
  } catch (err) {
    log.warn("could not count the desk:", (err as Error).message);
  }
  const pulse = answer?.pulse;
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
