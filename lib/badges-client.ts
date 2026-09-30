"use client";

import { createSocketStore, useSocketStore } from "./socket-store";
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
 * same reason: a plain snapshot with subscribers (`socket-store`), so a
 * component reads it through a hook and nothing has to be a provider.
 */

const NONE: EarnedBadge[] = [];
const keyOf = (b: EarnedBadge) => `${b.person}:${b.code}`;

const badges = createSocketStore<EarnedBadge[]>({
  name: "badges",
  initial: NONE,
  reduce: (all, message) => {
    if (message.type !== "badge") return all;
    if (all.some((b) => b.code === message.code && b.person === message.person)) return all;
    return [
      ...all,
      { person: message.person, name: message.name, code: message.code, earnedAt: message.at },
    ];
  },
  load: async () => {
    const response = await fetch("/api/badges");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { badges?: EarnedBadge[] };
    // The server's answer first, then anything the socket announced while
    // it was in flight, which the answer may predate — once each.
    return (heard) => {
      const seen = new Set<string>();
      return [...(body.badges ?? []), ...heard].filter((b) => {
        if (seen.has(keyOf(b))) return false;
        seen.add(keyOf(b));
        return true;
      });
    };
  },
});

/** Every badge anybody holds, kept current. */
export function useBadges(): EarnedBadge[] {
  return useSocketStore(badges, (all) => all, NONE);
}

/** One person's, newest first — the order a shelf reads in. */
export function badgesOf(all: readonly EarnedBadge[], person: string): EarnedBadge[] {
  return all
    .filter((b) => b.person === person)
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}
