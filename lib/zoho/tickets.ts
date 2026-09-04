/**
 * A Zoho Desk queue, as the wall in the office shows it.
 *
 * Zoho's tickets carry far more than a wall needs, so they are narrowed
 * here into columns by status. Everything in this file is pure: no
 * fetching, no credentials, no clock of its own, so the queue can be
 * checked without a network or a Zoho account.
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
  /** Whether Zoho counts this status as closed, which sends it to the end. */
  closed: boolean;
  tickets: DeskTicket[];
}

export interface DeskView {
  columns: DeskColumn[];
  ticketCount: number;
  /** Tickets not in a closed status. */
  openCount: number;
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
 * The order statuses hang in: the ones needing attention first, whatever a
 * given Desk calls them, then anything custom, then the closed ones.
 */
const STATUS_ORDER = ["open", "on hold", "escalated", "in progress"];

function statusRank(name: string, closed: boolean): number {
  if (closed) return 100;
  const known = STATUS_ORDER.indexOf(name.trim().toLowerCase());
  return known === -1 ? 50 : known;
}

function toTicket(raw: RawTicket, now: number): DeskTicket {
  const closed = (raw.statusType ?? "").trim().toLowerCase() === "closed";
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
 * Tickets grouped into columns by status, in the order a support desk
 * reads them. Zoho returns them newest-first within each status, which is
 * the order they keep.
 */
export function toDeskView(raw: unknown, now: number = Date.now()): DeskView {
  const tickets = Array.isArray(raw)
    ? raw.filter((t): t is RawTicket => typeof t === "object" && t !== null && "id" in t)
    : [];

  const columns = new Map<string, DeskColumn>();
  let openCount = 0;
  let overdueCount = 0;

  for (const item of tickets) {
    const ticket = toTicket(item, now);
    const closed = (item.statusType ?? "").trim().toLowerCase() === "closed";
    const column = columns.get(ticket.status) ?? { name: ticket.status, closed, tickets: [] };
    column.tickets.push(ticket);
    columns.set(ticket.status, column);
    if (!closed) openCount += 1;
    if (ticket.dueState === "overdue") overdueCount += 1;
  }

  const ordered = [...columns.values()].sort((a, b) => {
    const rank = statusRank(a.name, a.closed) - statusRank(b.name, b.closed);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });

  return { columns: ordered, ticketCount: tickets.length, openCount, overdueCount };
}
