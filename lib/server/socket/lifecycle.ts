/**
 * A connection's life on the room socket: arriving, claiming a person,
 * walking between rooms, being swept, and going.
 *
 * Everything a connection says after it has joined is dispatched from here
 * to whichever feature answers that message type (see `./feature`); the
 * join itself is this file's, because deciding who somebody is and where
 * they may stand is what every feature relies on having been settled.
 */

import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { personaFor, type AccessIdentity } from "../access";
import { mayWear } from "../../characters/library";
import { BOSS_SPRITE_KEY } from "../../characters/sprites";
import { normaliseRoomSlug } from "../../rooms";
import { mayEnterRoom } from "../../world/floors";
import { onArrival, onRoomFull } from "../badge-rules";
import { ConnectionLimiter, type BudgetedKind, type Verdict } from "../rate-limit";
import {
  CLAIM_GRACE_MS,
  isClientMessage,
  type ClientMessage,
  type JoinMessage,
  type PresencePlayer,
} from "../../presence-types";
import { createLogger } from "../../logger";
import type { ClientType, Feature, MessageContext, SocketContext } from "./feature";
import { coerceFacing, coerceNumber } from "./features/presence";
import { isOpenAir, type Room } from "./state";

const log = createLogger("Presence");

/** How long a new connection has to say where it is standing before it is closed. */
export const JOIN_DEADLINE_MS = 10_000;

/** A room gets a snapshot this often even when nothing in it has changed. */
export const PRESENCE_KEEPALIVE_MS = 1_000;

/** A session id is a uuid; longer than this and it is not one. */
const MAX_SESSION_LENGTH = 64;
/** A name is trimmed to sixteen by the hub; this only bounds the work to get there. */
const MAX_NAME_LENGTH = 64;
/** A sprite key is a short slug or an upload's id. */
const MAX_SPRITE_KEY_LENGTH = 64;

/** The close code for a connection that broke the rules of the socket. */
const POLICY_VIOLATION = 1008;

/** A string no longer than `limit`, or nothing. */
const shortString = (value: unknown, limit: number): string | undefined =>
  typeof value === "string" && value.length <= limit ? value : undefined;

/** Which of the dear budgets a message is spent from, if any. */
function budgetOf(message: ClientMessage): BudgetedKind | null {
  if (message.type === "mic") return "mic";
  if (message.type === "meeting") return "meeting";
  if (message.type === "board" && message.action === "clear") return "board-clear";
  return null;
}

/**
 * The look this connection is allowed to wear.
 *
 * The picker already offers each person only what is theirs, but the browser
 * says what it likes over this socket — a hand-edited profile could otherwise
 * walk into the room wearing Coop's face. So the claim is checked against
 * `looksFor`: the shared cast for a visitor, and for somebody whose own code
 * names their sheet, that sheet alone.
 *
 * A visitor who is refused keeps what they had — any of the cast will do. A
 * persona is put back into their own sheet rather than into whatever the
 * connection last claimed, which may be the impersonation itself.
 */
function permittedLook(identity: AccessIdentity, wanted: string, fallback: string): string {
  const persona = personaFor(identity);
  if (mayWear(persona, wanted)) return wanted;
  const kept = persona?.characterKey ?? fallback;
  log.warn(`${identity} asked for the look "${wanted}"; kept "${kept}"`);
  return kept;
}

type Dispatch = { feature: Feature; handle: (message: ClientMessage, ctx: MessageContext) => void };

export class Lifecycle {
  /**
   * Connections that have been pinged and have not answered.
   *
   * A socket the far end had abandoned used to count as present until it
   * went fifteen seconds without speaking. A proxy between browser and server
   * makes that routine: the browser navigates away, the proxy holds the
   * upstream open, and the person is left standing in the room they just
   * walked out of.
   */
  private readonly owesPong = new Set<string>();
  /**
   * Identities whose place is being contested right now, and by which
   * connection.
   *
   * The challenge takes a moment, and another connection arriving inside it
   * would find the incumbent still there and start a second challenge of
   * its own — two newcomers, each told the ghost is gone, both let in. The
   * one contesting has the claim; anybody else is refused while it is
   * decided. Keyed to the claimant because the claimant itself may join
   * again inside the moment — a name chosen on the welcome screen is a
   * re-join — and it used to be refused as though it were a third person.
   */
  private readonly claiming = new Map<AccessIdentity, string>();
  /** The latest join each claimant sent, to be admitted if the claim succeeds. */
  private readonly pendingJoin = new Map<string, JoinMessage>();
  private readonly handlers = new Map<ClientType, Dispatch>();

  constructor(
    private readonly ctx: SocketContext,
    private readonly features: readonly Feature[],
  ) {
    for (const feature of features) {
      for (const [type, handle] of Object.entries(feature.onMessage ?? {})) {
        if (this.handlers.has(type as ClientType)) {
          throw new Error(`two features answer "${type}" messages`);
        }
        this.handlers.set(type as ClientType, {
          feature,
          handle: handle as Dispatch["handle"],
        });
      }
    }
  }

  /**
   * The other connection holding this identity, if somebody is already in
   * the world as them.
   *
   * Server-wide, not per room: "two Coops" is one person in two places at
   * once whether or not the two places are the same one. Being in a room is
   * what counts as being online — a connection that has upgraded and not yet
   * said where it is standing is nobody yet.
   */
  private heldBy(identity: AccessIdentity, exceptId: string): string | null {
    const { identityByConnection, roomOf } = this.ctx.state;
    for (const [other, held] of identityByConnection) {
      if (other === exceptId || held !== identity || !roomOf.has(other)) continue;
      return other;
    }
    return null;
  }

  /**
   * Whether the connection in possession is really still there.
   *
   * Asked rather than assumed, because the commonest reason for a second
   * connection claiming one person's code is that person reloading: behind a
   * proxy the old socket is not closed at the server for some seconds yet. A
   * browser that is there answers a ping at once; a ghost never does. See
   * CLAIM_GRACE_MS for the wait, which only a newcomer whose predecessor is
   * dead ever feels.
   */
  private stillThere(id: string): Promise<boolean> {
    const socket = this.ctx.state.socketFor(id);
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
        // A ping that was sent, so its answer counts as presence too.
        this.owesPong.add(id);
        socket.ping();
      } catch {
        finish(false);
      }
    });
  }

  /**
   * Take a connection out of its room and tell everybody.
   *
   * `departed` is who left, for the one caller that already knows: the idle
   * sweep takes them out of the hub itself, so `leave` answers null and this
   * would otherwise go quiet about somebody who had gone.
   *
   * `moving` is the other kind of leaving: out of one room and into the next
   * on the same connection, which is every door in the world. The room being
   * left is still told, but their tab is still their tab — `session` is what
   * tells one person coming back from two people arriving, so forgetting it
   * here left anybody who had changed room once to be challenged on their
   * next reload. (The online list is safe either way: it goes out once a
   * tick, after the join that follows a move has landed. See `OnlineList`.)
   */
  drop(id: string, departed?: PresencePlayer, { moving = false } = {}): void {
    const { state, out, online } = this.ctx;
    const slug = state.roomOf.get(id) ?? null;
    state.roomOf.delete(id);
    if (!moving) state.sessionByConnection.delete(id);
    const room = slug ? state.rooms.get(slug) : undefined;
    if (slug && room) {
      const player = room.hub.leave(id) ?? departed ?? null;
      room.sockets.delete(id);
      if (player) {
        log.info(`${player.name} left "${slug}" (${room.hub.count}/${room.hub.capacity})`);
        out.broadcast(slug, { type: "left", id, name: player.name });
        if (!moving) online.changed();
      }
      state.forgetIfEmpty(slug);
    }
    for (const feature of this.features) feature.onDrop?.(id, room ? slug : null);
  }

  /**
   * Standing still is not the same as being gone: a player who never moves
   * still holds a live socket. Ping every connection — joined or not — and
   * count the reply as presence, so only a genuinely dead one is swept. It
   * used to walk the rooms, which left a connection that never joined, or
   * one taken out of its room, swept by nothing at all.
   */
  heartbeat(): void {
    for (const [id, socket] of this.ctx.state.connections) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (this.owesPong.has(id)) {
        // Asked last time round and never answered: nobody is there.
        log.info("a connection stopped answering; taking it out of the room");
        this.drop(id);
        socket.terminate();
        continue;
      }
      try {
        this.owesPong.add(id);
        socket.ping();
      } catch {
        this.drop(id);
        socket.terminate();
      }
    }
  }

  /**
   * The rooms' share of a tick: sweep who has gone quiet, forget what is
   * empty, and send a snapshot where something changed — or where nothing
   * has for `PRESENCE_KEEPALIVE_MS`. It went to every room with somebody in
   * it twenty times a second whether or not anybody had moved.
   */
  tickRooms(now: number): void {
    const { state, out } = this.ctx;
    for (const [slug, room] of state.rooms) {
      for (const gone of room.hub.sweep()) {
        log.info(`${gone.name} timed out of "${slug}"`);
        // Through `drop`, so a timeout leaves by exactly the same door as a
        // closed tab. Held before dropping, because dropping is what takes
        // it out of the map.
        const socket = room.sockets.get(gone.id);
        this.drop(gone.id, gone);
        socket?.close();
      }
      if (room.sockets.size === 0) {
        state.forgetIfEmpty(slug);
        continue;
      }
      if (!room.hub.takeDirty() && now - room.presenceAt < PRESENCE_KEEPALIVE_MS) continue;
      room.presenceAt = now;
      out.broadcast(slug, { type: "presence", players: room.hub.snapshot() }, { lossy: true });
    }
  }

  /** A connection has upgraded: wire it up. */
  accept(ws: WebSocket, identity: AccessIdentity): void {
    const { state, out, badges, online } = this.ctx;
    const id = randomUUID();
    const limiter = new ConnectionLimiter();
    state.identityByConnection.set(id, identity);
    state.connections.set(id, ws);

    // A connection that never says where it is standing is nobody, and was
    // held open for as long as it liked. It is given a while, and closed.
    const joinBy = setTimeout(() => {
      if (state.roomOf.has(id) || this.claiming.get(identity) === id) return;
      log.info("a connection never said where it was standing; closing it");
      ws.close(POLICY_VIOLATION, "join first");
    }, JOIN_DEADLINE_MS);
    joinBy.unref?.();

    // A pong is the one answer that says the browser is still there when
    // nobody is walking: it clears the debt the heartbeat sweeps on, and
    // counts as presence so the idle clock does not run out underneath
    // somebody standing still. Only an answer to a ping that was sent: an
    // unsolicited pong is a frame anybody can send, and not a sign of life.
    ws.on("pong", () => {
      if (!this.owesPong.delete(id)) return;
      const slug = state.roomOf.get(id);
      if (slug) state.rooms.get(slug)?.hub.touch(id);
    });

    const lookFor = (requested: string | undefined, fallback: string) =>
      permittedLook(identity, requested ?? fallback, fallback);

    const refuse = (reason: "full" | "private" | "already-online", capacity?: number) => {
      out.send(ws, { type: "rejected", reason, ...(capacity ? { capacity } : {}) });
      ws.close();
    };

    /** The welcome and everything else an arrival needs to be told. */
    const welcome = (slug: string, room: Room) => {
      out.send(ws, {
        type: "welcome",
        you: id,
        players: room.hub.snapshot(),
        capacity: room.hub.capacity,
      });
      online.tell(ws);
      for (const feature of this.features) feature.catchUp?.(slug, id, ws);
    };

    /**
     * Walk this connection into a room: the whole of a join, once the place
     * is known to be theirs to take. A function rather than the body of the
     * handler because the claim below may have to wait a moment first.
     */
    const admit = (join: JoinMessage) => {
      const slug = normaliseRoomSlug(typeof join.room === "string" ? join.room : undefined);
      // A private building's floors. The lift will not carry a visitor and
      // the floor's page turns them away, but neither is the gate: the
      // browser asks for whatever room it likes over this socket.
      if (!mayEnterRoom(slug, identity)) {
        log.warn(`refused a join to "${slug}": not ${identity}'s floor`);
        refuse("private");
        return;
      }
      const name = typeof join.name === "string" ? join.name.slice(0, MAX_NAME_LENGTH) : undefined;
      const spriteKey = shortString(join.spriteKey, MAX_SPRITE_KEY_LENGTH);

      // The same room again — a new name or a new look. Placed, not re-joined.
      const previous = state.roomOf.get(id);
      if (previous === slug) {
        const room = state.rooms.get(slug);
        const player = room?.hub.get(id);
        if (room && player) {
          room.hub.place(id, {
            x: coerceNumber(join.x, player.x),
            y: coerceNumber(join.y, player.y),
            facing: coerceFacing(join.facing),
            name,
            spriteKey: spriteKey !== undefined ? lookFor(spriteKey, player.spriteKey) : undefined,
          });
          online.changed();
          welcome(slug, room);
          return;
        }
      }
      // Walking from one place to another on the same connection: out of the
      // old room first, so nobody there keeps a ghost of you.
      if (previous) this.drop(id, undefined, { moving: true });
      const room = state.roomFor(slug);

      const result = room.hub.join(id, {
        name: name ?? "Guest",
        // The default look rather than a word: a refused claim on a first
        // join has nothing to keep, and the fallback has to name a sheet.
        spriteKey: lookFor(spriteKey, BOSS_SPRITE_KEY),
        x: coerceNumber(join.x),
        y: coerceNumber(join.y),
        facing: coerceFacing(join.facing),
      });

      if (!result.ok) {
        log.info(`refused a join to "${slug}": full (${room.hub.capacity} humans)`);
        // The one way a move ends in no join at all, so the world is told
        // they are nowhere now.
        online.changed();
        state.forgetIfEmpty(slug);
        refuse("full", result.capacity);
        return;
      }

      clearTimeout(joinBy);
      room.sockets.set(id, ws);
      state.roomOf.set(id, slug);
      if (state.micOf.get(id)) room.hub.setMic(id, true);
      log.info(`${result.player.name} joined "${slug}" (${room.hub.count}/${room.hub.capacity})`);

      welcome(slug, room);
      out.broadcast(slug, { type: "joined", player: result.player }, { except: id });
      online.changed();

      // Badges, after the room has been told they are here: everything below
      // reads the hub, and a `holderOf` before the join would name nobody.
      const holder = badges.holderOf(id);
      if (holder) {
        badges.announce(slug, onArrival(holder, slug));
        if (!isOpenAir(slug) && room.hub.count >= room.hub.capacity) {
          badges.announce(slug, onRoomFull(badges.holdersIn(slug)));
        }
      }
      for (const feature of this.features) feature.onJoin?.(slug, id);
    };

    /**
     * Take the world away from a connection that has been replaced.
     *
     * Usually nobody sees it: the connection being superseded is the one a
     * reloading page left behind. Where somebody is looking at it — two tabs
     * sharing a session, which is what duplicating a tab does — they are told
     * rather than simply going quiet. Terminated rather than closed politely,
     * so it is gone now rather than whenever a closing handshake nobody is
     * there to finish gives up.
     */
    const supersede = (held: string) => {
      const stale = state.socketFor(held);
      this.drop(held);
      if (!stale) return;
      if (stale.readyState !== WebSocket.OPEN) {
        stale.terminate();
        return;
      }
      const hangUp = () => stale.terminate();
      const giveUp = setTimeout(hangUp, CLAIM_GRACE_MS);
      giveUp.unref?.();
      try {
        stale.send(JSON.stringify({ type: "rejected", reason: "already-online" }), () => {
          clearTimeout(giveUp);
          hangUp();
        });
      } catch {
        clearTimeout(giveUp);
        hangUp();
      }
    };

    /**
     * Somebody is already in the world on this code. Decide which of the two
     * connections is real, and let exactly one of them stand: the one in
     * possession is asked whether it is still there, keeps its place if it
     * answers, and is taken over from if it does not.
     */
    const claim = async (join: JoinMessage, contested: string) => {
      const claimant = this.claiming.get(identity);
      if (claimant === id) {
        // Its own second join inside the moment replaces the first.
        this.pendingJoin.set(id, join);
        return;
      }
      if (claimant !== undefined) {
        log.info(`${identity} is already being claimed; turning this one away`);
        refuse("already-online");
        return;
      }
      this.claiming.set(identity, id);
      this.pendingJoin.set(id, join);
      let alive: boolean;
      try {
        alive = await this.stillThere(contested);
      } finally {
        this.claiming.delete(identity);
      }
      const latest = this.pendingJoin.get(id) ?? join;
      this.pendingJoin.delete(id);

      if (alive) {
        log.info(`${identity} is already online; refusing a second connection`);
        refuse("already-online");
        return;
      }
      log.info(`${identity}'s earlier connection is gone; letting this one in`);
      supersede(contested);
      // The newcomer may itself have gone while we waited.
      if (ws.readyState !== WebSocket.OPEN) return;
      admit(latest);
    };

    /**
     * One person, one session. A personal code names exactly one person, so
     * a second connection claiming it is a second window onto somebody
     * already in the world. Server-wide, not per room, and only for a
     * personal identity: the shared code is many people.
     */
    const join = (message: JoinMessage) => {
      const session = shortString(message.session, MAX_SESSION_LENGTH);
      if (session) state.sessionByConnection.set(id, session);
      const contested = identity !== "visitor" ? this.heldBy(identity, id) : null;
      if (!contested) {
        admit(message);
        return;
      }
      // The same tab coming back: a reload, or a browser reopened onto the
      // same session. It is one person at one screen and the place is
      // already theirs — challenging it is what used to shut somebody out of
      // their own world with their own ghost, which answers a ping.
      if (session && state.sessionByConnection.get(contested) === session) {
        log.info(`${identity} is back on the same tab; taking their place over`);
        supersede(contested);
        admit(message);
        return;
      }
      void claim(message, contested).catch((err: Error) => {
        log.error("a claim failed:", err.message);
      });
    };

    const abusive = (verdict: Verdict): boolean => {
      if (verdict !== "abuse") return verdict === "drop";
      log.warn(`${identity} is sending far more than any browser would; closing the connection`);
      ws.terminate();
      return true;
    };

    ws.on("message", (raw) => {
      // Spent before the message is so much as parsed: a flood is dropped
      // for the price of a subtraction.
      if (abusive(limiter.admit())) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isClientMessage(parsed)) return;
      // One message that throws — a malformed field nothing checked, a store
      // that is locked — is logged and dropped, and the connection lives on.
      // It used to escape the handler.
      try {
        if (parsed.type === "join") {
          join(parsed);
          return;
        }
        // Everything else requires having walked in first.
        const slug = state.roomOf.get(id);
        const room = slug ? state.rooms.get(slug) : undefined;
        const player = room?.hub.get(id);
        if (!slug || !room || !player) return;
        const entry = this.handlers.get(parsed.type);
        if (!entry) return;
        // A feature's messages mean nothing outside its room: a hand on the
        // ball from a lobby is a browser asking for something that is not there.
        if (entry.feature.room !== null && entry.feature.room !== slug) return;
        const budget = budgetOf(parsed);
        if (budget && abusive(limiter.admitKind(budget))) return;
        entry.handle(parsed, { id, ws, identity, slug, room, player, limiter });
      } catch (err) {
        log.error(`a "${parsed.type}" message failed:`, (err as Error).message);
      }
    });

    let gone = false;
    const leave = () => {
      if (gone) return;
      gone = true;
      clearTimeout(joinBy);
      state.micOf.delete(id);
      state.connections.delete(id);
      this.owesPong.delete(id);
      this.pendingJoin.delete(id);
      this.drop(id);
      state.identityByConnection.delete(id);
    };
    ws.on("close", leave);
    ws.on("error", (err) => {
      log.warn("socket error:", err.message);
      leave();
    });
  }
}
