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
  atOrAfter,
  commonZone,
  dayStartIn,
  toPulse,
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
 * The five counts, from three sweeps.
 *
 * Three rather than one because they are three different questions. The
 * standing counters want every ticket in three statuses, however old; the
 * day counters want a prefix of the desk sorted by when tickets were
 * raised and by when they were closed, which are different orders and
 * neither of them the first.
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
  const scope: Record<string, string> = config.departmentId
    ? { departmentId: config.departmentId }
    : {};

  const standing = await sweep(config, {
    ...scope,
    status: statuses.join(","),
    sortBy: "-modifiedTime",
  });
  const opened = await sweep(
    config,
    { ...scope, sortBy: "-createdTime" },
    (ticket) => !atOrAfter(ticket.createdTime as string | undefined, from),
  );
  const closed = await sweep(
    config,
    { ...scope, status: CLOSED_STATUS, sortBy: "-closedTime" },
    (ticket) => !atOrAfter(ticket.closedTime as string | undefined, from),
  );

  // A capped standing sweep leaves all three of its counters a floor: the
  // pages it did not read could have held any of the three statuses.
  const capped: PulseId[] = [
    ...(standing.capped ? (["new", "queue", "in-progress"] as PulseId[]) : []),
    ...(opened.capped ? (["opened-today"] as PulseId[]) : []),
    ...(closed.capped ? (["closed-today"] as PulseId[]) : []),
  ];

  return toPulse({
    statuses,
    standing: standing.tickets,
    opened: opened.tickets,
    closed: closed.tickets,
    capped,
    since: from,
    timeZone,
    zone,
  });
}
