/**
 * Studio state reducer — pure function, no side effects.
 *
 * All state shape definitions and the reducer live here.
 * The provider (store.ts) wires this to React context.
 */

import type { SeatState, ChatMessage, StudioSnapshot } from "@/types/game";
import { MAX_CHAT } from "./constants";
import { WORKER_SPRITES } from "@/components/game/config/animations";
import type { SeatDef as DiscoveredSeat } from "@/components/game/utils/MapHelpers";
import type { PersistedSeatConfig } from "./persistence";

// ── Helpers ────────────────────────────────────────────

let _chatSeq = 0;
export function chatId(): string {
  return `chat_${Date.now()}_${++_chatSeq}`;
}

export function mergeDiscoveredSeats(
  discovered: DiscoveredSeat[],
  storedConfigs: PersistedSeatConfig[],
  currentSeats: SeatState[],
): SeatState[] {
  const storedById = new Map(storedConfigs.map((seat) => [seat.seatId, seat]));
  const currentById = new Map(currentSeats.map((seat) => [seat.seatId, seat]));

  return discovered.map((seat, index) => {
    const stored = storedById.get(seat.seatId) ?? currentById.get(seat.seatId);
    const fallback = WORKER_SPRITES[index];

    const assigned = stored?.assigned ?? Boolean(fallback);
    const spriteKey = stored?.spriteKey ?? fallback?.key;
    const spritePath = stored?.spritePath ?? fallback?.path;
    const label = stored?.label ?? fallback?.label ?? `Seat ${index + 1}`;
    const roleTitle = stored?.roleTitle ?? (assigned ? "Worker" : undefined);

    return {
      seatId: seat.seatId,
      label,
      roleTitle,
      assigned,
      spriteKey: assigned ? spriteKey : undefined,
      spritePath: assigned ? spritePath : undefined,
      spawnX: seat.x,
      spawnY: seat.y,
      spawnFacing: seat.facing,
    };
  });
}

// ── Actions ────────────────────────────────────────────

export type Action =
  /** Apply a remark from another player, without duplicating it. */
  | { type: "UPSERT_CHAT"; message: ChatMessage }
  | { type: "SYNC_SEATS"; seats: SeatState[] }
  | { type: "UPDATE_SEAT_CONFIG"; seatId: string; patch: Partial<SeatState> }
  | { type: "RESTORE"; chatMessages: ChatMessage[] };

// ── Initial state ──────────────────────────────────────

export const initialState: StudioSnapshot = {
  seats: [],
  chatMessages: [],
};

// ── Reducer ────────────────────────────────────────────

export function reducer(state: StudioSnapshot, action: Action): StudioSnapshot {
  switch (action.type) {
    case "UPSERT_CHAT": {
      const index = state.chatMessages.findIndex((message) => message.id === action.message.id);
      if (index === -1) {
        return {
          ...state,
          chatMessages: [...state.chatMessages, action.message].slice(-MAX_CHAT),
        };
      }
      const chatMessages = [...state.chatMessages];
      chatMessages[index] = action.message;
      return { ...state, chatMessages };
    }

    case "SYNC_SEATS":
      return { ...state, seats: action.seats };

    case "UPDATE_SEAT_CONFIG":
      return {
        ...state,
        seats: state.seats.map((seat) => {
          if (seat.seatId !== action.seatId) return seat;
          const next = { ...seat, ...action.patch };
          if (!next.assigned) {
            next.label = seat.label;
            next.roleTitle = undefined;
            next.spriteKey = undefined;
            next.spritePath = undefined;
          }
          return next;
        }),
      };

    case "RESTORE":
      return { ...state, chatMessages: action.chatMessages.slice(-MAX_CHAT) };

    default:
      return state;
  }
}
