import { describe, expect, it } from "vitest";
import type { BoardView } from "../board";
import {
  DEFAULT_FLOW_LANES,
  FLOW_COLOURS,
  NO_LANE,
  flowBars,
  flowFigure,
  flowRows,
  laneId,
  laneShort,
  toFlow,
} from "../flow";

/** A board of named lists holding that many cards apiece. */
function board(lists: Record<string, number>, name = "Sandbox ERP"): BoardView {
  const columns = Object.entries(lists).map(([listName, count], i) => ({
    id: `l${i}`,
    name: listName,
    cards: Array.from({ length: count }, (_, c) => ({ id: `c${i}-${c}` })),
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
          { id: "l9", name: "testing", cards: [{ id: "x" }] },
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
