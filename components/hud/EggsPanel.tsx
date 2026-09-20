"use client";

import { useMemo } from "react";
import { EGG_KINDS, basketSize, oneIn, type EggKind, type EggTally } from "@/lib/world/eggs";
import { basketOf, useEggTallies, useSelfPerson } from "@/lib/eggs-client";
import { castMember } from "@/lib/world/cast";
import { isGuestHolder } from "@/lib/badges";
import { gameEvents } from "@/lib/events";
import EggMark from "./EggMark";

/**
 * The world's baskets.
 *
 * Built like the Badges panel next door and for the same reason: the
 * useful question a collection answers is *what is there still to find*,
 * so every rung of the ladder is listed whether or not anybody has one,
 * with how rare it is and who has found it. A kind nobody holds is the
 * interesting row on the page.
 *
 * What it adds over the badges is a basket of your own at the top, which
 * is the one question a shared list cannot answer: a badge you either
 * have or you have not, and an egg you have four of.
 */

function Holders({ tallies }: { tallies: EggTally[] }) {
  if (tallies.length === 0) return null;
  return (
    <div className="badges__holders">
      {tallies.map((tally) => (
        <button
          key={tally.person}
          type="button"
          className="badges__holder"
          onClick={() => gameEvents.emit("open-profile", tally.person)}
          title={`${castMember(tally.person)?.name ?? tally.name} — ${tally.count}`}
        >
          {castMember(tally.person)?.name ?? tally.name}
          {tally.count > 1 && <span className="eggs__many">×{tally.count}</span>}
          {isGuestHolder(tally.person) && <span className="badges__guest">guest</span>}
        </button>
      ))}
    </div>
  );
}

/** Your own, at the top: one slot per rung, filled in as you find them. */
function Basket({ mine }: { mine: EggTally[] }) {
  const held = useMemo(() => new Map(mine.map((t) => [t.tier, t.count])), [mine]);
  const total = basketSize(mine);
  const kinds = held.size;

  return (
    <div className="eggs__basket">
      <div className="badges__count">
        {total === 0
          ? "Nothing in your basket yet"
          : `${total} egg${total === 1 ? "" : "s"}, ${kinds} of ${EGG_KINDS.length} kinds`}
      </div>
      <div className="eggs__slots">
        {EGG_KINDS.map((kind) => {
          const count = held.get(kind.id) ?? 0;
          return (
            <div
              key={kind.id}
              className={`eggs__slot${count === 0 ? " eggs__slot--empty" : ""}`}
              title={count === 0 ? `${kind.name} — not found yet` : `${kind.name} ×${count}`}
            >
              <EggMark kind={kind} dim={count === 0} />
              <span className="eggs__slot-count">{count || "—"}</span>
            </div>
          );
        })}
      </div>
      {/* Where they come from, said once. Nothing else in the HUD says it,
          and an empty basket with no explanation is a panel that reads as
          a bug. */}
      <div className="eggs__how">
        Michael drops one in the grass now and then when somebody startles him. Walk up and press E.
      </div>
    </div>
  );
}

export default function EggsPanel() {
  const all = useEggTallies();
  const me = useSelfPerson();
  const mine = useMemo(() => basketOf(all, me), [all, me]);

  const byTier = useMemo(() => {
    const map = new Map<string, EggTally[]>();
    for (const tally of all) {
      const list = map.get(tally.tier) ?? [];
      list.push(tally);
      map.set(tally.tier, list);
    }
    // The biggest basket first: a list of who has one reads best from
    // whoever has most, and it is stable between renders unlike a tie
    // broken by whatever order the rows came back in.
    for (const list of map.values()) {
      list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
    return map;
  }, [all]);

  return (
    <div className="app-sidebar__scroll eggs">
      <Basket mine={mine} />

      <section className="badges__group">
        <div className="badges__group-name">Every kind there is</div>
        {EGG_KINDS.map((kind: EggKind) => {
          const holders = byTier.get(kind.id) ?? [];
          const found = holders.reduce((sum, t) => sum + t.count, 0);
          return (
            <div
              key={kind.id}
              className={`badges__row${found === 0 ? " badges__row--locked" : ""}`}
            >
              <span className="badges__icon eggs__icon">
                <EggMark kind={kind} dim={found === 0} />
              </span>
              <div className="badges__body">
                <div className="badges__title">
                  {kind.name}
                  {/* Read off the weight rather than written beside it, so
                      a kind made rarer says so here without being edited. */}
                  <span className="eggs__odds">1 in {oneIn(kind.id)}</span>
                </div>
                <div className="badges__detail">{kind.note}</div>
                <Holders tallies={holders} />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
