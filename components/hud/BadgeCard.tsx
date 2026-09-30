"use client";

import { useMemo } from "react";
import { BADGES, BADGE_GROUPS, badgeFor, badgesIn, isGuestHolder } from "@/lib/badges";
import { useBadges } from "@/lib/badges-client";
import { useSelfPerson } from "@/lib/eggs-client";
import { useBusWindow } from "@/lib/hooks/useBusWindow";
import CardWindow from "./CardWindow";
import Holders, { shortDate } from "./Holders";

/**
 * One badge, at the size it deserves.
 *
 * The catalogue was readable in two places and openable in neither: a row
 * in the Badges panel, and a chip on somebody's profile, each carrying the
 * whole of what it knows in a `title` — which is a tooltip, which is
 * nothing at all on a touchscreen and nothing at all while you are
 * playing. So the one question the badges could not answer was the first
 * one anybody asks of them: *what is that, and what do I do to get it?*
 *
 * Three things open it, and the third is most of why it exists: a row in
 * the panel, a chip on a profile, and **the toast over the office**. A
 * badge announces itself for six seconds in the middle of a game and then
 * goes, and until now that was the whole of what anybody was ever told.
 *
 * Built on the egg card, which is built on the profile — the same window,
 * the same two columns, the same rail down the left, because all three
 * answer the same three questions: what it is, what is known about it, and
 * who has one. The rules are shared (`.entry-card` in hud.css) rather than
 * copied, so they cannot drift apart.
 *
 * Mounted in `app/page.tsx` and not in `GameHud`, for the reason the other
 * two are: `.app-hud` sits at z-index 20 and the column at 30, so a window
 * mounted in the HUD is behind the column whatever z-index it asks for —
 * and two of the three ways in here are in the column.
 */

/** A badge in the catalogue, or nothing: a stale code opens no card. */
const badgeIn = (next: string | null) => (next && badgeFor(next) ? next : null);

export default function BadgeCard() {
  const { value: code, show: setCode, close } = useBusWindow("open-badge", badgeIn);
  const all = useBadges();
  const me = useSelfPerson();

  /** Who holds this one, oldest first — which is who got there first. */
  const holders = useMemo(
    () =>
      all.filter((item) => item.code === code).sort((a, b) => a.earnedAt.localeCompare(b.earnedAt)),
    [all, code],
  );
  /** Everything this browser's own person holds, for the marks below. */
  const mine = useMemo(
    () => new Set(all.filter((item) => item.person === me).map((item) => item.code)),
    [all, me],
  );

  // The directions below still show for a guest: they are the world's, and
  // they are how somebody learns what a code of their own would be for.
  const guest = !!me && isGuestHolder(me);

  const badge = code ? badgeFor(code) : undefined;
  if (!badge) return null;

  const group = BADGE_GROUPS.find((one) => one.id === badge.group);
  const got = holders.find((item) => item.person === me) ?? null;
  const at = BADGES.indexOf(badge) + 1;
  // The rest of its group, so a card is a place in a catalogue rather than
  // an isolated fact, and so somebody can read along it without going back
  // to the column between each one. Its group rather than all of them: a
  // row of thirty-one icons is the list again.
  const others = badgesIn(badge.group).filter((other) => other.code !== badge.code);

  return (
    <CardWindow kind="entry-card" label={badge.title} onClose={close}>
      {/* The icon, on the one dark field in the app that is nothing but a
            backdrop for a single thing — the job the concept sheet does at
            the top of a profile and the plinth does under an egg. Grey
            until it is yours, which is the distinction the column draws. */}
      <div className="entry-card__plinth">
        <div
          className={`entry-card__emblem${got ? "" : " entry-card__emblem--locked"}`}
          aria-hidden="true"
        >
          {badge.icon}
        </div>
      </div>

      <div className="entry-card__body">
        <div className="entry-card__head">
          <div className="entry-card__name">{badge.title}</div>
          <div className="entry-card__chips">
            <span
              className={`entry-card__chip ${
                got ? "entry-card__chip--got" : "entry-card__chip--key"
              }`}
            >
              {got
                ? `Earned ${shortDate(got.earnedAt)}`
                : guest
                  ? "Guests keep none"
                  : "Not yet earned"}
            </span>
            {group && <span className="entry-card__chip">{group.title}</span>}
            <span className="entry-card__chip">
              {at} of {BADGES.length} in the catalogue
            </span>
          </div>
        </div>

        <p className="entry-card__note">{badge.description}.</p>

        {/*
            What to go and do — and only for somebody who has not got it.
            An earned badge is a memory, and nobody needs directions to
            somewhere they have already been.
          */}
        {got ? (
          <p className="entry-card__lore">
            You have this one, and it stays on your profile wherever you are standing.
          </p>
        ) : (
          <p className="entry-card__hint">
            <span className="entry-card__hint-name">How</span>
            <span>{badge.hint}</span>
          </p>
        )}

        <div className="entry-card__shelf">
          <div className="profile__shelf-name">
            Who has it
            {holders.length > 0 && <span className="profile__tally">{holders.length}</span>}
          </div>
          <Holders
            holders={holders.map((b) => ({
              person: b.person,
              name: b.name,
              note: shortDate(b.earnedAt),
            }))}
            onPick={close}
            empty={
              <p className="entry-card__none">
                Nobody in this world has it yet. Somebody has to be first at everything.
              </p>
            }
          />
        </div>

        <div className="entry-card__shelf">
          <div className="profile__shelf-name">{group?.title ?? "The rest"}</div>
          <div className="entry-card__row">
            {others.map((other) => (
              <button
                key={other.code}
                type="button"
                className={`entry-card__rung${
                  mine.has(other.code) ? "" : " entry-card__rung--locked"
                }`}
                onClick={() => setCode(other.code)}
                title={`${other.title} — ${other.description}`}
              >
                <span aria-hidden="true">{other.icon}</span>
                <span className="entry-card__rung-note">{other.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </CardWindow>
  );
}
