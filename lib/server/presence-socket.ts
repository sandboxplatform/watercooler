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
import { identityOf, isAuthorized, personaFor, type AccessIdentity } from "./access";
import { mayWear } from "../characters/library";
import { BOSS_SPRITE_KEY } from "../characters/sprites";
import { normaliseRoomSlug } from "../rooms";
import { describeRoom, hasBoardroom, mayEnterRoom } from "../world/floors";
import { achievementFor, type EarnedAchievement } from "../achievements";
import { isPongPayload } from "../pong/protocol";
import { SHARED_BOARD, isStroke, sanitiseStroke } from "../whiteboard";
import { onPlayerJoined, onRoomFull } from "./achievement-rules";
import { createLogger } from "../logger";
import {
  CLAIM_GRACE_MS,
  HEARTBEAT_MS,
  TICK_MS,
  isClientMessage,
  isWorldChange,
  type Facing,
  type OnlineMessage,
  type PresencePlayer,
  type JoinMessage,
  type MeetingNotice,
  type ServerMessage,
  type WorldChange,
  isVoiceSignal,
} from "../presence-types";

import { ResidentSimulation } from "./residents";
import { setRoomBroadcast } from "./room-broadcast";

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
 * The picker already offers each person only what is theirs, but the browser
 * says what it likes over this socket — a hand-edited profile could otherwise
 * walk into the room wearing Coop's face. So the claim is checked rather than
 * trusted, against `looksFor`: the shared cast for a visitor, and for
 * somebody whose own code names their sheet, that sheet alone.
 *
 * Who is refused falls back differently, because the two have different
 * right answers. A visitor keeps what they had — any of the cast will do,
 * and the one they were wearing is the least surprising. A persona is put
 * back into their own sheet rather than into whatever the connection last
 * claimed, which may be the impersonation itself.
 */
function permittedLook(identity: AccessIdentity, wanted: string, fallback: string): string {
  const persona = personaFor(identity);
  if (mayWear(persona, wanted)) return wanted;
  const kept = persona?.characterKey ?? fallback;
  log.warn(`${identity} asked for the look "${wanted}"; kept "${kept}"`);
  return kept;
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
  /**
   * The meeting under way in each room, by room slug.
   *
   * In memory rather than in the room store, because a meeting is something
   * happening rather than something kept: a server that restarts has ended
   * every meeting it was hosting, and a notice that outlived the room it
   * was called in would hang over the building until somebody walked up to
   * the table to take it down.
   *
   * Who called it is kept as a name rather than as a connection: a meeting
   * outlives the person who called it — they may leave the room while it
   * carries on without them, exactly as a meeting does.
   */
  const meetings = new Map<string, { host: string; since: string }>();

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

  /**
   * One person's socket, wherever on the server they are.
   *
   * A connection is indexed by the room it is in, so reaching somebody
   * means finding their room first. Only voice needs this: everything else
   * is addressed to a room, and this one thing is addressed to a person.
   */
  const socketFor = (id: string): WebSocket | undefined => {
    const slug = roomOf.get(id);
    return slug ? rooms.get(slug)?.sockets.get(id) : undefined;
  };

  /**
   * The other connection holding this identity, if somebody is already in
   * the world as them.
   *
   * Server-wide, not per room: "two Coops" is one person in two places at
   * once whether or not the two places are the same one. It used to ask
   * only about the room being joined, so the same code in a lobby and on
   * the floor above it was two people in the Online list and two names
   * over two characters.
   *
   * Being in a room is what counts as being online — a connection that has
   * upgraded and not yet said where it is standing is nobody yet, and the
   * whole of a join is about to follow it.
   */
  const heldBy = (identity: AccessIdentity, exceptId: string): string | null => {
    for (const [other, held] of identityByConnection) {
      if (other === exceptId) continue;
      if (held !== identity) continue;
      if (!roomOf.has(other)) continue;
      return other;
    }
    return null;
  };

  /**
   * Whether the connection in possession is really still there.
   *
   * Asked rather than assumed, because the commonest reason for a second
   * connection claiming one person's code is that person reloading: a page
   * load is a new socket, and behind a proxy the old one is not closed at
   * the server for some seconds yet. Refusing on the strength of a socket
   * that is still open would shut somebody out of their own world with
   * their own ghost.
   *
   * A ping is what tells them apart, exactly as it does for the heartbeat:
   * a browser that is there answers at once, a ghost never answers. See
   * CLAIM_GRACE_MS for the wait, which is only ever felt by a newcomer
   * whose predecessor is dead.
   */
  const stillThere = (id: string): Promise<boolean> => {
    const socket = socketFor(id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (alive: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("pong", answered);
        resolve(alive);
      };
      const answered = () => finish(true);
      const timer = setTimeout(() => finish(false), CLAIM_GRACE_MS);
      socket.on("pong", answered);
      try {
        socket.ping();
      } catch {
        finish(false);
      }
    });
  };

  /**
   * Identities whose place is being contested right now.
   *
   * The challenge above takes a moment, and a third connection arriving
   * inside it would find the incumbent still in the room and start a
   * second challenge of its own — two newcomers, each told the ghost is
   * gone, both let in. Whoever is already contesting it has the claim;
   * anybody else is turned away while it is decided.
   */
  const claiming = new Set<AccessIdentity>();

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

  /**
   * The meetings a given identity is allowed to know about.
   *
   * The same rule that decides whether they could walk in: a meeting on a
   * floor they cannot ride to is not news they are entitled to. Asked here
   * rather than in the HUD for the reason every other private-floor check
   * is asked here — what the browser is told is the only thing that holds.
   */
  const noticesFor = (identity: AccessIdentity): MeetingNotice[] => {
    const notices: MeetingNotice[] = [];
    for (const [room, meeting] of meetings) {
      if (!mayEnterRoom(room, identity)) continue;
      notices.push({ room, where: describeRoom(room), host: meeting.host, since: meeting.since });
    }
    return notices;
  };

  /** Tell one connection what is being held that it may know about. */
  const tellMeetings = (id: string, socket: WebSocket) => {
    send(socket, {
      type: "meetings",
      meetings: noticesFor(identityByConnection.get(id) ?? "visitor"),
    });
  };

  /**
   * Tell everyone, wherever they are.
   *
   * A meeting is announced across the server rather than into its own room:
   * the people it is news to are the ones who are not in the room yet. Each
   * connection gets its own filtered list, which is why this is a loop
   * rather than a `broadcastAll`.
   */
  const tellEveryoneMeetings = () => {
    for (const room of rooms.values()) {
      for (const [id, socket] of room.sockets) tellMeetings(id, socket);
    }
  };

  /**
   * A meeting in an empty room is over.
   *
   * The other way one ends, and the one nobody has to remember: whoever
   * called it may close the tab, time out or ride away, and the meeting
   * carries on for the people still at the table — which is what a meeting
   * does. When the last of them goes the notice would otherwise hang over
   * the building for as long as the server runs, and the table is on a
   * private floor, so there may be nobody left who can reach it to take it
   * down.
   *
   * Humans only, which is what `hub.count` counts: Doc standing about in
   * Support is not somebody still in the meeting.
   */
  const endMeetingIfEmpty = (slug: string, hub: PresenceHub) => {
    const meeting = meetings.get(slug);
    if (!meeting || hub.count > 0) return false;
    meetings.delete(slug);
    log.info(`the meeting in "${slug}" ended: the room is empty`);
    return true;
  };

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
    }
  };

  /**
   * Take a connection out of its room and tell everybody.
   *
   * `departed` is who left, for the one caller that already knows: the idle
   * sweep takes them out of the hub itself, so `leave` answers null and this
   * would go quiet about somebody who had gone. It used to clear `roomOf` and
   * the socket by hand and let the close event reach here — where the missing
   * `roomOf` entry then sent it straight back out of the guard above, so a
   * timed-out person got no "left" line in the room's log (a person who
   * closed their tab did) and the room they had been alone in was never
   * forgotten from the map.
   */
  const drop = (id: string, departed?: PresencePlayer) => {
    const slug = roomOf.get(id);
    roomOf.delete(id);
    owesPong.delete(id);
    if (!slug) return;

    const room = rooms.get(slug);
    if (!room) return;

    const player = room.hub.leave(id) ?? departed ?? null;
    room.sockets.delete(id);
    if (player) {
      log.info(`${player.name} left "${slug}" (${room.hub.count}/${room.hub.capacity})`);
      broadcast(slug, { type: "left", id, name: player.name });
    }

    // An empty room costs nothing to forget; its contents live in the store
    if (room.sockets.size === 0 && room.hub.count === 0) rooms.delete(slug);
    if (player) broadcastOnline();
    // Whoever has just gone may have been the last of the meeting.
    if (endMeetingIfEmpty(slug, room.hub)) tellEveryoneMeetings();
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
    const author = room.hub.get(authorId);
    const by = author ? { id: author.id, name: author.name } : undefined;

    switch (change.entity) {
      case "seat":
        store.upsertSeat(slug, change.seat);
        break;
    }

    broadcast(slug, { type: "world", change, by }, authorId);
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
    for (const [slug, room] of rooms) {
      for (const gone of room.hub.sweep()) {
        log.info(`${gone.name} timed out of "${slug}"`);
        // Through `drop`, so a timeout leaves by exactly the same door as a
        // closed tab: the room told, the log written, the room forgotten if
        // it is now empty. Held before dropping, because dropping is what
        // takes it out of the map.
        const socket = room.sockets.get(gone.id);
        drop(gone.id, gone);
        socket?.close();
      }

      if (room.hub.count === 0) continue;
      broadcast(slug, { type: "presence", players: room.hub.snapshot() });
    }
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

      // A pong is the one answer that says the browser is still there when
      // nobody is walking: it clears the debt the heartbeat sweeps on, and
      // counts as presence so the idle clock does not run out underneath
      // somebody standing still. Both, in one handler — they were two, which
      // is two places to remember when the meaning of a pong changes.
      ws.on("pong", () => {
        owesPong.delete(id);
        const slug = roomOf.get(id);
        if (slug) rooms.get(slug)?.hub.touch(id);
      });

      const lookFor = (requested: unknown, fallback: string) => {
        const wanted = typeof requested === "string" ? requested : fallback;
        return permittedLook(identity, wanted, fallback);
      };

      /**
       * Walk this connection into a room: the whole of a join, once the
       * place is known to be theirs to take.
       *
       * It is a function rather than the body of the handler because the
       * claim below may have to wait a moment before it knows, and a join
       * that has waited is otherwise a second copy of all of this.
       */
      const admit = (join: JoinMessage) => {
        const slug = normaliseRoomSlug(join.room);
        // A private building's floors. The lift will not carry a visitor
        // and the floor's page turns them away, but neither is the gate:
        // the browser asks for whatever room it likes over this socket, so
        // the answer is checked against the cookie the way a look is.
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
          const player = room?.hub.get(id);
          if (room && player) {
            room.hub.place(id, {
              x: coerceNumber(join.x, player.x),
              y: coerceNumber(join.y, player.y),
              facing: coerceFacing(join.facing),
              name: typeof join.name === "string" ? join.name : undefined,
              spriteKey:
                typeof join.spriteKey === "string"
                  ? lookFor(join.spriteKey, player.spriteKey)
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
            tellMeetings(id, ws);
            return;
          }
        }
        if (previous) drop(id);
        const room = roomFor(slug);

        const result = room.hub.join(id, {
          name: typeof join.name === "string" ? join.name : "Guest",
          // The default look rather than a word: a refused claim on a
          // first join has nothing to keep, and the fallback has to name
          // a sheet somebody can be drawn in. "player" named none, so
          // every scene and the People panel alike fell through to the
          // default on their own — which looked like an answer and was
          // the absence of one.
          spriteKey: lookFor(join.spriteKey, BOSS_SPRITE_KEY),
          x: coerceNumber(join.x),
          y: coerceNumber(join.y),
          facing: coerceFacing(join.facing),
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
        log.info(`${result.player.name} joined "${slug}" (${room.hub.count}/${room.hub.capacity})`);

        send(ws, {
          type: "welcome",
          you: id,
          players: room.hub.snapshot(),
          capacity: room.hub.capacity,
        });
        broadcast(slug, { type: "joined", player: result.player }, id);
        broadcastOnline();
        // What is being held, of what they may know about: a meeting is
        // most useful to somebody who is not in the room yet.
        tellMeetings(id, ws);
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
      };

      /**
       * Somebody is already in the world on this code. Decide which of the
       * two connections is real, and let exactly one of them stand.
       *
       * The one in possession is asked whether it is still there. If it
       * answers, it keeps its place and this connection is refused. If it
       * does not, it was a page that has gone — a reload, a door, a closed
       * tab whose socket a proxy is still holding open — and this
       * connection takes over from it.
       */
      const claim = async (join: JoinMessage, contested: string) => {
        if (claiming.has(identity)) {
          log.info(`${identity} is already being claimed; turning this one away`);
          send(ws, { type: "rejected", reason: "already-online" });
          ws.close();
          return;
        }
        claiming.add(identity);
        let alive: boolean;
        try {
          alive = await stillThere(contested);
        } finally {
          claiming.delete(identity);
        }

        if (alive) {
          log.info(`${identity} is already online; refusing a second connection`);
          send(ws, { type: "rejected", reason: "already-online" });
          ws.close();
          return;
        }

        log.info(`${identity}'s earlier connection is gone; letting this one in`);
        const stale = socketFor(contested);
        drop(contested);
        stale?.terminate();

        // The newcomer may itself have gone while we waited.
        if (ws.readyState !== WebSocket.OPEN) return;
        admit(join);
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
          // One person, one session. A personal code names exactly one
          // person, so a second connection claiming it is a second window
          // onto somebody who is already in the world — and two of one
          // person walking about is the thing this rule exists to make
          // impossible. The one already in possession keeps its place and
          // the newcomer is turned away, told which refusal it is so it
          // stands down rather than reconnecting into the same answer.
          //
          // Server-wide, not per room, because two Coops is two Coops
          // whether they are in the same room or two floors apart.
          //
          // Only for a personal identity: the shared code is many people,
          // so two visitors are two visitors and both belong here.
          const contested = identity !== "visitor" ? heldBy(identity, id) : null;
          if (contested) {
            void claim(parsed, contested);
            return;
          }
          admit(parsed);
          return;
        }

        // Everything else requires having walked in first
        const slug = roomOf.get(id);
        if (!slug) return;
        const room = rooms.get(slug);
        if (!room?.hub.has(id)) return;

        if (parsed.type === "board") {
          const player = room.hub.get(id);

          if (parsed.action === "clear") {
            getRoomStore().clearBoard(SHARED_BOARD);
            log.info(`${player?.name ?? "someone"} cleared the board from "${slug}"`);
            // Everyone everywhere, including the author, so a wipe is unambiguous
            broadcastAll({ type: "board", action: "clear", by: player?.name });
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

        if (parsed.type === "pong") {
          // The server is a post box here: it checks the envelope, finds the
          // player it is addressed to in this room, and passes it on. What
          // the two of them do with it is between them.
          const to = typeof parsed.to === "string" ? parsed.to : "";
          if (!to || !isPongPayload(parsed.payload)) return;
          if (roomOf.get(to) !== slug) return;

          const target = room.sockets.get(to);
          if (!target || target.readyState !== target.OPEN) return;

          const from = room.hub.get(id);
          target.send(
            JSON.stringify({
              type: "pong",
              from: { id, name: from?.name ?? "Someone" },
              payload: parsed.payload,
            }),
          );
          return;
        }

        if (parsed.type === "boarded") {
          // Into the lift, or back out of it. Part of presence so everyone
          // else stops drawing them, and deliberately not remembered by
          // connection the way the microphone is: a ride to another floor
          // is a fresh join, and `place` clears it for a re-join to this
          // one, so nobody can arrive somewhere invisible.
          room.hub.setHidden(id, parsed.inside === true);
          return;
        }

        if (parsed.type === "meeting") {
          // A meeting is held at a table, so it can only be called in a
          // room that has one — every Operations floor, and nowhere else.
          // The panel only opens at the table, but `?meeting=1` opens it
          // anywhere and a panel is decoration either way.
          if (!hasBoardroom(slug)) return;
          // The room it is held in is whatever room this connection is
          // standing in, and anybody there may end it — see `MeetingMessage`.
          const player = room.hub.get(id);
          const running = meetings.get(slug);
          if (parsed.on) {
            // Already under way: the second person to press E at the table
            // is joining a meeting rather than calling another one.
            if (running) return;
            const since = new Date().toISOString();
            meetings.set(slug, { host: player?.name ?? "Someone", since });
            log.info(`${player?.name ?? "someone"} called a meeting in "${slug}"`);
          } else {
            if (!running) return;
            meetings.delete(slug);
            log.info(`the meeting in "${slug}" ended`);
          }
          tellEveryoneMeetings();
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
          // to one person anywhere on the server, and passed on unread.
          //
          // Anywhere, because voice is one conversation for the whole
          // server rather than one per room. It used to be delivered only
          // within the sender's room, which is what made it a room's
          // conversation: two people a floor apart would say hello and
          // neither would hear an answer.
          const to = typeof parsed.to === "string" ? parsed.to : "";
          if (!to || to === id || !isVoiceSignal(parsed.signal)) return;
          // Both halves of the greeting say the same thing about the sender:
          // a microphone is on over there. Counting only the "hello" left
          // whoever answered one reading as off until their own tick.
          if (parsed.signal.kind === "hello" || parsed.signal.kind === "hi") {
            micOf.set(id, true);
            room.hub.setMic(id, true);
          }
          if (parsed.signal.kind === "bye") {
            micOf.set(id, false);
            room.hub.setMic(id, false);
          }
          const target = socketFor(to);
          if (!target || target.readyState !== target.OPEN) return;
          const from = room.hub.get(id);
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
