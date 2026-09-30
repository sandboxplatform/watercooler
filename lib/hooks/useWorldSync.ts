"use client";

import { useEffect } from "react";
import { acquireRoomSocket, onRoomMessage } from "../room-socket";
import { gameEvents } from "../events";

/**
 * Passes on what the room says that the game and the HUD both draw.
 *
 * A badge and a remark arrive on the socket and are put on the bus, where
 * the toast and the scene each pick up the half they want. Nothing is kept:
 * both belong to the moment they are said.
 */
export function useWorldSync() {
  useEffect(() => {
    const release = acquireRoomSocket();

    const unsubscribe = onRoomMessage((message) => {
      if (message.type === "badge") {
        // Everything a badge is — its title, what it is for, its icon — is
        // in the catalogue on both sides, so the wire carries only who,
        // which, where and when. The HUD looks the rest up.
        gameEvents.emit("badge-earned", {
          code: message.code,
          person: message.person,
          name: message.name,
          room: message.room,
        });
        return;
      }

      if (message.type === "said") {
        // A bubble over somebody's head for a few seconds and then gone.
        // Residents are the only ones who speak now, and what they say
        // belongs to the moment they say it.
        gameEvents.emit("player-said", message.from.id, message.text);
      }
    });

    return () => {
      unsubscribe();
      release();
    };
  }, []);
}
