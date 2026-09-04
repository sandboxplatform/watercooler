/**
 * Custom Next.js dev server.
 *
 * Attaches the presence socket and the agent CLI bridge (ws://localhost:3000/api/gateway)
 * so the browser never needs to spawn or reach an agent process directly.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { createLogger } from "./lib/logger";
import {
  attachCliBridge,
  dispatchToWorker,
  getWorkerRoster,
  validateDispatchSecret,
} from "./lib/cli-bridge";
import { getCliProvider, isCliProviderId } from "./lib/cli-providers";
import { getRoomStore } from "./lib/server/room-store";
import { readBoard, readDesk } from "./lib/server/boards";
import {
  offeredProviders,
  providerBlocked,
  registerProviderSwitch,
  rememberProvider,
  rememberedProvider,
} from "./lib/server/provider-choice";
import { getBridgeProvider, setBridgeProvider } from "./lib/cli-bridge";
import { attachPresenceSocket } from "./lib/server/presence-socket";
import { ERP_DB_PATH, isEmpty, openErpDb, seedErpDatabase } from "./lib/erp/db";
import { DEFAULT_ROOM_SLUG } from "./lib/rooms";
import { readMettaraConfig } from "./lib/mettara/config";
import { buildOfficeTools } from "./lib/mettara/office-tools";
import { createToolsHandler, TOOLS_PATH } from "./lib/mettara/webhook";
import {
  accessCookieHeader,
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
  rateLimited,
  recordFailure,
  retryAfterSeconds,
  urlWithoutCode,
} from "./lib/server/access";
import { parseRoomPath, floorRoomSlug } from "./lib/rooms";
import { mayEnterRoom } from "./lib/world/floors";

const log = createLogger("Server");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
// Next loads .env files during app.prepare(), long after the settings below
// are read. Without this, AGENT_PROVIDER in .env.local was silently ignored
// while every lazily-read key in the same file worked — so the app would boot
// on the wrong provider and say so in the HUD with no hint why.
loadEnvConfig(process.cwd(), dev);

const AGENT_PROVIDER = process.env.AGENT_PROVIDER ?? "claude";
const CLI_PROVIDER = isCliProviderId(AGENT_PROVIDER)
  ? getCliProvider(AGENT_PROVIDER)
  : getCliProvider("claude");
// The agents boot on the Claude implementation — the CLI, or the API-keyed
// CLI where AGENT_PROVIDER says so — and Mettara is a switch away in the
// HUD. AGENT_PROVIDER=mettara only says Mettara is wanted; the HUD's choice,
// remembered in the room database, is what actually picks it.
const DEFAULT_PROVIDER = CLI_PROVIDER.id !== "mettara" ? CLI_PROVIDER : getCliProvider("claude");
// Expose provider to Next.js client code (compiled on-demand in dev)
process.env.NEXT_PUBLIC_AGENT_PROVIDER = AGENT_PROVIDER;

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

const UNCONFIGURED_MESSAGE =
  "This world has no access code, so nothing is being served.\n\n" +
  "Set ACCESS_CODE in the server's environment to a long random value and redeploy.\n";

/**
 * Answer while unconfigured. The health check says the process is alive, so
 * the host routes to it and whoever opens the page reads why — a failing
 * probe would only reproduce the 502 this exists to avoid.
 */
function answerUnconfigured(req: IncomingMessage, res: ServerResponse) {
  if ((req.url ?? "").split("?")[0] === "/api/health") {
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

// ── Internal dispatch endpoint for MCP tool → auggie bridge ──

function handleDispatch(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Only accept requests from localhost
  const remoteIp = req.socket.remoteAddress;
  if (remoteIp !== "127.0.0.1" && remoteIp !== "::1" && remoteIp !== "::ffff:127.0.0.1") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  const secret = req.headers["x-dispatch-secret"] as string | undefined;
  if (!secret || !validateDispatchSecret(secret)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid dispatch secret" }));
    return;
  }

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { seatId, task, room } = JSON.parse(body);
      if (!seatId || !task) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "seatId and task are required" }));
        return;
      }

      dispatchToWorker(seatId, task, typeof room === "string" ? room : undefined)
        .then((result) => {
          res.writeHead(result.error ? 500 : 200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err: Error) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  });
}

// ── The access gate ──

/**
 * Exchange the shared code for a cookie.
 *
 * Handled here rather than as a Next route so that the attempt counters live
 * in one module instance: a route handler is bundled into Next's own module
 * graph, which would give it a second, separate copy of them.
 */
function handleUnlock(req: IncomingMessage, res: ServerResponse) {
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

  let body = "";
  let tooBig = false;
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
    // Nothing legitimate is large, and an unbounded body is a free denial of service.
    if (body.length > 4096) {
      tooBig = true;
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooBig) return;
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
  });
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

  const pathname = (req.url ?? "/").split("?")[0];
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
  const pathname = (req.url ?? "/").split("?")[0];
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
 * What the office is working on, for the agents' MCP tools.
 *
 * Same door as dispatch: loopback only, and a shared secret. The boards'
 * credentials live in this process and stop here — the agent's tool server
 * gets the cards and tickets, never the keys.
 *
 * Read-only. There is no counterpart that writes.
 */
function handleBoards(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const remoteIp = req.socket.remoteAddress;
  if (remoteIp !== "127.0.0.1" && remoteIp !== "::1" && remoteIp !== "::ffff:127.0.0.1") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  const secret = req.headers["x-dispatch-secret"] as string | undefined;
  if (!secret || !validateDispatchSecret(secret)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid dispatch secret" }));
    return;
  }

  const params = new URL(req.url ?? "", "http://127.0.0.1").searchParams;
  const what = params.get("what");
  const reader = what === "desk" ? readDesk() : readBoard(params.get("board"));
  reader
    .then((answer) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer));
    })
    .catch((err: Error) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// ── Inbound tool endpoint for Mettara AIs ──

/**
 * Mettara AIs reach back into the office through one signed endpoint. It is
 * only mounted when the platform credentials are present: without a secret
 * there is nothing to verify signatures against, and an unauthenticated door
 * into worker dispatch is not one worth opening.
 */
function buildMettaraTools() {
  const config = readMettaraConfig();
  if (!config) return null;
  return createToolsHandler({
    secret: config.apiSecret,
    registry: buildOfficeTools({
      listWorkers: (room) => getWorkerRoster(room),
      dispatch: (seatId, task, room) => dispatchToWorker(seatId, task, room),
      defaultRoom: DEFAULT_ROOM_SLUG,
    }),
  });
}

// ── Seat config sync for auggie worker roster ──

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
      const mettaraTools = buildMettaraTools();
      const server = createServer((req, res) => {
        // Intercept internal API routes before Next.js. These authenticate
        // themselves — a localhost-plus-secret check and an HMAC signature —
        // and are not browser traffic, so the cookie gate does not apply.
        if (req.url === "/api/internal/dispatch") {
          handleDispatch(req, res);
          return;
        }
        if (mettaraTools && (req.url ?? "").split("?")[0] === TOOLS_PATH) {
          void mettaraTools(req, res);
          return;
        }
        if ((req.url ?? "").split("?")[0] === "/api/internal/boards") {
          handleBoards(req, res);
          return;
        }
        if ((req.url ?? "").split("?")[0] === "/api/unlock") {
          handleUnlock(req, res);
          return;
        }
        // Everything below this line needs the cookie: pages, API routes, uploads.
        if (blockedByGate(req, res)) return;
        // Past the door, but a private floor is still not everyone's.
        if (blockedByFloor(req, res)) return;
        handle(req, res);
      });

      // Players and agents ride separate sockets: presence is lossy and constant,
      // agent traffic is rare and must not be dropped.
      attachPresenceSocket(server);

      attachCliBridge(server, DEFAULT_PROVIDER);
      // The HUD may have switched the agents to another AI before; come
      // back on it, and let it switch again.
      const defaultId = DEFAULT_PROVIDER.id;
      const remembered = rememberedProvider(getRoomStore(), defaultId);
      if (remembered && remembered !== defaultId) setBridgeProvider(getCliProvider(remembered));
      registerProviderSwitch({
        defaultId,
        active: () => getBridgeProvider().id,
        async switchTo(id) {
          if (!offeredProviders(defaultId).includes(id))
            return "That provider is not offered here.";
          const blocked = await providerBlocked(id);
          if (blocked) return blocked;
          if (getBridgeProvider().id !== id) setBridgeProvider(getCliProvider(id));
          rememberProvider(getRoomStore(), id);
          return null;
        },
      });
      log.info(`Ready on http://localhost:${port}`);
      log.info(
        DEFAULT_PROVIDER.kind === "service"
          ? `Provider: ${DEFAULT_PROVIDER.displayName} (hosted service)`
          : `Provider: ${DEFAULT_PROVIDER.displayName} (bridging via ${DEFAULT_PROVIDER.binName} CLI)`,
      );
      if (mettaraTools) log.info(`Mettara tool endpoint: ${TOOLS_PATH}`);

      server.listen(port);
    })
    .catch((err) => {
      log.error("Failed to prepare Next.js:", err);
      process.exit(1);
    });
}
