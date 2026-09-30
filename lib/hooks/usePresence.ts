"use client";

import { useEffect, useRef } from "react";
import { gameEvents } from "../events";
import {
  acquireRoomSocket,
  onRoomMessage,
  onRoomOpen,
  sendRoom,
  stopRoomSocket,
} from "../room-socket";
import { currentRoom } from "../room-client";
import { createLogger } from "../logger";
import { loadPlayerName } from "../persistence";
import { subscribeToProfile } from "../profile";
import { rememberCharacter, rememberedCharacter } from "../characters/choice";
import { sheetPathFor } from "../characters/library";
import { SPRITE_KEY } from "@/components/game/config/animations";
import { rememberSelfId, tabSession } from "../presence-self";
import { rememberPlayers } from "../presence-roster";
import { MOVE_SEND_MS, type Facing, type PresencePlayer } from "../presence-types";

const log = createLogger("Presence");

/**
 * The longest a browser standing still goes without saying where it is.
 *
 * Not what keeps it in the room — the heartbeat's pongs do that — but a
 * frame lost on the way is otherwise never corrected while nobody moves.
 */
export const MOVE_KEEPALIVE_MS = 5_000;

type Stance = { x: number; y: number; facing: Facing; moving: boolean };

function sameStance(a: Stance, b: Stance | null): boolean {
  return !!b && a.x === b.x && a.y === b.y && a.facing === b.facing && a.moving === b.moving;
}

/**
 * Keeps this browser's character on the room socket.
 *
 * Outbound: the scene reports where our character is every frame; we forward
 * what changed, no faster than the tick rate. Inbound: the roster goes to the scene, which
 * owns how other people are drawn.
 *
 * Presence is best-effort. If the socket is down the office still works — you
 * are simply alone in it.
 */
export function usePresence() {
  const selfIdRef = useRef<string | null>(null);
  const latestRef = useRef<Stance | null>(null);
  /** What the room was last told, and when — so a frame that says nothing new is not sent. */
  const sentRef = useRef<Stance | null>(null);
  const sentAtRef = useRef(0);
  const joinedRef = useRef(false);
  // The look this browser last claimed, to compare against the one it got.
  const askedRef = useRef<string | null>(null);

  useEffect(() => {
    const release = acquireRoomSocket();

    /** Hand the scene everyone except ourselves. */
    const publish = (players: PresencePlayer[]) => {
      const others = players.filter((player) => player.id !== selfIdRef.current);
      rememberPlayers(others);
      gameEvents.emit("presence-updated", others);
    };

    /** Walk into the place the address bar names, standing where the scene put us. */
    const join = (spawn: { x: number; y: number; facing: Facing }, look?: string) => {
      joinedRef.current = false;
      const spriteKey = look ?? rememberedCharacter()?.key ?? SPRITE_KEY;
      askedRef.current = spriteKey;
      sendRoom({
        type: "join",
        room: currentRoom(),
        // Which tab this is, so coming back after a reload is not mistaken
        // for a second window onto the same person.
        session: tabSession(),
        name: loadPlayerName(),
        spriteKey,
        x: spawn.x,
        y: spawn.y,
        facing: spawn.facing,
      });
    };

    // Nothing is sent until the scene has said where the character stands.
    // The join used to fall back to 0,0, which put a stranger in the top-left
    // corner of everyone else's map for the moment before the first step —
    // and on the world map that corner is a long way from anywhere.
    // `place-entered` follows every scene's create, so the wait is a frame.
    const unsubOpen = onRoomOpen(() => {
      if (latestRef.current) join(latestRef.current);
    });

    // A scene started in-page — out of a door onto the world map, through a
    // gate onto a campus — is a different place with the same socket. The
    // server moves us from the old room to the new one, and everyone in
    // both hears about it.
    const unsubPlace = gameEvents.on("place-entered", (spawn) => {
      const next = { x: spawn.x, y: spawn.y, facing: spawn.facing as Facing, moving: false };
      latestRef.current = next;
      join(next);
    });

    /**
     * Put this browser into the look the room actually gave us.
     *
     * The socket clamps a claimed look against the cookie — a visitor may not
     * walk in wearing somebody's own face — and it used to do so in silence.
     * The scene goes on drawing whatever localStorage remembers, so you
     * looked like yourself on your own screen and like the default character
     * to everybody else in the world, with nothing anywhere to say why. The
     * welcome carries our own entry, so the refusal is answerable here.
     *
     * It settles rather than loops: putting a look on re-joins in it, and
     * the welcome that follows carries back the one we asked for.
     */
    const wearWhatWeWereGiven = (players: PresencePlayer[], you: string) => {
      const mine = players.find((player) => player.id === you);
      const asked = askedRef.current;
      if (!mine || !asked || mine.spriteKey === asked) return;
      const path = sheetPathFor(mine.spriteKey);
      if (!path) {
        log.error(`the room put us in "${mine.spriteKey}", which names no sheet`);
        return;
      }
      log.warn(`the look "${asked}" is not ours to wear; wearing "${mine.spriteKey}"`);
      rememberCharacter({ key: mine.spriteKey, path });
      gameEvents.emit("player-sprite-chosen", mine.spriteKey, path);
    };

    const unsubMessage = onRoomMessage((message) => {
      switch (message.type) {
        case "welcome":
          selfIdRef.current = message.you;
          rememberSelfId(message.you);
          joinedRef.current = true;
          // A welcome is a fresh place in a room, so the next frame is news
          // to it whatever the last room was last told.
          sentRef.current = null;
          log.info(`joined as ${message.you} (${message.players.length}/${message.capacity})`);
          publish(message.players);
          wearWhatWeWereGiven(message.players, message.you);
          break;
        case "rejected":
          joinedRef.current = false;
          if (message.reason === "already-online") {
            // The same person is in the world on another connection, which
            // keeps its place: this window is the second one. Reconnecting
            // would only ask the same question and get the same answer, so
            // it stops — and says so, since a world with nobody in it and
            // no explanation reads as the app being broken.
            log.warn("this person is already online elsewhere; standing down");
            stopRoomSocket();
            gameEvents.emit("presence-refused", "already-online");
            break;
          }
          if (message.reason === "private") {
            // The lift already said so in the room; nothing to show here.
            log.warn("that floor is not ours to be on");
            break;
          }
          log.warn(`room is full (${message.capacity ?? "?"} humans)`);
          break;
        case "presence":
          publish(message.players);
          break;
        case "left":
          // Remove immediately rather than waiting for the next tick
          gameEvents.emit("presence-left", message.id);
          break;
        default:
          break;
      }
    });

    /**
     * Tell the room where we stand, if that is news or it has been a while.
     *
     * The scene reports every frame whether or not anything moved, and this
     * used to forward one of those every `MOVE_SEND_MS` regardless — twenty
     * messages a second from somebody standing still. Now a frame that says
     * what the room was last told is not sent, and the keepalive is the
     * only thing a stationary browser says. Being quiet costs nothing on the
     * server's side: the heartbeat's pongs are what keep a player from the
     * idle sweep, and the move clamp budgets over a capped window, so the
     * first step after a long stand is paid for like any other.
     */
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const sendLatest = () => {
      trailing = null;
      const latest = latestRef.current;
      if (!joinedRef.current || !latest) return;
      const now = Date.now();
      const since = now - sentAtRef.current;
      const news = !sameStance(latest, sentRef.current);
      if (!news && since < MOVE_KEEPALIVE_MS) return;
      if (since < MOVE_SEND_MS) {
        // The tick rate still holds. What was held back goes out when it
        // allows, or somebody who stops inside the window is drawn
        // walking on the spot until they next move.
        trailing ??= setTimeout(sendLatest, MOVE_SEND_MS - since);
        return;
      }
      sentAtRef.current = now;
      sentRef.current = latest;
      sendRoom({ type: "move", ...latest });
    };

    const unsubscribeMove = gameEvents.on("player-moved", (position) => {
      latestRef.current = {
        x: position.x,
        y: position.y,
        facing: position.facing as Facing,
        moving: position.moving,
      };
      sendLatest();
    });

    // Into the lift, or out through a door: they have gone out of sight,
    // so tell the room to stop drawing them. Sent every time rather than
    // only on a change, since it is two messages a ride and the server
    // clears the flag on a join — a browser that thought it had already
    // said so would leave somebody drawn in a doorway.
    const unsubBoarded = gameEvents.on("player-boarded", (inside) => {
      if (joinedRef.current) sendRoom({ type: "boarded", inside });
    });

    /**
     * A name chosen while the socket is already in a room.
     *
     * The welcome screen is the one place a name is set, and it used to end
     * in a page load — so the name it wrote was read by a socket that had
     * not opened yet, and there was nothing to keep in step. It walks in in
     * the page now, and without this everybody in the world goes on seeing
     * the name we arrived under, which for a visitor is `Guest`.
     *
     * A re-join is the whole of it, as it is for a new look: the server
     * takes a join naming the room we are already in as a change of what we
     * look like and are called, rather than as a second arrival.
     */
    let called = loadPlayerName();
    const unsubProfile = subscribeToProfile(() => {
      const now = loadPlayerName();
      if (now === called) return;
      called = now;
      if (joinedRef.current && latestRef.current) join(latestRef.current);
    });

    // A new look goes out with a fresh join, so everyone sees it at once
    // rather than on the next walk through a door.
    // The event carries the key: the choice is remembered a moment later.
    const unsubLook = gameEvents.on("player-sprite-chosen", (spriteKey) => {
      if (joinedRef.current && latestRef.current) join(latestRef.current, spriteKey);
    });

    return () => {
      if (trailing) clearTimeout(trailing);
      unsubOpen();
      unsubProfile();
      unsubBoarded();
      unsubLook();
      unsubPlace();
      unsubMessage();
      unsubscribeMove();
      joinedRef.current = false;
      release();
    };
  }, []);
}
