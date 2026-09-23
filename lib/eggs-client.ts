"use client";

import { useEffect, useSyncExternalStore } from "react";
import { onRoomMessage, sendRoom } from "./room-socket";
import { createLogger } from "./logger";
import { getSelfId } from "./presence-self";
import { onlinePeople, subscribeOnline } from "./presence-online";
import type { EggsBroadcast } from "./presence-types";
import type { EggTally, LaidEgg } from "./world/eggs";

/**
 * The eggs, from the browser's side.
 *
 * Two things live here because they are two halves of one feature and they
 * arrive on the same socket:
 *
 * - **The field** — what is lying in the grass on the world map, which the
 *   scene draws. Like the ball, and thin for the same reason: the server
 *   lays them, rolls what kind each is and decides who gets one, and this
 *   passes on what comes back.
 * - **The baskets** — who has found what, which three parts of the HUD
 *   want. Like the badges, and kept current the same way: fetched once,
 *   then topped up off the `egg-found` message the server sends to
 *   everybody.
 */

const log = createLogger("Eggs");

// ── The field ─────────────────────────────────────────

/**
 * What was lying in the grass when the server last said.
 *
 * Kept module-side rather than handed only to whoever was listening, for
 * the reason the ball is: the scene is built after the message that told
 * it. Walking out of a building onto the map takes a moment, and the field
 * is published when it changes, which may have been half an hour ago.
 */
let field: LaidEgg[] = [];

/** What somebody just picked up, if this message carried one. */
export type EggTaken = NonNullable<EggsBroadcast["taken"]>;

/**
 * What *happened*, beside what is lying there.
 *
 * The field is a whole list on every message, which is the right shape for
 * drawing it and no shape at all for the two moments worth watching: one
 * picked up, and one just laid. Both are null on the ordinary message —
 * the one sent on arriving, and the one sent when a few go stale — which
 * is what keeps a browser walking onto the map from marking every find and
 * bursting over every egg in the park.
 */
export interface EggNews {
  taken: EggTaken | null;
  /** The id of one Michael has just left; it is in `eggs` beside it. */
  laid: string | null;
}

const NO_NEWS: EggNews = { taken: null, laid: null };

type FieldListener = (eggs: readonly LaidEgg[], news: EggNews) => void;
const watchers = new Set<FieldListener>();

/** Follow the field. What is lying there now, if anything, arrives at once. */
export function onEggs(listener: FieldListener): () => void {
  listen();
  watchers.add(listener);
  listener(field, NO_NEWS);
  return () => {
    watchers.delete(listener);
  };
}

/**
 * Bend down for the nearest one.
 *
 * Which egg is not said, and neither is where we are standing: the server
 * has both from the room, and an egg named in a message is an egg that
 * could be named from across the map.
 */
export function takeEgg(): void {
  sendRoom({ type: "egg", action: "take" });
}

// ── The baskets ───────────────────────────────────────

let tallies: EggTally[] = [];
let loaded = false;
let fetching = false;
const listeners = new Set<() => void>();
let listening = false;

function changed() {
  for (const listener of listeners) listener();
}

/**
 * One socket handler for both halves.
 *
 * The two messages are deliberately different shapes — the field is a fact
 * about the world map and goes to that room, a basket is a fact about a
 * person and goes to everybody — and this is the one place either of them
 * is read.
 */
function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type === "eggs") {
      field = message.eggs;
      const news: EggNews = { taken: message.taken ?? null, laid: message.laid ?? null };
      for (const watcher of watchers) watcher(field, news);
      return;
    }
    if (message.type !== "egg-found") return;
    // A tally rather than a row, so an egg of a kind somebody already has
    // is an increment. Rebuilt rather than mutated, because the store is
    // read through `useSyncExternalStore` and that wants a new identity.
    const found = tallies.find((t) => t.person === message.person && t.tier === message.tier);
    tallies = found
      ? tallies.map((t) =>
          t === found ? { ...t, count: t.count + 1, name: message.name, latest: message.at } : t,
        )
      : [
          ...tallies,
          {
            person: message.person,
            name: message.name,
            tier: message.tier,
            count: 1,
            latest: message.at,
          },
        ];
    changed();
  });
}

async function load() {
  if (fetching) return;
  fetching = true;
  listen();
  try {
    const response = await fetch("/api/eggs");
    const body = (await response.json()) as { eggs?: EggTally[] };
    // Anything that arrived over the socket while this was in flight is
    // already counted, and the server's answer predates it — so the
    // greater of the two counts is the true one for a pair that overlap.
    const fresh = new Map(tallies.map((t) => [`${t.person}:${t.tier}`, t]));
    tallies = (body.eggs ?? []).map((t) => {
      const seen = fresh.get(`${t.person}:${t.tier}`);
      fresh.delete(`${t.person}:${t.tier}`);
      return seen && seen.count > t.count ? seen : t;
    });
    tallies = [...tallies, ...fresh.values()];
  } catch (err) {
    log.warn("could not read the baskets:", (err as Error).message);
  } finally {
    loaded = true;
    changed();
  }
}

export function allEggs(): EggTally[] {
  return tallies;
}

/**
 * Follow the baskets without React, for the shelves on a People floor.
 *
 * `useEggTallies` is the same subscription with a hook around it, and the
 * hook is no use to the game layer — a cubicle's shelf is drawn by Phaser.
 * Like `onEggs` above it fetches on the first listener and hands over what
 * is known now, so a scene built before the answer arrives is told when it
 * does rather than standing an empty shelf for ever.
 */
export function onBaskets(listener: (eggs: readonly EggTally[]) => void): () => void {
  const relay = () => listener(tallies);
  const stop = subscribe(relay);
  relay();
  return stop;
}

export function eggsLoaded(): boolean {
  return loaded;
}

function subscribe(listener: () => void): () => void {
  void load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const NONE: EggTally[] = [];

/** Every basket in the world, kept current. */
export function useEggTallies(): EggTally[] {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, allEggs, () => NONE);
}

/**
 * One person's basket.
 *
 * Unsorted, because both readers walk `EGG_KINDS` and look each kind up:
 * the ladder's own order is the order a basket should read in, and a list
 * sorted here would be a second opinion about that.
 */
export function basketOf(all: readonly EggTally[], person: string | null): EggTally[] {
  if (!person) return NONE;
  return all.filter((t) => t.person === person);
}

/**
 * Which holder we are ourselves.
 *
 * The socket hands this browser its connection id and the online list
 * carries a `person` beside each connection, so our own shelf is one
 * lookup away — there is nothing else in the HUD that knows it, and
 * "whose basket is mine" is the first question the panel asks.
 *
 * Null until the list has arrived, which is a second or two after the
 * page: a panel that shows the world's eggs and then finds its own is
 * better than one that waits.
 */
export function useSelfPerson(): string | null {
  return useSyncExternalStore(subscribeOnline, selfPerson, () => null);
}

function selfPerson(): string | null {
  const self = getSelfId();
  if (!self) return null;
  return onlinePeople().find((p) => p.id === self)?.person ?? null;
}

/** Test seam: forget what the socket has said between cases. */
export function resetEggs(): void {
  field = [];
  tallies = [];
  loaded = false;
  fetching = false;
  watchers.clear();
  listeners.clear();
}
