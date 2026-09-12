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
  sweptPast,
  toPulse,
  weekStart,
  weekStartIn,
  zoneOffset,
} from "../pulse";

/**
 * The arithmetic behind the numbers on a wall.
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

describe("weekStart", () => {
  /**
   * Monday, because a support desk's week is a working week — a Sunday
   * ticket belongs with the weekend it arrived in rather than opening the
   * week that is about to be worked.
   */
  it("steps back to Monday morning", () => {
    const monday = weekStart(at("2026-09-09T15:00:00Z"));
    expect(new Date(monday).getDay()).toBe(1);
    expect(new Date(monday).getHours()).toBe(0);
    expect(new Date(monday).getMinutes()).toBe(0);
  });

  /** A Monday is its own week's start, not last week's. */
  it("leaves a Monday where it is", () => {
    const at9 = new Date(2026, 8, 7, 9, 30);
    const start = new Date(weekStart(at9.getTime()));
    expect(start.getDate()).toBe(7);
    expect(start.getHours()).toBe(0);
  });

  /** Sunday is the end of a week here, six days from its Monday. */
  it("puts Sunday at the end of its own week", () => {
    const sunday = new Date(2026, 8, 13, 23, 0);
    const start = new Date(weekStart(sunday.getTime()));
    expect(start.getDate()).toBe(7);
  });
});

describe("weekStartIn", () => {
  const zone = "America/Halifax";
  // Assembled from the parts rather than taken as a formatted string: how
  // a locale punctuates between a weekday and a time is up to the ICU the
  // runtime was built with, and it is not what any of this is about.
  const reads = (at: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${part("weekday")} ${part("hour")}:${part("minute")}`;
  };

  it("is midnight on Monday where the desk is", () => {
    expect(reads(weekStartIn(at("2026-09-10T12:00:00Z"), zone))).toBe("Mon 00:00");
  });

  /**
   * A Halifax Monday starts at 04:00 UTC, so an instant between midnight
   * UTC and then is still Sunday on the desk's clock — and belongs to the
   * week before. Reading the boundary off the server's clock would open the
   * new week eight hours early, every week.
   */
  it("uses the desk's calendar day, not the server's", () => {
    const sundayThere = at("2026-09-14T02:00:00Z");
    expect(reads(weekStartIn(sundayThere, zone))).toBe("Mon 00:00");
    expect(weekStartIn(sundayThere, zone)).toBeLessThan(sundayThere - 6 * 86_400_000);
  });

  /**
   * The week the clocks go back is 169 hours long. Stepping back whole days
   * on a calendar lands on midnight anyway; subtracting days of
   * milliseconds from Sunday's midnight would land an hour inside Monday.
   */
  it("still lands on midnight across a clock change", () => {
    // Nova Scotia puts its clocks back on the first Sunday in November.
    expect(reads(weekStartIn(at("2026-11-05T12:00:00Z"), zone))).toBe("Mon 00:00");
    expect(reads(weekStartIn(at("2026-03-12T12:00:00Z"), zone))).toBe("Mon 00:00");
  });

  /** Today is always inside this week, whatever the clocks did. */
  it("never lands after the day it contains", () => {
    for (let day = 0; day < 14; day++) {
      const now = at("2026-11-01T09:00:00Z") + day * 86_400_000;
      expect(weekStartIn(now, zone)).toBeLessThanOrEqual(dayStartIn(now, zone));
      expect(now - weekStartIn(now, zone)).toBeLessThan(8 * 86_400_000);
    }
  });

  /** No zone, or one this runtime never heard of: the server's own Monday. */
  it("falls back to the server's week", () => {
    const now = at("2026-09-10T12:00:00Z");
    expect(weekStartIn(now, null)).toBe(weekStart(now));
    expect(weekStartIn(now, "Mars/Olympus")).toBe(weekStart(now));
  });
});

describe("sweptPast", () => {
  const boundary = at("2026-09-08T00:00:00Z");
  const older = { createdTime: "2026-09-07T23:00:00Z" };
  const newer = { createdTime: "2026-09-08T01:00:00Z" };

  it("is true once the sweep has read something older", () => {
    expect(sweptPast([newer, older], "createdTime", boundary)).toBe(true);
  });

  /**
   * The whole point: a sweep that ran out of pages inside the week may
   * still have read every ticket raised today, and marking today's count a
   * floor on the week's account would be a floor where there is a total.
   */
  it("is false while everything read is newer", () => {
    expect(sweptPast([newer, newer], "createdTime", boundary)).toBe(false);
    expect(sweptPast([], "createdTime", boundary)).toBe(false);
  });

  /** A missing stamp is no evidence of having read far enough. */
  it("does not count an unreadable stamp as reaching back", () => {
    expect(sweptPast([{}, { createdTime: "whenever" }], "createdTime", boundary)).toBe(false);
  });
});

describe("toPulse", () => {
  // A Tuesday, so "yesterday" is still inside the week and the two
  // boundaries are a day apart rather than the same instant.
  const from = dayStartIn(at("2026-09-08T12:00:00Z"), "America/Halifax");
  const week = weekStartIn(at("2026-09-08T12:00:00Z"), "America/Halifax");
  const today = new Date(from + 3_600_000).toISOString();
  const yesterday = new Date(from - 3_600_000).toISOString();
  const lastWeek = new Date(week - 3_600_000).toISOString();

  const pulse = (over: Partial<Parameters<typeof toPulse>[0]> = {}) =>
    toPulse({
      statuses: ["New", "Queue", "In Progress"],
      standing: [],
      opened: [],
      closed: [],
      capped: [],
      since: from,
      weekSince: week,
      timeZone: "America/Halifax",
      zone: "agents",
      ...over,
    });

  it("fills the seven counters", () => {
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
      "opened-week": 2,
      "closed-week": 3,
    });
  });

  /**
   * The week's two are the day's two over a longer reach of the same swept
   * page — the whole point of sweeping to Monday rather than to midnight
   * twice. So today is always a subset of the week, and a ticket older than
   * Monday is in neither.
   */
  it("counts the week off the same sweep, and stops at Monday", () => {
    const view = pulse({
      opened: [{ createdTime: today }, { createdTime: yesterday }, { createdTime: lastWeek }],
      closed: [{ closedTime: yesterday }, { closedTime: lastWeek }],
    });
    expect(view.counts["opened-today"]).toBe(1);
    expect(view.counts["opened-week"]).toBe(2);
    expect(view.counts["closed-today"]).toBe(0);
    expect(view.counts["closed-week"]).toBe(1);
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

  /**
   * Its own field rather than left to the reader: "this week" is only
   * checkable if the panel can say which Monday, on whose clock.
   */
  it("says which Monday the week is measured from", () => {
    expect(pulse().weekSince).toBe(new Date(week).toISOString());
    expect(new Date(pulse().weekSince).getTime()).toBeLessThanOrEqual(
      new Date(pulse().since).getTime(),
    );
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
    "opened-week": 9,
    "closed-week": 11,
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
    expect(bars["opened-week"]).toBeCloseTo(9 / 20);
    expect(bars["closed-week"]).toBeCloseTo(11 / 20);
  });

  it("fills each bank, and only its own", () => {
    const bars = pulseBars(counts);
    for (const bank of ["standing", "today", "week"] as const) {
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
      "opened-week": 0,
      "closed-week": 0,
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

describe("the metrics", () => {
  it("are seven, each in one of the three banks", () => {
    expect(PULSE_METRICS).toHaveLength(7);
    expect(PULSE_METRICS.filter((m) => m.bank === "standing")).toHaveLength(3);
    expect(PULSE_METRICS.filter((m) => m.bank === "today")).toHaveLength(2);
    expect(PULSE_METRICS.filter((m) => m.bank === "week")).toHaveLength(2);
  });

  it("gives each its own id", () => {
    const ids = PULSE_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The plate's headings are drawn on five tiles of wall — two hundred and
   * forty pixels, less padding, split three across the top and two across
   * the bottom, in a font that advances by its own size. Twelve characters
   * is what the narrower of the two banks affords.
   *
   * The week's two are not on the plate, so they are not held to a bay:
   * they are lettered on the corridor wall outside, where what they have to
   * fit is a quarter of a stretch of wall. That is the test below.
   */
  it("keeps every heading on the plate short enough to fit its bay", () => {
    const room: Record<string, number> = { standing: (240 - 12) / 3, today: (240 - 12) / 2 };
    for (const metric of PULSE_METRICS) {
      const bay = room[metric.bank];
      if (bay === undefined) continue;
      expect(metric.short.length * 8, metric.short).toBeLessThanOrEqual(bay);
    }
  });

  /**
   * The narrowest stretch of corridor wall the week is ever lettered on is
   * nine tiles (see `opsWallRuns`), so each of the two has four and a half
   * of them — two hundred and sixteen pixels — at twelve to a letter.
   */
  it("keeps the week's headings short enough for the wall outside", () => {
    for (const metric of PULSE_METRICS.filter((m) => m.bank === "week")) {
      expect(metric.short.length * 12, metric.short).toBeLessThanOrEqual((9 / 2) * 48);
    }
  });
});
