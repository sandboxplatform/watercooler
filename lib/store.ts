"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import React from "react";
import type { SeatState, StudioSnapshot } from "@/types/game";
import { gameEvents } from "./events";
import { type PersistedSeatConfig } from "./persistence";
import { fetchRoomSnapshot, flushRoomWrites } from "./room-client";
import { watchRoomHistory } from "./room-travel";
import { type Action, reducer, initialState, mergeDiscoveredSeats } from "./reducer";
import { usePresence } from "./hooks/usePresence";
import { useWorldSync } from "./hooks/useWorldSync";
import { primeFromSnapshot, syncSeats } from "./room-sync";

// ── Context ────────────────────────────────────────────

interface StudioContextValue {
  state: StudioSnapshot;
  updateSeatConfig: (seatId: string, patch: Partial<SeatState>) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dispatchRef = useRef<Dispatch<Action>>(dispatch);
  dispatchRef.current = dispatch;
  const seatsRef = useRef<SeatState[]>(state.seats);
  seatsRef.current = state.seats;
  const seatConfigRef = useRef<PersistedSeatConfig[]>([]);

  /** True once the server snapshot has been applied; gates all writes. */
  const hydratedRef = useRef(false);
  /** Last seat layout the scene reported, so hydration can re-merge it. */
  const discoveredSeatsRef = useRef<Parameters<typeof mergeDiscoveredSeats>[0] | null>(null);

  const applySeatMerge = useCallback((discovered: Parameters<typeof mergeDiscoveredSeats>[0]) => {
    const mergedSeats = mergeDiscoveredSeats(discovered, seatConfigRef.current, seatsRef.current);
    dispatchRef.current({ type: "SYNC_SEATS", seats: mergedSeats });
  }, []);

  // Keep this browser's character on the room socket
  usePresence();
  // Apply world changes made by the other people in it
  useWorldSync({
    dispatch: dispatchRef,
    seatConfigs: seatConfigRef,
    seats: seatsRef,
  });

  /**
   * Bumped when the address bar names a different room without a page load.
   *
   * Riding the lift used to reload the client, which is what fetched the
   * new room. Now nothing does unless this says so: every read and write in
   * room-client reads the room off the URL at call time, so the endpoints
   * are already right — it is the world in the store that is the floor
   * below's until it is fetched again.
   */
  const [roomEpoch, setRoomEpoch] = useState(0);
  useEffect(() => {
    const stopWatching = watchRoomHistory();
    const unsub = gameEvents.on("room-changed", () => setRoomEpoch((n) => n + 1));
    return () => {
      stopWatching();
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const snapshot = await fetchRoomSnapshot();
      if (cancelled) return;

      seatConfigRef.current = snapshot.seats;

      // Everything in the snapshot is already in the room; recording it stops
      // the first diff treating the restored world as brand new and shouting
      // all of it back at everyone.
      primeFromSnapshot({ seats: snapshot.seats });

      // Writes are blocked until this point: the save effects run on mount with
      // empty state, and against a server that would erase the room before its
      // contents arrived.
      hydratedRef.current = true;

      // The scene may already have reported its seats while the snapshot was in
      // flight; re-merge so restored names and roles are not lost.
      if (discoveredSeatsRef.current) {
        applySeatMerge(discoveredSeatsRef.current);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      // Anything still queued would otherwise be lost on navigation
      void flushRoomWrites();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomEpoch]);

  // ── Seat sync: merge discovered seats with persisted configs ──
  useEffect(() => {
    const unsub = gameEvents.on("seats-discovered", (discovered) => {
      discoveredSeatsRef.current = discovered;
      applySeatMerge(discovered);
    });
    return unsub;
  }, [applySeatMerge]);

  // ── Share the room's roster with everyone in it ──
  // One change at a time: sending whole collections would let a second player's
  // write erase work this client had not heard about yet.
  useEffect(() => {
    const configs: PersistedSeatConfig[] = state.seats.map((seat) => ({
      seatId: seat.seatId,
      label: seat.label,
      roleTitle: seat.roleTitle,
      assigned: seat.assigned,
      spriteKey: seat.spriteKey,
      spritePath: seat.spritePath,
    }));
    seatConfigRef.current = configs;
    if (hydratedRef.current) syncSeats(configs);
    gameEvents.emit("seat-configs-updated", state.seats);
  }, [state.seats]);

  const updateSeatConfig = useCallback((seatId: string, patch: Partial<SeatState>) => {
    dispatchRef.current({ type: "UPDATE_SEAT_CONFIG", seatId, patch });
  }, []);

  return React.createElement(
    StudioContext.Provider,
    { value: { state, updateSeatConfig } },
    children,
  );
}
