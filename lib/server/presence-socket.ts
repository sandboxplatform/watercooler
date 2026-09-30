/**
 * Room socket — carries who is where, what the world is doing, and the
 * handshakes people make with each other.
 *
 * Traffic here is deliberately mixed: presence is constant and lossy, while
 * a badge, a meeting or a wiped board is rare and must not be dropped. They
 * share a connection because they concern the same world.
 *
 * Rooms are separate worlds. Presence is keyed by room and never crosses
 * between them; what does cross — badges, baskets, voice, the one whiteboard
 * — says so where it is sent.
 *
 * This file is the wiring. The pieces are under `./socket/`:
 *
 * | Where                  | What                                                              |
 * | ---------------------- | ----------------------------------------------------------------- |
 * | `socket/state`         | Rooms, who is in which, and what the door let each connection in as |
 * | `socket/outbox`        | Every way out: serialised once, and minding a slow reader's queue  |
 * | `socket/lifecycle`     | Arriving, claiming a person, moving, sweeping, going; dispatch     |
 * | `socket/badges`        | Whose shelf, the chatty rules settled once, telling the world      |
 * | `socket/online`        | The server's list, published at most once a tick                  |
 * | `socket/features/*`    | The ball, the eggs, the road, the blob, meetings, board, relays, mic |
 */

import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocketServer } from "ws";
import { identityOf, isAuthorized } from "./access";
import { HEARTBEAT_MS, TICK_MS } from "../presence-types";
import { onCaught, onMingle } from "./badge-rules";
import { createLogger } from "../logger";
import { ResidentSimulation } from "./residents";
import { setRoomBroadcast, setWorldBroadcast } from "./room-broadcast";
import { SocketState } from "./socket/state";
import { Outbox } from "./socket/outbox";
import { BadgeDesk } from "./socket/badges";
import { ONLINE_REFRESH_MS, OnlineList } from "./socket/online";
import { Lifecycle } from "./socket/lifecycle";
import type { Feature, SocketContext } from "./socket/feature";
import { basketballFeature } from "./socket/features/basketball";
import { eggsFeature } from "./socket/features/eggs";
import { trafficFeature } from "./socket/features/traffic";
import { blobFeature } from "./socket/features/blob";
import { meetingsFeature } from "./socket/features/meetings";
import { whiteboardFeature } from "./socket/features/whiteboard";
import { micFeature } from "./socket/features/mic";
import { relaysFeature } from "./socket/features/relays";
import { presenceFeature } from "./socket/features/presence";

const log = createLogger("Presence");

/**
 * The most a single frame may weigh. The largest real ones are a session
 * description (a few kilobytes, `SDP_LIMIT` at the outside) and a whiteboard
 * stroke of two thousand points; `ws` would otherwise accept a hundred
 * megabytes and parse it.
 */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/** The path part of a request's URL — a query on the socket's address is still its address. */
const pathOf = (url: string | undefined) => (url ?? "").split("?")[0];

/**
 * Same-origin check. Not authentication: it only constrains browsers, and
 * any other client can send whatever `Origin` it likes — which is why the
 * cookie is asked for as well.
 */
function checkOrigin(req: IncomingMessage, socket: Duplex): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return true;
  try {
    if (new URL(origin).host === host) return true;
    log.warn(`rejected upgrade: origin ${origin} does not match host ${host}`);
  } catch {
    // An origin that is not a URL is no origin of ours.
  }
  socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
  socket.destroy();
  return false;
}

export function attachPresenceSocket(server: Server, path = "/api/room/socket"): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  const state = new SocketState();
  const out = new Outbox(state);
  const badges = new BadgeDesk(state, out);
  const online = new OnlineList(state, out, badges);
  const ctx: SocketContext = { state, out, badges, online };

  const mic = micFeature(ctx);
  const eggs = eggsFeature(ctx);
  const features: Feature[] = [
    presenceFeature(ctx),
    mic,
    relaysFeature(ctx, mic),
    whiteboardFeature(ctx),
    meetingsFeature(ctx),
    basketballFeature(ctx),
    eggs,
    trafficFeature(ctx),
    blobFeature(ctx),
  ];
  const lifecycle = new Lifecycle(ctx, features);

  // How anything else in the process reaches a room's sockets: through
  // ./room-broadcast, so a Next route handler's second copy of this module
  // and the resident simulation need not import it.
  setRoomBroadcast((slug, message) => out.broadcast(slug, message));
  setWorldBroadcast((message) => out.broadcastAll(message));

  const heartbeat = setInterval(() => lifecycle.heartbeat(), HEARTBEAT_MS);
  heartbeat.unref?.();

  // One timer for every room and every feature rather than one per player,
  // and the online list last, so a tick's changes go out as one list.
  const ticker = setInterval(() => {
    const now = Date.now();
    lifecycle.tickRooms(now);
    for (const feature of features) {
      try {
        feature.tick?.(now);
      } catch (err) {
        log.error(`the ${feature.name} tick failed:`, (err as Error).message);
      }
    }
    online.flush();
  }, TICK_MS);
  ticker.unref?.();

  // The whole server's list, now and then regardless, so nobody's copy drifts.
  const onlineTicker = setInterval(() => online.changed(), ONLINE_REFRESH_MS);
  onlineTicker.unref?.();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Anything else is somebody else's — in development, Next's own
    // hot-reload socket upgrades on this same server — so it is left alone
    // rather than refused.
    if (pathOf(req.url) !== path) return;
    if (!checkOrigin(req, socket)) return;
    // Origin only binds browsers; this socket carries everyone's position
    // and voice signalling, so it needs the door's cookie too.
    if (!isAuthorized(req)) {
      log.warn("rejected upgrade: no valid access cookie");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // Taken from the cookie at the upgrade, not from anything the connection
    // says later: a look and a floor are both clamped to what it may have.
    const identity = identityOf(req.headers.cookie);
    wss.handleUpgrade(req, socket, head, (ws) => lifecycle.accept(ws, identity));
  });

  wss.on("error", (err) => log.error("WebSocketServer error:", err.message));

  // The residents walk about the same rooms, and leave when the server does.
  // RESIDENT_DWELL_SCALE=0.02 makes a day of theirs pass in a minute, for watching.
  const dwellScale = Number(process.env.RESIDENT_DWELL_SCALE) || 1;
  const stopResidents = new ResidentSimulation(
    {
      roomFor: (slug) => state.roomFor(slug),
      /**
       * Somebody ran one of them down. Only Michael bolts, so only Michael
       * can be caught — but the simulation reports whoever it was, since what
       * makes it a catch is the fright rather than the bird.
       */
      caught: (_residentId, connectionId) => {
        const holder = badges.holderOf(connectionId);
        if (holder) badges.announce(state.roomOf.get(connectionId) ?? "", onCaught(holder));
      },
      /**
       * Somebody came to stand beside one of the locals. Reported on the edge
       * by the simulation, so this runs when they arrive rather than for as
       * long as they linger.
       */
      met: (residentId, connectionIds) => {
        for (const id of connectionIds) {
          const holder = badges.holderOf(id);
          if (holder) badges.announce(state.roomOf.get(id) ?? "", onMingle(holder, residentId));
        }
      },
      laid: (residentId, room, at, startledBy) => eggs.laid(residentId, room, at, startledBy),
    },
    { dwellScale },
  ).start();

  server.on("close", () => {
    clearInterval(ticker);
    clearInterval(onlineTicker);
    clearInterval(heartbeat);
    stopResidents();
  });

  log.info(`room socket attached on ${path}`);
}
