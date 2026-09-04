import { describe, expect, it } from "vitest";
import {
  DUE_SOON_MS,
  dueState,
  labelColour,
  toBoardSummaries,
  toBoardView,
  type RawBoard,
} from "../board";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

describe("label colours", () => {
  it("uses Trello's palette, whatever shade it sends", () => {
    expect(labelColour("green")).toBe(labelColour("green_dark"));
    expect(labelColour("sky_light")).toBe(labelColour("sky"));
    expect(labelColour("red")).not.toBe(labelColour("blue"));
  });

  it("greys a label with no colour", () => {
    const grey = labelColour(null);
    expect(labelColour(undefined)).toBe(grey);
    expect(labelColour("")).toBe(grey);
    expect(labelColour("chartreuse")).toBe(grey);
  });
});

describe("due dates", () => {
  it("says nothing about a card with no date", () => {
    expect(dueState(null, false, NOW)).toBe("none");
    expect(dueState("not a date", false, NOW)).toBe("none");
  });

  it("counts a ticked card as done however late it was", () => {
    expect(dueState("2026-01-01T00:00:00.000Z", true, NOW)).toBe("done");
  });

  it("separates overdue, coming up, and later", () => {
    expect(dueState("2026-09-02T12:00:00.000Z", false, NOW)).toBe("overdue");
    expect(dueState(new Date(NOW + DUE_SOON_MS - 1000).toISOString(), false, NOW)).toBe("soon");
    expect(dueState(new Date(NOW + DUE_SOON_MS + 1000).toISOString(), false, NOW)).toBe("later");
  });
});

describe("a board as the wall shows it", () => {
  const raw: RawBoard = {
    id: "b1",
    name: " Roadmap ",
    url: "https://trello.com/b/b1",
    labels: [
      { id: "l1", name: "Bug", color: "red" },
      { id: "l2", name: "", color: null },
    ],
    members: [
      { id: "m1", initials: "AC", fullName: "Ada Coleman" },
      { id: "m2", fullName: "Bob Ross" },
    ],
    // Deliberately out of order: Trello's `pos` decides, not the array.
    lists: [
      { id: "done", name: "Done", pos: 30 },
      { id: "todo", name: "To do", pos: 10 },
      { id: "doing", name: "Doing", pos: 20 },
    ],
    cards: [
      { id: "c2", name: "Second", idList: "todo", pos: 20 },
      {
        id: "c1",
        name: " First ",
        idList: "todo",
        pos: 10,
        idLabels: ["l1", "gone"],
        idMembers: ["m1", "m2", "ghost"],
        due: "2026-09-02T12:00:00.000Z",
        badges: {
          comments: 2,
          attachments: 1,
          description: true,
          checkItems: 4,
          checkItemsChecked: 3,
        },
        shortUrl: "https://trello.com/c/c1",
      },
      { id: "c3", name: "Homeless", idList: "archived-list", pos: 5 },
    ],
  };

  const view = toBoardView(raw, NOW);

  it("names the board and orders the columns by position", () => {
    expect(view.name).toBe("Roadmap");
    expect(view.columns.map((c) => c.name)).toEqual(["To do", "Doing", "Done"]);
  });

  it("puts cards in their column, in order", () => {
    expect(view.columns[0].cards.map((c) => c.title)).toEqual(["First", "Second"]);
    expect(view.columns[1].cards).toEqual([]);
  });

  it("leaves out a card whose list is gone rather than misfiling it", () => {
    expect(view.cardCount).toBe(2);
    expect(JSON.stringify(view)).not.toContain("Homeless");
  });

  it("carries the labels, members and badges a card has", () => {
    const card = view.columns[0].cards[0];
    expect(card.labels.map((l) => l.name)).toEqual(["Bug"]);
    expect(card.members).toEqual(["AC", "BR"]);
    expect(card.checklist).toEqual({ done: 3, total: 4 });
    expect(card.comments).toBe(2);
    expect(card.attachments).toBe(1);
    expect(card.hasDescription).toBe(true);
    expect(card.dueState).toBe("overdue");
  });

  it("leaves a bare card bare", () => {
    const card = view.columns[0].cards[1];
    expect(card.labels).toEqual([]);
    expect(card.members).toEqual([]);
    expect(card.checklist).toBeNull();
    expect(card.dueState).toBe("none");
    expect(card.hasDescription).toBe(false);
  });

  it("copes with a board that is empty, or missing everything optional", () => {
    const bare = toBoardView({ id: "b2" }, NOW);
    expect(bare).toMatchObject({ name: "Board", url: "", columns: [], cardCount: 0 });
  });
});

describe("the list of boards", () => {
  it("names and sorts them", () => {
    expect(
      toBoardSummaries([
        { id: "2", name: "Zebra", url: "u2" },
        { id: "1", name: "Apple", url: "u1" },
      ]),
    ).toEqual([
      { id: "1", name: "Apple", url: "u1" },
      { id: "2", name: "Zebra", url: "u2" },
    ]);
  });

  it("ignores anything that is not a board", () => {
    expect(toBoardSummaries(null)).toEqual([]);
    expect(toBoardSummaries([null, "nope", { name: "no id" }])).toEqual([]);
  });
});
