/**
 * A Trello board, as the wall in the office shows it.
 *
 * Trello's own shapes are wide and full of things a wall does not need, so
 * one request for the whole board is narrowed here into columns of cards.
 * Everything in this file is pure: no fetching, no keys, no clock of its
 * own — so what the board looks like can be checked without a network or a
 * Trello account.
 *
 * The office only ever reads. Nothing here writes back.
 */

// ── What Trello sends ──────────────────────────────────

export interface RawLabel {
  id: string;
  name?: string;
  color?: string | null;
}

export interface RawMember {
  id: string;
  initials?: string;
  fullName?: string;
}

export interface RawList {
  id: string;
  name?: string;
  pos?: number;
}

export interface RawCard {
  id: string;
  name?: string;
  idList?: string;
  idLabels?: string[];
  idMembers?: string[];
  due?: string | null;
  dueComplete?: boolean;
  shortUrl?: string;
  pos?: number;
  badges?: {
    comments?: number;
    attachments?: number;
    description?: boolean;
    checkItems?: number;
    checkItemsChecked?: number;
  };
}

export interface RawBoard {
  id: string;
  name?: string;
  url?: string;
  lists?: RawList[];
  cards?: RawCard[];
  labels?: RawLabel[];
  members?: RawMember[];
}

// ── What the wall shows ────────────────────────────────

export interface CardLabel {
  name: string;
  colour: string;
}

/** Where a card stands against its due date. */
export type DueState = "none" | "later" | "soon" | "overdue" | "done";

export interface BoardCard {
  id: string;
  title: string;
  labels: CardLabel[];
  /** Initials of whoever it is assigned to. */
  members: string[];
  due: string | null;
  dueState: DueState;
  /** Ticked and total items, when the card has a checklist. */
  checklist: { done: number; total: number } | null;
  comments: number;
  attachments: number;
  hasDescription: boolean;
  url: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  cards: BoardCard[];
}

export interface BoardView {
  id: string;
  name: string;
  url: string;
  columns: BoardColumn[];
  /** Cards on the board, counted once. */
  cardCount: number;
}

export interface BoardSummary {
  id: string;
  name: string;
  url: string;
}

/**
 * Trello's label colours, as the HUD draws them. Trello also sends shades
 * — "green_dark", "sky_light" — so the shade is dropped and the base
 * colour used; a label with no colour at all shows grey.
 */
const LABEL_COLOURS: Record<string, string> = {
  green: "#4bce97",
  yellow: "#e2b203",
  orange: "#faa53d",
  red: "#f87168",
  purple: "#9f8fef",
  blue: "#579dff",
  sky: "#6cc3e0",
  lime: "#94c748",
  pink: "#e774bb",
  black: "#8590a2",
};

const NO_COLOUR = "#8590a2";

export function labelColour(colour: string | null | undefined): string {
  if (!colour) return NO_COLOUR;
  const base = colour.split("_")[0];
  return LABEL_COLOURS[base] ?? NO_COLOUR;
}

/** Within this long, a due date counts as coming up rather than merely later. */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * Where a card stands against its due date. A card ticked as done is done
 * however late it was; an unticked one past its date is overdue.
 */
export function dueState(
  due: string | null | undefined,
  dueComplete: boolean | undefined,
  now: number,
): DueState {
  if (!due) return "none";
  const at = Date.parse(due);
  if (Number.isNaN(at)) return "none";
  if (dueComplete) return "done";
  if (at < now) return "overdue";
  return at - now <= DUE_SOON_MS ? "soon" : "later";
}

/** Trello orders by a `pos` number; anything without one goes last. */
function byPosition(a: { pos?: number }, b: { pos?: number }): number {
  return (a.pos ?? Number.MAX_SAFE_INTEGER) - (b.pos ?? Number.MAX_SAFE_INTEGER);
}

function toCard(
  card: RawCard,
  labels: Map<string, CardLabel>,
  members: Map<string, string>,
  now: number,
): BoardCard {
  const badges = card.badges ?? {};
  const total = badges.checkItems ?? 0;
  return {
    id: card.id,
    title: card.name?.trim() || "Untitled card",
    labels: (card.idLabels ?? []).map((id) => labels.get(id)).filter((l): l is CardLabel => !!l),
    members: (card.idMembers ?? []).map((id) => members.get(id)).filter((m): m is string => !!m),
    due: card.due ?? null,
    dueState: dueState(card.due, card.dueComplete, now),
    checklist: total > 0 ? { done: badges.checkItemsChecked ?? 0, total } : null,
    comments: badges.comments ?? 0,
    attachments: badges.attachments ?? 0,
    hasDescription: badges.description === true,
    url: card.shortUrl ?? "",
  };
}

/**
 * One board request turned into columns of cards, each in Trello's own
 * order. A card whose list is missing — archived out from under it — is
 * left out rather than piled somewhere it does not belong.
 */
export function toBoardView(raw: RawBoard, now: number = Date.now()): BoardView {
  const labels = new Map<string, CardLabel>();
  for (const label of raw.labels ?? []) {
    labels.set(label.id, { name: label.name?.trim() || "", colour: labelColour(label.color) });
  }

  const members = new Map<string, string>();
  for (const member of raw.members ?? []) {
    const initials = member.initials?.trim() || initialsOf(member.fullName);
    if (initials) members.set(member.id, initials);
  }

  const columns = new Map<string, BoardColumn>();
  const lists = [...(raw.lists ?? [])].sort(byPosition);
  for (const list of lists) {
    columns.set(list.id, { id: list.id, name: list.name?.trim() || "Unnamed list", cards: [] });
  }

  let cardCount = 0;
  for (const card of [...(raw.cards ?? [])].sort(byPosition)) {
    const column = card.idList ? columns.get(card.idList) : undefined;
    if (!column) continue;
    column.cards.push(toCard(card, labels, members, now));
    cardCount += 1;
  }

  return {
    id: raw.id,
    name: raw.name?.trim() || "Board",
    url: raw.url ?? "",
    columns: [...columns.values()],
    cardCount,
  };
}

/** A fallback for a member Trello gave no initials for. */
function initialsOf(fullName: string | undefined): string {
  if (!fullName) return "";
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** The boards a token can see, named and ordered for a menu. */
export function toBoardSummaries(raw: unknown): BoardSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (board): board is RawBoard => typeof board === "object" && board !== null && "id" in board,
    )
    .map((board) => ({
      id: board.id,
      name: board.name?.trim() || "Board",
      url: board.url ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
