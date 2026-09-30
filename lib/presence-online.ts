"use client";

import { createSocketStore, useSocketStore } from "./socket-store";
import type { OnlinePerson } from "./presence-types";

/**
 * Everyone on the server, wherever they are.
 *
 * The room socket carries the room's own roster twenty times a second; this
 * is the other list, the whole server's, sent whenever someone arrives,
 * leaves or walks somewhere else. It is what the People panel shows.
 *
 * The residents come in a list of their own, `locals`, and are never part
 * of `people`: the Online count is a count of people, and a resident is a
 * character the server walks about. But they are always somewhere, and where
 * Doc is standing is exactly what somebody looking for Doc wants to know — so
 * the People panel lists them under their own heading.
 *
 * Nothing to catch up on: the list is sent whole, on joining and on every
 * change, so a browser that missed one has the next.
 */

/** One empty list, shared: a new one every render would look like a change. */
const NOBODY: OnlinePerson[] = [];

interface Online {
  people: OnlinePerson[];
  locals: OnlinePerson[];
}

const online = createSocketStore<Online>({
  initial: { people: NOBODY, locals: NOBODY },
  reduce: (state, message) =>
    message.type === "online"
      ? { people: message.people, locals: message.locals ?? NOBODY }
      : state,
});

export function onlinePeople(): OnlinePerson[] {
  return online.get().people;
}

export function onlineLocals(): OnlinePerson[] {
  return online.get().locals;
}

export const subscribeOnline = online.subscribe;

/** Everyone online, as the server last said. */
export function useOnline(): OnlinePerson[] {
  return useSocketStore(online, (state) => state.people, NOBODY);
}

/** The residents, and where each of them is standing. */
export function useLocals(): OnlinePerson[] {
  return useSocketStore(online, (state) => state.locals, NOBODY);
}
