import { describe, it, expect } from "vitest";
import {
  PULSE_METRICS,
  atOrAfter,
  countSince,
  commonZone,
  countStatuses,
  dayStart,
  dayStartIn,
  pulseBars,
  pulseFigure,
  readableBefore,
  toPulse,
  zoneOffset,
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

describe("dayStartIn", () => {
  /**
   * The whole point: the same instant is a different day depending on whose
   * clock you ask, and the desk's is the one that decides. Halifax is four
   * hours behind UTC in winter and three in summer, so 02:00 UTC is still
   * yesterday evening there.
   */
  it("is midnight where the desk is, not where the server is", () => {
    // 02:00 UTC on the 8th is 23:00 on the 7th in Halifax (UTC-3 in
    // September), so the desk's day started at 03:00 UTC on the 7th.
    const start = dayStartIn(at("2026-09-08T02:00:00Z"), "America/Halifax");
    expect(new Date(start).toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("agrees with UTC when the desk keeps UTC", () => {
    expect(new Date(dayStartIn(at("2026-09-08T12:34:56Z"), "UTC")).toISOString()).toBe(
      "2026-09-08T00:00:00.000Z",
    );
  });

  it("lands on midnight in the desk's own zone", () => {
    for (const zone of ["America/Halifax", "America/Toronto", "Europe/London", "Asia/Kolkata"]) {
      const start = dayStartIn(at("2026-09-08T12:00:00Z"), zone);
      const reads = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(start));
      expect(reads, zone).toBe("00:00");
    }
  });

  /** Half-hour and three-quarter-hour offsets are where naive maths breaks. */
  it("handles a zone that is not a whole number of hours from UTC", () => {
    for (const zone of ["Asia/Kolkata", "Australia/Eucla", "Pacific/Chatham"]) {
      const start = dayStartIn(at("2026-09-08T12:00:00Z"), zone);
      expect(start % 60_000, zone).toBe(0);
      expect(new Date(start).getTime(), zone).toBeLessThanOrEqual(at("2026-09-08T12:00:00Z"));
    }
  });

  /**
   * The two days a year the clocks move, the offset in force now is not the
   * offset that was in force at midnight. Checked from after the change on
   * both of them.
   */
  it("still lands on midnight on the days the clocks change", () => {
    const zone = "America/Halifax";
    // Spring forward: 02:00 becomes 03:00 on 8 March 2026.
    const spring = dayStartIn(at("2026-03-08T18:00:00Z"), zone);
    // Fall back: 02:00 becomes 01:00 on 1 November 2026.
    const autumn = dayStartIn(at("2026-11-01T18:00:00Z"), zone);
    for (const [name, start] of [
      ["spring", spring],
      ["autumn", autumn],
    ] as const) {
      const reads = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(start));
      expect(reads, name).toBe("00:00");
    }
  });

  it("does not move within the desk's own day", () => {
    const zone = "America/Halifax";
    const morning = dayStartIn(at("2026-09-08T13:00:00Z"), zone);
    expect(dayStartIn(morning + 60_000, zone)).toBe(morning);
    expect(dayStartIn(morning + 20 * 3_600_000, zone)).toBe(morning);
  });

  /** No zone, or one this runtime has never heard of: the server's own day. */
  it("falls back to the server's midnight", () => {
    const now = at("2026-09-08T12:00:00Z");
    expect(dayStartIn(now, null)).toBe(dayStart(now));
    expect(dayStartIn(now, "Middle/Earth")).toBe(dayStart(now));
    expect(dayStartIn(now, "")).toBe(dayStart(now));
  });
});

describe("zoneOffset", () => {
  it("reads a whole-hour offset", () => {
    expect(zoneOffset(at("2026-09-08T12:00:00Z"), "UTC")).toBe(0);
    // September: Atlantic Daylight Time, three hours behind.
    expect(zoneOffset(at("2026-09-08T12:00:00Z"), "America/Halifax")).toBe(-3 * 3_600_000);
    // January: Atlantic Standard Time, four.
    expect(zoneOffset(at("2026-01-08T12:00:00Z"), "America/Halifax")).toBe(-4 * 3_600_000);
  });

  it("reads a half-hour offset", () => {
    expect(zoneOffset(at("2026-09-08T12:00:00Z"), "Asia/Kolkata")).toBe(5.5 * 3_600_000);
  });

  it("ignores the milliseconds the formatter cannot see", () => {
    const offset = zoneOffset(at("2026-09-08T12:00:00Z") + 456, "America/Halifax");
    expect(offset).toBe(-3 * 3_600_000);
  });

  it("answers null for a zone it does not know", () => {
    expect(zoneOffset(at("2026-09-08T12:00:00Z"), "Middle/Earth")).toBeNull();
  });
});

describe("commonZone", () => {
  /**
   * The desk this was written against: four agents, three in Halifax and
   * one in Toronto. The majority is the desk.
   */
  it("takes the timezone the most of the desk's people keep", () => {
    expect(
      commonZone(["America/Halifax", "America/Toronto", "America/Halifax", "America/Halifax"]),
    ).toBe("America/Halifax");
  });

  /** Deterministic, so the day boundary does not drift with Zoho's ordering. */
  it("breaks a tie the same way every time", () => {
    const tied = ["America/Toronto", "America/Halifax"];
    expect(commonZone(tied)).toBe("America/Halifax");
    expect(commonZone([...tied].reverse())).toBe("America/Halifax");
  });

  it("ignores agents with no timezone on them", () => {
    expect(commonZone([null, undefined, "", "  ", "Europe/London"])).toBe("Europe/London");
  });

  it("answers null when nobody has one", () => {
    expect(commonZone([])).toBeNull();
    expect(commonZone([null, undefined, ""])).toBeNull();
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

/**
 * The question a sweep that stops early has to ask, and why it is not simply
 * `!atOrAfter`.
 *
 * The closed-today sweep reads pages newest-first and stops at the first
 * ticket older than midnight, on the reasoning that everything behind it is
 * older still. `!atOrAfter` says true for a *missing* stamp as well as an old
 * one — and a Closed ticket with no `closedTime` (a workflow, an import) can
 * land anywhere under `sortBy=-closedTime`. One at the head of page one ended
 * the sweep having counted nothing, and the Support wall read "CLOSED TODAY
 * 0", which is precisely what a quiet desk looks like.
 */
describe("readableBefore", () => {
  const from = at("2026-09-08T00:00:00Z");

  it("stops on a stamp that really is older", () => {
    expect(readableBefore("2026-09-07T23:59:59Z", from)).toBe(true);
  });

  it("does not stop on the boundary or anything after it", () => {
    expect(readableBefore("2026-09-08T00:00:00Z", from)).toBe(false);
    expect(readableBefore("2026-09-08T09:00:00Z", from)).toBe(false);
  });

  it("does not stop on a stamp it cannot read", () => {
    expect(readableBefore(null, from)).toBe(false);
    expect(readableBefore(undefined, from)).toBe(false);
    expect(readableBefore("", from)).toBe(false);
    expect(readableBefore("whenever", from)).toBe(false);
  });

  /**
   * The two are deliberately not complements: an unreadable stamp is neither
   * inside the day nor grounds for saying the rest of the desk is outside it.
   */
  it("leaves an unreadable stamp out of both answers", () => {
    for (const stamp of [null, undefined, "", "whenever"]) {
      expect(atOrAfter(stamp, from)).toBe(false);
      expect(readableBefore(stamp, from)).toBe(false);
    }
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
  const from = dayStartIn(at("2026-09-08T12:00:00Z"), "America/Halifax");
  const today = new Date(from + 3_600_000).toISOString();
  const yesterday = new Date(from - 3_600_000).toISOString();

  const pulse = (over: Partial<Parameters<typeof toPulse>[0]> = {}) =>
    toPulse({
      statuses: ["New", "Queue", "In Progress"],
      standing: [],
      opened: [],
      closed: [],
      capped: [],
      since: from,
      timeZone: "America/Halifax",
      zone: "agents",
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

  it("says which midnight today is measured from, and whose", () => {
    expect(pulse().since).toBe(new Date(from).toISOString());
    expect(pulse().timeZone).toBe("America/Halifax");
    expect(pulse().zone).toBe("agents");
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
