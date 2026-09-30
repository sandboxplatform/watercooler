"use client";

import type { ReactNode } from "react";
import { castMember } from "@/lib/world/cast";
import { gameEvents } from "@/lib/events";

/** "Sep 9": when somebody got something, at the size a chip has room for. */
export function shortDate(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface Holder {
  person: string;
  /** The name they held it under, for somebody the cast does not know. */
  name: string;
  /** What the tooltip adds after the name: when they got it, how many. */
  note: string;
  /** How many, drawn after the name where it is more than one. */
  count?: number;
}

/**
 * Everybody holding one thing — a badge, a kind of egg — as names you can
 * press, each opening that person's profile.
 *
 * Written out four times before this, once in each list and once in each
 * card, and the four had begun to disagree about small things: which name
 * wins, what the tooltip says, whether a count is shown.
 */
export default function Holders({
  holders,
  onPick,
  empty = null,
}: {
  holders: readonly Holder[];
  /**
   * Run before the profile opens. A card passes its own close: a profile is
   * the same kind of window over the same whole app, and two of them stacked
   * is a card behind a card with no way of telling which is which.
   */
  onPick?: () => void;
  /** Said when nobody holds it; nothing at all by default. */
  empty?: ReactNode;
}) {
  if (holders.length === 0) return <>{empty}</>;
  return (
    <div className="badges__holders">
      {holders.map((holder) => {
        const name = castMember(holder.person)?.name ?? holder.name;
        return (
          <button
            key={holder.person}
            type="button"
            className="badges__holder"
            onClick={() => {
              onPick?.();
              gameEvents.emit("open-profile", holder.person);
            }}
            title={`${name} — ${holder.note}`}
          >
            {name}
            {holder.count !== undefined && holder.count > 1 && (
              <span className="eggs__many">×{holder.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
