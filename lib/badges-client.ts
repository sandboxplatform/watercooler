"use client";

import { useEffect, useSyncExternalStore } from "react";
import { onRoomMessage } from "./room-socket";
import { createLogger } from "./logger";
import type { EarnedBadge } from "./badges";

/**
 * Every badge anybody holds, in the browser.
 *
 * One store for the whole HUD rather than a fetch per panel, because three
 * things want the same list and they come and go independently: the Badges
 * tab, the People tab's count beside each name, and the profile window.
 * Fetched once when the first of them mounts and kept current off the
 * socket, which announces every badge to everybody for exactly this reason.
 *
 * The same shape as the module beside it, `presence-online`, and for the
 * same reason: a plain snapshot with subscribers, so a component reads it
 * through `useSyncExternalStore` and nothing has to be a provider.
 */

const log = createLogger("Badges");

let badges: EarnedBadge[] = [];
let loaded = false;
let fetching = false;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function listen() {
  onRoomMessage((message) => {
    if (message.type !== "badge") return;
    if (badges.some((b) => b.code === message.code && b.person === message.person)) return;
    badges = [
      ...badges,
      { person: message.person, name: message.name, code: message.code, earnedAt: message.at },
    ];
    changed();
  });
}

async function load() {
  if (fetching) return;
  fetching = true;
  listen();
  try {
    const response = await fetch("/api/badges");
    const body = (await response.json()) as { badges?: EarnedBadge[] };
    // Anything that arrived over the socket while this was in flight is
    // already in the list, and the server's answer may predate it.
    const known = new Set(badges.map((b) => `${b.person}:${b.code}`));
    badges = [...(body.badges ?? []), ...badges.filter((b) => known.has(`${b.person}:${b.code}`))];
    const seen = new Set<string>();
    badges = badges.filter((b) => {
      const key = `${b.person}:${b.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    log.warn("could not read the badges:", (err as Error).message);
  } finally {
    loaded = true;
    changed();
  }
}

export function allBadges(): EarnedBadge[] {
  return badges;
}

export function badgesLoaded(): boolean {
  return loaded;
}

function subscribe(listener: () => void): () => void {
  void load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const NONE: EarnedBadge[] = [];

/** Every badge anybody holds, kept current. */
export function useBadges(): EarnedBadge[] {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, allBadges, () => NONE);
}

/** One person's, newest first — the order a shelf reads in. */
export function badgesOf(all: readonly EarnedBadge[], person: string): EarnedBadge[] {
  return all
    .filter((b) => b.person === person)
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}
