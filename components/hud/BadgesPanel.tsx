"use client";

import { useMemo } from "react";
import { BADGES, BADGE_GROUPS, badgeFor, isGuestHolder } from "@/lib/badges";
import { useBadges } from "@/lib/badges-client";
import { castMember } from "@/lib/world/cast";
import { gameEvents } from "@/lib/events";
import type { EarnedBadge } from "@/lib/badges";

/**
 * The world's trophy cabinet.
 *
 * The whole catalogue, in its groups, with who holds each one beside it.
 * Not "what has been won here" — the old panel counted a room's badges, so
 * riding one floor up showed a different and smaller wall — and not a feed
 * of recent wins either: the useful question a list of badges answers is
 * *what is there to go and do*, and a feed answers it only by accident.
 *
 * So every badge is listed whether or not anybody has it, and the names
 * under it are the ones who have. A badge nobody holds is the interesting
 * row on the page.
 *
 * **A row opens the badge**, the way a row in the Eggs panel opens an egg
 * and a name in People opens a profile. A list row has space for a title
 * and a line, and the line it carries is the past tense — what somebody
 * did. What to go and do is in `BadgeCard`, with who got there first, and
 * until that existed the whole of it was a `title` attribute, which is a
 * tooltip and so is nothing at all on a handset.
 *
 * The holders stay pressable and still open a profile: they are buttons
 * inside the row rather than part of it, so the two do not fight.
 */

function when(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The holders of one badge, newest first, as names you can press. */
function Holders({ earned }: { earned: EarnedBadge[] }) {
  if (earned.length === 0) return null;
  return (
    <div className="badges__holders">
      {earned.map((item) => (
        <button
          key={item.person}
          type="button"
          className="badges__holder"
          onClick={() => gameEvents.emit("open-profile", item.person)}
          title={`${castMember(item.person)?.name ?? item.name} — ${when(item.earnedAt)}`}
        >
          {castMember(item.person)?.name ?? item.name}
          {/* A guest is a name somebody typed rather than somebody the world
              knows, and two of them may be the same name. Marked so a shelf
              of them does not read as the cast. */}
          {isGuestHolder(item.person) && <span className="badges__guest">guest</span>}
        </button>
      ))}
    </div>
  );
}

export default function BadgesPanel() {
  const all = useBadges();

  const byCode = useMemo(() => {
    const map = new Map<string, EarnedBadge[]>();
    for (const item of all) {
      if (!badgeFor(item.code)) continue;
      const list = map.get(item.code) ?? [];
      list.push(item);
      map.set(item.code, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    return map;
  }, [all]);

  const claimed = [...byCode.keys()].length;

  return (
    <div className="app-sidebar__scroll badges">
      <div className="badges__count">
        {claimed} of {BADGES.length} found in this world
      </div>

      {BADGE_GROUPS.map((group) => {
        const inGroup = BADGES.filter((badge) => badge.group === group.id);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.id} className="badges__group">
            <div className="badges__group-name">{group.title}</div>
            {inGroup.map((badge) => {
              const earned = byCode.get(badge.code) ?? [];
              return (
                <div
                  key={badge.code}
                  className={`badges__row${earned.length === 0 ? " badges__row--locked" : ""}`}
                >
                  <span className="badges__icon">{badge.icon}</span>
                  <div className="badges__body">
                    <button
                      type="button"
                      className="badges__open"
                      onClick={() => gameEvents.emit("open-badge", badge.code)}
                    >
                      <span className="badges__title">{badge.title}</span>
                      <span className="badges__detail">{badge.description}</span>
                    </button>
                    <Holders earned={earned} />
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
