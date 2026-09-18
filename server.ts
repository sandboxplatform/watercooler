/**
 * Custom Next.js dev server.
 *
 * Attaches the presence socket, so everyone in a room sees everyone else.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { createLogger } from "./lib/logger";
import { describeBuild } from "./lib/server/build-info";
import { attachPresenceSocket } from "./lib/server/presence-socket";
import { ERP_DB_PATH, isEmpty, openErpDb, seedErpDatabase } from "./lib/erp/db";
import {
  accessCookieHeader,
  clearedAccessCookieHeader,
  clearFailures,
  clientIp,
  codeFromUrl,
  gateEnabled,
  identityForCode,
  identityOf,
  misconfiguredCodes,
  isAuthorized,
  isOpenPath,
  mintToken,
  personaFor,
  rateLimited,
  recordFailure,
  retryAfterSeconds,
  urlWithoutCode,
} from "./lib/server/access";
import { parseRoomPath, floorRoomSlug } from "./lib/rooms";
import { landsOutside, mayEnterRoom, OUTSIDE_PATH } from "./lib/world/floors";

const log = createLogger("Server");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
// Next loads .env files during app.prepare(), long after the settings below
// are read. Without this, AGENT_PROVIDER in .env.local was silently ignored
// while every lazily-read key in the same file worked — so the app would boot
// on the wrong provider and say so in the HUD with no hint why.
loadEnvConfig(process.cwd(), dev);

/**
 * Production with no code configured: serve nothing, but say so.
 *
 * A deployment is reachable by anyone who finds the URL, so it must not come
 * up open. It used to exit instead, which was equally closed and far worse to
 * diagnose: the host had nothing to route to, so a visitor — and the person
 * who deployed it — got a bare 502 with the reason buried in deploy logs. So
 * the server now starts, answers the health check, and refuses every other
 * request with the one sentence that explains it.
 */
const unconfigured = !dev && !gateEnabled();
if (unconfigured) {
  log.error(
    "ACCESS_CODE is not set. Serving nothing until it is — set ACCESS_CODE to a long " +
      "random value (a GUID is fine) and redeploy.",
  );
}
if (dev && !gateEnabled()) {
  log.warn("ACCESS_CODE is not set: the world is open to anyone who can reach this port.");
}

/** The path a request names, without its query. Asked for all over this file. */
function pathOf(req: IncomingMessage): string {
  return (req.url ?? "/").split("?")[0];
}

const UNCONFIGURED_MESSAGE =
  "This world has no access code, so nothing is being served.\n\n" +
  "Set ACCESS_CODE in the server's environment to a long random value and redeploy.\n";

/**
 * Answer while unconfigured. The health check says the process is alive, so
 * the host routes to it and whoever opens the page reads why — a failing
 * probe would only reproduce the 502 this exists to avoid.
 */
function answerUnconfigured(req: IncomingMessage, res: ServerResponse) {
  if (pathOf(req) === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, serving: false, reason: "ACCESS_CODE is not set" }));
    return;
  }
  res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(UNCONFIGURED_MESSAGE);
}
// A personal code that is also the shared one would hand that person's name,
// look and desk to every visitor who was given the shared code.
for (const problem of misconfiguredCodes()) {
  log.error(`Access codes: ${problem}. Give each person their own.`);
}

// Next builds each request's absolute URL from what it is told here, not
// from the socket: without the port, sign-in callbacks would point at 3000
// whatever port the server is actually on.
const app = next({ dev, port, hostname: process.env.HOSTNAME ?? "localhost" });
const handle = app.getRequestHandler();

/**
 * Read a request body, refusing one too big to be honest.
 *
 * An unbounded read is a free denial of service — a body is buffered in this
 * process's heap, and nothing but the sender decides how much of it there is.
 * Dispatch had no ceiling at all while the two handlers either side of it did,
 * which is the shape of thing that happens when the same reader is written
 * out per endpoint. Resolves null when the request was refused or broke, and
 * has already answered in that case.
 */
function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let body = "";
    let done = false;
    const stop = (answer: string | null) => {
      if (done) return;
      done = true;
      resolve(answer);
    };
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      body += chunk.toString();
      if (body.length <= limit) return;
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Body too large" }));
      req.destroy();
      stop(null);
    });
    req.on("end", () => stop(body));
    // A socket that broke mid-body: nothing to answer, and nobody to answer to.
    req.on("error", () => stop(null));
  });
}

/**
 * Last resort for a handler that threw.
 *
 * These are launched and not awaited, so without this a throw reaches the
 * process as an unhandled rejection — which takes the whole world down to
 * report one bad request. Once a response has started there is nothing left
 * to say, so it is only closed.
 */
function failRequest(res: ServerResponse, what: string, err: unknown) {
  log.error(`${what} failed:`, (err as Error)?.message ?? err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Something went wrong." }));
}

/** Nothing a person types at the door is large. */
const UNLOCK_BODY_LIMIT = 4 * 1024;

/**
 * Exchange the shared code for a cookie.
 *
 * Handled here rather than as a Next route so that the attempt counters live
 * in one module instance: a route handler is bundled into Next's own module
 * graph, which would give it a second, separate copy of them.
 */
async function handleUnlock(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    const retry = retryAfterSeconds(ip);
    log.warn(`unlock: too many attempts from ${ip}`);
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(retry) });
    res.end(
      JSON.stringify({ error: `Too many attempts. Try again in ${Math.ceil(retry / 60)} min.` }),
    );
    return;
  }

  const body = await readBody(req, res, UNLOCK_BODY_LIMIT);
  if (body === null) return;

  let submitted = "";
  try {
    submitted = String((JSON.parse(body) as { code?: unknown }).code ?? "");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const identity = identityForCode(submitted);
  if (!identity) {
    recordFailure(ip);
    log.warn(`unlock: rejected code from ${ip}`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "That code was not accepted." }));
    return;
  }

  const token = mintToken(identity);
  if (!token) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No access code is configured." }));
    return;
  }

  clearFailures(ip);
  log.info(`unlock: let ${ip} in as ${identity}`);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": accessCookieHeader(token, !dev),
  });
  res.end(JSON.stringify({ ok: true }));
}

/**
 * Give the cookie back.
 *
 * The only way out there was: the cookie is `HttpOnly`, so nothing on the
 * page can reach it, and there is no session store to drop it from — a
 * cookie handed over stays a way in for its whole week unless the code
 * behind it is rotated, which turns out everybody holding that code rather
 * than the one browser that asked to leave.
 *
 * A GET as well as a POST, and that is a decision. `SameSite=Lax` carries
 * the cookie on a cross-site navigation, so a link on another page can sign
 * somebody out — and the answer to that is to sign back in, which is one
 * link away. Against it: this is the only way out, the address bar is how
 * anybody will reach it while nothing in the HUD offers it, and a way out
 * that needs a button somebody has to build first is no way out at all.
 */
function handleLock(req: IncomingMessage, res: ServerResponse) {
  const header = clearedAccessCookieHeader(!dev);
  log.info(`lock: ${clientIp(req)} signed out`);
  if ((req.method ?? "GET").toUpperCase() === "POST") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": header,
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // A navigation goes to the door, which is the one page that will answer
  // now — landing on a 401 would read as something having gone wrong.
  res.writeHead(302, {
    Location: "/unlock",
    "Set-Cookie": header,
    "Cache-Control": "no-store",
  });
  res.end();
}

/**
 * Trade a `?code=` in the link for the cookie, then send the browser to the
 * same place without it. Returns true when the request has been answered.
 *
 * Done for every path, and whether or not the caller already holds a cookie:
 * the point is that the code does not stay in the address bar, so it has to
 * be stripped even when it was not needed.
 */
function handleCodeInLink(req: IncomingMessage, res: ServerResponse): boolean {
  const supplied = codeFromUrl(req.url ?? "/");
  if (supplied === null) return false;

  const ip = clientIp(req);
  const clean = urlWithoutCode(req.url ?? "/");

  // Guessed at just as easily through a link as through the form.
  if (rateLimited(ip)) {
    const retry = retryAfterSeconds(ip);
    log.warn(`link: too many attempts from ${ip}`);
    res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": String(retry) });
    res.end(`Too many attempts. Try again in ${Math.ceil(retry / 60)} min.`);
    return true;
  }

  const identity = identityForCode(supplied);
  if (!identity) {
    recordFailure(ip);
    log.warn(`link: rejected code from ${ip}`);
    // Strip it anyway — a wrong code is no more welcome in the log or the
    // address bar than a right one — and let the door ask properly.
    const next = encodeURIComponent(clean);
    res.writeHead(302, { Location: `/unlock?next=${next}`, "Cache-Control": "no-store" });
    res.end();
    return true;
  }

  const token = mintToken(identity);
  if (!token) return false;

  clearFailures(ip);
  log.info(`link: let ${ip} in as ${identity}`);
  res.writeHead(302, {
    Location: clean,
    "Set-Cookie": accessCookieHeader(token, !dev),
    // Never let a proxy or the browser keep this redirect: the URL that
    // produced it carries the code.
    "Cache-Control": "no-store, private",
  });
  res.end();
  return true;
}

/**
 * Turn away anything without a valid cookie. Returns true when the request
 * has been answered and must go no further.
 *
 * A navigation gets the unlock page and is sent on afterwards; anything else
 * — fetches, uploads, the API — gets a flat 401, because redirecting an XHR
 * to an HTML page only produces a confusing parse error at the other end.
 */
function blockedByGate(req: IncomingMessage, res: ServerResponse): boolean {
  if (!gateEnabled()) return false;
  // Before the open-path check, so a bookmark to /unlock?code=… works too.
  if (handleCodeInLink(req, res)) return true;

  const pathname = pathOf(req);
  if (isOpenPath(pathname) || isAuthorized(req)) return false;

  const wantsHtml = (req.headers.accept ?? "").includes("text/html");
  if (wantsHtml) {
    const next = encodeURIComponent(req.url ?? "/");
    res.writeHead(302, { Location: `/unlock?next=${next}`, "Cache-Control": "no-store" });
    res.end();
    return true;
  }

  res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "Locked. Enter the access code at /unlock." }));
  return true;
}

/**
 * Send somebody back down from a floor that is not theirs.
 *
 * A valid cookie opens the world, not every room in it: a building's upper
 * floors can belong to the people whose own codes name them. The lift refuses
 * to carry anyone else and the presence socket refuses their room, but a URL
 * is typed, bookmarked and shared, so the page itself has to turn them away
 * — otherwise "only they can go up" holds everywhere except the address bar.
 *
 * They land in the lobby, which is public, rather than on an error: they are
 * welcome in the building, just not upstairs.
 */
function blockedByFloor(req: IncomingMessage, res: ServerResponse): boolean {
  if (!gateEnabled()) return false;
  const pathname = pathOf(req);
  const path = parseRoomPath(pathname);
  if (!path || path.floor === null) return false;

  const identity = identityOf(req.headers.cookie);
  if (mayEnterRoom(floorRoomSlug(path.slug, path.floor), identity)) return false;

  log.info(`turned a ${identity} away from ${pathname}`);
  // A navigation is sent down to the lobby; a prefetch or a fetch is refused
  // flatly, for the same reason the cookie gate does not redirect one.
  if ((req.headers.accept ?? "").includes("text/html")) {
    res.writeHead(302, { Location: `/r/${path.slug}`, "Cache-Control": "no-store" });
    res.end();
    return true;
  }
  res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "That floor is not yours." }));
  return true;
}

/**
 * A visitor arriving at the front door is sent outside, to the world map.
 *
 * The root is the default room, which is an *office* — somebody's building.
 * A visitor has no building: no desk, no floors above the lobby, nothing
 * upstairs that is theirs. Landing them inside one is landing them in the
 * only place on the map that is not really for them, and with the door
 * behind them rather than in front.
 *
 * The world map is where the buildings are, so it is where somebody who has
 * not picked one starts. `WORLD_SPAWN` already puts them on the plaza.
 *
 * Only the root, and only somebody with no building of their own — a
 * visitor, or a person whose code names them before they work anywhere. A
 * typed `/r/<slug>` still opens that lobby, because a lobby is public and a
 * shared link has to work; and somebody whose own code names their building
 * is left alone, since for them the default room is not a stranger's office.
 */
function sentOutside(req: IncomingMessage, res: ServerResponse): boolean {
  if (!gateEnabled()) return false;
  // A prefetch or a fetch is left alone, as everywhere else here: only a
  // navigation should have its destination changed under it.
  if (!(req.headers.accept ?? "").includes("text/html")) return false;
  const pathname = pathOf(req);
  // The persona is what knows whether they have somewhere; a visitor has no
  // persona at all, which is the same answer.
  const home = personaFor(identityOf(req.headers.cookie))?.home;
  if (!landsOutside(pathname, !!home)) return false;

  res.writeHead(302, { Location: OUTSIDE_PATH, "Cache-Control": "no-store" });
  res.end();
  return true;
}

/**
 * Build the company on first boot.
 *
 * A fresh deployment gets an empty volume, and agents told they have an ERP
 * would find nothing in it. Seeding here is idempotent — an existing database
 * is left exactly as it is, including anything agents have since written.
 */
function ensureErpData() {
  try {
    const db = openErpDb(ERP_DB_PATH);
    const empty = isEmpty(db);
    db.close();

    if (!empty) {
      log.info(`ERP ready at ${ERP_DB_PATH}`);
      return;
    }

    log.info("No company data found — creating Brightwater Supply Co.");
    const { db: seeded, counts } = seedErpDatabase(ERP_DB_PATH);
    seeded.close();
    log.info(`ERP seeded: ${counts.customers} customers, ${counts.invoices} invoices`);
  } catch (err) {
    // The office still works without it; agents will say the data is unreachable
    log.error("Could not prepare the ERP:", (err as Error).message);
  }
}

if (unconfigured) {
  // Nothing is prepared and nothing is attached: no Next, no presence socket,
  // no agent bridge. isAuthorized() waves everything through when no code is
  // configured, so a running server with the sockets on would have been open
  // to anyone — the surface here is one function that answers and stops.
  createServer(answerUnconfigured).listen(port, () => {
    log.error(`Serving nothing on http://localhost:${port} until ACCESS_CODE is set.`);
  });
} else {
  app
    .prepare()
    .then(() => {
      ensureErpData();
      const server = createServer((req, res) => {
        // The door is answered before Next sees anything: it authenticates
        // itself, and the two ways in and out of the world are the only
        // paths the cookie gate cannot be asked about.
        if (pathOf(req) === "/api/unlock") {
          void handleUnlock(req, res).catch((err) => failRequest(res, "unlock", err));
          return;
        }
        if (pathOf(req) === "/api/lock") {
          handleLock(req, res);
          return;
        }
        // Everything below this line needs the cookie: pages, API routes, uploads.
        if (blockedByGate(req, res)) return;
        // Past the door, but a private floor is still not everyone's.
        if (blockedByFloor(req, res)) return;
        // And a visitor with no building of their own starts outside.
        if (sentOutside(req, res)) return;
        handle(req, res);
      });

      // The one socket the world needs: who is in a room, where they are
      // standing, and what they said.
      attachPresenceSocket(server);

      log.info(`Ready on http://localhost:${port}`);
      // Printed at start-up as well as served from /api/health, so a deploy's
      // own output says which commit it brought up — which is the first thing
      // you want when a fix is on main and the box is behaving as though it
      // is not.
      log.info(describeBuild());

      server.listen(port);
    })
    .catch((err) => {
      log.error("Failed to prepare Next.js:", err);
      process.exit(1);
    });
}
