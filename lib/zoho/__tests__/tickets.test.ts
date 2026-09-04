import { describe, expect, it } from "vitest";
import { personName, priorityOf, toDeskView, type RawTicket } from "../tickets";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

describe("priorities", () => {
  it("reads Zoho's words whatever their case", () => {
    expect(priorityOf("Urgent")).toBe("urgent");
    expect(priorityOf(" high ")).toBe("high");
    expect(priorityOf("MEDIUM")).toBe("medium");
  });

  it("has a place for a ticket with none, or an unfamiliar one", () => {
    expect(priorityOf(null)).toBe("none");
    expect(priorityOf("")).toBe("none");
    expect(priorityOf("Whenever")).toBe("none");
  });
});

describe("names", () => {
  it("joins the parts Zoho gives", () => {
    expect(personName({ firstName: "Ada", lastName: "Coleman" })).toBe("Ada Coleman");
    expect(personName({ firstName: "Ada" })).toBe("Ada");
  });

  it("never falls back to an email address, which does not belong on a wall", () => {
    expect(personName({ email: "someone@example.com" })).toBeNull();
    expect(personName(null)).toBeNull();
    expect(personName({ firstName: "  ", lastName: null })).toBeNull();
  });
});

describe("a queue as the wall shows it", () => {
  const raw: RawTicket[] = [
    {
      id: "1",
      ticketNumber: 1043,
      subject: " Stock sync ran twice ",
      status: "Open",
      statusType: "Open",
      priority: "Urgent",
      dueDate: "2026-09-02T09:00:00.000Z",
      channel: "Email",
      assignee: { firstName: "Ada", lastName: "Coleman" },
      contact: { firstName: "Bob", lastName: "Ross", email: "bob@example.com" },
      webUrl: "https://desk.zoho.com/agent/x/tickets/1",
    },
    { id: "2", ticketNumber: 1044, subject: "Password reset", status: "Open", statusType: "Open" },
    {
      id: "3",
      ticketNumber: 1040,
      subject: "Invoice query",
      status: "Closed",
      statusType: "Closed",
      priority: "Low",
      dueDate: "2026-08-01T09:00:00.000Z",
    },
    {
      id: "4",
      ticketNumber: 1041,
      subject: "Quote wrong",
      status: "On Hold",
      statusType: "On Hold",
    },
    { id: "5", ticketNumber: 1042, subject: "Site down", status: "Escalated", statusType: "Open" },
  ];

  const view = toDeskView(raw, NOW);

  it("puts open work first, then what is parked, then the closed ones", () => {
    expect(view.columns.map((c) => c.name)).toEqual(["Open", "Escalated", "On Hold", "Closed"]);
  });

  it("orders a desk that names its statuses its own way", () => {
    // A real desk: none of these are the words the code knows, so Zoho's
    // coarse type is what decides.
    const real = toDeskView(
      [
        { id: "a", status: "Closed", statusType: "Closed" },
        { id: "b", status: "Under Consideration", statusType: "On Hold" },
        { id: "c", status: "Queue", statusType: "Open" },
        { id: "d", status: "New", statusType: "Open" },
      ],
      NOW,
    );
    expect(real.columns.map((c) => c.name)).toEqual([
      "New",
      "Queue",
      "Under Consideration",
      "Closed",
    ]);
    expect(real.openCount).toBe(3);
  });

  it("counts the queue, what is still open, and what is late", () => {
    expect(view.ticketCount).toBe(5);
    expect(view.openCount).toBe(4);
    expect(view.overdueCount).toBe(1);
  });

  it("carries what a ticket is, without the customer's email", () => {
    const ticket = view.columns[0].tickets[0];
    expect(ticket).toMatchObject({
      number: "#1043",
      subject: "Stock sync ran twice",
      priority: "urgent",
      assignee: "Ada Coleman",
      contact: "Bob Ross",
      channel: "Email",
      dueState: "overdue",
    });
    expect(JSON.stringify(view)).not.toContain("@example.com");
  });

  it("treats a closed ticket as done rather than late", () => {
    const closed = view.columns[3].tickets[0];
    expect(closed.dueState).toBe("done");
  });

  it("fills in for a ticket with almost nothing on it", () => {
    const bare = view.columns[0].tickets[1];
    expect(bare).toMatchObject({
      subject: "Password reset",
      priority: "none",
      assignee: null,
      contact: null,
      due: null,
      dueState: "none",
    });
  });

  it("copes with nothing, or with rubbish", () => {
    expect(toDeskView([], NOW)).toEqual({
      columns: [],
      ticketCount: 0,
      openCount: 0,
      overdueCount: 0,
    });
    expect(toDeskView(null, NOW).ticketCount).toBe(0);
    expect(toDeskView([null, "nope", { subject: "no id" }], NOW).ticketCount).toBe(0);
  });

  it("keeps a status it has never heard of, between the known ones and the closed", () => {
    const odd = toDeskView(
      [
        { id: "a", status: "Waiting on parts", statusType: "Open" },
        { id: "b", status: "Closed", statusType: "Closed" },
        { id: "c", status: "Open", statusType: "Open" },
      ],
      NOW,
    );
    expect(odd.columns.map((c) => c.name)).toEqual(["Open", "Waiting on parts", "Closed"]);
  });
});
