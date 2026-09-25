/**
 * What a project room says about its board: the counts lettered on the
 * wall, and the line of stations standing on the floor.
 *
 * The board beside them is the work itself — every card, in every column,
 * with who has it and when it is due. This is the other way of reading the
 * same board: how much is standing in each stage of the pipeline, big
 * enough to take in from the doorway without pressing anything.
 *
 * It is the project board's answer to the five counts on Support's wall,
 * and deliberately the same shape of thing. One difference, and it is the
 * only one that matters to the arithmetic: the bays are **one bank**. The
 * lanes left on the wall are stages of a single flow, so each bar is that
 * stage's share of the work in flight and they compare with each other.
 * The support board's are two banks precisely because a standing total and
 * a day's traffic do not.
 *
 * **Three of the stages are not on the wall at all**, because each of them
 * stands on the floor of the room as a thing you can look at: the rack of
 * refined work at the head of the line, the machine making what is in
 * hand, and the rig checking what has been made. A bay and a station
 * saying the same number six feet apart is one count printed twice, so the
 * wall letters the stages work **waits** in and the floor carries the
 * three it happens in. See `wallLanes`.
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
 * Cool at the back of the pipeline, warm at the front of it, yellow at the
 * end — the HUD's own palette, the same one the support board uses.
 *
 * Not green at the end, which it was: green is the crates' at the end of a
 * project room's line (`systems/Deployed`), and those are work that has
 * gone out rather than a stage anything stands in, so the colour has to be
 * on none of these.
 */
export const FLOW_COLOURS = ["#8590a2", "#579dff", "#a78bfa", "#faa53d", "#f5cd47"] as const;

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
 * What a board calls the stage work has been written up and is waiting in.
 *
 * The first of the three stages that stand on the room's floor rather than
 * on its wall, and the one that is doing nothing: a rack of stock cut to
 * spec, at the head of the line, with the machine next along waiting to
 * take it. Everything about that picture is the point — this is work
 * somebody has already thought about and nobody has started.
 *
 * **Narrow, for `isIncident`'s reason.** All three of Sandbox ERP's boards
 * call the list **Refined**, in that word, so what is folded in is the
 * inflections of the one word and nothing else. Deliberately not "Ready",
 * however it is qualified, though `laneShort` carries a shortening for
 * "Ready for Dev": that table is about **lettering** a bay and this is
 * about **claiming** a lane, which is a far more expensive mistake. Ready
 * is the most overloaded word on a kanban board — ready for dev, ready for
 * QA, ready to deploy are three different stages, and `isDeployed`'s own
 * tests pin the last of them as something that must not be matched there.
 *
 * A wide net fails in the worst direction of any on this floor: it takes a
 * bay **off** the wall while the station on the floor counts something
 * else, so a stage disappears from the room altogether with nothing
 * anywhere to say why. That is worse than `isIncident`'s failure, which is
 * only a light that never lights. Widen it when a board wants it.
 */
export function isRefined(name: string): boolean {
  return /^refined?$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * What a board calls the stage work is actually being done in.
 *
 * The three nets below ask the whole board a question the wall cannot
 * answer. This one, and the two either side of it, ask the wall's own
 * question again — because the machine standing on the floor **is** the
 * WIP bay stood up and made to move: a bar can say how much work is in
 * hand and cannot say that anything is happening to it, which is the one
 * thing a room with work in it has to say from the doorway.
 *
 * Narrow, for `isIncident`'s reason: all three of the building's boards
 * call the list **In Progress** and the wall already lettered that WIP, so
 * what is folded in is the handful of ways anybody writes the same stage
 * down. Deliberately not In Review, which is a stage where work is looked
 * at rather than made and has a bay of its own to say so — nor Testing,
 * which is looked at too and now has a station of its own.
 */
export function isWip(name: string): boolean {
  return /^(work)?inprogress$|^wip$|^doing$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * What a board calls the stage work is checked in.
 *
 * The last of the three stages on the floor, standing between the barrier
 * and the crates: work that has been made and is being looked at before it
 * goes out. It moves, as the machine does, because checking is something
 * being done to the work rather than somewhere the work is sitting — and
 * it moves differently, because the machine's parts ride past a fixed head
 * and this one holds the work still and crosses it.
 *
 * Narrow, on the boards' own word, which is `isRefined`'s argument exactly
 * and matters most here. **"Done" is deliberately out**, and it is the
 * sharpest call in the catalogue: `isDeployed` records that these three
 * boards kept a Done list until it was renamed to Testing on all three of
 * them, which is the same word drifting that argues for a wide net next
 * door. It is still refused, because a pipeline of Backlog, Refined, In
 * Progress, Testing and Done is an entirely ordinary five — and two
 * declared lanes answering one station is a station counting a stage it
 * was never about, with the other stage off the wall to pay for it. "QA"
 * is out for the same reason and a weaker one: it is a guess at a board
 * nobody here has seen.
 */
export function isTesting(name: string): boolean {
  return /^test(s|ing)?$/.test(name.toLowerCase().replace(/[^a-z]+/g, ""));
}

/**
 * The three stages that stand on the room's floor, in the order they run,
 * with what each of their stations reads.
 *
 * Written once because everything about them is the same question asked
 * three times: which lane is this, is it on the wall, and what does the
 * thing standing on the floor say. Three predicates scattered through
 * three functions is how one of them comes to be left out of the fourth.
 *
 * A list rather than a union, because the next stage taken off the plate
 * should be one entry here and nothing else — which is exactly how two of
 * these three arrived, the machine having been the only one before them.
 */
const ON_THE_FLOOR = [
  { is: isRefined, reads: (flow: Flow) => flow.refined },
  { is: isWip, reads: (flow: Flow) => flow.wip },
  { is: isTesting, reads: (flow: Flow) => flow.testing },
] as const;

/** Whether a lane of that name is a thing standing on the room's floor. */
export function standsOnFloor(name: string): boolean {
  return ON_THE_FLOOR.some((station) => station.is(name));
}

/**
 * Cards standing in the lanes a station counts, **less what is roadblocked
 * in them** — which is what the thing on the floor reads.
 *
 * The barrier in the middle of the row counts a stuck card wherever it is
 * standing, off the whole board, so a card carrying a Roadblock label
 * while it stands in one of these three lanes was being counted twice by
 * two things a few feet apart in the same row. That is exactly what a line
 * laid out in the order work happens exists to stop. Hammer Time is the
 * board that showed it: nine cards in the WIP lane with three of them
 * stuck, so the room said twelve where the board said nine. It reads six.
 *
 * **The station gives way rather than the barrier.** Being stuck is the
 * whole fact about a stuck card and the lane it stopped in is an accident
 * of how far it got; what a station is there to say is that something is
 * *happening* to the work, and nothing is happening to these.
 *
 * **The lane's own count is untouched**, which is the other half of it. A
 * bar is that lane's share of the work in flight and a stuck card is still
 * in flight — it is standing in that stage, which is the whole reason
 * `blocked` is not a bay of its own. So the panel behind the wall goes on
 * saying how many cards stand in each list, and only the things on the
 * floor answer the narrower question.
 *
 * A label is the only way a card in one of these lanes is stuck: the other
 * way a board says so is a list of its own, and a card stands in one list.
 * No two of these nets share a word, which is the property this leans on —
 * three times over now — and which `flow.test.ts` asserts rather than
 * leaving it to be rediscovered.
 *
 * **And a roadblock is the only thing on this floor the subtraction is
 * owed to.** A stuck card is not a lane: it is a status a card carries
 * *while it stands in a stage*, which is what puts one card under two
 * things in the same row. A despatch and an incident are lanes on these
 * boards, so a card in either has left all three of these stages and there
 * was never anything to take away — a card in Refined carrying a Server
 * Incident label is legitimately counted by both the rack and the beacon,
 * which is two true facts rather than one card twice. Generalise this to
 * those two and the floor starts subtracting cards no station ever had.
 *
 * Off the building's own declaration rather than off the whole board: a
 * station is a *stage*, and the building has already said which of its
 * lists that is by declaring its lanes. Every lane matching is summed,
 * which is `countByList`'s rule — two lists a board calls the same stage
 * are both that stage, and dropping one would put less work on the floor
 * than there is on the board.
 */
export function countUnblocked(
  board: BoardView,
  lanes: readonly string[],
  is: (name: string) => boolean,
): number {
  const keys = new Set(lanes.filter(is).map((name) => name.trim().toLowerCase()));
  if (keys.size === 0) return 0;
  let standing = 0;
  for (const column of board.columns) {
    if (!keys.has(column.name.trim().toLowerCase())) continue;
    for (const card of column.cards) {
      if (!card.labels.some((label) => isRoadblock(label.name))) standing += 1;
    }
  }
  return standing;
}

/** A stage that stands on the floor: the lane it counts, and what it reads. */
export interface FloorLane {
  /** The lane or lanes it counts, as the building named them. */
  name: string;
  /** The figure on its plate: those lanes less what is roadblocked in them. */
  reads: number;
}

/**
 * The stations on the floor that are lanes of this board, for the panel
 * behind the wall to say why the floor and the plate can differ.
 *
 * Only the ones the board actually has a list for: a station whose lane
 * has been renamed or archived stands nowhere at all, exactly as a missing
 * lane draws a dash rather than a zero.
 */
export function floorLanes(flow: Flow): FloorLane[] {
  return ON_THE_FLOOR.flatMap((station) => {
    const named = flow.lanes.filter((lane) => !lane.missing && station.is(lane.name));
    if (named.length === 0) return [];
    return [{ name: named.map((lane) => lane.name).join(" and "), reads: station.reads(flow) }];
  });
}

/**
 * The lanes the wall letters: the ones the building declared, less the
 * three that stand on the floor of the room.
 *
 * Work that is refined and waiting, work in hand and work being checked
 * are each a thing in the room now — a rack, a machine and a rig, each
 * with its number on a plate over it — and a bay six feet above one of
 * them saying the same thing is that count printed twice. The wall is then
 * the stages work **waits** in and the floor is the three it happens in,
 * which is a sharper division than five bars three of which happen to have
 * something standing under them.
 *
 * By the name rather than by asking which lanes the board has got: the
 * rule is that these stages are not on the wall, and a lane the board has
 * lost is no more the wall's business than one it has — otherwise an
 * archived list would put the bay back.
 *
 * The bars are left alone, and they are still a share of every declared
 * lane (`flowBars`) rather than of the ones that are drawn. What stands on
 * the floor is still work in flight, so the share of the plate left bare
 * is what the three stations are holding — which is the honest picture,
 * and the one they are standing there to complete.
 */
export function wallLanes(flow: Flow): FlowLane[] {
  return flow.lanes.filter((lane) => !standsOnFloor(lane.name));
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
   * The three stages that stand on the room's floor rather than on its
   * wall — see `countUnblocked`.
   *
   * Each is that declared lane less the cards roadblocked in it, which is
   * what makes these the counts here that are not simply a lane's length.
   * They are the rack, the machine and the rig standing in the room's line,
   * and the barrier standing among them is the rest of all three: between
   * them every card is accounted for once rather than twice.
   *
   * Flat, beside `blocked` and the others, because the four things on the
   * floor that carry a plate read their number straight off this — a nested
   * record would make three of the stations read differently from the rest.
   */
  refined: number;
  wip: number;
  testing: number;
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
    refined: countUnblocked(board, lanes, isRefined),
    wip: countUnblocked(board, lanes, isWip),
    testing: countUnblocked(board, lanes, isTesting),
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
 * **Two is the ordinary case now**, in one row: the wall has given three
 * of its five stages to the things standing on the floor, so Sandbox ERP's
 * plate letters Backlog and In Review and nothing else. The wrapping is
 * kept because it is the rule rather than the arrangement — a building
 * declaring seven lanes would want it — and because the plate is a shared
 * one, drawn for the support desk's five as well.
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
