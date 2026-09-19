"use client";

import { useMemo } from "react";
import { Mic } from "lucide-react";
import CharacterPortrait from "./CharacterPortrait";
import { useOnline, useLocals } from "@/lib/presence-online";
import { useBadges } from "@/lib/badges-client";
import { getSelfId } from "@/lib/presence-self";
import { currentRoom } from "@/lib/room-client";
import { describeRoom } from "@/lib/world/places";
import { CAST_PEOPLE, CAST_RESIDENTS } from "@/lib/world/cast";
import { SPRITE_PATH } from "@/components/game/config/animations";
import { sheetPathFor } from "@/lib/characters/library";
import { gameEvents } from "@/lib/events";
import type { OnlinePerson } from "@/lib/presence-types";

/**
 * Who is in the world — everybody, not only whoever is looking at it.
 *
 * Three sections, in the order the questions get asked:
 *
 * 1. **Online**, grouped by place with the place you are standing in first,
 *    so "is anyone about?" and "where did they go?" are both answered at a
 *    glance. That much is what this panel has always done.
 * 2. **Offline** — the rest of the cast. A list of only the people who
 *    happen to have a tab open is a list that says nothing about who this
 *    world is *of*: Hunter being out is a different fact from Hunter not
 *    existing, and only one of them was visible before.
 * 3. **The locals** — the residents, always somewhere, never news. Out of
 *    the Online count, which counts people, and in the panel with where
 *    each of them is standing right now, which is the one thing about Doc
 *    a browser cannot work out for itself.
 *
 * Every row opens a profile. Somebody's face, their badges and a short and
 * largely unreliable account of who they are is the reward for the shelf
 * being worth filling.
 */

interface Group {
  room: string;
  label: string;
  here: boolean;
  people: OnlinePerson[];
}

function openProfile(person: string) {
  gameEvents.emit("open-profile", person);
}

/** One name in the list: portrait, name, and what is true of them today. */
function Row({
  person,
  name,
  spriteKey,
  badges,
  me,
  mic,
  where,
  dim,
}: {
  person: string;
  name: string;
  spriteKey: string;
  badges: number;
  me?: boolean;
  mic?: boolean;
  /** Where they are, for a row that is not already under a place heading. */
  where?: string;
  /** Offline: shown, plainly not here. */
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      className={`people__row${me ? " people__row--me" : ""}${dim ? " people__row--away" : ""}`}
      onClick={() => openProfile(person)}
      title={`${name} — open their profile`}
    >
      <CharacterPortrait spritePath={sheetPathFor(spriteKey) ?? SPRITE_PATH} name={name} small />
      <div className="people__who">
        <span className="people__name">{name}</span>
        {me && <span className="people__me">you</span>}
        {/*
          Their microphone is on, which is the whole of being in Global Chat
          — there is no other state to be in. A bare mic glyph with the
          words in a tooltip said "microphone", which is a device; this says
          which conversation they are in, which is what somebody reading the
          list wants.
        */}
        {mic && (
          <span
            className="people__mic"
            title="In Global Chat — everyone in it hears them, wherever in the world they are standing"
          >
            <Mic size={9} />
            Global Chat
          </span>
        )}
        {where && <span className="people__where">{where}</span>}
      </div>
      {badges > 0 && (
        <span className="people__badges" title={badges === 1 ? "1 badge" : `${badges} badges`}>
          {badges}
        </span>
      )}
    </button>
  );
}

export default function PeoplePanel() {
  const people = useOnline();
  const locals = useLocals();
  const badges = useBadges();
  const me = getSelfId();
  const room = currentRoom();
  const inChat = people.filter((person) => person.mic).length;

  /** How many badges each person holds, counted once for the whole list. */
  const counts = useMemo(() => {
    const byPerson = new Map<string, number>();
    for (const badge of badges) byPerson.set(badge.person, (byPerson.get(badge.person) ?? 0) + 1);
    return byPerson;
  }, [badges]);

  const groups = useMemo(() => {
    const byRoom = new Map<string, OnlinePerson[]>();
    for (const person of people) {
      const list = byRoom.get(person.room) ?? [];
      list.push(person);
      byRoom.set(person.room, list);
    }
    const built: Group[] = [...byRoom.entries()].map(([slug, list]) => ({
      room: slug,
      label: describeRoom(slug).label,
      here: slug === room,
      people: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return built.sort((a, b) => {
      if (a.here !== b.here) return a.here ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [people, room]);

  /**
   * The cast, minus whoever is already listed above.
   *
   * Matched on the holder id rather than on the name: two visitors may both
   * be called Sara, and neither of them is Sara.
   */
  const away = useMemo(() => {
    const here = new Set(people.map((p) => p.person));
    return CAST_PEOPLE.filter((member) => !here.has(member.id));
  }, [people]);

  /** Where each resident is standing, so the locals list can say. */
  const localRoom = useMemo(() => {
    const byId = new Map<string, string>();
    for (const local of locals) byId.set(local.person, local.room);
    return byId;
  }, [locals]);

  return (
    <div className="app-sidebar__scroll people">
      <div className="people__count">
        {people.length === 0
          ? "Nobody online"
          : people.length === 1
            ? "1 person online"
            : `${people.length} people online`}
      </div>
      {/*
        Global Chat is one conversation for the whole world, so its membership
        belongs at the top of the list rather than only beside the people in
        it: "is anyone talking?" is a question about the world, and scanning
        every place for a green badge is not an answer to it.
      */}
      {inChat > 0 && (
        <div className="people__chat-count">
          <Mic size={9} />
          <span>{inChat === 1 ? "1 in Global Chat" : `${inChat} in Global Chat`}</span>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.room} className="people__place">
          <div className="people__place-name">
            {group.label}
            {group.here && <span className="people__here">you are here</span>}
          </div>
          {group.people.map((person) => (
            <Row
              key={person.id}
              person={person.person}
              name={person.name}
              spriteKey={person.spriteKey}
              badges={counts.get(person.person) ?? 0}
              me={person.id === me}
              mic={person.mic}
            />
          ))}
        </section>
      ))}

      {away.length > 0 && (
        <section className="people__place">
          <div className="people__place-name people__place-name--away">Not here</div>
          {away.map((member) => (
            <Row
              key={member.id}
              person={member.id}
              name={member.name}
              spriteKey={member.spriteKey}
              badges={counts.get(member.id) ?? 0}
              where={member.role}
              dim
            />
          ))}
        </section>
      )}

      <section className="people__place">
        <div className="people__place-name people__place-name--away">The locals</div>
        {CAST_RESIDENTS.map((member) => {
          const at = localRoom.get(member.id);
          return (
            <Row
              key={member.id}
              person={member.id}
              name={member.name}
              spriteKey={member.spriteKey}
              badges={0}
              where={at ? describeRoom(at).label : member.role}
            />
          );
        })}
      </section>
    </div>
  );
}
