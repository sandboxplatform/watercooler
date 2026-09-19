"use client";

import { useEffect, useSyncExternalStore } from "react";
import { onRoomMessage } from "./room-socket";
import type { OnlinePerson } from "./presence-types";

/**
 * Everyone on the server, wherever they are.
 *
 * The room socket carries the room's own roster twenty times a second; this
 * is the other list, the whole server's, sent whenever someone arrives,
 * leaves or walks somewhere else. It is what the People panel shows.
 */

/** One empty list, shared: a new one every render would look like a change. */
const NOBODY: OnlinePerson[] = [];

let people: OnlinePerson[] = [];
/**
 * The residents, in a list of their own.
 *
 * Never part of `people`, because the Online count is a count of people and
 * a resident is a character the server walks about. But they are always
 * somewhere, and where Doc is standing is exactly what somebody looking for
 * Doc wants to know — so the People panel lists them under their own
 * heading, off this.
 */
let locals: OnlinePerson[] = [];
const listeners = new Set<() => void>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type !== "online") return;
    people = message.people;
    locals = message.locals ?? NOBODY;
    for (const listener of listeners) listener();
  });
}

export function onlinePeople(): OnlinePerson[] {
  return people;
}

export function onlineLocals(): OnlinePerson[] {
  return locals;
}

export function subscribeOnline(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Everyone online, as the server last said. */
export function useOnline(): OnlinePerson[] {
  useEffect(listen, []);
  return useSyncExternalStore(subscribeOnline, onlinePeople, () => NOBODY);
}

/** The residents, and where each of them is standing. */
export function useLocals(): OnlinePerson[] {
  useEffect(listen, []);
  return useSyncExternalStore(subscribeOnline, onlineLocals, () => NOBODY);
}
