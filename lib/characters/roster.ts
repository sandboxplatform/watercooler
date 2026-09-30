"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RosterCharacter } from "./library";

/**
 * The character list, fetched once for the whole page.
 *
 * The welcome screen and the picker both read it, and each used to fetch it
 * for itself on mount — two requests for one list on every load, and the
 * welcome's made even when it was never going to be drawn. So the list is
 * held here and shared: the first reader to ask starts the one request,
 * anybody asking while it is in flight waits on the same one, and
 * `refreshRoster` is for the picker, which wants a fresh read each time it
 * opens in case a character has been uploaded since.
 *
 * Two lists come back: `characters` is the whole roster and `wearable` what
 * the person at the keyboard may put on. They are the same for a visitor and
 * differ for anybody whose own code names their sheet — see `looksFor`.
 */

export interface Roster {
  characters: RosterCharacter[];
  wearable: RosterCharacter[];
  error: string | null;
}

const EMPTY: Roster = { characters: [], wearable: [], error: null };

let roster: Roster = EMPTY;
let loaded = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<void> {
  try {
    const res = await fetch("/api/characters");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      characters?: RosterCharacter[];
      wearable?: RosterCharacter[];
    };
    // An older answer carries no `wearable`; the roster it did carry is
    // already filtered to what this person may be shown.
    const characters = body.characters ?? [];
    roster = { characters, wearable: body.wearable ?? characters, error: null };
    loaded = true;
  } catch (err) {
    // Kept apart from `loaded`, so the next reader to ask tries again.
    roster = { ...roster, error: (err as Error).message };
  } finally {
    inFlight = null;
    for (const listener of listeners) listener();
  }
}

/** Read the list afresh, sharing a read already under way. */
export function refreshRoster(): Promise<void> {
  inFlight ??= read();
  return inFlight;
}

/** Read the list if nothing has yet. */
function ensureRoster(): void {
  if (!loaded) void refreshRoster();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => roster;
const serverSnapshot = () => EMPTY;

/**
 * The list, and a way to read it again.
 *
 * `wanted` is whether this reader needs it at all: false subscribes to what
 * is known without starting a request, which is how the welcome screen
 * stays quiet for somebody it is never going to be shown to.
 */
export function useCharacterRoster(wanted = true) {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (wanted) ensureRoster();
  }, [wanted]);
  return { ...current, refresh: refreshRoster };
}

/** Test seam: forget the list between cases. */
export function resetRoster(): void {
  roster = EMPTY;
  loaded = false;
  inFlight = null;
  listeners.clear();
}
