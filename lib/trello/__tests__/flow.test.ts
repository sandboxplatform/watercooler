import { describe, expect, it } from "vitest";
import type { BoardView } from "../board";
import {
  DEFAULT_FLOW_LANES,
  FLOW_COLOURS,
  NO_LANE,
  countDeployed,
  countIncidents,
  countRoadblocks,
  flowBars,
  flowFigure,
  flowRows,
  isDeployed,
  isIncident,
  isRoadblock,
  laneId,
  laneShort,
  toFlow,
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
