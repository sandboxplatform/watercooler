/**
 * The five numbers on the Support room's wall.
 *
 * A support desk is read two ways. The queue itself — who asked what, and
 * how late it is — is the board beside this one (`tickets.ts`). This is the
 * other way: five counts that say how much work is standing and how much
 * moved today, big enough to read from the doorway.
 *
 * Everything here is pure. No fetching, no credentials, no clock of its
 * own, so the arithmetic can be checked without a network or a Zoho
 * account — which matters more than usual, because a wall reading 0 and a
 * wall reading nothing look the same from across the room.
 *
 * Read-only, like everything else downstream of Zoho.
 */

/** The five, in the order they hang. */
export type PulseId = "new" | "queue" | "in-progress" | "opened-today" | "closed-today";

export interface PulseMetric {
  id: PulseId;
  /** What the wall says. Short: eighty pixels of wall, at eight of them a letter. */
  short: string;
  /** What the panel says, where there is room for words. */
  label: string;
  /** One line saying what it counts, so nobody has to guess. */
  note: string;
  /** The colour it lights up in, on the wall and in the panel alike. */
  colour: string;
  /**
   * Which bank it belongs to. The two are scaled separately, because a bar
   * is only meaningful against the numbers standing next to it: "how much
   * of the open work is here", and "how much of today's traffic was this".
   * One scale across all five would measure a standing total against a
   * day's flow, which is not a comparison.
   */
  bank: "standing" | "today";
}

/**
 * The three statuses the standing counters ask Zoho for, in order.
 *
 * Every desk names its own, so this is the one part a deployment may need
 * to change: `ZOHO_PULSE_STATUSES` overrides it, comma separated, and the
 * names have to match the desk's Status picklist exactly — Zoho's filter is
 * by literal value. Sandbox ERP's desk carries New, Queue and In Progress
 * among its nine, which is where the default comes from.
 */
export const DEFAULT_PULSE_STATUSES = ["New", "Queue", "In Progress"] as const;

/** The status a closed ticket is in, which the closed-today sweep asks for. */
export const CLOSED_STATUS = "Closed";

export const PULSE_METRICS: readonly PulseMetric[] = [
  {
    id: "new",
    short: "NEW",
    label: "New",
    note: "Standing in New, waiting to be picked up",
    colour: "#faa53d",
    bank: "standing",
  },
  {
    id: "queue",
    short: "QUEUE",
    label: "Queue",
    note: "Standing in Queue, triaged and waiting its turn",
    colour: "#579dff",
    bank: "standing",
  },
  {
    id: "in-progress",
    short: "WIP",
    label: "In progress",
    note: "Somebody is working on it now",
    colour: "#a78bfa",
    bank: "standing",
  },
  {
    id: "opened-today",
    short: "OPENED TODAY",
    label: "Opened today",
    note: "Raised since midnight, whatever status they are in now",
    colour: "#7dd3fc",
    bank: "today",
  },
  {
    id: "closed-today",
    short: "CLOSED TODAY",
    label: "Closed today",
    note: "Closed since midnight, whenever they were raised",
    colour: "#6bd968",
    bank: "today",
  },
];

/** Which of the three standing counters each named status feeds, by position. */
const STANDING: readonly PulseId[] = ["new", "queue", "in-progress"];

export type PulseCounts = Record<PulseId, number>;

export interface Pulse {
  counts: PulseCounts;
  /**
   * Which counts are a floor rather than a total, because the sweep behind
   * them hit its page ceiling. Written as "600+" rather than quietly as
   * 600: a number that is wrong and looks right is worse than no number.
   */
  capped: PulseId[];
  /** The status names the standing counters asked for, in order. */
  statuses: string[];
  /** Midnight the two day counters are measured from, as an ISO instant. */
  since: string;
}

/** Midnight this morning, where the server stands. */
export function dayStart(now: number): number {
  const at = new Date(now);
  at.setHours(0, 0, 0, 0);
  return at.getTime();
}

/**
 * Whether an instant Zoho reported falls on or after `from`.
 *
 * Missing and unparseable both answer false. A ticket with no `closedTime`
 * is one Zoho has not closed, and counting it would put work on the wall
 * that nobody did.
 */
export function atOrAfter(stamp: string | null | undefined, from: number): boolean {
  if (!stamp) return false;
  const at = Date.parse(stamp);
  return Number.isFinite(at) && at >= from;
}

/**
 * How many of a swept page fall in each of the named statuses.
 *
 * Matched case-insensitively on the name, so a desk whose picklist reads
 * "In progress" is counted under the status that was asked for rather than
 * silently dropped — Zoho's own filter is literal, so anything that came
 * back was asked for by one of these names.
 */
export function countStatuses(
  tickets: readonly { status?: string }[],
  statuses: readonly string[],
): Record<string, number> {
  const wanted = new Map(statuses.map((name) => [name.trim().toLowerCase(), name]));
  const counts: Record<string, number> = Object.fromEntries(statuses.map((name) => [name, 0]));
  for (const ticket of tickets) {
    const name = wanted.get((ticket.status ?? "").trim().toLowerCase());
    if (name !== undefined) counts[name] += 1;
  }
  return counts;
}

/** How many of a swept page carry `field` on or after `from`. */
export function countSince(
  tickets: readonly Record<string, unknown>[],
  field: "createdTime" | "closedTime",
  from: number,
): number {
  let count = 0;
  for (const ticket of tickets) {
    if (atOrAfter(ticket[field] as string | null | undefined, from)) count += 1;
  }
  return count;
}

/**
 * The five counts, from three swept pages.
 *
 * The status names map onto the three standing counters by position, which
 * is what `ZOHO_PULSE_STATUSES` overrides: the first name asked for is the
 * left-hand bay whatever the desk calls it.
 */
export function toPulse(input: {
  statuses: readonly string[];
  standing: readonly { status?: string }[];
  opened: readonly Record<string, unknown>[];
  closed: readonly Record<string, unknown>[];
  capped: readonly PulseId[];
  now: number;
}): Pulse {
  const from = dayStart(input.now);
  const byStatus = countStatuses(input.standing, input.statuses);
  const counts = {
    new: 0,
    queue: 0,
    "in-progress": 0,
    "opened-today": countSince(input.opened, "createdTime", from),
    "closed-today": countSince(input.closed, "closedTime", from),
  } as PulseCounts;
  for (const [i, id] of STANDING.entries()) {
    const name = input.statuses[i];
    counts[id] = name === undefined ? 0 : (byStatus[name] ?? 0);
  }
  return {
    counts,
    capped: [...input.capped],
    statuses: [...input.statuses],
    since: new Date(from).toISOString(),
  };
}

/**
 * How full each bar stands, 0 to 1, within its own bank.
 *
 * Share of the bank rather than of some invented ceiling: the three
 * standing bars show where the open work is sitting, and the two day bars
 * show which way today went. An empty bank leaves every bar at zero rather
 * than dividing by nothing, which is the right picture of a quiet desk.
 */
export function pulseBars(counts: PulseCounts): Record<PulseId, number> {
  const totals = { standing: 0, today: 0 };
  for (const metric of PULSE_METRICS) totals[metric.bank] += Math.max(0, counts[metric.id]);
  const bars = {} as Record<PulseId, number>;
  for (const metric of PULSE_METRICS) {
    const total = totals[metric.bank];
    bars[metric.id] = total > 0 ? Math.max(0, counts[metric.id]) / total : 0;
  }
  return bars;
}

/**
 * The number as the wall writes it. A capped count says so with a "+",
 * because it is a floor and not a total.
 */
export function pulseFigure(value: number, capped: boolean): string {
  return capped ? `${value}+` : String(value);
}
