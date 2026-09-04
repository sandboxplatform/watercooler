import { describe, expect, it } from "vitest";
import {
  clampLimit,
  describeBoard,
  describeDesk,
  filterCards,
  filterTickets,
  renderCards,
  renderTickets,
  TOOLS,
} from "../boards-mcp.mjs";

const board = {
  name: "Sandbox ERP",
  cardCount: 3,
  columns: [
    {
      name: "Backlog",
      cards: [
        {
          title: "Fix the stock sync",
          labels: [{ name: "Bug" }],
          members: ["RC"],
          due: null,
          dueState: "none",
          checklist: null,
        },
        {
          title: "Quote PDF tidy-up",
          labels: [],
          members: [],
          due: null,
          dueState: "none",
          checklist: { done: 1, total: 3 },
        },
      ],
    },
    {
      name: "In Progress",
      cards: [
        {
          title: "Ferry timetable",
          labels: [{ name: "Feature" }],
          members: ["AC"],
          due: "2026-09-02T09:00:00Z",
          dueState: "overdue",
          checklist: null,
        },
      ],
    },
  ],
};

const desk = {
  ticketCount: 3,
  openCount: 2,
  overdueCount: 1,
  columns: [
    {
      name: "New",
      closed: false,
      tickets: [
        {
          number: "#1",
          subject: "Printer on fire",
          status: "New",
          priority: "urgent",
          assignee: "Ada Coleman",
          contact: "Bob Ross",
          due: "2026-09-02T09:00:00Z",
          dueState: "overdue",
        },
        {
          number: "#2",
          subject: "Password reset",
          status: "New",
          priority: "low",
          assignee: null,
          contact: "Mia Klein",
          due: null,
          dueState: "none",
        },
      ],
    },
    {
      name: "Closed",
      closed: true,
      tickets: [
        {
          number: "#3",
          subject: "Old printer question",
          status: "Closed",
          priority: "low",
          assignee: "Ada Coleman",
          contact: null,
          due: null,
          dueState: "done",
        },
      ],
    },
  ],
};

describe("the tools offered to an agent", () => {
  it("are the four read-only ones, and nothing that writes", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "board_summary",
      "board_cards",
      "desk_summary",
      "desk_tickets",
    ]);
  });
});

describe("how much is returned", () => {
  it("has a sane default and a ceiling", () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(0)).toBe(25);
    expect(clampLimit("nonsense")).toBe(25);
    expect(clampLimit(5)).toBe(5);
    expect(clampLimit(5000)).toBe(100);
  });
});

describe("choosing cards", () => {
  it("returns them all with no filter, tagged with their column", () => {
    const cards = filterCards(board);
    expect(cards).toHaveLength(3);
    expect(cards[0].column).toBe("Backlog");
  });

  it("narrows by column, label and words in the title", () => {
    expect(filterCards(board, { column: "in progress" }).map((c) => c.title)).toEqual([
      "Ferry timetable",
    ]);
    expect(filterCards(board, { label: "bug" }).map((c) => c.title)).toEqual([
      "Fix the stock sync",
    ]);
    expect(filterCards(board, { query: "quote" }).map((c) => c.title)).toEqual([
      "Quote PDF tidy-up",
    ]);
    expect(filterCards(board, { column: "Nowhere" })).toEqual([]);
  });

  it("writes a card as one readable line, marking what is overdue", () => {
    const line = renderCards(filterCards(board, { column: "In Progress" }));
    expect(line).toContain("[In Progress] Ferry timetable");
    expect(line).toContain("OVERDUE");
    expect(line).toContain("with: AC");
    expect(renderCards([])).toBe("No cards match.");
  });
});

describe("choosing tickets", () => {
  it("leaves out the closed ones unless asked", () => {
    expect(filterTickets(desk, { openOnly: true })).toHaveLength(2);
    expect(filterTickets(desk, { openOnly: false })).toHaveLength(3);
  });

  it("narrows by status, priority, who has it and words in the subject", () => {
    expect(filterTickets(desk, { priority: "urgent" }).map((t) => t.number)).toEqual(["#1"]);
    expect(filterTickets(desk, { assignee: "ada", openOnly: true }).map((t) => t.number)).toEqual([
      "#1",
    ]);
    expect(filterTickets(desk, { query: "password" }).map((t) => t.number)).toEqual(["#2"]);
    expect(filterTickets(desk, { status: "new" })).toHaveLength(2);
  });

  it("marks an unassigned ticket as such, and flags what is late", () => {
    const text = renderTickets(filterTickets(desk, { openOnly: true }));
    expect(text).toContain("#1 Printer on fire");
    expect(text).toContain("OVERDUE");
    expect(text).toContain("unassigned");
    expect(renderTickets([])).toBe("No tickets match.");
  });
});

describe("the summaries", () => {
  it("count what is on each board", () => {
    expect(describeBoard({ configured: true, board })).toContain("Backlog: 2");
    expect(describeDesk({ configured: true, desk })).toContain("2 open of 3, 1 overdue");
  });

  it("explain themselves when nothing is connected or something broke", () => {
    expect(describeBoard({ configured: false })).toMatch(/No Trello board/);
    expect(describeDesk({ configured: false })).toMatch(/No Zoho Desk/);
    expect(describeBoard({ configured: true, error: "nope" })).toContain("nope");
    expect(describeDesk({ configured: true, error: "nope" })).toContain("nope");
    expect(describeBoard({ configured: true, boards: [{ name: "Hammer Time" }] })).toContain(
      "Hammer Time",
    );
  });
});
