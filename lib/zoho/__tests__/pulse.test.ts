import { describe, it, expect } from "vitest";
import {
  PULSE_METRICS,
  atOrAfter,
  countSince,
  countStatuses,
  dayStart,
  pulseBars,
  pulseFigure,
  toPulse,
} from "../pulse";

/**
 * The arithmetic behind five numbers on a wall.
 *
 * Worth pinning down because a wrong count looks exactly like a right one:
 * there is nothing on the board to say a status was missed or that a ticket
 * closed last week was counted as today's. The sweeps that feed these are
 * ordinary Zoho pages; everything that turns them into the five figures is
 * here, and none of it needs a network.
 */

const at = (iso: string) => Date.parse(iso);

describe("dayStart", () => {
  it("is midnight this morning, where the server stands", () => {
    const noon = at("2026-09-08T12:34:56Z");
    const start = new Date(dayStart(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date(noon).getDate());
  });

  it("does not move within a day", () => {
    const morning = dayStart(at("2026-09-08T08:00:00Z"));
    expect(dayStart(morning + 60_000)).toBe(morning);
  });
});

describe("atOrAfter", () => {
  const from = at("2026-09-08T00:00:00Z");

  it("takes the boundary itself", () => {
    expect(atOrAfter("2026-09-08T00:00:00Z", from)).toBe(true);
  });

  it("refuses anything earlier", () => {
    expect(atOrAfter("2026-09-07T23:59:59Z", from)).toBe(false);
  });

  /**
   * A ticket with no `closedTime` is one Zoho has not closed. Counting it
   * would put work on the wall that nobody did.
   */
  it("refuses a stamp that is missing or nonsense", () => {
    expect(atOrAfter(null, from)).toBe(false);
    expect(atOrAfter(undefined, from)).toBe(false);
    expect(atOrAfter("", from)).toBe(false);
    expect(atOrAfter("whenever", from)).toBe(false);
  });
});

describe("countStatuses", () => {
  const statuses = ["New", "Queue", "In Progress"];

  it("counts each named status", () => {
    const counts = countStatuses(
      [
        { status: "New" },
        { status: "New" },
        { status: "In Progress" },
        { status: "Queue" },
        { status: "New" },
      ],
      statuses,
    );
    expect(counts).toEqual({ New: 3, Queue: 1, "In Progress": 1 });
  });

  it("names every status asked for, even an empty one", () => {
    expect(countStatuses([{ status: "New" }], statuses)).toEqual({
      New: 1,
      Queue: 0,
      "In Progress": 0,
    });
  });

  /** Zoho's filter is literal, so whatever came back was asked for. */
  it("does not mind how a desk capitalises its own statuses", () => {
    expect(countStatuses([{ status: "in progress" }, { status: " NEW " }], statuses)).toEqual({
      New: 1,
      Queue: 0,
      "In Progress": 1,
    });
  });

  it("ignores a status nobody asked about", () => {
    expect(countStatuses([{ status: "Under Consideration" }], statuses)).toEqual({
      New: 0,
      Queue: 0,
      "In Progress": 0,
    });
  });
});

describe("countSince", () => {
  const from = dayStart(at("2026-09-08T12:00:00Z"));
  const today = new Date(from + 3_600_000).toISOString();
  const yesterday = new Date(from - 3_600_000).toISOString();

  it("counts only what carries the field on or after the boundary", () => {
    const tickets = [
      { createdTime: today },
      { createdTime: yesterday },
      { createdTime: today },
      {},
    ];
    expect(countSince(tickets, "createdTime", from)).toBe(2);
  });

  it("reads the field it was asked for and no other", () => {
    const tickets = [{ createdTime: today, closedTime: yesterday }];
    expect(countSince(tickets, "createdTime", from)).toBe(1);
    expect(countSince(tickets, "closedTime", from)).toBe(0);
  });
});

describe("toPulse", () => {
  const now = at("2026-09-08T12:00:00Z");
  const from = dayStart(now);
  const today = new Date(from + 3_600_000).toISOString();
  const yesterday = new Date(from - 3_600_000).toISOString();

  const pulse = (over: Partial<Parameters<typeof toPulse>[0]> = {}) =>
    toPulse({
      statuses: ["New", "Queue", "In Progress"],
      standing: [],
      opened: [],
      closed: [],
      capped: [],
      now,
      ...over,
    });

  it("fills the five counters", () => {
    const view = pulse({
      standing: [{ status: "New" }, { status: "New" }, { status: "Queue" }],
      opened: [{ createdTime: today }, { createdTime: yesterday }],
      closed: [{ closedTime: today }, { closedTime: today }, { closedTime: yesterday }],
    });
    expect(view.counts).toEqual({
      new: 2,
      queue: 1,
      "in-progress": 0,
      "opened-today": 1,
      "closed-today": 2,
    });
  });

  /**
   * The three standing counters are positional, which is the whole of what
   * `ZOHO_PULSE_STATUSES` overrides: a desk that calls its second stage
   * something else still fills the middle bay.
   */
  it("maps the statuses onto the three bays by position", () => {
    const view = pulse({
      statuses: ["Fresh", "Waiting", "Working"],
      standing: [{ status: "Waiting" }, { status: "Working" }, { status: "Working" }],
    });
    expect(view.counts.new).toBe(0);
    expect(view.counts.queue).toBe(1);
    expect(view.counts["in-progress"]).toBe(2);
    expect(view.statuses).toEqual(["Fresh", "Waiting", "Working"]);
  });

  it("leaves a bay at zero when there is no status for it", () => {
    const view = pulse({ statuses: ["New"], standing: [{ status: "New" }] });
    expect(view.counts.new).toBe(1);
    expect(view.counts.queue).toBe(0);
    expect(view.counts["in-progress"]).toBe(0);
  });

  it("says which midnight today is measured from", () => {
    expect(pulse().since).toBe(new Date(from).toISOString());
  });

  it("carries the capped counters through", () => {
    expect(pulse({ capped: ["new", "queue", "in-progress"] }).capped).toEqual([
      "new",
      "queue",
      "in-progress",
    ]);
  });
});

describe("pulseBars", () => {
  const counts = {
    new: 3,
    queue: 1,
    "in-progress": 0,
    "opened-today": 2,
    "closed-today": 6,
  } as const;

  /**
   * Each bank is scaled against itself. One scale across all five would
   * measure a standing total against a day's flow, which is not a
   * comparison — a desk with a hundred tickets standing would flatten
   * both of today's bars to nothing whatever happened today.
   */
  it("gives each bar its share of its own bank", () => {
    const bars = pulseBars(counts);
    expect(bars.new).toBeCloseTo(3 / 4);
    expect(bars.queue).toBeCloseTo(1 / 4);
    expect(bars["in-progress"]).toBe(0);
    expect(bars["opened-today"]).toBeCloseTo(2 / 8);
    expect(bars["closed-today"]).toBeCloseTo(6 / 8);
  });

  it("fills each bank, and only its own", () => {
    const bars = pulseBars(counts);
    for (const bank of ["standing", "today"] as const) {
      const total = PULSE_METRICS.filter((m) => m.bank === bank).reduce(
        (sum, m) => sum + bars[m.id],
        0,
      );
      expect(total).toBeCloseTo(1);
    }
  });

  it("leaves a quiet desk empty rather than dividing by nothing", () => {
    const bars = pulseBars({
      new: 0,
      queue: 0,
      "in-progress": 0,
      "opened-today": 0,
      "closed-today": 0,
    });
    for (const metric of PULSE_METRICS) expect(bars[metric.id]).toBe(0);
  });
});

describe("pulseFigure", () => {
  it("writes a total plainly", () => {
    expect(pulseFigure(48, false)).toBe("48");
  });

  /** A floor that looks like a total is worse than no number. */
  it("marks a count that is only a floor", () => {
    expect(pulseFigure(600, true)).toBe("600+");
  });
});

describe("the five metrics", () => {
  it("are five, each in one of the two banks", () => {
    expect(PULSE_METRICS).toHaveLength(5);
    expect(PULSE_METRICS.filter((m) => m.bank === "standing")).toHaveLength(3);
    expect(PULSE_METRICS.filter((m) => m.bank === "today")).toHaveLength(2);
  });

  it("gives each its own id", () => {
    const ids = PULSE_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The headings are drawn on five tiles of wall — two hundred and forty
   * pixels, less padding, split three across the top and two across the
   * bottom, in a font that advances by its own size. Twelve characters is
   * what the narrower of the two banks affords.
   */
  it("keeps every wall heading short enough to fit its bay", () => {
    const room = { standing: (240 - 12) / 3, today: (240 - 12) / 2 };
    for (const metric of PULSE_METRICS) {
      expect(metric.short.length * 8, metric.short).toBeLessThanOrEqual(room[metric.bank]);
    }
  });
});
