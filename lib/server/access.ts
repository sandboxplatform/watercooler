/**
 * The door: one shared code opens the whole world. Server only.
 *
 * The code lives in ACCESS_CODE and is exchanged once, at /unlock, for a
 * signed cookie. The code itself never travels in a URL — browser history,
 * proxies and access logs all keep copies of those, and a link is forwarded
 * far more casually than a password.
 *
 * The cookie is an HMAC over its own expiry, keyed by the code itself, so
 * there is no session store to keep and **rotating ACCESS_CODE invalidates
 * every cookie already handed out**. That is the whole revocation story.
 *
 * Know what this is not: everyone shares one code, so there is no per-person
 * revocation and no audit trail of who came in. Auth.js (lib/auth/config.ts)
 * is the finer-grained answer and layers on top of this — the gate checks the
 * cookie, and a signed-in Auth.js session can later stand in for it.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "http";

export const ACCESS_COOKIE = "wc_access";

/** Bump if the token shape changes, to invalidate old cookies. */
const TOKEN_VERSION = "v2";

/**
 * Who a code lets in.
 *
 * `visitor` is the shared code: anyone who has been given it. The others are
 * one person each, holding a code they never pass on, so the code *is* the
 * identity — presenting it is enough to be brought in as them.
 */
export type AccessIdentity = "visitor" | "coop" | "rob";

/** Someone whose own code brings them straight in, already dressed. */
export interface Persona {
  identity: AccessIdentity;
  name: string;
  /** Tenant slug of the office they work out of. */
  home: string;
  /** A WORKER_SPRITES key; their look, which no visitor may wear. */
  characterKey: string;
}

const PERSONAS: readonly Persona[] = [
  { identity: "coop", name: "Coop", home: "sandbox-erp", characterKey: "character_coop" },
  { identity: "rob", name: "Rob", home: "sandbox-erp", characterKey: "character_rob" },
];

export function personaFor(identity: AccessIdentity): Persona | null {
  return PERSONAS.find((p) => p.identity === identity) ?? null;
}

/** The environment variable holding a given identity's code. */
function envNameFor(identity: AccessIdentity): string {
  return identity === "visitor" ? "ACCESS_CODE" : `ACCESS_CODE_${identity.toUpperCase()}`;
}

function codeFor(identity: AccessIdentity): string | null {
  const code = process.env[envNameFor(identity)]?.trim();
  return code ? code : null;
}

const IDENTITIES: readonly AccessIdentity[] = ["coop", "rob", "visitor"];

/** How long a cookie lasts before the code must be entered again. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Enough to stop guessing without locking a whole office out over typos.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** The shared visitors' code, or null when there isn't one. */
export function accessCode(): string | null {
  return codeFor("visitor");
}

/** Any code at all locks the door — a personal code alone still gates it. */
export function gateEnabled(): boolean {
  return IDENTITIES.some((id) => codeFor(id) !== null);
}

/**
 * Which identity a submitted code belongs to, or null for none.
 *
 * Every configured code is compared, without an early return, so the work
 * done does not reveal which one matched. Personal codes are considered
 * first: were one ever set to the same string as the shared code, its owner
 * should still arrive as themselves rather than as a visitor.
 */
export function identityForCode(submitted: string): AccessIdentity | null {
  if (!submitted) return null;
  let found: AccessIdentity | null = null;
  for (const identity of IDENTITIES) {
    const code = codeFor(identity);
    if (code && equals(submitted, code) && !found) found = identity;
  }
  return found;
}

/**
 * Configuration worth shouting about at boot: a personal code that is also
 * the shared one would hand that person's name and desk to every visitor.
 */
export function misconfiguredCodes(): string[] {
  const shared = accessCode();
  const problems: string[] = [];
  for (const { identity } of PERSONAS) {
    const code = codeFor(identity);
    if (!code) continue;
    if (shared && code === shared) {
      problems.push(`${envNameFor(identity)} is the same as ACCESS_CODE`);
    }
    for (const other of PERSONAS) {
      if (other.identity <= identity) continue;
      if (code === codeFor(other.identity)) {
        problems.push(`${envNameFor(identity)} is the same as ${envNameFor(other.identity)}`);
      }
    }
  }
  return problems;
}

/**
 * Paths that must answer before anyone holds a cookie.
 *
 * `/api/health` stays open for the host's liveness probe (it reports only
 * that the process is up). `/api/auth/` stays open so Auth.js sign-in can
 * work once it is configured. `/_next/` is the build's own assets, without
 * which the unlock page cannot render itself.
 *
 * Deliberately absent: `/api/mettara/tools` and `/api/internal/dispatch`.
 * Those are machine-to-machine and carry their own, stronger authentication
 * (an HMAC signature and a localhost-plus-secret check); server.ts answers
 * them before the gate is consulted.
 */
export function isOpenPath(pathname: string): boolean {
  if (pathname === "/unlock" || pathname === "/api/unlock") return true;
  if (pathname === "/api/health" || pathname === "/favicon.ico") return true;
  return pathname.startsWith("/api/auth/") || pathname.startsWith("/_next/");
}

// ── The cookie ─────────────────────────────────────────

function sign(payload: string, code: string): string {
  return createHmac("sha256", code).update(payload).digest("base64url");
}

/**
 * A cookie value good for TTL_MS, carrying who came in.
 *
 * The identity travels in the clear but is inside the signature, so it cannot
 * be edited into someone else's: the signature is keyed by *that identity's*
 * code, which means rotating one person's code logs out only them.
 */
export function mintToken(identity: AccessIdentity): string | null {
  const code = codeFor(identity);
  if (!code) return null;
  const expiresAt = Date.now() + TTL_MS;
  return `${expiresAt}.${identity}.${sign(`${TOKEN_VERSION}.${expiresAt}.${identity}`, code)}`;
}

/** The identity a cookie proves, or null if it proves nothing. */
export function verifyToken(token: string | undefined): AccessIdentity | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawExpiry, rawIdentity, signature] = parts;

  const identity = IDENTITIES.find((id) => id === rawIdentity);
  if (!identity) return null;
  const code = codeFor(identity);
  if (!code) return null;

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;

  const expected = sign(`${TOKEN_VERSION}.${expiresAt}.${identity}`, code);
  return equals(signature, expected) ? identity : null;
}

/**
 * Compare without leaking length or content through timing. Both sides are
 * hashed first so timingSafeEqual always sees two equal-length buffers —
 * it throws otherwise, and the throw itself would be a signal.
 */
function equals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/** Whether a submitted code opens the door at all, whoever it belongs to. */
export function codeMatches(submitted: string): boolean {
  return identityForCode(submitted) !== null;
}

// ── The code in a link ─────────────────────────────────

/** Query parameter carrying the code, for a bookmarkable link. */
export const CODE_PARAM = "code";

/**
 * A link is a convenience with a cost: unlike a typed password, the code
 * lands in browser history, in the server's request log, and in whatever
 * chat window the link gets pasted into. It is accepted, but the very next
 * thing that happens is a redirect to the same place without it, so it lives
 * in the address bar for exactly one request. Cross-origin Referer leakage is
 * already blocked by the Referrer-Policy set in next.config.ts.
 */
export function codeFromUrl(rawUrl: string): string | null {
  return params(rawUrl).searchParams.get(CODE_PARAM);
}

/** The same target, minus the code. Path and query only — never a host. */
export function urlWithoutCode(rawUrl: string): string {
  const url = params(rawUrl);
  url.searchParams.delete(CODE_PARAM);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

/**
 * A request target is usually a path, but a proxy may send an absolute URL.
 * The base makes both parse; only pathname and search are ever read from the
 * result, so a host smuggled in here goes nowhere.
 */
function params(rawUrl: string): URL {
  try {
    return new URL(rawUrl || "/", "http://placeholder.invalid");
  } catch {
    return new URL("/", "http://placeholder.invalid");
  }
}

// ── Reading the request ────────────────────────────────

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  return cookieFrom(req.headers.cookie, name);
}

/**
 * The caller's address. Behind Railway's proxy the socket address is the
 * proxy's, so the first hop of x-forwarded-for is the real one. Only trusted
 * for rate limiting, where a spoofed value costs the spoofer their own quota.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || req.socket.remoteAddress || "unknown";
}

/** Whether this request may pass. Open when no gate is configured. */
export function isAuthorized(req: IncomingMessage): boolean {
  if (!gateEnabled()) return true;
  return verifyToken(readCookie(req, ACCESS_COOKIE)) !== null;
}

/**
 * Who this request is, by its cookie. With no gate configured everyone is a
 * visitor: nobody has proved they are anyone in particular.
 */
export function identityOf(cookieHeader: string | undefined): AccessIdentity {
  if (!gateEnabled()) return "visitor";
  return verifyToken(cookieFrom(cookieHeader, ACCESS_COOKIE)) ?? "visitor";
}

/** Read one cookie out of a raw Cookie header, for callers without a request. */
export function cookieFrom(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

// ── Set-Cookie ─────────────────────────────────────────

/**
 * `secure` is on in production: a cookie without it can be stripped onto a
 * plain-HTTP request and read in the clear. HttpOnly keeps it away from any
 * script on the page, and Lax means a forwarded link still works while
 * cross-site form posts do not carry it.
 */
export function accessCookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${ACCESS_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// ── Guessing ───────────────────────────────────────────

const attempts = new Map<string, { count: number; firstAt: number }>();

/** True when this address has spent its attempts for now. */
export function rateLimited(ip: string): boolean {
  const record = attempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  record.count += 1;
}

export function clearFailures(ip: string): void {
  attempts.delete(ip);
}

/** Seconds until this address may try again. */
export function retryAfterSeconds(ip: string): number {
  const record = attempts.get(ip);
  if (!record) return 0;
  const left = ATTEMPT_WINDOW_MS - (Date.now() - record.firstAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
