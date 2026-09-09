/**
 * The five numbers on the wall of the room the project board hangs in.
 *
 * The board beside them is the work itself — every card, in every column,
 * with who has it and when it is due. This is the other way of reading the
 * same board: how much is standing in each stage of the pipeline, big
 * enough to take in from the doorway without pressing anything.
 *
 * It is the project board's answer to the five counts on Support's wall,
 * and deliberately the same shape of thing. One difference, and it is the
 * only one that matters to the arithmetic: these five are **one bank**.
 * Backlog through Testing are stages of a single flow, so each bar is that
 * stage's share of the work in flight and the five compare with each other.
 * The support board's are two banks precisely because a standing total and
 * a day's traffic do not.
 *
 * Everything here is pure: no fetching, no credentials, no clock. Which
 * matters for the same reason it does next door — a wall reading 0 and a
 * wall reading nothing look identical from across the room, so the case
 * where a lane is not on the board at all is arithmetic rather than luck.
 *
 * Read-only, like everything else downstream of Trello.
 */

import type { BoardView } from "./board";

/**
 * The lanes counted where a building does not say.
 *
 * Sandbox ERP's board, which is the one this was written against. A
 * building names its own (`flow` in `lib/world/tenants.ts`), because the
 * lists are the board's and no two boards agree about them.
 */
export const DEFAULT_FLOW_LANES = [
  "Backlog",
  "Refined",
  "In Progress",
  "In Review",
  "Testing",
] as const;

/**
 * The colours the bays light up in, taken by position.
 *
 * By position rather than by name, so a building naming its own lanes gets
 * a board that reads as a progression rather than one with holes in it.
 * Cool at the back of the pipeline, warm at the front of it, green at the
 * end — the HUD's own palette, the same one the support board uses.
 */
export const FLOW_COLOURS = ["#8590a2", "#579dff", "#a78bfa", "#faa53d", "#4bce97"] as const;

/**
 * How a lane is lettered on the wall, where its own name is too long for a
 * bay.
 *
 * Eighty pixels of wall and eight of them to a letter, which "In progress"
 * wants three times over. The support board next door letters the same
 * thing WIP, so this is one word looked up rather than a wall that reads
 * differently about the same work. Anything not here is its own name in
 * capitals, and a long one is drawn a size down rather than over its
 * neighbour — see `systems/CountBoard`.
 */
const SHORT: Record<string, string> = {
  "in progress": "WIP",
  "in review": "REVIEW",
  "code review": "REVIEW",
  "ready for dev": "READY",
};

/** What the wall letters for a lane. */
export function laneShort(name: string): string {
  const trimmed = name.trim();
  return (SHORT[trimmed.toLowerCase()] ?? trimmed).toUpperCase();
}

/**
 * A lane's key: its name, folded.
 *
 * The name is the identity — it is what the board is asked for and what a
 * building declares — so nothing is invented here beyond making it safe to
 * use as a key and a DOM id.
 */
export function laneId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "lane"
  );
}

export interface FlowLane {
  id: string;
  /** The Trello list this counts, named as the building declared it. */
  name: string;
  /** As the wall letters it. */
  short: string;
  colour: string;
  /** Cards standing in it. Zero where the list is empty; see `missing`. */
  count: number;
  /**
   * The board has no list of that name.
   *
   * Kept apart from a count of zero, and drawn as a dash rather than a
   * figure, because the two mean opposite things: an empty lane is a lane
   * with nothing in it, and a missing one is a lane nobody is looking at.
   * A renamed or archived list would otherwise read as good news.
   */
  missing: boolean;
}

/** A list on the board that no lane names, so a mismatch is visible. */
export interface FlowOther {
  name: string;
  count: number;
}

export interface Flow {
  /** The board these were counted off, by name and by link. */
  board: string;
  url: string;
  lanes: FlowLane[];
  /** Cards standing in the lanes, which is what each bar is a share of. */
  total: number;
  /** The board's other lists, counted but not on the wall. */
  others: FlowOther[];
}

/**
 * The board's lists, counted by name.
 *
 * Case-insensitively and trimmed, because a list called "In progress" is
 * the lane a building declared as "In Progress" and nobody would call that
 * a different stage. Two lists sharing a name are summed: they are both
 * that stage of the board, and dropping one would put work on the wall
 * that is less than the work on the board.
 */
function countByList(board: BoardView): Map<string, number> {
  const counts = new Map<string, number>();
  for (const column of board.columns) {
    const key = column.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + column.cards.length);
  }
  return counts;
}

/**
 * The five counts, from one board read.
 *
 * In the order the building declared them, which is the order they hang:
 * the first named is the left-hand bay whatever the board happens to call
 * it. No fetching of its own — the board comes from the same read the
 * project board next to it shows, so the two cannot disagree about what is
 * on it.
 */
export function toFlow(board: BoardView, lanes: readonly string[]): Flow {
  const counted = countByList(board);
  const wanted = new Set(lanes.map((name) => name.trim().toLowerCase()));

  const flowLanes: FlowLane[] = lanes.map((name, i) => {
    const key = name.trim().toLowerCase();
    const count = counted.get(key);
    return {
      id: laneId(name),
      name: name.trim(),
      short: laneShort(name),
      colour: FLOW_COLOURS[i % FLOW_COLOURS.length],
      count: count ?? 0,
      missing: count === undefined,
    };
  });

  const others: FlowOther[] = board.columns
    .filter((column) => !wanted.has(column.name.trim().toLowerCase()))
    .map((column) => ({ name: column.name, count: column.cards.length }));

  return {
    board: board.name,
    url: board.url,
    lanes: flowLanes,
    total: flowLanes.reduce((sum, lane) => sum + (lane.missing ? 0 : lane.count), 0),
    others,
  };
}

/**
 * How full each bar stands, 0 to 1.
 *
 * One scale across all five: they are stages of one pipeline, so a bar is
 * that stage's share of the work in flight and the five are a picture of
 * where it is sitting. A board with nothing on it leaves every bar at zero
 * rather than dividing by nothing, which is the right picture of a clear
 * board — and a missing lane has no bar at all rather than a bar of none.
 */
export function flowBars(flow: Flow): Record<string, number> {
  const bars: Record<string, number> = {};
  for (const lane of flow.lanes) {
    bars[lane.id] = !lane.missing && flow.total > 0 ? lane.count / flow.total : 0;
  }
  return bars;
}

/** What a bay shows for a lane the board does not have. */
export const NO_LANE = "—";

/** The count as the wall writes it. */
export function flowFigure(lane: FlowLane): string {
  return lane.missing ? NO_LANE : String(lane.count);
}

/**
 * How many bays to a row, for the plate on the wall.
 *
 * Three across is what fits a five-tile board at a size worth calling
 * legible, so five lanes hang three and two — the way a line of text
 * wraps, left to right and then down. Rows as even as they go, with the
 * fuller one first: five is 3 and 2, four is 2 and 2, six is 3 and 3.
 */
export const FLOW_ROW_MAX = 3;

export function flowRows<T>(lanes: readonly T[]): T[][] {
  if (lanes.length === 0) return [];
  const rows = Math.ceil(lanes.length / FLOW_ROW_MAX);
  const out: T[][] = [];
  let taken = 0;
  for (let row = 0; row < rows; row++) {
    // What is left, spread over the rows that are left, rounded up — so the
    // fuller row comes first and the last row is never the long one.
    const size = Math.ceil((lanes.length - taken) / (rows - row));
    out.push(lanes.slice(taken, taken + size) as T[]);
    taken += size;
  }
  return out;
}
