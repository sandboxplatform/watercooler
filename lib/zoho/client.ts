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
  };
}

export class ZohoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function describe(status: number): string {
  if (status === 401) return "Zoho refused the token. Check the client and refresh token.";
  if (status === 403) return "That Zoho token is not allowed to read tickets. Check its scope.";
  if (status === 404) return "Zoho has no such desk or department.";
  if (status === 429) return "Zoho is rate limiting us. The queue will refresh shortly.";
  return `Zoho answered ${status}.`;
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
    log.warn(`Zoho Desk answered ${response.status} for ${path}`);
    throw new ZohoError(response.status, describe(response.status));
  }
  return (await response.json()) as { data?: unknown };
}

/** The desk's tickets, newest first, grouped into columns by status. */
export async function fetchTickets(config: ZohoConfig): Promise<DeskView> {
  const params: Record<string, string> = {
    limit: String(TICKET_LIMIT),
    sortBy: "-modifiedTime",
    include: "assignee,contact",
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
