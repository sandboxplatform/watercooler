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
const TOKEN_VERSION = "v1";

/** How long a cookie lasts before the code must be entered again. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Enough to stop guessing without locking a whole office out over typos.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** The configured code, or null when no gate is configured. */
export function accessCode(): string | null {
  const code = process.env.ACCESS_CODE?.trim();
  return code ? code : null;
}

export function gateEnabled(): boolean {
  return accessCode() !== null;
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

/** A cookie value good for TTL_MS, or null when there is no gate to mint for. */
export function mintToken(): string | null {
  const code = accessCode();
  if (!code) return null;
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${expiresAt}.${sign(payload, code)}`;
}

export function verifyToken(token: string | undefined): boolean {
  const code = accessCode();
  if (!code || !token) return false;

  const split = token.indexOf(".");
  if (split < 1) return false;
  const expiresAt = Number(token.slice(0, split));
  const signature = token.slice(split + 1);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return false;

  return equals(signature, sign(`${TOKEN_VERSION}.${expiresAt}`, code));
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

/** Whether a submitted code is the configured one. */
export function codeMatches(submitted: string): boolean {
  const code = accessCode();
  if (!code || !submitted) return false;
  return equals(submitted, code);
}

// ── Reading the request ────────────────────────────────

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
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
  return verifyToken(readCookie(req, ACCESS_COOKIE));
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
