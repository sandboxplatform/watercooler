/**
 * A Zoho Desk queue, as the wall in the office shows it.
 *
 * Zoho's tickets carry far more than a wall needs, so they are narrowed
 * here into columns by status. Everything in this file is pure: no
 * fetching, no credentials, no clock of its own, so the queue can be
 * checked without a network or a Zoho account.
 *
 * **It is the open queue, and only that.** A closed ticket is work that
 * has gone, and a lane of them on the end of the board is the one column
 * nobody walks up to a wall to read — it is the longest of them on any
 * desk that is keeping up, and it gets longer the better the week went.
 * What the desk has closed is said next door, in numbers: the two day
 * counters on Support's plate and the two weeks lettered in the corridor.
 * This is the work still to do.
 *
 * The office only ever reads. Nothing here replies to a ticket or changes
 * one.
 */

import { dueState, type DueState } from "../due";

// ── What Zoho sends ────────────────────────────────────

export interface RawPerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface RawTicket {
  id: string;
  ticketNumber?: string | number;
  subject?: string;
  status?: string;
  /** Zoho's coarse grouping: "Open" or "Closed". */
  statusType?: string;
  priority?: string | null;
  dueDate?: string | null;
  createdTime?: string;
  modifiedTime?: string;
  webUrl?: string;
  channel?: string;
  assignee?: RawPerson | null;
  contact?: RawPerson | null;
}

// ── What the wall shows ────────────────────────────────

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export interface DeskTicket {
  id: string;
  /** The number a person quotes on the phone, "#1043". */
  number: string;
  subject: string;
  status: string;
  priority: Priority;
  /** Who it is with, and who asked — names, never email addresses. */
  assignee: string | null;
  contact: string | null;
  channel: string | null;
  due: string | null;
  dueState: DueState;
  url: string;
}

export interface DeskColumn {
  name: string;
  /**
   * Zoho's coarse type for the status: "Open" or "On Hold". Never
   * "Closed" — those are left off the board entirely — but it is what
   * orders the two that are left, since a desk names its own statuses and
   * the coarse type is the only word Zoho guarantees.
   */
  statusType: string;
  tickets: DeskTicket[];
}

export interface DeskView {
  columns: DeskColumn[];
  /** Tickets on the board, which is to say the open ones. */
  ticketCount: number;
  /**
   * Closed tickets the page held, left off the board.
   *
   * Reported rather than dropped silently, because the page is the
   * hundred most recently *modified* tickets and closing one modifies it
   * — so a desk having a good afternoon spends much of its page on work
   * that is finished with, and the board comes up short with nothing to
   * say why. This is what says why.
   */
  closedCount: number;
  overdueCount: number;
}

const PRIORITIES: Record<string, Priority> = {
  urgent: "urgent",
  high: "high",
  medium: "medium",
  low: "low",
};

export function priorityOf(raw: string | null | undefined): Priority {
  if (!raw) return "none";
  return PRIORITIES[raw.trim().toLowerCase()] ?? "none";
}

/** The colours the wall paints a priority, darkest trouble first. */
export const PRIORITY_COLOURS: Record<Priority, string> = {
  urgent: "#f87168",
  high: "#faa53d",
  medium: "#579dff",
  low: "#8590a2",
  none: "#5c5f7a",
};

/**
 * A person's name from Zoho's parts. Email is deliberately not a fallback:
 * a wall in an office is a public thing, and a customer's address does not
 * belong on it.
 */
export function personName(person: RawPerson | null | undefined): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}

/**
 * The order statuses hang in.
 *
 * Every desk names its own statuses — "New", "Queue", "Under
 * Consideration" — so the coarse type Zoho guarantees decides first: what
 * is open, then what is waiting, then what is done. Within a type, the
 * familiar names lead and the rest fall in alphabetically, so the order is
 * the same every time the wall is read.
 */
const STATUS_TYPE_ORDER = ["open", "on hold", "closed"];
const KNOWN_FIRST = ["new", "open", "queue", "in progress", "escalated"];

export function statusRank(name: string, statusType: string): number {
  const type = STATUS_TYPE_ORDER.indexOf(statusType.trim().toLowerCase());
  const band = (type === -1 ? 1 : type) * 100;
  const known = KNOWN_FIRST.indexOf(name.trim().toLowerCase());
  return band + (known === -1 ? 50 : known);
}

/**
 * Whether Zoho itself calls this ticket closed.
 *
 * Zoho's own coarse type rather than a list of status names written down
 * here: every desk names its statuses its own way — "Resolved", "Done",
 * "Invoice sent" — and the desk is the only thing that knows which of them
 * mean the work has gone. A written-down list would leave a lane on the
 * board the first time somebody added a ninth status, which is the failure
 * that is invisible from this side.
 */
function isClosed(raw: RawTicket): boolean {
  return (raw.statusType ?? "").trim().toLowerCase() === "closed";
}

function toTicket(raw: RawTicket, now: number): DeskTicket {
  const closed = isClosed(raw);
  return {
    id: raw.id,
    number: raw.ticketNumber === undefined ? "" : `#${raw.ticketNumber}`,
    subject: raw.subject?.trim() || "No subject",
    status: raw.status?.trim() || "Unknown",
    priority: priorityOf(raw.priority),
    assignee: personName(raw.assignee),
    contact: personName(raw.contact),
    channel: raw.channel?.trim() || null,
    due: raw.dueDate ?? null,
    // A closed ticket is done, however late it was answered.
    dueState: dueState(raw.dueDate, closed, now),
    url: raw.webUrl ?? "",
  };
}

/**
 * The open tickets, grouped into columns by status, in the order a support
 * desk reads them. Zoho returns them newest-first within each status,
 * which is the order they keep.
 *
 * Closed ones are counted and left off — see `closedCount`. Here rather
 * than in the fetch because the alternative is naming the desk's open
 * statuses in `status=`, and a status left off that list is open work
 * vanishing from the board with nothing on screen to say so. Zoho's own
 * coarse type cannot hide an open ticket.
 */
export function toDeskView(raw: unknown, now: number = Date.now()): DeskView {
  const tickets = Array.isArray(raw)
    ? raw.filter((t): t is RawTicket => typeof t === "object" && t !== null && "id" in t)
    : [];

  const columns = new Map<string, DeskColumn>();
  let closedCount = 0;
  let overdueCount = 0;

  for (const item of tickets) {
    if (isClosed(item)) {
      closedCount += 1;
      continue;
    }
    const ticket = toTicket(item, now);
    const column = columns.get(ticket.status) ?? {
      name: ticket.status,
      statusType: item.statusType?.trim() || "Open",
      tickets: [],
    };
    column.tickets.push(ticket);
    columns.set(ticket.status, column);
    if (ticket.dueState === "overdue") overdueCount += 1;
  }

  const ordered = [...columns.values()].sort((a, b) => {
    const rank = statusRank(a.name, a.statusType) - statusRank(b.name, b.statusType);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });

  return {
    columns: ordered,
    ticketCount: tickets.length - closedCount,
    closedCount,
    overdueCount,
  };
}
