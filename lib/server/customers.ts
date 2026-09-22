/**
 * Who the support desk's customers are, and how a ticket is attributed to
 * one.
 *
 * Server-only, and that is the point of the file existing at all. The map
 * needs to know which building is a customer's, which is
 * `lib/world/mailboxes.ts` and ships in the browser's bundle; this is the
 * other half — the Zoho account ids and the email domains their people
 * write in from — and it stays here, exactly as the id of Doc's Mettara
 * conversation does. Nothing downstream of it sends an address anywhere: a
 * mailbox's bubble is a number.
 *
 * Pure. No fetching, no credentials and no clock, so the attribution can be
 * checked without a network or a Zoho account — which matters here for the
 * reason it matters to the counts on Support's wall: a bubble reading
 * nothing and a bubble nobody could work out look the same from across the
 * road.
 *
 * The record it is written from is `public/characters/examples/
 * customer_domains.json`, and `customers.test.ts` holds the two to agreeing
 * rather than leaving a hand-copied table to drift.
 */

import { CUSTOMER_ORGS } from "../world/mailboxes";

export interface DeskCustomer {
  /** What Zoho calls them. */
  name: string;
  /** Their Zoho Desk account, which is the first way a ticket is attributed. */
  account: string;
  /** The domains their people write in from, which is the second way. */
  domains: readonly string[];
  /**
   * The organisation whose building they are met at, or null for a customer
   * with no premises in this world. Four of the ten are in that state and
   * stay in it: a mailbox has to stand outside something.
   */
  org: string | null;
}

/** The desk's customers, in the order the record lists them. */
export const DESK_CUSTOMERS: readonly DeskCustomer[] = [
  {
    name: "Castle Atlantic",
    account: "258289000005325323",
    domains: ["castleatlantic.ca"],
    org: "castle-atlantic",
  },
  {
    name: "Focus Media Group",
    account: "258289000002786223",
    domains: ["fmgpublishing.com"],
    org: null,
  },
  {
    name: "Homestar",
    account: "258289000008650589",
    domains: ["homestarinc.ca", "homestarbuildingsupplies.ca"],
    org: "homestar",
  },
  {
    name: "MacCallum",
    account: "258289000003330089",
    domains: ["maccallumcastle.com"],
    org: "maccallum",
  },
  {
    name: "Masstown",
    account: "258289000018401001",
    domains: ["masstownhardware.ca"],
    org: "masstown",
  },
  { name: "Pareto", account: "258289000000927001", domains: ["paretobiz.com"], org: null },
  {
    name: "Sandbox",
    account: "258289000002786157",
    domains: ["sandboxonline.co"],
    org: "sandbox-erp",
  },
  {
    name: "Targetts",
    account: "258289000009185057",
    domains: ["targetts.ca"],
    org: "targetts",
  },
  {
    name: "Trinity Energy Group",
    account: "258289000001230001",
    domains: ["trinityenergygroup.ca"],
    org: null,
  },
  {
    name: "Ultimate Windows",
    account: "258289000004625001",
    domains: ["ultimatewindows.ca"],
    org: null,
  },
];

/**
 * The little of a ticket this needs: who it is filed against, and who wrote
 * it in.
 *
 * Narrowed at the fetch rather than here, so the rest of a Zoho ticket —
 * the subject, the customer's name, everything else an address sits beside
 * — never travels this far. `RawTicket` satisfies it structurally, which is
 * what lets the two files stay independent of each other.
 */
export interface TicketParty {
  accountId?: string | null;
  email?: string | null;
}

/** Everything in lower case, with the surrounding spaces gone. */
const fold = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

/** The part of an address after the `@`, or "" for anything that is not one. */
export function domainOf(email: string | null | undefined): string {
  const at = fold(email).lastIndexOf("@");
  return at === -1 ? "" : fold(email).slice(at + 1);
}

/**
 * Whether an address belongs to a customer.
 *
 * A subdomain counts — `mail.targetts.ca` is Targetts writing in — and the
 * leading dot is what keeps that from also claiming `nottargetts.ca`, which
 * a plain `endsWith` would.
 */
function claims(customer: DeskCustomer, domain: string): boolean {
  return customer.domains.some((d) => {
    const own = fold(d);
    return domain === own || domain.endsWith(`.${own}`);
  });
}

/**
 * Whose ticket this is, or null for one belonging to nobody on the list.
 *
 * **The account first, the domain after it.** An account is what Zoho
 * itself says the ticket is filed against and is the answer wherever there
 * is one; the domain is for the ordinary case of a ticket raised by email
 * from somebody Zoho has not linked to an account, which on a real desk is
 * a great many of them. Without the second, a customer's mailbox reads low
 * for reasons nobody standing in front of it could ever guess at.
 */
export function customerOf(ticket: TicketParty): DeskCustomer | null {
  const account = fold(ticket.accountId);
  if (account) {
    const filed = DESK_CUSTOMERS.find((c) => c.account === account);
    if (filed) return filed;
  }
  const domain = domainOf(ticket.email);
  if (!domain) return null;
  return DESK_CUSTOMERS.find((c) => claims(c, domain)) ?? null;
}

export interface CustomerTally {
  /** How many are standing against each customer with a building, by organisation slug. */
  open: Record<string, number>;
  /** How many of the swept tickets belonged to nobody the desk knows by account or domain. */
  unattributed: number;
}

/**
 * The tickets, counted into the buildings they hang outside.
 *
 * Every organisation with a mailbox is in the answer, a nought included:
 * "nobody is waiting on Targetts" is a fact the map is entitled to, and the
 * bubble that draws nothing from it is deciding that on its own. A customer
 * with no building is counted and then dropped, which is the same as not
 * counting them except that `unattributed` stays honest — the point of that
 * number is to say whether the *record* is short, and a ticket from Pareto
 * is not evidence that it is.
 */
export function tallyCustomers(tickets: readonly TicketParty[]): CustomerTally {
  const open: Record<string, number> = {};
  for (const { org } of CUSTOMER_ORGS) open[org] = 0;

  let unattributed = 0;
  for (const ticket of tickets) {
    const customer = customerOf(ticket);
    if (!customer) {
      unattributed += 1;
      continue;
    }
    if (customer.org && customer.org in open) open[customer.org] += 1;
  }
  return { open, unattributed };
}
