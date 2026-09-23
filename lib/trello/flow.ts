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

/**
 * What a board calls work that has stopped.
 *
 * A board says "this is stuck" in one of two ways and neither is more
 * correct than the other: a label on the card, or a list of its own with
 * the cards parked in it. Both are counted, and a card carrying the label
 * while standing in the list is one card — the count is of cards, not of
 * the ways a board found to say so.
 *
 * Matched on the folded name rather than against a written-down list of
 * spellings, because "Roadblock", "Roadblocked", "Blocked" and "Blocker"
 * are one word as far as anybody reading the wall is concerned, and a
 * board that spells it the fifth way should not quietly count zero.
 *
 * Deliberately not "On Hold", which is a decision somebody made rather
 * than a thing in the way.
 */
export function isRoadblock(name: string): boolean {
  return /^(road)?block(s|ed|er|ers|ing)?$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * Cards on the board that are roadblocked, however the board says so.
 *
 * The whole board rather than the counted lanes: a card is stuck wherever
 * it is standing, and a lane nobody put on the wall is exactly where one
 * would go to be forgotten about.
 */
export function countRoadblocks(board: BoardView): number {
  let blocked = 0;
  for (const column of board.columns) {
    const parked = isRoadblock(column.name);
    for (const card of column.cards) {
      if (parked || card.labels.some((label) => isRoadblock(label.name))) blocked += 1;
    }
  }
  return blocked;
}

/**
 * What a board calls work that has gone out.
 *
 * The other end of the pipeline from a roadblock, and the same kind of
 * fact: the five bays on the wall are the stages work is spread over, and
 * a card that has shipped has left all five of them. So it is counted the
 * same way — off the whole board, by the label on the card or the list it
 * is parked in, however the board spells it.
 *
 * Matched on the folded name, like a roadblock, and the width is paid for
 * by **the word having moved under it**. This was written when Sandbox
 * ERP's three boards disagreed — Hammer Time and the Reports App kept a
 * **Deployed** list and the board named after the building itself called
 * the identical thing **Production** — and since then the other two have
 * been renamed to match, so all three now say Production. The net is what
 * made that rename a non-event: a rule holding the one word would have
 * emptied the crates out of two Operations rooms the afternoon somebody
 * retitled a list, with nothing on screen to say why and nothing wrong
 * with the board.
 *
 * So three boards agreeing today is not the argument for narrowing it. It
 * is the argument the other way: these names drift, and this one has been
 * watched drifting.
 *
 * Deliberately not "Done": that is the stage before this one, and a board
 * that keeps such a list is as likely to count it on the wall as not —
 * Sandbox ERP's three did until the list was renamed to Testing on all
 * three of them, which is the same drift from the other end and the same
 * answer to it. Bare "Ship" is out too: a list called Ship is as often the
 * queue of things to send as the record of what was sent.
 */
export function isDeployed(name: string): boolean {
  return /^(deploy(s|ed|ing|ment|ments)?|release[sd]?|shipp(ed|ing)|prod(uction)?|live)$/.test(
    name.toLowerCase().replace(/[^a-z]+/g, ""),
  );
}

/**
 * Cards on the board that have gone out, however the board says so.
 *
 * The whole board, like the roadblocks — a card that shipped is not
 * standing in any of the five stages any more, which is the whole reason
 * this cannot be a sixth bay on the plate.
 *
 * **A list the wall already counts is never one of these**, and that guard
 * is what makes the wider net above safe. The words differ from board to
 * board, so the alternative was writing down which of them are despatches
 * and which are working stages — and there is no such list: "Production"
 * is where finished work sits on one board and could be where work is
 * being made on another. The building has already answered the question by
 * declaring its five stages, so a list it counts on the wall is a stage
 * whatever it is called, and only the lists it left out can be despatches.
 *
 * A label is read whatever list the card is standing in, which is the
 * roadblock's rule: a label is somebody saying so about that card.
 */
export function countDeployed(board: BoardView, lanes: readonly string[] = []): number {
  const counted = new Set(lanes.map((name) => name.trim().toLowerCase()));
  let out = 0;
  for (const column of board.columns) {
    const shipped = isDeployed(column.name) && !counted.has(column.name.trim().toLowerCase());
    for (const card of column.cards) {
      if (shipped || card.labels.some((label) => isDeployed(label.name))) out += 1;
    }
  }
  return out;
}

/**
 * What a board calls an incident on the server.
 *
 * The third kind of card the five bays cannot describe, and the only one
 * of the three that is not a fact about the *work*. A roadblock is work
 * that has stopped and a despatch is work that has left; an incident is
 * the server on fire, which is not a stage of anything and is not going to
 * wait for one. It is the reason a room's whole pipeline stops being the
 * most important thing in the room.
 *
 * **This is the narrow one of the three**, and the narrowest rule any of
 * this floor is counted by: all three of the building's boards call the
 * list **Server Incident**, in those words. So the folding is for
 * capitalisation, spacing and the plural only — the word the boards use,
 * written how anybody might write it — with the qualifier optional because
 * a bare Incidents is that list with its adjective dropped and can mean
 * nothing else. Outage, Live and Production Incident were in it and came
 * out: they were guesses at boards that do not exist, and every extra word
 * is another way for a working stage to be read as the building burning
 * down.
 *
 * **The despatches next door are the argument against this, and it is a
 * real one.** That net is wide because the word moved under it — two of
 * these boards said Deployed and have since been renamed to Production —
 * so "the boards agree today" is a weaker guarantee here than it looks.
 * The day somebody retitles this list to Outages the beacon reads zero,
 * and a beacon that never lights is indistinguishable from a quiet month,
 * which is the silent failure `isDeployed` exists to have avoided. Widen
 * it the moment a board wants it; what is not worth doing is widening it
 * for boards nobody has seen.
 *
 * Leaving the qualifier a closed set rather than anything-plus-Incidents
 * is what keeps **"RCA / Incidents"** out, and that is worth saying because
 * a list of that name has been on this board: a root-cause write-up is what
 * is done *after* an incident and a board keeps every one it has ever had,
 * so a beacon counting it is a red light permanently on with a large number
 * under it — which says exactly as little as a barrier reading 0, from the
 * other end.
 */
export function isIncident(name: string): boolean {
  return /^(server)?incidents?$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * Cards on the board that are incidents, however the board says so.
 *
 * Off the whole board, like the other two, and by the label on the card or
 * the list it is parked in: an incident raised against work already in
 * flight is still an incident, and that card is as likely to be sitting in
 * In Progress with somebody on it as parked in a list of its own.
 *
 * **A list the wall already counts is never one of these**, which is
 * `countDeployed`'s guard. It is not load-bearing the way it is next door,
 * since the net above is one word and no building is going to declare
 * Server Incident as a stage of its pipeline — it is here because the
 * alternative is a building that did declare it having the same cards
 * counted twice, on the wall and on the floor, and because one rule for
 * all three of these is one rule to remember.
 */
export function countIncidents(board: BoardView, lanes: readonly string[] = []): number {
  const counted = new Set(lanes.map((name) => name.trim().toLowerCase()));
  let raised = 0;
  for (const column of board.columns) {
    const burning = isIncident(column.name) && !counted.has(column.name.trim().toLowerCase());
    for (const card of column.cards) {
      if (burning || card.labels.some((label) => isIncident(label.name))) raised += 1;
    }
  }
  return raised;
}

/**
 * What a board calls the stage work is actually being done in.
 *
 * The other three of these ask the whole board a question the wall cannot
 * answer. This one asks the wall's own question again, because the machine
 * standing on the floor **is** the WIP bay stood up and made to move: a
 * bar can say how much work is in hand and cannot say that anything is
 * happening to it, which is the one thing a room with work in it has to
 * say from the doorway.
 *
 * Narrow, for `isIncident`'s reason: all three of the building's boards
 * call the list **In Progress** and the wall already letters that WIP, so
 * what is folded in is the handful of ways anybody writes the same stage
 * down. Deliberately not In Review or Testing, which are stages where work
 * is being looked at rather than made, and each of which has a bay of its
 * own to say so.
 */
export function isWip(name: string): boolean {
  return /^(work)?inprogress$|^wip$|^doing$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * The lane the machine is making, off **the lanes the building declared**
 * rather than off the whole board.
 *
 * That is the one difference between this and the other three, and it is
 * the whole of the difference. A roadblock, a despatch and an incident are
 * counted off the whole board precisely because none of them is a stage —
 * a stuck card is standing in one, a shipped card has left them all, and
 * an incident was never in any. This one is a stage, and it is the stage:
 * the building has already said which of its lists that is by declaring
 * its five, so asking the board which of them it means would be a second
 * answer to a question already answered.
 *
 * The declaration rather than the wall, because the wall no longer letters
 * it — see `wallLanes`. The machine is where this number is now shown, and
 * it would be an odd thing indeed for it to be read off the one plate that
 * has stopped saying it.
 *
 * A lane the board has not got counts nothing, which is what the rest of
 * this floor does with one: the bay draws a dash, and a thing standing on
 * the floor either stands there or does not.
 */
export function wipLane(flow: Flow): FlowLane | null {
  return flow.lanes.find((lane) => !lane.missing && isWip(lane.name)) ?? null;
}

/** Cards in hand: what the machine on the room's floor is making. */
export function countWip(flow: Flow): number {
  return wipLane(flow)?.count ?? 0;
}

/**
 * The lanes the wall letters: the ones the building declared, less the one
 * the machine on the floor is making.
 *
 * Work in hand is on the floor of the room now — a machine with the number
 * on a plate over it, running while there is anything in it — and a bay
 * saying the same thing six feet above it is the same number printed
 * twice. The wall is then the stages work is **waiting** in and the floor
 * is the stage it is being worked on, which is a sharper division than
 * five bars one of which happens to have a machine under it.
 *
 * By the name rather than by `wipLane`, which answers null for a lane the
 * board has not got: the rule is that this stage is not on the wall, and a
 * lane the board has lost is no more the wall's business than one it has.
 *
 * The bars are left alone, and they are still a share of every declared
 * lane (`flowBars`) rather than of the four that are drawn. What is in
 * hand is still work in flight, so the share of the plate that is bare is
 * what the machine is making — which is the honest picture, and the one
 * the machine is standing there to complete.
 */
export function wallLanes(flow: Flow): FlowLane[] {
  return flow.lanes.filter((lane) => !isWip(lane.name));
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
  /**
   * Cards on the board that are roadblocked — see `countRoadblocks`.
   *
   * Counted off the whole board rather than off the lanes, so it is not a
   * share of `total` and does not belong on the plate with the five that
   * are. It is what stands on the floor of the room instead: a stage of
   * the pipeline is where work is, and this is work that has stopped.
   */
  blocked: number;
  /**
   * Cards on the board that have been deployed — see `countDeployed`.
   *
   * Counted off the whole board — less the lists the wall itself counts,
   * which are stages whatever they are called — for the same reason
   * `blocked` is, and off the plate for the opposite one: a roadblocked card is standing in a
   * stage and a deployed one has left them all, so neither is a share of
   * `total` and neither belongs among the five. It is the stack of crates
   * in the far corner of the room instead — work that is finished with,
   * out of the way, which is where finished work goes.
   */
  deployed: number;
  /**
   * Cards on the board that are incidents — see `countIncidents`.
   *
   * The third of these, and the one that is not about the work at all.
   * `blocked` is work that has stopped and `deployed` is work that has
   * gone; this is the server on fire, which is not a stage, not a share of
   * `total`, and not something the five bays would show even if it were —
   * a card raised this morning against a live outage sits in whatever lane
   * somebody dropped it in. It is the beacon standing in the near corner
   * of the room: the one thing in there asking to be looked at before
   * anything else on the wall.
   */
  incidents: number;
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
    blocked: countRoadblocks(board),
    deployed: countDeployed(board, lanes),
    incidents: countIncidents(board, lanes),
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
 * Three across is what fits a plate of counts at a size worth calling
 * legible, so five lanes hang three and two — the way a line of text
 * wraps, left to right and then down. Rows as even as they go, with the
 * fuller one first: five is 3 and 2, four is 2 and 2, six is 3 and 3.
 *
 * Four is the ordinary case now that the wall has stopped lettering WIP,
 * and two rows of two is why the plate wanting the whole depth of the wall
 * was worth having: a row of four across one row leaves the figures the
 * size they would have been and most of the plate bare.
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
