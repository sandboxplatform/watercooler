"use client";

import { useCallback, useEffect, useState } from "react";
import type { RosterCharacter } from "./library";

/**
 * The character list, fetched once per mount.
 *
 * Both pickers — the seat manager for agents, the studio for the person —
 * read from here, so a character uploaded in one is immediately offered in
 * the other. `refresh` is for the studio to call after it makes one.
 *
 * Two lists come back, and which one a picker wants depends on who is being
 * dressed: `characters` is what a seat may wear, `wearable` what the person
 * at the keyboard may. They are the same for a visitor and differ for
 * anybody whose own code names their sheet — see `looksFor`.
 */
export function useCharacterRoster() {
  const [characters, setCharacters] = useState<RosterCharacter[]>([]);
  const [wearable, setWearable] = useState<RosterCharacter[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/characters");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        characters?: RosterCharacter[];
        wearable?: RosterCharacter[];
      };
      setCharacters(body.characters ?? []);
      // An older answer carries no `wearable`; the roster it did carry is
      // already filtered to what this person may be shown.
      setWearable(body.wearable ?? body.characters ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { characters, wearable, error, refresh };
}
