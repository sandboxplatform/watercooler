import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DESK_CUSTOMERS,
  customerOf,
  domainOf,
  tallyCustomers,
  type TicketParty,
} from "../customers";
import { CUSTOMER_ORGS } from "@/lib/world/mailboxes";
import { ORGANISATIONS } from "@/lib/world/tenants";

/**
 * The record the table is written from.
 *
 * Read off disk rather than imported, which is the whole point of the test:
 * the JSON is where somebody writes a new customer down, and a hand-copied
 * table in TypeScript is a thing that drifts from it silently. Note that
 * `--changed` cannot see this — it follows imports — so a change to the JSON
 * alone wants `pnpm test:all`. Same category as `exact.test.ts` and the
 * asset manifest.
 */
const RECORD = "public/characters/examples/customer_domains.json";

interface Recorded {
  customers: { name: string; account_id: string; domains: string[] }[];
}

const recorded = (JSON.parse(readFileSync(RECORD, "utf8")) as Recorded).customers;

describe("the desk's customers", () => {
  it("say what the record says, in the order it says it", () => {
    expect(
      DESK_CUSTOMERS.map((c) => ({
        name: c.name,
        account_id: c.account,
        domains: [...c.domains],
      })),
    ).toEqual(recorded);
  });

  it("claim no account and no domain twice", () => {
    const accounts = DESK_CUSTOMERS.map((c) => c.account);
    expect(new Set(accounts).size).toBe(accounts.length);
    const domains = DESK_CUSTOMERS.flatMap((c) => c.domains.map((d) => d.toLowerCase()));
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("name an organisation that is in this world, where they name one at all", () => {
    for (const customer of DESK_CUSTOMERS) {
      if (!customer.org) continue;
      expect(
        ORGANISATIONS.map((o) => o.slug),
        customer.name,
      ).toContain(customer.org);
    }
  });

  // The two halves of one fact, kept apart because the account ids and the
  // domains must not ship in the browser's bundle. Which makes agreeing
  // about the rest a thing to assert rather than to remember.
  it("agree with the map about who has a mailbox", () => {
    const withBuildings = DESK_CUSTOMERS.filter((c) => c.org).map((c) => ({
      org: c.org,
      customer: c.name,
    }));
    expect(
      [...CUSTOMER_ORGS].map((m) => ({ org: m.org, customer: m.customer })).sort(byOrg),
    ).toEqual(withBuildings.sort(byOrg));
  });
});

const byOrg = (a: { org: string | null }, b: { org: string | null }) =>
  (a.org ?? "").localeCompare(b.org ?? "");

describe("whose ticket it is", () => {
  const ticket = (party: Partial<TicketParty>): TicketParty => party;

  it("takes the account Zoho filed it against", () => {
    expect(customerOf(ticket({ accountId: "258289000009185057" }))?.name).toBe("Targetts");
  });

  // The account is what Zoho itself says, so it wins outright. Two of the
  // desk's customers could share a domain one day; none could share an id.
  it("prefers the account to the address", () => {
    const filed = ticket({ accountId: "258289000009185057", email: "someone@masstownhardware.ca" });
    expect(customerOf(filed)?.name).toBe("Targetts");
  });

  // The case this exists for: raised by email from somebody Zoho has not
  // linked to an account, which on a real desk is a great many of them.
  it("falls back to the address's domain", () => {
    expect(customerOf(ticket({ email: "sue@castleatlantic.ca" }))?.name).toBe("Castle Atlantic");
    expect(customerOf(ticket({ accountId: null, email: "Sue@CastleAtlantic.CA " }))?.name).toBe(
      "Castle Atlantic",
    );
  });

  it("counts a subdomain and not a lookalike", () => {
    expect(customerOf(ticket({ email: "a@mail.targetts.ca" }))?.name).toBe("Targetts");
    expect(customerOf(ticket({ email: "a@nottargetts.ca" }))).toBeNull();
  });

  it("knows an account it has never heard of, and no address at all", () => {
    expect(customerOf(ticket({ accountId: "999", email: "a@example.com" }))).toBeNull();
    expect(customerOf(ticket({}))).toBeNull();
    expect(customerOf(ticket({ email: "not-an-address" }))).toBeNull();
  });

  it("reads the domain off an address and nothing else", () => {
    expect(domainOf("a@b.example.com")).toBe("b.example.com");
    expect(domainOf(" A@B.COM ")).toBe("b.com");
    expect(domainOf("nobody")).toBe("");
    expect(domainOf(null)).toBe("");
  });
});

describe("counting them into the buildings", () => {
  it("names every mailbox, a nought included", () => {
    const { open } = tallyCustomers([]);
    expect(Object.keys(open).sort()).toEqual([...CUSTOMER_ORGS].map((m) => m.org).sort());
    expect(Object.values(open).every((n) => n === 0)).toBe(true);
  });

  it("puts each ticket outside the right door", () => {
    const { open } = tallyCustomers([
      { accountId: "258289000009185057" },
      { email: "a@targetts.ca" },
      { email: "b@masstownhardware.ca" },
      { accountId: "258289000002786157" },
    ]);
    expect(open.targetts).toBe(2);
    expect(open.masstown).toBe(1);
    expect(open["sandbox-erp"]).toBe(1);
    expect(open.homestar).toBe(0);
  });

  // A customer with no premises is still a customer: counting them as
  // unattributed would make `unattributed` read as "the record is short"
  // when the record is complete and they simply have no door here.
  it("does not call a customer with no building a stranger", () => {
    const { open, unattributed } = tallyCustomers([
      { email: "a@paretobiz.com" },
      { email: "b@nobody.example" },
    ]);
    expect(unattributed).toBe(1);
    expect(Object.values(open).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
