"use client";

import { useEffect, type Dispatch, type MutableRefObject } from "react";
import type { Action } from "../reducer";
import type { ChatMessage, SeatState } from "@/types/game";
import type { PersistedSeatConfig } from "../persistence";
import { acquireRoomSocket, onRoomMessage } from "../room-socket";
import { gameEvents } from "../events";
import { markKnown } from "../room-sync";

export interface WorldSyncRefs {
  dispatch: MutableRefObject<Dispatch<Action>>;
  /** Seat configs as this client last built them, for merging remote edits. */
  seatConfigs: MutableRefObject<PersistedSeatConfig[]>;
  seats: MutableRefObject<SeatState[]>;
}

/**
 * Applies world changes made by other people in the room.
 *
 * Everything arriving here was already persisted by the server, so this only
 * has to reflect it locally — and it does so with the received object itself,
 * which is what keeps the change from being echoed straight back.
 */
export function useWorldSync(refs: WorldSyncRefs) {
  useEffect(() => {
    const release = acquireRoomSocket();

    const unsubscribe = onRoomMessage((message) => {
      if (message.type === "achievement") {
        gameEvents.emit("achievement-earned", {
          code: message.code,
          subjectType: message.subjectType,
          subjectId: message.subjectId,
          subjectName: message.subjectName,
          title: message.title,
          description: message.description,
          icon: message.icon,
        });
        return;
      }

      if (message.type === "said") {
        // The server has already kept the remark, so it is known here before
        // it lands in the state — or the sync would send it back out as a
        // change of ours, and everyone would see it twice.
        const said: ChatMessage = {
          id: message.id,
          content: message.text,
          actorName: message.from.name,
          authorId: message.from.id,
          timestamp: message.at,
        };
        markKnown(`message:${said.id}`, said);
        refs.dispatch.current({ type: "UPSERT_CHAT", message: said });
        gameEvents.emit("player-said", message.from.id, message.text);
        return;
      }

      if (message.type !== "world") return;
      const { change } = message;

      switch (change.entity) {
        case "message": {
          const chatMessage = change.message as unknown as ChatMessage;
          if (!chatMessage?.id) return;
          markKnown(`message:${chatMessage.id}`, chatMessage);
          refs.dispatch.current({ type: "UPSERT_CHAT", message: chatMessage });
          break;
        }
        case "seat": {
          const seat = change.seat as unknown as PersistedSeatConfig;
          if (!seat?.seatId) return;
          markKnown(`seat:${seat.seatId}`, seat);
          refs.dispatch.current({
            type: "UPDATE_SEAT_CONFIG",
            seatId: seat.seatId,
            patch: {
              label: seat.label,
              roleTitle: seat.roleTitle,
              assigned: seat.assigned,
              spriteKey: seat.spriteKey,
              spritePath: seat.spritePath,
            } as Partial<SeatState>,
          });
          break;
        }
      }
    });

    return () => {
      unsubscribe();
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
