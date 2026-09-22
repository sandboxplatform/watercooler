/**
 * Reading a Zoho Desk queue.
 *
 * Server-side only. Zoho uses OAuth rather than a simple key: a long-lived
 * refresh token is traded for an access token that lasts an hour, and the
 * access token is what every request carries. The refresh token is the
 * valuable one, so it never leaves the server, is never logged, and is
 * never sent to the browser.
 *
 * Read-only: only GETs, and no method that changes a ticket exists.
 */

import { createLogger } from "../logger";
import { toDeskView, type DeskView } from "./tickets";
import {
  CLOSED_STATUS,
  DEFAULT_PULSE_STATUSES,
  commonZone,
  dayStartIn,
  readableBefore,
  sweptPast,
  toPulse,
  weekStartIn,
  type Pulse,
  type PulseId,
  type ZoneSource,
} from "./pulse";

const log = createLogger("Zoho");

/** Long enough to spare Zoho's API credits, short enough to feel live. */
export const DESK_CACHE_MS = 30_000;

/** The most tickets to hang on the wall. Zoho's own ceiling per page is 100. */
export const TICKET_LIMIT = 100;

/** Refresh a little early, so a request never rides an expiring token. */
const TOKEN_MARGIN_MS = 60_000;

export interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
  /**
   * Which Zoho data centre the account lives in — "com", "eu", "in",
   * "com.au", "jp". The domains differ, and a token from one is refused
   * by another.
   */
  region: string;
  /** One department's queue, when named; otherwise the whole desk. */
  departmentId: string | null;
  /**
   * The timezone the desk's day runs in, when somebody has said. Null means
   * work it out from the desk itself — see `fetchDeskZone`.
   */
  timeZone: string | null;
}

export function readZohoConfig(env: NodeJS.ProcessEnv = process.env): ZohoConfig | null {
  const clientId = env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = env.ZOHO_REFRESH_TOKEN?.trim();
  const orgId = env.ZOHO_ORG_ID?.trim();
  if (!clientId || !clientSecret || !refreshToken || !orgId) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    orgId,
    region: env.ZOHO_REGION?.trim() || "com",
    departmentId: env.ZOHO_DEPARTMENT_ID?.trim() || null,
    timeZone: env.ZOHO_TIMEZONE?.trim() || null,
  };
}

export class ZohoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function describe(status: number, detail?: string): string {
  if (status === 401) return "Zoho refused the token. Check the client and refresh token.";
  if (status === 403) return "That Zoho token is not allowed to read tickets. Check its scope.";
  if (status === 404) return "Zoho has no such desk or department.";
  if (status === 422) {
    // Zoho's own words are the useful part here: it names the field it
    // did not like.
    return detail
      ? `Zoho would not accept the request: ${detail}`
      : "Zoho would not accept the request.";
  }
  if (status === 429) return "Zoho is rate limiting us. The queue will refresh shortly.";
  return detail ? `Zoho answered ${status}: ${detail}` : `Zoho answered ${status}.`;
}

/** Zoho explains a refusal in the body; that explanation names no credential. */
async function reasonFrom(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as {
      errorCode?: string;
      message?: string;
      errorField?: string;
    };
    const parts = [body.message, body.errorField && `(field: ${body.errorField})`].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : body.errorCode;
  } catch {
    return undefined;
  }
}

/** The access token in hand, and when it goes stale. */
let token: { value: string; until: number } | null = null;

/** Test seam, and a way to force a fresh token after the keys change. */
export function forgetZohoToken() {
  token = null;
}

/**
 * Trade the refresh token for an access token, keeping it until it is
 * nearly expired. The refresh token itself is sent in the body, never in
 * a URL, and neither is ever logged.
 */
async function accessToken(config: ZohoConfig): Promise<string> {
  const now = Date.now();
  if (token && token.until > now) return token.value;

  const body = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetch(`https://accounts.zoho.${config.region}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch (err) {
    log.warn("could not reach Zoho for a token:", (err as Error).message);
    throw new ZohoError(502, "Zoho could not be reached.");
  }

  const answer = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !answer.access_token) {
    // Zoho reports a bad refresh token as 200 with an error field, so the
    // status alone is not enough to trust.
    log.warn(`Zoho refused a token: ${answer.error ?? response.status}`);
    throw new ZohoError(401, describe(401));
  }

  const seconds = typeof answer.expires_in === "number" ? answer.expires_in : 3600;
  token = { value: answer.access_token, until: now + seconds * 1000 - TOKEN_MARGIN_MS };
  return token.value;
}

async function get(path: string, params: Record<string, string>, config: ZohoConfig) {
  const access = await accessToken(config);
  const url = new URL(`https://desk.zoho.${config.region}/api/v1${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // A header, not a query parameter: this one stays out of any log.
        Authorization: `Zoho-oauthtoken ${access}`,
        orgId: config.orgId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    log.warn(`could not reach Zoho Desk for ${path}:`, (err as Error).message);
    throw new ZohoError(502, "Zoho could not be reached.");
  }

  // An expired token reads as 401; drop it so the next attempt gets a new one.
  if (response.status === 401) forgetZohoToken();
  // Nothing to show is not a failure: Zoho answers 204 for an empty queue.
  if (response.status === 204) return { data: [] };
  if (!response.ok) {
    const reason = await reasonFrom(response);
    log.warn(`Zoho Desk answered ${response.status} for ${path}${reason ? `: ${reason}` : ""}`);
    throw new ZohoError(response.status, describe(response.status, reason));
  }
  return (await response.json()) as { data?: unknown };
}

/** The desk's tickets, newest first, grouped into columns by status. */
export async function fetchTickets(config: ZohoConfig): Promise<DeskView> {
  const params: Record<string, string> = {
    limit: String(TICKET_LIMIT),
    sortBy: "-modifiedTime",
    // "contacts", plural: Zoho names the include differently from the
    // field it fills in, and refuses the singular with a 422.
    include: "contacts,assignee",
  };
  if (config.departmentId) params.departmentId = config.departmentId;
  const answer = await get("/tickets", params, config);
  return toDeskView(answer.data);
}

/** The desk's departments, so a person can see which id to name. */
export async function fetchDepartments(
  config: ZohoConfig,
): Promise<{ id: string; name: string }[]> {
  const answer = await get("/departments", { limit: "50" }, config);
  const list = Array.isArray(answer.data) ? answer.data : [];
  return list
    .filter(
      (d): d is { id: string; name?: string } => typeof d === "object" && d !== null && "id" in d,
    )
    .map((d) => ({ id: d.id, name: d.name?.trim() || "Department" }));
}

// ── The five numbers on the wall ────────────────────────

/**
 * How long the counts are held. Longer than the queue's half minute: the
 * counts take three sweeps rather than one page, and a number on a wall
 * that is a minute old is still the truth about a support desk.
 */
export const PULSE_CACHE_MS = 60_000;

/**
 * How many pages a sweep reads before it gives up and says the number is a
 * floor. Six hundred tickets standing in one status is a desk with a
 * different problem than this wall can help with; counting for ever to
 * find that out would spend Zoho's credits on it every minute.
 */
export const PULSE_MAX_PAGES = 6;

/** Which statuses the standing counters ask for. See DEFAULT_PULSE_STATUSES. */
export function readPulseStatuses(env: NodeJS.ProcessEnv = process.env): string[] {
  const named = env.ZOHO_PULSE_STATUSES?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return named && named.length > 0 ? named.slice(0, 3) : [...DEFAULT_PULSE_STATUSES];
}

/**
 * The desk's timezone, once. It does not change while a server is up, and
 * two of the three ways of finding it cost a request.
 */
let deskZone: { timeZone: string | null; zone: ZoneSource } | null = null;

/** Test seam, and a way to re-ask after the keys change. */
export function forgetDeskZone() {
  deskZone = null;
}

/**
 * Which timezone the desk keeps its day in.
 *
 * `ZOHO_TIMEZONE` wins: an explicit answer beats a derived one, and it is
 * the way out if a desk's people are scattered and the majority below is
 * not the answer anybody wants. Otherwise Zoho's own field on the
 * organisation, which is the right place for it — and null on plenty of
 * accounts, including the one this was written against. Failing that, the
 * timezone the most of the desk's agents keep: they are the people working
 * the queue, so their clock is what "today" means on a support board.
 *
 * A failure is not cached, so a Zoho blip during the first read does not
 * pin the day to the server's clock until somebody restarts.
 */
export async function fetchDeskZone(
  config: ZohoConfig,
): Promise<{ timeZone: string | null; zone: ZoneSource }> {
  if (config.timeZone) return { timeZone: config.timeZone, zone: "configured" };
  if (deskZone) return deskZone;

  const found = await resolveDeskZone(config);
  if (found.timeZone) deskZone = found;
  return found;
}

async function resolveDeskZone(
  config: ZohoConfig,
): Promise<{ timeZone: string | null; zone: ZoneSource }> {
  try {
    const orgs = await get("/organizations", { limit: "50" }, config);
    const list = Array.isArray(orgs.data)
      ? (orgs.data as { id?: unknown; timeZone?: unknown }[])
      : [];
    const mine = list.find((org) => String(org.id) === config.orgId) ?? list[0];
    const named = typeof mine?.timeZone === "string" ? mine.timeZone.trim() : "";
    if (named) return { timeZone: named, zone: "organisation" };
  } catch (err) {
    log.warn("could not read the organisation's timezone:", (err as Error).message);
  }

  try {
    const agents = await get("/agents", { limit: "50" }, config);
    const list = Array.isArray(agents.data)
      ? (agents.data as { timeZone?: string; status?: string }[])
      : [];
    // Only the people actually working: a leaver's clock is not the desk's.
    const active = list.filter((agent) => (agent.status ?? "ACTIVE").toUpperCase() === "ACTIVE");
    const common = commonZone((active.length > 0 ? active : list).map((agent) => agent.timeZone));
    if (common) return { timeZone: common, zone: "agents" };
  } catch (err) {
    log.warn("could not read the agents' timezones:", (err as Error).message);
  }

  return { timeZone: null, zone: "server" };
}

type Page = Record<string, unknown> & { status?: string };

/**
 * Read pages until they run out, the ceiling is reached, or `until` says a
 * ticket is past the point of interest.
 *
 * `from` is one-based — Zoho's first record is 1, and 0 is treated as 1 —
 * so a zero-based offset would read the boundary record twice on every page
 * and count it twice with it.
 *
 * `until` exists because the two day counters are a prefix of a sorted
 * list: sweeping newest-first, the first ticket older than midnight ends
 * the sweep, and everything behind it is older still. That is what makes
 * those two counts exact from one page in the ordinary case rather than a
 * count of the whole desk.
 */
async function sweep(
  config: ZohoConfig,
  params: Record<string, string>,
  until?: (ticket: Page) => boolean,
): Promise<{ tickets: Page[]; capped: boolean }> {
  const tickets: Page[] = [];
  for (let page = 0; page < PULSE_MAX_PAGES; page++) {
    const answer = await get(
      "/tickets",
      { ...params, limit: String(TICKET_LIMIT), from: String(1 + page * TICKET_LIMIT) },
      config,
    );
    const rows = Array.isArray(answer.data) ? (answer.data as Page[]) : [];
    for (const row of rows) {
      if (until?.(row)) return { tickets, capped: false };
      tickets.push(row);
    }
    // A short page is the end of the desk, not the end of our patience.
    if (rows.length < TICKET_LIMIT) return { tickets, capped: false };
  }
  return { tickets, capped: true };
}

/**
 * The counts, from three sweeps.
 *
 * Three rather than one because they are three different questions. The
 * standing counters want every ticket in three statuses, however old; the
 * traffic counters want a prefix of the desk sorted by when tickets were
 * raised and by when they were closed, which are different orders and
 * neither of them the first.
 *
 * Still three, and now over four boundaries. The Monday before last is the
 * longest reach of them, so the two traffic sweeps stop there and every
 * shorter count — this week's, today's — is a prefix of what those same
 * pages already held. A pair of sweeps per boundary would ask Zoho again
 * for tickets it has just handed over.
 *
 * What a second week does cost is reach: the sweeps read a fortnight of the
 * desk before they stop, against a week before, so a busy desk runs into
 * `PULSE_MAX_PAGES` sooner. That is why capping is asked per boundary — a
 * sweep that ran out of pages inside last week has very often still read
 * every ticket of this one, and marking this week a floor on those grounds
 * would be a floor where there is a total.
 *
 * `sortBy` matters for more than tidiness on the last two: `until` trusts
 * the order to stop early, so the sort is what keeps them exact.
 */
export async function fetchPulse(config: ZohoConfig, now: number = Date.now()): Promise<Pulse> {
  const statuses = readPulseStatuses();
  // The desk's midnight, not the server's: a support desk's day belongs to
  // the people working it, and this same build runs on a host in another
  // timezone. Worked out once, so the sweeps below stop where the counts
  // say they stopped.
  const { timeZone, zone } = await fetchDeskZone(config);
  const from = dayStartIn(now, timeZone);
  const weekFrom = weekStartIn(now, timeZone);
  const lastWeekFrom = weekStartIn(now, timeZone, 1);
  const scope: Record<string, string> = config.departmentId
    ? { departmentId: config.departmentId }
    : {};

  const standing = await sweep(config, {
    ...scope,
    status: statuses.join(","),
    sortBy: "-modifiedTime",
  });
  // `readableBefore` rather than `!atOrAfter`: a sweep stops on the claim
  // that everything past here is older, and a ticket whose stamp is missing
  // or unreadable is no grounds for it. See the note on that function.
  const opened = await sweep(config, { ...scope, sortBy: "-createdTime" }, (ticket) =>
    readableBefore(ticket.createdTime as string | undefined, lastWeekFrom),
  );
  const closed = await sweep(
    config,
    { ...scope, status: CLOSED_STATUS, sortBy: "-closedTime" },
    (ticket) => readableBefore(ticket.closedTime as string | undefined, lastWeekFrom),
  );

  // A capped standing sweep leaves all three of its counters a floor: the
  // pages it did not read could have held any of the three statuses.
  //
  // The traffic sweeps are capped per boundary rather than outright, since
  // one sweep now answers three questions. Running out of pages somewhere
  // inside last week says nothing about this week, and nothing about today,
  // if the sweep got as far back as those boundaries — which, on a busy
  // desk, is the ordinary case.
  const short = (
    tickets: readonly Record<string, unknown>[],
    field: "createdTime" | "closedTime",
    capped: boolean,
    boundary: number,
  ) => capped && !sweptPast(tickets, field, boundary);
  const openedShort = (boundary: number) =>
    short(opened.tickets, "createdTime", opened.capped, boundary);
  const closedShort = (boundary: number) =>
    short(closed.tickets, "closedTime", closed.capped, boundary);

  const capped: PulseId[] = [
    ...(standing.capped ? (["new", "queue", "in-progress"] as PulseId[]) : []),
    ...(openedShort(from) ? (["opened-today"] as PulseId[]) : []),
    ...(closedShort(from) ? (["closed-today"] as PulseId[]) : []),
    ...(openedShort(weekFrom) ? (["opened-week"] as PulseId[]) : []),
    ...(closedShort(weekFrom) ? (["closed-week"] as PulseId[]) : []),
    ...(openedShort(lastWeekFrom) ? (["opened-last-week"] as PulseId[]) : []),
    ...(closedShort(lastWeekFrom) ? (["closed-last-week"] as PulseId[]) : []),
  ];

  return toPulse({
    statuses,
    standing: standing.tickets,
    opened: opened.tickets,
    closed: closed.tickets,
    capped,
    since: from,
    weekSince: weekFrom,
    lastWeekSince: lastWeekFrom,
    timeZone,
    zone,
  });
}

// ── The mailboxes on the world map ──────────────────────

/**
 * How long the customers' counts are held.
 *
 * Longer than the wall's minute, because of where they hang: the world map
 * is the one room everybody passes through, and a mailbox is a thing you
 * glance at on the way past rather than a dashboard anybody stands in front
 * of. Two minutes old is the truth about who is waiting.
 */
export const CUSTOMERS_CACHE_MS = 120_000;

/**
 * Which statuses count as open, for the bubbles over the mailboxes.
 *
 * `ZOHO_OPEN_STATUSES` names them, comma separated, and they have to match
 * the desk's Status picklist exactly — Zoho filters by literal value, the
 * same as the standing counters do.
 *
 * With nothing named it is the standing three (`ZOHO_PULSE_STATUSES`), so
 * out of the box a mailbox and Support's wall agree: the six bubbles sum to
 * the wall's three bays. A separate name rather than sharing that one,
 * because they are different questions asked of the same desk — the wall
 * has three bays and takes exactly three statuses, and a desk whose open
 * work is spread over five of its nine has nowhere to say so.
 */
export function readOpenStatuses(env: NodeJS.ProcessEnv = process.env): string[] {
  const named = env.ZOHO_OPEN_STATUSES?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return named && named.length > 0 ? named : readPulseStatuses(env);
}

/**
 * The little of an open ticket a mailbox needs: who it is filed against,
 * and who wrote it in.
 *
 * Narrowed here, at the fetch, rather than downstream: attributing a ticket
 * takes an account id and an address and nothing else, and an address is
 * not a thing to carry any further through this app than it has to go. See
 * `personName` in `tickets.ts`, which is the same argument about the wall.
 */
export interface TicketParty {
  accountId: string | null;
  email: string | null;
}

const text = (value: unknown): string | null => {
  const found = typeof value === "string" ? value.trim() : "";
  return found || null;
};

/**
 * Every open ticket on the desk, as the pair of facts that says whose it is.
 *
 * One sweep, not ten. Zoho has no count endpoint this token can use — see
 * the note above `fetchPulse` — so the choice is paging a filtered list
 * once and sorting the tickets into customers here, or asking per account
 * and paying for ten of these. The sweep is capped like every other, and a
 * capped one makes every figure a floor rather than a total: a mailbox
 * cannot say which customer the pages it never read belonged to.
 */
export async function fetchOpenParties(
  config: ZohoConfig,
): Promise<{ parties: TicketParty[]; capped: boolean; statuses: string[] }> {
  const statuses = readOpenStatuses();
  const scope: Record<string, string> = config.departmentId
    ? { departmentId: config.departmentId }
    : {};
  // "contacts", plural, is what fills in the singular `contact` — Zoho names
  // the include differently from the field and refuses the singular with a
  // 422. See `fetchTickets`.
  const swept = await sweep(config, {
    ...scope,
    status: statuses.join(","),
    sortBy: "-modifiedTime",
    include: "contacts",
  });

  const parties = swept.tickets.map((ticket): TicketParty => {
    const contact = ticket.contact as { email?: unknown } | null | undefined;
    return {
      accountId: text(ticket.accountId),
      // The ticket's own address first: a ticket raised by email carries the
      // address it came from whether or not Zoho has a contact for it, and
      // the contact is the one that is missing on exactly those tickets.
      email: text(ticket.email) ?? text(contact?.email),
    };
  });
  return { parties, capped: swept.capped, statuses };
}
