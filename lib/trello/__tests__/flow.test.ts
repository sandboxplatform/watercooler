import { describe, expect, it } from "vitest";
import type { BoardView } from "../board";
import {
  DEFAULT_FLOW_LANES,
  FLOW_COLOURS,
  NO_LANE,
  countDeployed,
  countIncidents,
  countRoadblocks,
  countUnblocked,
  floorLanes,
  flowBars,
  flowFigure,
  flowRows,
  isDeployed,
  isIncident,
  isRefined,
  isRoadblock,
  isTesting,
  isWip,
  laneId,
  laneShort,
  standsOnFloor,
  toFlow,
  wallLanes,
} from "../flow";

/** A board of named lists holding that many cards apiece. */
function board(lists: Record<string, number>, name = "Sandbox ERP"): BoardView {
  const columns = Object.entries(lists).map(([listName, count], i) => ({
    id: `l${i}`,
    name: listName,
    cards: Array.from({ length: count }, (_, c) => ({ id: `c${i}-${c}`, labels: [] })),
  }));
  return {
    id: "b1",
    name,
    url: "https://trello.com/b/b1",
    columns,
    cardCount: Object.values(lists).reduce((a, b) => a + b, 0),
  } as unknown as BoardView;
}

const LANES = [...DEFAULT_FLOW_LANES];

describe("lettering a lane", () => {
  it("puts a name in capitals", () => {
    expect(laneShort("Backlog")).toBe("BACKLOG");
    expect(laneShort("  Testing ")).toBe("TESTING");
  });

  it("uses the short word for the long names a bay cannot hold", () => {
    expect(laneShort("In Progress")).toBe("WIP");
    expect(laneShort("in progress")).toBe("WIP");
    expect(laneShort("In Review")).toBe("REVIEW");
  });

  it("keys a lane by its name, folded", () => {
    expect(laneId("In Progress")).toBe("in-progress");
    expect(laneId("RCA / Incidents")).toBe("rca-incidents");
    expect(laneId("???")).toBe("lane");
  });
});

describe("counting a board's stages", () => {
  it("counts each lane's cards, in the order they were declared", () => {
    const flow = toFlow(
      board({ Backlog: 10, Refined: 7, "In Progress": 0, "In Review": 1, Testing: 11 }),
      LANES,
    );
    expect(flow.lanes.map((l) => [l.name, l.count])).toEqual([
      ["Backlog", 10],
      ["Refined", 7],
      ["In Progress", 0],
      ["In Review", 1],
      ["Testing", 11],
    ]);
    expect(flow.total).toBe(29);
    expect(flow.board).toBe("Sandbox ERP");
  });

  it("takes its colours by position, so any set of lanes reads as a progression", () => {
    const flow = toFlow(board({ One: 1, Two: 2 }), ["One", "Two"]);
    expect(flow.lanes.map((l) => l.colour)).toEqual([FLOW_COLOURS[0], FLOW_COLOURS[1]]);
  });

  it("matches a list however it is capitalised or spaced", () => {
    const flow = toFlow(board({ " in progress ": 4 }), ["In Progress"]);
    expect(flow.lanes[0].count).toBe(4);
    expect(flow.lanes[0].missing).toBe(false);
  });

  it("sums two lists of the same name rather than dropping one", () => {
    const flow = toFlow(board({ Testing: 3 }), ["Testing"]);
    expect(flow.lanes[0].count).toBe(3);
    const both = toFlow(
      {
        ...board({ Testing: 3 }),
        columns: [
          ...board({ Testing: 3 }).columns,
          { id: "l9", name: "testing", cards: [{ id: "x", labels: [] }] },
        ],
      } as unknown as BoardView,
      ["Testing"],
    );
    expect(both.lanes[0].count).toBe(4);
  });

  it("keeps a lane the board has no list for apart from an empty one", () => {
    const flow = toFlow(board({ Backlog: 0 }), ["Backlog", "Refined"]);
    const [backlog, refined] = flow.lanes;
    expect([backlog.count, backlog.missing]).toEqual([0, false]);
    expect(refined.missing).toBe(true);
    // A missing lane is a gap, not a zero, and is written as one.
    expect(flowFigure(backlog)).toBe("0");
    expect(flowFigure(refined)).toBe(NO_LANE);
    // And it is left out of the total, so the bars are a share of what is
    // actually being counted.
    expect(flow.total).toBe(0);
  });

  it("names the board's other lists, so a mismatch is visible", () => {
    const flow = toFlow(board({ Backlog: 2, Production: 33, "RCA / Incidents": 0 }), ["Backlog"]);
    expect(flow.others).toEqual([
      { name: "Production", count: 33 },
      { name: "RCA / Incidents", count: 0 },
    ]);
  });
});

describe("the bars", () => {
  it("gives each lane its share of the work in flight", () => {
    const flow = toFlow(board({ Backlog: 3, Refined: 1 }), ["Backlog", "Refined"]);
    const bars = flowBars(flow);
    expect(bars["backlog"]).toBeCloseTo(0.75);
    expect(bars["refined"]).toBeCloseTo(0.25);
  });

  it("leaves every bar flat on a board with nothing on it", () => {
    const flow = toFlow(board({ Backlog: 0, Refined: 0 }), ["Backlog", "Refined"]);
    expect(Object.values(flowBars(flow))).toEqual([0, 0]);
  });

  it("gives a missing lane no bar at all", () => {
    const flow = toFlow(board({ Backlog: 4 }), ["Backlog", "Refined"]);
    expect(flowBars(flow)["refined"]).toBe(0);
  });
});

describe("the rows on the plate", () => {
  it("wraps five bays three and two, the fuller row first", () => {
    expect(flowRows([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("spreads the rows as evenly as they go", () => {
    expect(flowRows([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(flowRows([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(flowRows([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(flowRows([1, 2, 3, 4, 5, 6, 7])).toEqual([
      [1, 2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("keeps every bay, whatever the count", () => {
    for (let n = 1; n <= 12; n++) {
      const lanes = Array.from({ length: n }, (_, i) => i);
      expect(flowRows(lanes).flat()).toEqual(lanes);
    }
    expect(flowRows([])).toEqual([]);
  });
});

/** A board whose cards carry labels, and whose lists may be named anything. */
function labelled(lists: Record<string, string[][]>): BoardView {
  return {
    id: "b1",
    name: "Sandbox ERP",
    url: "https://trello.com/b/b1",
    columns: Object.entries(lists).map(([name, cards], i) => ({
      id: `l${i}`,
      name,
      cards: cards.map((labels, c) => ({
        id: `c${i}-${c}`,
        labels: labels.map((label) => ({ name: label, colour: "#f87168" })),
      })),
    })),
    cardCount: Object.values(lists).reduce((a, b) => a + b.length, 0),
  } as unknown as BoardView;
}

/**
 * Work that has stopped, which is the one thing the five bars cannot say:
 * a stuck card is still standing in a stage, so a board in trouble and a
 * board getting on with it draw the same picture.
 */
describe("counting a board's roadblocks", () => {
  it("reads the word however the board spells it", () => {
    for (const name of ["Roadblock", "Roadblocked", "BLOCKED", "blocker", " Road Block "])
      expect(isRoadblock(name)).toBe(true);
    for (const name of ["On Hold", "Backlog", "Blocked by design", "Unblocked", ""])
      expect(isRoadblock(name)).toBe(false);
  });

  it("counts a card carrying the label, wherever it is standing", () => {
    const view = labelled({
      Backlog: [["Roadblocked"], [], ["bug"]],
      "In Progress": [["Roadblocked"], []],
    });
    expect(countRoadblocks(view)).toBe(2);
  });

  it("counts a card parked in a list of that name", () => {
    expect(countRoadblocks(labelled({ Backlog: [[], []], Roadblocked: [[], [], []] }))).toBe(3);
  });

  /** The count is of cards, not of the ways the board found to say so. */
  it("counts a card once when it is both", () => {
    expect(countRoadblocks(labelled({ Blocked: [["Roadblock"], []] }))).toBe(2);
  });

  it("counts them off the whole board, lanes or not", () => {
    const view = labelled({
      Backlog: [["Roadblock"]],
      Production: [["Roadblock"], ["Roadblock"]],
    });
    expect(toFlow(view, ["Backlog"]).blocked).toBe(3);
    // And it is not part of what the bars are a share of.
    expect(toFlow(view, ["Backlog"]).total).toBe(1);
  });

  it("says none where nothing is stuck", () => {
    expect(toFlow(board({ Backlog: 4, Testing: 2 }), LANES).blocked).toBe(0);
  });
});

/**
 * Work that has gone out, which is the other thing the five bars cannot
 * say: a card that shipped is not standing in any stage, so a board that
 * sent nine things out this month and one that sent none draw the same
 * five bars.
 */
describe("counting what a board has deployed", () => {
  it("reads the word however the board spells it", () => {
    // The width is paid for by the word having moved: two of the building's
    // three boards said Deployed and have since been renamed to Production.
    // A rule holding one word would have emptied two rooms' crates that
    // afternoon, which is the whole argument for folding rather than naming.
    for (const name of [
      "Deployed",
      "Deploy",
      "DEPLOYMENT",
      "released",
      "Shipped",
      " De-ployed ",
      "Production",
      "Live",
    ])
      expect(isDeployed(name)).toBe(true);
    // Done is the stage before this one and the wall counts it; "Ship" alone
    // is as often the queue of things to send as the record of what was sent.
    for (const name of ["Done", "Ship", "Ready to Deploy", "Undeployed", ""])
      expect(isDeployed(name)).toBe(false);
  });

  it("counts a card carrying the label, wherever it is standing", () => {
    const view = labelled({
      Testing: [["Deployed"], [], ["bug"]],
      "In Review": [["deployed"], []],
    });
    expect(countDeployed(view)).toBe(2);
  });

  it("counts a card parked in a list of that name", () => {
    expect(countDeployed(labelled({ Backlog: [[], []], Deployed: [[], [], []] }))).toBe(3);
  });

  /** The count is of cards, not of the ways the board found to say so. */
  it("counts a card once when it is both", () => {
    expect(countDeployed(labelled({ Released: [["Shipped"], []] }))).toBe(2);
  });

  /**
   * The guard that makes the wider net safe: the building has already said
   * which of its lists are stages by declaring them, so one it counts on
   * the wall is a stage whatever it is called. Otherwise a board whose
   * Production list is where work is *made* would report its whole working
   * middle as despatched.
   */
  it("never counts a list the wall itself counts", () => {
    const view = labelled({ Backlog: [[]], Production: [[], [], []] });
    expect(countDeployed(view, ["Backlog", "Production"])).toBe(0);
    expect(countDeployed(view, ["Backlog"])).toBe(3);
    // A label is somebody saying so about that card, wherever it stands.
    const flagged = labelled({ Production: [["Deployed"], []] });
    expect(countDeployed(flagged, ["Production"])).toBe(1);
  });

  it("counts them off the whole board, and out of what the bars share", () => {
    const view = labelled({
      Backlog: [[]],
      Deployed: [[], [], []],
    });
    const flow = toFlow(view, ["Backlog"]);
    expect(flow.deployed).toBe(3);
    // Not a stage, so not part of what each bar is a share of.
    expect(flow.total).toBe(1);
  });

  /** A Done bay is the wall's; it is the stage before a despatch. */
  it("leaves a counted Done lane where it is", () => {
    const flow = toFlow(board({ Backlog: 2, Done: 5 }), ["Backlog", "Done"]);
    expect(flow.deployed).toBe(0);
    expect(flow.total).toBe(7);
  });

  /**
   * The building's boards before and after the rename, which is the pair
   * this has to go on reading. All three say Production today; two of them
   * said Deployed when this was written, and a board restored from an
   * export or a fourth building set up from the old template still will.
   */
  it("reads the building's boards on either side of the rename", () => {
    const was = toFlow(board({ Backlog: 4, Done: 0, Deployed: 9 }), ["Backlog", "Done"]);
    expect(was.deployed).toBe(9);
    const now = toFlow(board({ Backlog: 4, Done: 0, Production: 9 }), ["Backlog", "Done"]);
    expect(now.deployed).toBe(9);
    const main = toFlow(board({ Backlog: 10, Testing: 1, Production: 58 }), ["Backlog", "Testing"]);
    expect(main.deployed).toBe(58);
    // None of it is part of what the bars are a share of.
    expect([was.total, now.total, main.total]).toEqual([4, 4, 11]);
  });

  it("says none where nothing has gone out", () => {
    expect(toFlow(board({ Backlog: 4, Testing: 2 }), LANES).deployed).toBe(0);
  });
});

/**
 * Incidents on the server, which is the third thing the five bars cannot
 * say and the only one of the three that is not about the work at all.
 * A roadblock is work that has stopped and a despatch is work that has
 * gone; this is the server on fire, sitting in whatever lane somebody
 * dropped the card in.
 */
describe("counting a board's incidents", () => {
  /**
   * The narrow one of the three, and deliberately: all three of the
   * building's boards call this **Server Incident**, in those words, so
   * the folding is for capitalisation, spacing and the plural and nothing
   * else. The despatches next door are a wide net because those boards
   * really do disagree; spreading this one over words no board here uses
   * would be guessing, and every extra word is another way for a working
   * stage to read as the building burning down.
   */
  it("reads the board's own word, however it is written", () => {
    for (const name of [
      "Server Incident",
      "Server Incidents",
      " SERVER INCIDENT ",
      "server-incident",
      // The adjective dropped, which can mean nothing else.
      "Incident",
      "incidents",
    ])
      expect(isIncident(name)).toBe(true);
    /*
     * The qualifier is a closed set rather than anything-plus-Incidents,
     * which is what keeps RCA out — a root-cause write-up is what is done
     * *after* an incident and a board keeps every one it has ever had, so
     * a beacon counting that list is a red light permanently on. Outage
     * and Production Incident are out for the plainer reason: no board
     * here uses either, so counting them is a guess.
     */
    for (const name of [
      "RCA / Incidents",
      "Post-incident review",
      "Incident Review",
      "Outage",
      "Production Incident",
      "Backlog",
      "Testing",
      "",
    ])
      expect(isIncident(name)).toBe(false);
  });

  it("counts a card carrying the label, wherever it is standing", () => {
    const view = labelled({
      "In Progress": [["Server Incident"], [], ["bug"]],
      Backlog: [["incident"], []],
    });
    expect(countIncidents(view)).toBe(2);
  });

  it("counts a card parked in a list of that name", () => {
    expect(countIncidents(labelled({ Backlog: [[], []], "Server Incident": [[], [], []] }))).toBe(
      3,
    );
  });

  /** The count is of cards, not of the ways the board found to say so. */
  it("counts a card once when it is both", () => {
    expect(countIncidents(labelled({ Incidents: [["Server Incident"], []] }))).toBe(2);
  });

  /**
   * `countDeployed`'s guard. Not load-bearing here — the net is one word
   * and no building is going to call a stage of its pipeline Server
   * Incident — but a building that did would otherwise have the same cards
   * counted twice, on the wall and on the floor.
   */
  it("never counts a list the wall itself counts", () => {
    const view = labelled({ Backlog: [[]], Incidents: [[], [], []] });
    expect(countIncidents(view, ["Backlog", "Incidents"])).toBe(0);
    expect(countIncidents(view, ["Backlog"])).toBe(3);
    // A label is somebody saying so about that card, wherever it stands.
    const flagged = labelled({ Incidents: [["Server Incident"], []] });
    expect(countIncidents(flagged, ["Incidents"])).toBe(1);
  });

  it("counts them off the whole board, and out of what the bars share", () => {
    const view = labelled({ Backlog: [[]], "Server Incident": [[], []] });
    const flow = toFlow(view, ["Backlog"]);
    expect(flow.incidents).toBe(2);
    // Not a stage, so not part of what each bar is a share of.
    expect(flow.total).toBe(1);
  });

  /**
   * The building's own board, list for list, which is the shape all three
   * of them have: five declared stages, then Server Incident and
   * Production, neither of them a stage. The two questions are asked of
   * different cards and neither answer may leak into the other — which is
   * worth pinning, because Production is a word `isDeployed` matches and
   * Server Incident sits right beside it.
   */
  it("reads the building's own board without the two answers leaking", () => {
    const flow = toFlow(
      board({
        Backlog: 10,
        Refined: 7,
        "In Progress": 0,
        "In Review": 3,
        Testing: 0,
        "Server Incident": 2,
        Production: 58,
      }),
      LANES,
    );
    expect(flow.incidents).toBe(2);
    expect(flow.deployed).toBe(58);
    // Only the five declared stages are what the bars are a share of.
    expect(flow.total).toBe(20);
    expect(flow.others.map((o) => o.name)).toEqual(["Server Incident", "Production"]);
  });

  it("says none where nothing is burning", () => {
    expect(toFlow(board({ Backlog: 4, Testing: 2 }), LANES).incidents).toBe(0);
  });
});

/**
 * Work in hand, which is what the machine at the head of the room's
 * production line is making.
 *
 * One of the three stations on that line that are **stages**: the barrier,
 * the crates and the beacon are counted off the whole board precisely
 * because none of them is a stage of it, and these three are, so which
 * list each one is is read off the lanes the building declared rather than
 * asked of the board.
 *
 * And each is that lane **less what is roadblocked in it**, which is the
 * other thing that makes them odd: the barrier standing among them counts
 * the same cards, and a card cannot both have stopped and be in hand.
 */
describe("counting what a board has in hand", () => {
  /**
   * Narrow, for the incidents' reason: all three of the building's boards
   * call the list **In Progress**, so what is folded in is the handful of
   * ways anybody writes the one stage down rather than a guess at boards
   * nobody has seen. It decides two things now — what the machine counts,
   * and what the wall leaves off — so a name folded in wrongly here both
   * makes the machine and unletters a bay.
   */
  it("reads the stage work is being done in, however it is written", () => {
    for (const name of [
      "In Progress",
      " in progress ",
      "in-progress",
      "WIP",
      "Work in progress",
      "Doing",
    ])
      expect(isWip(name)).toBe(true);
    /*
     * The stages either side of it are stages where work is looked at
     * rather than made, and each already has a bay saying so — a machine
     * counting them would be making the same cards twice.
     */
    for (const name of ["In Review", "Testing", "Backlog", "Refined", "Progress report", "Done"])
      expect(isWip(name)).toBe(false);
  });

  it("counts the lane the machine is making", () => {
    const flow = toFlow(
      board({ Backlog: 4, Refined: 2, "In Progress": 3, "In Review": 1, Testing: 2 }),
      LANES,
    );
    expect(flow.wip).toBe(3);
    expect(floorLanes(flow).map((lane) => lane.name)).toEqual([
      "Refined",
      "In Progress",
      "Testing",
    ]);
  });

  /**
   * Off the building's own declaration rather than off the whole board,
   * which is the difference between this and the other three. A list
   * nobody declared is not a stage of this building's pipeline, whatever
   * it is called — the building answered that question when it named its
   * lanes.
   */
  it("ignores a list the building did not declare", () => {
    const flow = toFlow(
      board({ Backlog: 4, Refined: 2, "In Review": 1, Testing: 2, Doing: 9 }),
      LANES,
    );
    expect(flow.wip).toBe(0);
    expect(floorLanes(flow).map((lane) => lane.name)).not.toContain("In Progress");
  });

  /**
   * A lane the board has not got counts nothing, which is what the rest of
   * this floor does with one: the bay draws a dash, and a thing standing
   * on the floor either stands there or does not.
   */
  it("counts nothing where the board has no such lane", () => {
    const flow = toFlow(board({ Backlog: 4, Refined: 2, "In Review": 1, Testing: 2 }), LANES);
    expect(flow.lanes.find((lane) => lane.short === "WIP")?.missing).toBe(true);
    expect(flow.wip).toBe(0);
  });

  /** A building naming its own lanes gets the same answer. */
  it("finds it wherever the building put it in the order", () => {
    const lanes = ["Ideas", "Doing", "Shipped"];
    const flow = toFlow(board({ Ideas: 1, Doing: 7, Shipped: 3 }), lanes);
    expect(flow.wip).toBe(7);
  });

  /**
   * Hammer Time, which is the board this came off: nine cards standing in
   * the lane, three of them roadblocked. The machine and the barrier stand
   * a foot apart in the same row, so counting those three in both had the
   * room claiming twelve cards where the board had nine.
   */
  it("leaves out a stuck card standing in the lane", () => {
    const view = labelled({
      Backlog: [[], []],
      "In Progress": [
        ["Roadblocked"],
        ["Roadblock"],
        ["bug", "Blocked"],
        [],
        [],
        ["bug"],
        [],
        [],
        [],
      ],
    });
    const flow = toFlow(view, LANES);
    expect(flow.lanes.find((lane) => lane.short === "WIP")?.count).toBe(9);
    expect(flow.blocked).toBe(3);
    expect(flow.wip).toBe(6);
  });

  /**
   * The lane's own count is untouched: a bar is that stage's share of the
   * work in flight and a stuck card is still standing in the stage, which
   * is the whole reason `blocked` is not a sixth bay. Only the thing on
   * the floor answers the narrower question.
   */
  it("leaves the lane on the plate saying what stands in the list", () => {
    const flow = toFlow(labelled({ "In Progress": [["Roadblocked"], [], []] }), LANES);
    expect(flow.lanes.find((lane) => lane.short === "WIP")?.count).toBe(3);
    expect(flow.total).toBe(3);
    expect(flow.wip).toBe(2);
  });

  /** A card stuck somewhere else is the barrier's business and not the machine's. */
  it("keeps a stuck card standing in another lane out of it", () => {
    const flow = toFlow(
      labelled({ Backlog: [["Roadblocked"], ["Roadblocked"]], "In Progress": [[], [], []] }),
      LANES,
    );
    expect(flow.blocked).toBe(2);
    expect(flow.wip).toBe(3);
  });

  /**
   * Nothing is up when nothing is in hand, which is the rule all four are
   * under — so a lane whose every card has stopped stops the machine, and
   * the barrier beside it is what says why.
   */
  it("stops the machine where every card in the lane is stuck", () => {
    const flow = toFlow(labelled({ "In Progress": [["Blocked"], ["Roadblock"]] }), LANES);
    expect(flow.wip).toBe(0);
    expect(flow.blocked).toBe(2);
  });

  /** Off the board rather than off the lane, so it answers the board directly too. */
  it("counts the lane off a board it is handed", () => {
    const view = labelled({ Doing: [["Roadblocked"], [], []], Backlog: [["Roadblocked"]] });
    expect(countUnblocked(view, ["Backlog", "Doing"], isWip)).toBe(2);
    expect(countUnblocked(view, ["Backlog"], isWip)).toBe(0);
  });
});

/**
 * The bays the plate draws: everything declared, less the three stages
 * standing on the floor of the room.
 *
 * Each of them went up with its number on a plate over it, and a bay six
 * feet above saying the same thing is one count printed twice. What is
 * left is the stages work **waits** in, which is a sharper division than
 * five bars three of which happen to have something under them.
 */
describe("the lanes the wall letters", () => {
  const five = { Backlog: 4, Refined: 2, "In Progress": 3, "In Review": 1, Testing: 2 };

  it("leaves the three on the floor off the wall and keeps the rest in order", () => {
    const lanes = wallLanes(toFlow(board(five), LANES));
    expect(lanes.map((lane) => lane.short)).toEqual(["BACKLOG", "REVIEW"]);
  });

  /**
   * By the name rather than by asking which lanes the board has got. The
   * rule is that these stages are not on the wall, and a lane the board has
   * lost is no more the wall's business than one it has — otherwise an
   * archived list would put the bay back.
   */
  it("leaves it off even where the board has no such list", () => {
    const flow = toFlow(board({ Backlog: 4, Refined: 2, "In Review": 1, Testing: 2 }), LANES);
    expect(flow.lanes.find((lane) => lane.short === "WIP")?.missing).toBe(true);
    expect(wallLanes(flow).map((lane) => lane.short)).not.toContain("WIP");
  });

  /** However the board spells it, which is what the stations are found by. */
  it("follows the same words the stations do", () => {
    const flow = toFlow(board({ Ideas: 1, Doing: 7, Shipped: 3 }), ["Ideas", "Doing", "Shipped"]);
    expect(wallLanes(flow).map((lane) => lane.short)).toEqual(["IDEAS", "SHIPPED"]);
  });

  /**
   * Nothing to letter is a bare wall rather than an empty plate, which is
   * what `systems/ProjectFlow` does with this — a building whose whole
   * declared pipeline is the one stage on the floor has said everything it
   * has to say down there.
   */
  it("letters nothing where the one lane declared is the one on the floor", () => {
    expect(wallLanes(toFlow(board({ "In Progress": 3 }), ["In Progress"]))).toHaveLength(0);
  });

  /**
   * The bars are untouched: still a share of every declared lane, so the
   * share of the plate left bare is what the three stations are holding.
   * Scaling them to the two drawn would say the work on the floor is not
   * in flight, which is the one thing about it that is certain.
   */
  it("leaves the bars a share of the work in flight, the floor included", () => {
    const flow = toFlow(board(five), LANES);
    const bars = flowBars(flow);
    const drawn = wallLanes(flow).reduce((sum, lane) => sum + bars[lane.id], 0);
    expect(drawn).toBeCloseTo(5 / 12);
    expect(bars[laneId("In Progress")]).toBeCloseTo(3 / 12);
  });
});

/**
 * The two stages that joined the machine on the floor.
 *
 * Both are read exactly as work in hand is — off the lanes the building
 * declared, and less whatever is roadblocked standing in them — so what is
 * worth pinning here is the part that is theirs: the nets, which are the
 * narrowest in the file and decide two things apiece, since a name folded
 * in wrongly both feeds a station and unletters a bay.
 */
describe("the stages that stand on the floor", () => {
  it("reads the stage work is refined and waiting in", () => {
    for (const name of ["Refined", " refined ", "REFINED", "Refine"]) {
      expect(isRefined(name)).toBe(true);
    }
    /*
     * Ready is the most overloaded word on a kanban board and `laneShort`
     * carrying a shortening for it is about lettering a bay rather than
     * claiming a lane. Refinement is a guess at a board nobody has seen.
     */
    for (const name of ["Ready", "Ready for Dev", "Ready to Deploy", "Refinement", "Backlog"]) {
      expect(isRefined(name)).toBe(false);
    }
  });

  it("reads the stage work is checked in", () => {
    for (const name of ["Testing", " testing ", "Test", "Tests"])
      expect(isTesting(name)).toBe(true);
    /*
     * Done is the sharpest of these calls: `isDeployed` records that these
     * boards kept such a list until it was renamed to Testing, so the word
     * has moved here — and a pipeline of Backlog, Refined, In Progress,
     * Testing and Done is still an entirely ordinary five, which is two
     * declared lanes answering one station.
     */
    for (const name of ["Done", "QA", "Ready for Test", "In Review", "Tested and shipped"]) {
      expect(isTesting(name)).toBe(false);
    }
  });

  /**
   * No two nets share a word, which is the property `countUnblocked` leans
   * on three times over — a lane cannot be both a stage on the floor and
   * the thing standing beside it. Asserted rather than left to be
   * rediscovered: a station counting a despatch, or two stations counting
   * one lane, would take a bay off the wall and put the count in the wrong
   * place with nothing anywhere to say so.
   */
  it("keeps every net to itself", () => {
    const nets = { isRefined, isWip, isTesting, isRoadblock, isDeployed, isIncident };
    const names = [
      ...DEFAULT_FLOW_LANES,
      "Refine",
      "Doing",
      "WIP",
      "Test",
      "Blocked",
      "Roadblocked",
      "Production",
      "Deployed",
      "Server Incident",
      "Incidents",
    ];
    for (const name of names) {
      const claimed = Object.entries(nets).filter(([, is]) => is(name));
      expect(
        claimed.length,
        `${name} claimed by ${claimed.map(([k]) => k).join(", ")}`,
      ).toBeLessThan(2);
    }
  });

  /** Only the three of them, and only where the building declared the lane. */
  it("knows which lanes stand on the floor", () => {
    for (const name of ["Refined", "In Progress", "Testing"]) {
      expect(standsOnFloor(name)).toBe(true);
    }
    for (const name of ["Backlog", "In Review", "Production", "Server Incident"]) {
      expect(standsOnFloor(name)).toBe(false);
    }
  });

  it("counts each of them off the lanes the building declared", () => {
    const flow = toFlow(
      board({ Backlog: 4, Refined: 2, "In Progress": 3, "In Review": 1, Testing: 5 }),
      LANES,
    );
    expect([flow.refined, flow.wip, flow.testing]).toEqual([2, 3, 5]);
  });

  /**
   * The barrier counts a stuck card wherever it is standing, so every stage
   * with a thing of its own on the floor owes it the same subtraction the
   * machine has always made. Two cards stuck in Refined and one in Testing:
   * three on the barrier, and the two racks read one and two rather than
   * three and three, which is the row accounting for each card once.
   */
  it("leaves a stuck card to the barrier wherever on the line it stopped", () => {
    const view = labelled({
      Refined: [["Roadblocked"], ["Blocked"], []],
      "In Progress": [[], []],
      Testing: [["Roadblock"], [], []],
    });
    const flow = toFlow(view, LANES);
    expect(flow.blocked).toBe(3);
    expect([flow.refined, flow.wip, flow.testing]).toEqual([1, 2, 2]);
  });

  /**
   * And the lanes themselves are untouched: a bar is that stage's share of
   * the work in flight and a stuck card is still standing in the stage,
   * which is the whole reason the barrier is not a bay. Only the things on
   * the floor answer the narrower question.
   */
  it("leaves the lanes saying what stands in the list", () => {
    const flow = toFlow(labelled({ Refined: [["Roadblocked"], [], []] }), LANES);
    expect(flow.lanes.find((lane) => lane.short === "REFINED")?.count).toBe(3);
    expect(flow.refined).toBe(2);
  });

  /**
   * Two lists a board calls the same stage are both that stage, which is
   * `countByList`'s rule one level up. Dropping one would put less work on
   * the floor than there is on the board.
   */
  it("sums two declared lanes answering one station", () => {
    const view = labelled({ Test: [[], []], Testing: [[], [], ["Blocked"]] });
    expect(countUnblocked(view, ["Test", "Testing"], isTesting)).toBe(4);
  });

  /** A station whose lane the board has not got stands nowhere at all. */
  it("names no station for a lane the board has lost", () => {
    const flow = toFlow(board({ Backlog: 4, "In Review": 1 }), LANES);
    expect(floorLanes(flow)).toEqual([]);
    expect([flow.refined, flow.wip, flow.testing]).toEqual([0, 0, 0]);
  });
});
