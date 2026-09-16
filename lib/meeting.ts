"use client";

/**
 * The meetings under way, from the browser's side.
 *
 * A meeting is called at the boardroom table on an Operations floor and is
 * news to everybody who could walk into that room — which is mostly people
 * who are somewhere else, so this is a whole-server list like `online`
 * rather than anything about the room you are standing in. The server
 * filters it to what each person may know about before it arrives; nothing
 * here decides who sees what.
 *
 * The list is replaced wholesale on every message, so a browser that missed
 * one is not left with a notice that will never come down.
 */

import { useEffect, useSyncExternalStore } from "react";
import { onRoomMessage, sendRoom } from "./room-socket";
import type { MeetingNotice } from "./presence-types";

let meetings: MeetingNotice[] = [];
const listeners = new Set<() => void>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type !== "meetings") return;
    meetings = message.meetings;
    for (const listener of listeners) listener();
  });
}

function snapshot(): MeetingNotice[] {
  return meetings;
}

function subscribe(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const NONE: MeetingNotice[] = [];

/** Every meeting this person may know about, as the server last said. */
export function useMeetings(): MeetingNotice[] {
  useEffect(listen, []);
  return useSyncExternalStore(subscribe, snapshot, () => NONE);
}

/** The one in a given room, if there is one. */
export function meetingIn(room: string, all: MeetingNotice[]): MeetingNotice | null {
  return all.find((meeting) => meeting.room === room) ?? null;
}

/**
 * Call a meeting in the room you are standing in, or end the one that is
 * running there.
 *
 * The room is the server's business: it is the room this connection walked
 * into, which is the room the table is in. Saying it here would mean the
 * browser naming the place a meeting is held, and the browser is the part
 * of this that can lie.
 */
export function setMeeting(on: boolean): boolean {
  return sendRoom({ type: "meeting", on });
}

/** How long it has been going, in words, for a notice that is glanced at. */
export function meetingFor(since: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return "just started";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
