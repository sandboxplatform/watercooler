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

  it("puts open work first, then what is parked", () => {
    expect(view.columns.map((c) => c.name)).toEqual(["Open", "Escalated", "On Hold"]);
  });

  /**
   * The board is the work still to do. A closed lane is the longest
   * column on any desk keeping up with itself and the one nobody walks to
   * a wall to read — what the desk has closed is said next door, in the
   * day counters on the plate and the two weeks in the corridor.
   */
  it("leaves the closed lane off altogether", () => {
    expect(view.columns.map((c) => c.name)).not.toContain("Closed");
    expect(JSON.stringify(view)).not.toContain("Invoice query");
  });

  /**
   * By Zoho's own coarse type rather than by a status named here: a desk
   * names its statuses its own way, and a written-down list would put a
   * lane back the first time somebody added one.
   */
  it("goes by the coarse type, whatever the desk calls the status", () => {
    const view = toDeskView(
      [
        { id: "a", status: "Invoice sent", statusType: "Closed" },
        { id: "b", status: "Resolved", statusType: "Closed" },
        { id: "c", status: "Awaiting parts", statusType: "Open" },
      ],
      NOW,
    );
    expect(view.columns.map((c) => c.name)).toEqual(["Awaiting parts"]);
    expect(view.ticketCount).toBe(1);
    expect(view.closedCount).toBe(2);
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
    expect(real.columns.map((c) => c.name)).toEqual(["New", "Queue", "Under Consideration"]);
    expect(real.ticketCount).toBe(3);
  });

  /**
   * The closed ones are counted even though they are not shown: the page
   * is the hundred most recently modified tickets and closing one
   * modifies it, so a board that is short is short for a reason the foot
   * of the panel can give.
   */
  it("counts what is on the board, what was left off, and what is late", () => {
    expect(view.ticketCount).toBe(4);
    expect(view.closedCount).toBe(1);
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

  /**
   * Nothing on the board is closed any more, so this is asked of the one
   * thing that still reads the flag: an overdue date on a closed ticket
   * is not lateness, it is a ticket that was answered late and is done.
   */
  it("treats a closed ticket as done rather than late", () => {
    const only = toDeskView(
      [{ id: "3", status: "Closed", statusType: "Closed", dueDate: "2026-08-01T09:00:00.000Z" }],
      NOW,
    );
    expect(only.overdueCount).toBe(0);
    expect(only.closedCount).toBe(1);
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
      closedCount: 0,
      overdueCount: 0,
    });
    expect(toDeskView(null, NOW).ticketCount).toBe(0);
    expect(toDeskView([null, "nope", { subject: "no id" }], NOW).ticketCount).toBe(0);
  });

  it("keeps a status it has never heard of, after the known ones", () => {
    const odd = toDeskView(
      [
        { id: "a", status: "Waiting on parts", statusType: "Open" },
        { id: "b", status: "Closed", statusType: "Closed" },
        { id: "c", status: "Open", statusType: "Open" },
      ],
      NOW,
    );
    expect(odd.columns.map((c) => c.name)).toEqual(["Open", "Waiting on parts"]);
  });
});
