"use client";

import { useSyncExternalStore } from "react";
import { isRoomSocketOpen, onRoomMessage, onRoomOpen } from "./room-socket";
import { createLogger } from "./logger";
import type { ServerMessage } from "./presence-types";

const log = createLogger("SocketStore");

/**
 * A snapshot of something the room socket keeps saying, with subscribers.
 *
 * Four modules held one of these by hand — who is online, the meetings, the
 * badges and the baskets of eggs — each with its own listener set, its own
 * flag for having started listening and, for the two with a catch-up read
 * behind them, its own flag for having started that. The last is where the
 * copies had gone wrong together: a read that failed left the flag set, so
 * nothing ever asked again, and nothing asked again after the socket had
 * dropped and come back either, which is exactly when a message or two will
 * have gone past unheard.
 *
 * A component reads one through `useSocketStore`; the game layer, which
 * holds no React, through `get` and `subscribe`.
 */

export interface SocketStoreOptions<T> {
  initial: T;
  /** What a message does to the state: the same state back for one it ignores. */
  reduce: (state: T, message: ServerMessage) => T;
  /**
   * The catch-up read, for state the socket only ever sends changes to.
   *
   * Asked for by the first subscriber, by the next one after a read that
   * failed, and after every reconnect. It resolves to how to fold the
   * answer into whatever the socket said while it was in flight, since the
   * two overlap and the socket's is the newer.
   */
  load?: () => Promise<(state: T) => T>;
  /** Named in the log when the read fails. */
  name?: string;
}

export interface SocketStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
  /** Test seam: back to the start, as if nothing had been said. */
  reset(): void;
}

export function createSocketStore<T>({
  initial,
  reduce,
  load,
  name = "state",
}: SocketStoreOptions<T>): SocketStore<T> {
  let state = initial;
  let loaded = false;
  let fetching = false;
  let listening = false;
  /** Whether the socket has opened while we were listening — so the next open is a reconnect. */
  let hadOpened = false;
  const listeners = new Set<() => void>();

  const set = (next: T) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  const read = async () => {
    if (!load || fetching) return;
    fetching = true;
    try {
      const fold = await load();
      set(fold(state));
      loaded = true;
    } catch (err) {
      // Left unloaded, so whoever subscribes next asks again.
      log.warn(`could not read the ${name}:`, (err as Error).message);
    } finally {
      fetching = false;
    }
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    hadOpened = isRoomSocketOpen();
    onRoomMessage((message) => set(reduce(state, message)));
    onRoomOpen(() => {
      // Back after a drop: whatever went past meanwhile is in the answer.
      if (hadOpened) void read();
      hadOpened = true;
    });
  };

  return {
    get: () => state,
    subscribe(listener) {
      listen();
      if (!loaded) void read();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      state = initial;
      loaded = false;
      fetching = false;
      listeners.clear();
    },
  };
}

/**
 * Read a store from a component, or one part of it.
 *
 * `select` must hand back something already in the state rather than
 * something built from it, or every render is a change.
 */
export function useSocketStore<T, S>(
  store: SocketStore<T>,
  select: (state: T) => S,
  /** What the server renders, which has no socket. */
  server: S,
): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => server,
  );
}
