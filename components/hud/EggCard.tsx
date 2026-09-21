"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  EGG_KINDS,
  eggKind,
  isEggTier,
  oneIn,
  shareOf,
  type EggTally,
  type EggTier,
} from "@/lib/world/eggs";
import { basketOf, useEggTallies, useSelfPerson } from "@/lib/eggs-client";
import { castMember } from "@/lib/world/cast";
import { isGuestHolder } from "@/lib/badges";
import { gameEvents } from "@/lib/events";
import EggMark from "./EggMark";

/**
 * One kind of egg, at the size it deserves.
 *
 * A row in the Eggs panel is a picture the width of a badge's emoji and a
 * phrase beside it, which is the right shape for a list and the wrong shape
 * for the thing the list is about: half the point of the ladder is that the
 * bottom of it is worth crossing the park for, and an egg nobody has ever
 * seen bigger than thirteen pixels is not worth crossing anything for. So a
 * row opens this, the way a name in the People panel opens a profile — and
 * deliberately built like one, because it answers the same three questions:
 * what it looks like, what is known about it, and who has one.
 *
 * **It is two columns, and that is what keeps it off a scrollbar.** The
 * egg wants the height its plinth gives it and the words want a measure to
 * be read across; stacked, the two of them are taller than a laptop and
 * the card came up with a scroll bar down the side of it — a window you
 * have to scroll to see the bottom of is a list again, which is the thing
 * this exists instead of. So the plinth is a rail down the left and
 * everything that is words is beside it, and the whole card fits.
 *
 * Mounted in `app/page.tsx` rather than in the HUD for the same reason
 * `Profile` is: `.app-hud` sits at z-index 20 and the column at 30, so a
 * window mounted in the HUD is behind the column whatever z-index it asks
 * for — and this is opened *from* the column.
 */

function Holders({ tallies, onPick }: { tallies: readonly EggTally[]; onPick: () => void }) {
  if (tallies.length === 0) {
    return (
      <p className="entry-card__none">
        Nobody in this world has found one. Go and startle the chicken.
      </p>
    );
  }
  return (
    <div className="badges__holders">
      {tallies.map((tally) => (
        <button
          key={tally.person}
          type="button"
          className="badges__holder"
          onClick={() => {
            // This one shuts on the way: a profile is the same kind of
            // window over the same whole app, and two of them stacked is a
            // card behind a card with no way of telling which is which.
            onPick();
            gameEvents.emit("open-profile", tally.person);
          }}
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

export default function EggCard() {
  const [tier, setTier] = useState<EggTier | null>(null);
  const all = useEggTallies();
  const me = useSelfPerson();

  useEffect(() => gameEvents.on("open-egg", (next) => setTier(isEggTier(next) ? next : null)), []);

  const close = useCallback(() => setTier(null), []);

  useEffect(() => {
    if (!tier) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tier, close]);

  const holders = useMemo(
    () =>
      all
        .filter((t) => t.tier === tier)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [all, tier],
  );
  const mine = useMemo(
    () => basketOf(all, me).find((t) => t.tier === tier)?.count ?? 0,
    [all, me, tier],
  );

  const kind = tier ? eggKind(tier) : undefined;
  if (!kind) return null;

  const at = EGG_KINDS.indexOf(kind) + 1;
  const found = holders.reduce((sum, t) => sum + t.count, 0);
  // The ladder either side of this rung, so the card is a place in a
  // collection rather than an isolated fact. Pressing one is how you walk
  // along it without going back to the list each time.
  const others = EGG_KINDS.filter((other) => other.id !== kind.id);

  return (
    <div className="entry-card" role="dialog" aria-label={kind.name}>
      <div className="entry-card__scrim" onClick={close} />
      <div className="pixel-panel entry-card__panel">
        <button type="button" className="profile__close" onClick={close} aria-label="Close">
          <X size={14} />
        </button>

        {/* The egg itself, on the one dark field in the app that is nothing
            but a backdrop for it — the same job the concept sheet does at
            the top of a profile. */}
        <div className="entry-card__plinth">
          <div className="entry-card__object">
            <EggMark kind={kind} size={196} />
          </div>
        </div>

        <div className="entry-card__body">
          <div className="entry-card__head">
            <div className="entry-card__name">{kind.name}</div>
            <div className="entry-card__chips">
              <span className="entry-card__chip entry-card__chip--key">1 in {oneIn(kind.id)}</span>
              <span className="entry-card__chip">
                {at} of {EGG_KINDS.length} on the ladder
              </span>
              <span className="entry-card__chip">
                {/* The share to a whole number of per cent, which is the only
                    precision anybody wants of it. */}
                {Math.round(shareOf(kind.id) * 100)}% of every egg laid
              </span>
            </div>
          </div>

          <p className="entry-card__note">{kind.note}.</p>
          <p className="entry-card__lore">{kind.lore}</p>

          <div className="entry-card__yours">
            {mine === 0
              ? "None in your basket."
              : `${mine} in your basket${mine > 1 ? " — you have a small pile" : ""}.`}
            <span className="entry-card__world">
              {found === 0 ? "none found anywhere" : `${found} found in this world`}
            </span>
          </div>

          <div className="entry-card__shelf">
            <div className="profile__shelf-name">Who has one</div>
            <Holders tallies={holders} onPick={close} />
          </div>

          <div className="entry-card__shelf">
            <div className="profile__shelf-name">The rest of the ladder</div>
            <div className="entry-card__row">
              {others.map((other) => (
                <button
                  key={other.id}
                  type="button"
                  className="entry-card__rung"
                  onClick={() => setTier(other.id)}
                  title={`${other.name} — 1 in ${oneIn(other.id)}`}
                >
                  <EggMark kind={other} size={30} />
                  <span className="entry-card__rung-note">1 in {oneIn(other.id)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
