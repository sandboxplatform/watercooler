"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { BADGES, BADGE_GROUPS, badgeFor, isGuestHolder } from "@/lib/badges";
import { badgesOf, useBadges } from "@/lib/badges-client";
import { basketOf, useEggTallies } from "@/lib/eggs-client";
import { EGG_KINDS, basketSize } from "@/lib/world/eggs";
import { castMember, type CastMember } from "@/lib/world/cast";
import { useOnline, useLocals } from "@/lib/presence-online";
import { organisationFor } from "@/lib/world/tenants";
import { describeRoom } from "@/lib/world/places";
import { sheetPathFor } from "@/lib/characters/library";
import { SPRITE_PATH } from "@/components/game/config/animations";
import CharacterPortrait from "./CharacterPortrait";
import EggMark from "./EggMark";
import { gameEvents } from "@/lib/events";
import { asset } from "@/lib/assets";

/**
 * Somebody's profile: their face, who they are, and what they have done.
 *
 * It leads with the **concept sheet** — the 1536x1024 picture in
 * `public/characters/examples` of the 8-bit sprite beside a painted
 * portrait — because that is the one image in this app that is a person
 * rather than a tile, and the 48x48 the world draws them at is a thumbnail
 * of it by comparison. A card with a sprite at the top would be a list row
 * with more room.
 *
 * Opened off the bus (`open-profile`) rather than by a prop, because the
 * two ends are in different trees: the rows that open it are in the column
 * beside the office, and the window is over the office. Neither is the
 * other's parent, and the bus is what this app uses for exactly that.
 *
 * Somebody with no cast entry still gets one — a visitor is a name, a look
 * and whatever they have earned, which is a real profile and worth showing.
 * What they do not get is a backstory and a picture, because nobody has
 * drawn them one.
 */

/** What is known about whoever is being looked at, from wherever it comes. */
interface Subject {
  person: string;
  name: string;
  spriteKey: string;
  member: CastMember | null;
  /** The room they are standing in, or null when they are not in the world. */
  room: string | null;
  mic: boolean;
}

function useSubject(person: string | null): Subject | null {
  const online = useOnline();
  const locals = useLocals();

  return useMemo(() => {
    if (!person) return null;
    const member = castMember(person);
    const here = [...online, ...locals].find((p) => p.person === person) ?? null;
    return {
      person,
      // Where they are now beats the roster on the name — somebody may have
      // changed it this session — and the roster beats nothing at all.
      name: here?.name ?? member?.name ?? person.replace(/^guest:/, "") ?? "Someone",
      spriteKey: here?.spriteKey ?? member?.spriteKey ?? "",
      member,
      room: here?.room ?? null,
      mic: here?.mic === true,
    };
  }, [person, online, locals]);
}

export default function Profile() {
  const [person, setPerson] = useState<string | null>(null);
  const subject = useSubject(person);
  const all = useBadges();

  useEffect(() => gameEvents.on("open-profile", setPerson), []);

  const close = useCallback(() => setPerson(null), []);

  /**
   * Hands over to the badge rather than stacking on top of it, which is
   * the arrangement the eggs below are already under. It earns its keep
   * most on the locked half of the shelf: that is a wall of grey icons
   * with a `title` apiece, and the card is where "still out there" turns
   * into somewhere to go.
   */
  const openBadge = useCallback(
    (code: string) => {
      close();
      gameEvents.emit("open-badge", code);
    },
    [close],
  );

  useEffect(() => {
    if (!person) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [person, close]);

  const earned = useMemo(() => (person ? badgesOf(all, person) : []), [all, person]);
  const tallies = useEggTallies();
  const basket = useMemo(() => basketOf(tallies, person), [tallies, person]);
  const earnedCodes = useMemo(() => new Set(earned.map((b) => b.code)), [earned]);

  if (!subject) return null;

  const { member } = subject;
  const org = organisationFor(member?.org);
  const resident = member?.kind === "resident";
  const guest = isGuestHolder(subject.person);

  return (
    <div className="profile" role="dialog" aria-label={`${subject.name}'s profile`}>
      {/* The backdrop closes it, like every other window over the office. */}
      <div className="profile__scrim" onClick={close} />
      <div className="pixel-panel profile__card">
        <button type="button" className="profile__close" onClick={close} aria-label="Close">
          <X size={14} />
        </button>

        {/*
          The concept sheet, full bleed across the top. It is drawn on black
          and the panel is dark, so it needs no frame — the picture is the
          header. Somebody with no sheet gets the band without it rather
          than a broken image: a visitor is a real person in this world and
          simply has not been painted.
        */}
        {member?.art ? (
          <div className="profile__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset(member.art)} alt={`Concept art of ${member.name}`} />
          </div>
        ) : (
          <div className="profile__art profile__art--none">
            <span>No concept art — nobody has drawn them yet</span>
          </div>
        )}

        <div className="profile__head">
          <CharacterPortrait
            spritePath={sheetPathFor(subject.spriteKey) ?? SPRITE_PATH}
            name={subject.name}
            large
          />
          <div className="profile__who">
            <div className="profile__name">{subject.name}</div>
            <div className="profile__role">
              {member?.role ?? (guest ? "Visitor" : "In the world")}
              {org && <span className="profile__org">{org.name}</span>}
            </div>
            <div className="profile__chips">
              {resident && (
                <span
                  className="profile__chip profile__chip--local"
                  title="A character the server walks about"
                >
                  Resident
                </span>
              )}
              {guest && (
                <span className="profile__chip" title="Came in on the shared code">
                  Guest
                </span>
              )}
              {subject.room ? (
                <span className="profile__chip profile__chip--here">
                  {describeRoom(subject.room).label}
                </span>
              ) : (
                <span className="profile__chip profile__chip--away">Not in the world</span>
              )}
              {subject.mic && <span className="profile__chip profile__chip--mic">Global Chat</span>}
            </div>
          </div>
        </div>

        {member?.backstory && <p className="profile__story">{member.backstory}</p>}

        {/*
          A resident hands badges out rather than earning them — standing
          beside one is a badge for whoever walked up — so their shelf is
          not empty, it does not exist, and the card says which.
        */}
        {resident ? (
          <div className="profile__shelf">
            <div className="profile__shelf-name">Badges</div>
            <p className="profile__none">
              {subject.name} earns none. The locals are how badges are got, not who gets them — go
              and stand next to them.
            </p>
          </div>
        ) : (
          <div className="profile__shelf">
            <div className="profile__shelf-name">
              Badges
              <span className="profile__tally">
                {earned.length} of {BADGES.length}
              </span>
            </div>
            {earned.length === 0 && (
              <p className="profile__none">
                Nothing yet. They are earned by going places, playing what is in the lobbies, and
                turning up when somebody else is about.
              </p>
            )}
            {BADGE_GROUPS.map((group) => {
              const mine = earned
                .map((item) => badgeFor(item.code))
                .filter((badge) => badge?.group === group.id);
              if (mine.length === 0) return null;
              return (
                <div key={group.id} className="profile__group">
                  <div className="profile__group-name">{group.title}</div>
                  <div className="profile__badges">
                    {mine.map((badge) => (
                      <button
                        key={badge!.code}
                        type="button"
                        className="profile__badge"
                        title={badge!.description}
                        onClick={() => openBadge(badge!.code)}
                      >
                        <span className="profile__badge-icon">{badge!.icon}</span>
                        <span className="profile__badge-title">{badge!.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {/*
              What is left, in outline. Half the point of a badge is knowing
              it is there to be had, and a shelf of only what has been won
              says nothing about what the world still holds.
            */}
            {earned.length < BADGES.length && (
              <>
                <div className="profile__group-name profile__group-name--locked">
                  Still out there
                </div>
                <div className="profile__badges">
                  {BADGES.filter((badge) => !earnedCodes.has(badge.code)).map((badge) => (
                    <button
                      key={badge.code}
                      type="button"
                      className="profile__badge profile__badge--locked"
                      title={badge.description}
                      onClick={() => openBadge(badge.code)}
                    >
                      <span className="profile__badge-icon">{badge.icon}</span>
                      <span className="profile__badge-title">{badge.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/*
          And their basket. Not part of the shelf above, because a badge is
          something they did once and an egg is something they have — the
          two read as one list only until somebody has four of something.
          A resident gets none of this for the reason they get no badges:
          Michael is where eggs come from, not somebody who collects them.
        */}
        {!resident && basket.length > 0 && (
          <div className="profile__shelf">
            <div className="profile__shelf-name">
              Eggs
              <span className="profile__tally">{basketSize(basket)}</span>
            </div>
            <div className="profile__eggs">
              {EGG_KINDS.map((kind) => {
                const count = basket.find((t) => t.tier === kind.id)?.count ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={kind.id}
                    type="button"
                    className="profile__egg"
                    title={kind.note}
                    onClick={() => {
                      // Hands over rather than stacking: the egg card is a
                      // window over the same whole app, and one of them at a
                      // time is what "over everything" can mean.
                      close();
                      gameEvents.emit("open-egg", kind.id);
                    }}
                  >
                    <EggMark kind={kind} size={26} />
                    <span className="profile__badge-title">
                      {kind.name}
                      {count > 1 && <span className="eggs__many">×{count}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
