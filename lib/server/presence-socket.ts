/**
 * Room socket — carries who is where, what they say, and what they change.
 *
 * Traffic here is deliberately mixed: presence is constant and lossy, speech
 * and world changes are rare and must not be dropped. They share a connection
 * because they concern the same room.
 *
 * Rooms are separate worlds. Presence, speech and world changes are keyed by
 * room and never cross between them.
 */

import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { PresenceHub } from "./presence-hub";
import { getRoomStore } from "./room-store";
import { identityOf, isAuthorized, type AccessIdentity } from "./access";
import { inSharedCast } from "../characters/library";
import { normaliseRoomSlug } from "../rooms";
import { mayEnterRoom } from "../world/floors";
import { achievementFor, type EarnedAchievement } from "../achievements";
import type { ActivityEntry } from "../activity";
import { isPongPayload } from "../pong/protocol";
import { SHARED_BOARD, isStroke, sanitiseStroke } from "../whiteboard";
import { onPlayerJoined, onPlayerSpoke, onRoomFull } from "./achievement-rules";
import { createLogger } from "../logger";
import {
  EARSHOT_PX,
  HEARTBEAT_MS,
  TICK_MS,
  isClientMessage,
  isWorldChange,
  type Facing,
  type OnlineMessage,
  type SayScope,
  type ServerMessage,
  type WorldChange,
  isVoiceSignal,
  speechId,
} from "../presence-types";

import { ResidentSimulation } from "./residents";
import { currentBroadcast, setRoomBroadcast } from "./room-broadcast";

const log = createLogger("Presence");

/** How often everyone gets the whole server's list even when nothing changed. */
const ONLINE_REFRESH_MS = 10_000;

const FACINGS: Facing[] = ["up", "down", "left", "right"];

function coerceFacing(value: unknown): Facing {
  return FACINGS.includes(value as Facing) ? (value as Facing) : "down";
}

function coerceNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * The look this connection is allowed to wear.
 *
 * The picker already offers a visitor the shared cast only, but the browser
 * says what it likes over this socket — a hand-edited profile could otherwise
 * walk into the room wearing Coop's face. So the claim is checked rather than
 * trusted, and anything a visitor may not wear falls back to what they had.
 * Anyone on their own code is left alone: their roster is not restricted.
 */
function permittedLook(identity: AccessIdentity, wanted: string, fallback: string): string {
  if (identity !== "visitor") return wanted;
  if (inSharedCast(wanted)) return wanted;
  log.warn(`a visitor asked for the look "${wanted}"; kept "${fallback}"`);
  return fallback;
}

/** Same-origin check, matching the agent bridge. */
function checkOrigin(req: IncomingMessage, socket: Duplex): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return true;
  try {
    if (new URL(origin).host !== host) {
      log.warn(`rejected upgrade: origin ${origin} does not match host ${host}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return false;
    }
  } catch {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return false;
  }
  return true;
}

interface Room {
  hub: PresenceHub;
  sockets: Map<string, WebSocket>;
}

let occupancyLookup: (slug: string) => number = () => 0;

// How anything in the process reaches a room's sockets: ./room-broadcast,
// which holds the broadcaster this file fills in below. It lives in its own
// module for two reasons — a Next route handler loads this file into its own
// module graph and would get a second copy whose state the socket never
// filled in, and the resident simulation needs to speak into a room without
// importing this file, which already imports it.

/** How many humans are in a room right now. Zero when the socket is not up. */
export function humansInRoom(slug: string): number {
  return occupancyLookup(slug);
}

/**
 * Put a line in the room's log and tell everyone looking at it.
 *
 * Exported because the things worth logging happen all over: agent runs on
 * the bridge, badges and doors here, high scores in an API route. They all
 * come through this one door, so what is stored and what is on screen can
 * never drift apart.
 */
export function recordActivity(
  slug: string,
  entry: { kind: ActivityEntry["kind"]; actor: string; text: string; detail?: string },
): void {
  try {
    const saved = getRoomStore().recordActivity(slug, entry);
    currentBroadcast()?.(slug, { type: "activity", entry: saved });
  } catch (err) {
    // A log line is never worth taking the room down for
    log.warn("could not record activity:", (err as Error).message);
  }
}

export function attachPresenceSocket(server: import("http").Server, path = "/api/room/socket") {
  const wss = new WebSocketServer({ noServer: true });

  const rooms = new Map<string, Room>();
  /** Which room each connection is in, so later messages can be routed. */
  const roomOf = new Map<string, string>();
  /** Whose microphone is on, by connection: it stays on through a door. */
  const micOf = new Map<string, boolean>();
  /**
   * What the door let each connection in as, taken from its cookie.
   *
   * Kept per connection so a join can look for the same person already in
   * the room, which the connection itself cannot be asked about.
   */
  const identityByConnection = new Map<string, AccessIdentity>();
  /**
   * Connections that have been pinged and have not answered.
   *
   * The server pinged before and never read the replies, so a socket the
   * far end had abandoned counted as present until it went fifteen seconds
   * without speaking. A proxy between browser and server makes that
   * routine: the browser navigates away, the proxy holds the upstream open,
   * and the person is left standing in the room they just walked out of.
   */
  const owesPong = new Set<string>();

  setRoomBroadcast((slug, message) => broadcast(slug, message));

  const roomFor = (slug: string): Room => {
    let room = rooms.get(slug);
    if (!room) {
      room = { hub: new PresenceHub(), sockets: new Map() };
      rooms.set(slug, room);
      log.info(`opened room "${slug}"`);
    }
    return room;
  };

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      log.warn("send failed:", (err as Error).message);
    }
  };

  const broadcast = (slug: string, message: ServerMessage, exceptId?: string) => {
    const room = rooms.get(slug);
    if (!room) return;
    for (const [id, socket] of room.sockets) {
      if (id === exceptId) continue;
      send(socket, message);
    }
  };

  /** Everyone in every room; the whiteboard is one board. */
  const broadcastAll = (message: ServerMessage, exceptId?: string) => {
    for (const slug of rooms.keys()) broadcast(slug, message, exceptId);
  };

  /** Everyone on the server, with where they are — the People panel's list. */
  const onlineList = () => {
    const people: OnlineMessage["people"] = [];
    for (const [slug, room] of rooms) {
      for (const player of room.hub.snapshot()) {
        if (player.resident) continue;
        people.push({
          id: player.id,
          name: player.name,
          spriteKey: player.spriteKey,
          room: slug,
          ...(player.mic ? { mic: true } : {}),
        });
      }
    }
    return people;
  };
  const broadcastOnline = () => broadcastAll({ type: "online", people: onlineList() });

  /** Tell the room about badges just earned, so it is a shared moment. */
  const announce = (slug: string, earned: EarnedAchievement[]) => {
    for (const item of earned) {
      const definition = achievementFor(item.code);
      if (!definition) continue;
      broadcast(slug, {
        type: "achievement",
        code: item.code,
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        title: definition.title,
        description: definition.description,
        icon: definition.icon,
        at: item.earnedAt,
      });

      recordActivity(slug, {
        kind: "badge",
        actor: item.subjectName,
        text: `earned ${definition.title}`,
        detail: definition.description,
      });
    }
  };

  const drop = (id: string) => {
    const slug = roomOf.get(id);
    roomOf.delete(id);
    owesPong.delete(id);
    if (!slug) return;

    const room = rooms.get(slug);
    if (!room) return;

    const player = room.hub.leave(id);
    room.sockets.delete(id);
    if (player) {
      log.info(`${player.name} left "${slug}" (${room.hub.count}/${room.hub.capacity})`);
      broadcast(slug, { type: "left", id, name: player.name });
      recordActivity(slug, { kind: "human", actor: player.name, text: "left" });
    }

    // An empty room costs nothing to forget; its contents live in the store
    if (room.sockets.size === 0 && room.hub.count === 0) rooms.delete(slug);
    if (player) broadcastOnline();
  };

  /**
   * Persist one change and pass it on. The author already applied it locally,
   * so the echo goes to everyone else — the room converges without the author
   * seeing their own action arrive twice.
   */
  const applyWorldChange = (slug: string, authorId: string, change: WorldChange) => {
    const room = rooms.get(slug);
    if (!room) return;

    const store = getRoomStore();
    const author = room.hub.snapshot().find((player) => player.id === authorId);
    const by = author && { id: author.id, name: author.name };

    switch (change.entity) {
      case "task": {
        // Stamp who asked, unless the client already said
        const task = { ...change.task };
        if (!task.requestedBy && author) {
          task.requestedBy = author.id;
          task.requestedByName = author.name;
        }
        store.upsertTask(slug, task);
        broadcast(slug, { type: "world", change: { entity: "task", task }, by }, authorId);
        return;
      }
      case "message":
        store.appendMessage(slug, change.message);
        break;
      case "seat":
        store.upsertSeat(slug, change.seat);
        break;
      case "session":
        store.upsertSession(slug, change.session);
        break;
    }

    broadcast(slug, { type: "world", change, by }, authorId);
  };

  /**
   * Pass on something a human said, and keep it with the room's history so it
   * is still there after a refresh.
   *
   * "nearby" is filtered by the positions presence already tracks: it reaches
   * whoever is within earshot, which is the point of having an office rather
   * than a chat window.
   */
  const relaySpeech = (
    slug: string,
    authorId: string,
    text: string,
    scope: SayScope,
    id: string | null,
  ) => {
    const room = rooms.get(slug);
    if (!room) return;

    const roster = room.hub.snapshot();
    const author = roster.find((player) => player.id === authorId);
    if (!author) return;

    const said = {
      type: "said" as const,
      id: id ?? randomUUID(),
      from: { id: author.id, name: author.name },
      text,
      at: new Date().toISOString(),
      scope,
    };

    // "First thing said" is judged before this remark is stored
    let isFirstSpeech = false;
    try {
      isFirstSpeech = !getRoomStore()
        .getSnapshot(slug)
        .messages.some((message) => (message as { role?: string }).role === "player");
    } catch {
      // If we cannot tell, do not award rather than award wrongly
    }

    try {
      const store = getRoomStore();
      store.appendMessage(slug, {
        id: said.id,
        runId: "",
        role: "player",
        content: text,
        actorName: author.name,
        authorId: author.id,
        timestamp: said.at,
        sessionKey: store.getSnapshot(slug).activeSessionKey ?? "main",
        // Room talk, so it stays in view whichever session is being read
        roomChat: true,
      });
    } catch (err) {
      log.warn("could not keep what was said:", (err as Error).message);
    }

    for (const [id, socket] of room.sockets) {
      if (id === authorId) continue;
      if (scope === "nearby") {
        const listener = roster.find((player) => player.id === id);
        if (!listener) continue;
        if (Math.hypot(listener.x - author.x, listener.y - author.y) > EARSHOT_PX) continue;
      }
      send(socket, said);
    }

    announce(slug, onPlayerSpoke(slug, author.name, scope, isFirstSpeech));
  };

  // Standing still is not the same as being gone: a player who never moves
  // still holds a live socket. Ping them and count the reply as presence, so
  // only a genuinely dead connection is swept.
  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      // A copy, because dropping a dead one edits the map underneath.
      for (const [id, socket] of [...room.sockets]) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (owesPong.has(id)) {
          // Asked last time round and never answered: nobody is there.
          log.info("a connection stopped answering; taking it out of the room");
          drop(id);
          socket.terminate();
          continue;
        }
        try {
          owesPong.add(id);
          socket.ping();
        } catch {
          drop(id);
        }
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  // One timer for every room rather than one per player
  const ticker = setInterval(() => {
    let anyoneGone = false;
    for (const [slug, room] of rooms) {
      for (const gone of room.hub.sweep()) {
        log.info(`${gone.name} timed out of "${slug}"`);
        room.sockets.get(gone.id)?.close();
        room.sockets.delete(gone.id);
        roomOf.delete(gone.id);
        broadcast(slug, { type: "left", id: gone.id, name: gone.name });
        anyoneGone = true;
      }

      if (room.hub.count === 0) continue;
      broadcast(slug, { type: "presence", players: room.hub.snapshot() });
    }
    if (anyoneGone) broadcastOnline();
  }, TICK_MS);
  ticker.unref?.();

  // The whole server's list, now and then regardless, so nobody's copy drifts.
  const onlineTicker = setInterval(broadcastOnline, ONLINE_REFRESH_MS);
  onlineTicker.unref?.();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url !== path) return;
    if (!checkOrigin(req, socket)) return;
    // Origin only binds browsers; this socket carries everyone's position,
    // speech and voice signalling, so it needs the door's cookie too.
    if (!isAuthorized(req)) {
      log.warn("rejected upgrade: no valid access cookie");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Taken from the cookie at the upgrade, not from anything the connection
    // says later: a look is clamped to what that identity is allowed to wear.
    const identity = identityOf(req.headers.cookie);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = randomUUID();
      identityByConnection.set(id, identity);
      ws.on("pong", () => owesPong.delete(id));
      const lookFor = (requested: unknown, fallback: string) => {
        const wanted = typeof requested === "string" ? requested : fallback;
        return permittedLook(identity, wanted, fallback);
      };

      ws.on("message", (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!isClientMessage(parsed)) return;

        if (parsed.type === "join") {
          const slug = normaliseRoomSlug(parsed.room);
          // A private building's floors. The lift will not carry a visitor
          // and the floor's page turns them away, but neither is the gate:
          // the browser asks for whatever room it likes over this socket, so
          // the answer is checked against the cookie the way a look is.
          // One person, one place. A personal code names exactly one
          // person, so a second connection claiming it is that same
          // someone arriving again — most often because the last page's
          // socket outlived the page, which a proxy between browser and
          // server makes routine. The earlier one is let go, and told why
          // so it does not simply reconnect and take the place back.
          //
          // Only for a personal identity: the shared code is many people,
          // so two visitors are two visitors and both belong here.
          if (identity !== "visitor") {
            const here = rooms.get(slug);
            for (const [other, socket] of [...(here?.sockets ?? [])]) {
              if (other === id) continue;
              if (identityByConnection.get(other) !== identity) continue;
              log.info(`${identity} arrived again; letting the older connection go`);
              send(socket, { type: "rejected", reason: "elsewhere" });
              drop(other);
              socket.close();
            }
          }

          if (!mayEnterRoom(slug, identity)) {
            log.warn(`refused a join to "${slug}": not ${identity}'s floor`);
            send(ws, { type: "rejected", reason: "private" });
            ws.close();
            return;
          }
          // Walking from one place to another on the same connection: out
          // of the old room first, so nobody there keeps a ghost of you.
          const previous = roomOf.get(id);
          if (previous === slug) {
            const room = rooms.get(slug);
            const player = room?.hub.snapshot().find((p) => p.id === id);
            if (room && player) {
              room.hub.place(id, {
                x: coerceNumber(parsed.x, player.x),
                y: coerceNumber(parsed.y, player.y),
                facing: coerceFacing(parsed.facing),
                name: typeof parsed.name === "string" ? parsed.name : undefined,
                spriteKey:
                  typeof parsed.spriteKey === "string"
                    ? lookFor(parsed.spriteKey, player.spriteKey)
                    : undefined,
              });
              broadcastOnline();
              send(ws, {
                type: "welcome",
                you: id,
                players: room.hub.snapshot(),
                capacity: room.hub.capacity,
              });
              send(ws, { type: "online", people: onlineList() });
              return;
            }
          }
          if (previous) drop(id);
          const room = roomFor(slug);

          const result = room.hub.join(id, {
            name: typeof parsed.name === "string" ? parsed.name : "Guest",
            spriteKey: lookFor(parsed.spriteKey, "player"),
            x: coerceNumber(parsed.x),
            y: coerceNumber(parsed.y),
            facing: coerceFacing(parsed.facing),
          });

          if (!result.ok) {
            log.info(`refused a join to "${slug}": full (${room.hub.capacity} humans)`);
            send(ws, { type: "rejected", reason: "full", capacity: result.capacity });
            ws.close();
            return;
          }

          room.sockets.set(id, ws);
          roomOf.set(id, slug);
          if (micOf.get(id)) room.hub.setMic(id, true);
          log.info(
            `${result.player.name} joined "${slug}" (${room.hub.count}/${room.hub.capacity})`,
          );

          send(ws, {
            type: "welcome",
            you: id,
            players: room.hub.snapshot(),
            capacity: room.hub.capacity,
          });
          broadcast(slug, { type: "joined", player: result.player }, id);
          broadcastOnline();
          recordActivity(slug, {
            kind: "human",
            actor: result.player.name,
            text: "walked in",
          });

          announce(slug, onPlayerJoined(slug, result.player.name));
          if (room.hub.count >= room.hub.capacity) {
            announce(
              slug,
              onRoomFull(
                slug,
                room.hub.snapshot().map((p) => p.name),
              ),
            );
          }
          return;
        }

        // Everything else requires having walked in first
        const slug = roomOf.get(id);
        if (!slug) return;
        const room = rooms.get(slug);
        if (!room?.hub.has(id)) return;

        if (parsed.type === "board") {
          const player = room.hub.snapshot().find((p) => p.id === id);

          if (parsed.action === "clear") {
            getRoomStore().clearBoard(SHARED_BOARD);
            log.info(`${player?.name ?? "someone"} cleared the board from "${slug}"`);
            // Everyone everywhere, including the author, so a wipe is unambiguous
            broadcastAll({ type: "board", action: "clear", by: player?.name });
            recordActivity(slug, {
              kind: "board",
              actor: player?.name ?? "someone",
              text: "wiped the whiteboard",
            });
            return;
          }

          if (!isStroke(parsed.stroke)) return;
          const stroke = sanitiseStroke({ ...parsed.stroke, author: player?.name });
          getRoomStore().addStroke(SHARED_BOARD, stroke.id, stroke);
          // The author already drew it locally; echoing would double the ink
          broadcastAll(
            { type: "board", action: "draw", stroke, done: parsed.done === true, by: player?.name },
            id,
          );
          return;
        }

        if (parsed.type === "say") {
          const text = typeof parsed.text === "string" ? parsed.text.trim().slice(0, 500) : "";
          if (!text) return;
          relaySpeech(
            slug,
            id,
            text,
            parsed.scope === "nearby" ? "nearby" : "room",
            speechId(parsed.id),
          );
          return;
        }

        if (parsed.type === "pong") {
          // The server is a post box here: it checks the envelope, finds the
          // player it is addressed to in this room, and passes it on. What
          // the two of them do with it is between them.
          const to = typeof parsed.to === "string" ? parsed.to : "";
          if (!to || !isPongPayload(parsed.payload)) return;
          if (roomOf.get(to) !== slug) return;

          const target = room.sockets.get(to);
          if (!target || target.readyState !== target.OPEN) return;

          const from = room.hub.snapshot().find((p) => p.id === id);
          target.send(
            JSON.stringify({
              type: "pong",
              from: { id, name: from?.name ?? "Someone" },
              payload: parsed.payload,
            }),
          );
          return;
        }

        if (parsed.type === "mic") {
          // Who is on voice is part of presence, so the room can count it
          // and a late arrival sees it without a handshake.
          micOf.set(id, parsed.on === true);
          room.hub.setMic(id, parsed.on === true);
          broadcastOnline();
          return;
        }

        if (parsed.type === "voice") {
          // The same post box, for the voice handshake: checked, addressed
          // to someone in this room, and passed on unread.
          const to = typeof parsed.to === "string" ? parsed.to : "";
          if (!to || to === id || !isVoiceSignal(parsed.signal)) return;
          if (parsed.signal.kind === "hello") {
            micOf.set(id, true);
            room.hub.setMic(id, true);
          }
          if (parsed.signal.kind === "bye") {
            micOf.set(id, false);
            room.hub.setMic(id, false);
          }
          if (roomOf.get(to) !== slug) return;
          const target = room.sockets.get(to);
          if (!target || target.readyState !== target.OPEN) return;
          const from = room.hub.snapshot().find((p) => p.id === id);
          target.send(
            JSON.stringify({
              type: "voice",
              from: { id, name: from?.name ?? "Someone" },
              signal: parsed.signal,
            }),
          );
          return;
        }

        if (parsed.type === "world") {
          if (!isWorldChange(parsed.change)) return;
          applyWorldChange(slug, id, parsed.change);
          return;
        }

        if (parsed.type === "move") {
          room.hub.move(id, {
            x: coerceNumber(parsed.x),
            y: coerceNumber(parsed.y),
            facing: coerceFacing(parsed.facing),
            moving: parsed.moving === true,
          });
        }
      });

      // A pong proves the browser is still there even when nobody is walking
      ws.on("pong", () => {
        const slug = roomOf.get(id);
        if (slug) rooms.get(slug)?.hub.touch(id);
      });

      ws.on("close", () => {
        micOf.delete(id);
        identityByConnection.delete(id);
        drop(id);
      });
      ws.on("error", (err) => {
        log.warn("socket error:", err.message);
        micOf.delete(id);
        identityByConnection.delete(id);
        drop(id);
      });
    });
  });

  wss.on("error", (err) => log.error("WebSocketServer error:", err.message));

  // The residents walk about the same rooms, and leave when the server does.
  // RESIDENT_DWELL_SCALE=0.02 makes a day of theirs pass in a minute, for watching.
  const dwellScale = Number(process.env.RESIDENT_DWELL_SCALE) || 1;
  const stopResidents = new ResidentSimulation({ roomFor }, { dwellScale }).start();

  server.on("close", () => {
    clearInterval(ticker);
    clearInterval(onlineTicker);
    clearInterval(heartbeat);
    stopResidents();
  });

  log.info(`room socket attached on ${path}`);

  // The agent bridge needs to know whether anyone is in the office, for badges
  // that depend on working unattended
  occupancyLookup = (slug: string) => rooms.get(slug)?.hub.count ?? 0;

  return { rooms };
}
