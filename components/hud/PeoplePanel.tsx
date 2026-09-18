"use client";

import { useMemo } from "react";
import { Mic } from "lucide-react";
import CharacterPortrait from "./CharacterPortrait";
import { useOnline } from "@/lib/presence-online";
import { getSelfId } from "@/lib/presence-self";
import { currentRoom } from "@/lib/room-client";
import { describeRoom } from "@/lib/world/places";
import { SPRITE_PATH } from "@/components/game/config/animations";
import { sheetPathFor } from "@/lib/characters/library";
import type { OnlinePerson } from "@/lib/presence-types";

/**
 * Who is on the server right now, and where.
 *
 * Grouped by place, with the place you are in first, so "is anyone about?"
 * and "where did they go?" are both answered at a glance. The list is the
 * server's, refreshed as people come, go and walk between places.
 */

interface Group {
  room: string;
  label: string;
  here: boolean;
  people: OnlinePerson[];
}

export default function PeoplePanel() {
  const people = useOnline();
  const me = getSelfId();
  const room = currentRoom();
  const inChat = people.filter((person) => person.mic).length;

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
      {groups.length === 0 ? (
        <div className="people__empty">
          When the room socket is up, everyone on the server is listed here with where they are.
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.room} className="people__place">
            <div className="people__place-name">
              {group.label}
              {group.here && <span className="people__here">you are here</span>}
            </div>
            {group.people.map((person) => (
              <div
                key={person.id}
                className={`people__row${person.id === me ? " people__row--me" : ""}`}
              >
                <CharacterPortrait
                  spritePath={sheetPathFor(person.spriteKey) ?? SPRITE_PATH}
                  name={person.name}
                  small
                />
                <div className="people__who">
                  <span className="people__name">{person.name}</span>
                  {person.id === me && <span className="people__me">you</span>}
                  {/*
                    Their microphone is on, which is the whole of being in
                    Global Chat — there is no other state to be in. A bare
                    mic glyph with the words in a tooltip said "microphone",
                    which is a device; this says which conversation they are
                    in, which is what somebody reading the list wants.
                  */}
                  {person.mic && (
                    <span
                      className="people__mic"
                      title="In Global Chat — everyone in it hears them, wherever in the world they are standing"
                    >
                      <Mic size={9} />
                      Global Chat
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
