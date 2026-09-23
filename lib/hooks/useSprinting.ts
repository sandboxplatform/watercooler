"use client";

import { useSyncExternalStore } from "react";
import { gameEvents } from "@/lib/events";
import { loadSprinting } from "@/lib/persistence";

/**
 * Whether this browser is sprinting, for the HUD.
 *
 * The mode itself is the character's and the browser's memory of it is what
 * outlives them: a door builds a new character, so `loadSprinting` is the
 * one answer that survives the journey. The bus is what says it changed —
 * a press of left Shift and a press of the pill are the same flip, made in
 * one place (`Player.toggleSprint`) and announced once.
 *
 * An external store rather than state kept in step by an effect, for the
 * reason the talk button is one: this is a fact about the browser rather
 * than about any component, and reading it into state would mean a render
 * that says `false` before the one that says what is true.
 */
export function useSprinting(): boolean {
  return useSyncExternalStore(subscribe, loadSprinting, offOnTheServer);
}

const subscribe = (listener: () => void) => gameEvents.on("sprint-changed", listener);

/** Nothing is sprinting until a browser says otherwise, and the server has no browser. */
const offOnTheServer = () => false;
