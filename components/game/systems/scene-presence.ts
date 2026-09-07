import * as Phaser from "phaser";
import { RemotePlayerManager } from "./RemotePlayerManager";
import { ensureSheet } from "../utils/sheets";
import { WORKER_SPRITES } from "../config/animations";
import { gameEvents } from "@/lib/events";
import { createLogger } from "@/lib/logger";
import type { PresencePlayer } from "@/lib/presence-types";

const log = createLogger("ScenePresence");

/**
 * The other people in a place: the office, the world map, a campus.
 *
 * Keeps the remote characters in step with the roster, puts their words and
 * their voice mark over their heads, fetches a sheet this scene has not
 * loaded yet so a person looks like themselves here too, and tells the room
 * socket where our own character has just been put.
 *
 * The office used to do all of this by hand, and the divergence cost
 * something: when the office stopped preloading the whole cast, its own
 * path had no sheet fetch, so two residents were drawn as each other —
 * `RemotePlayerManager` substitutes the default sheet for a missing texture,
 * which fails silently rather than as a missing-texture box. One path now,
 * so a fix to presence lands everywhere people stand.
 */
export interface ScenePresence {
  /** Ease everyone toward their last reported position; call once a frame. */
  update(deltaMs: number): void;
  /**
   * Put a remark over somebody's head. The socket's own messages arrive as
   * `player-said` and need nothing; this is for a scene with something else
   * to say about a person, which is the office announcing an achievement.
   */
  say(id: string, text: string): void;
  /** Take everyone down and stop listening; call when the scene goes. */
  detach(): void;
}

export interface PresenceOptions {
  /** This browser's own remark, to show over our own character. */
  ownSay?: (text: string) => void;
  /**
   * How the other people are stacked, and the two schemes are not a matter
   * of taste.
   *
   * `"feet"` gives everyone a depth off how far down the screen they stand,
   * so someone walking below a building is drawn in front of it. Outdoors
   * that is the only thing that reads correctly, and it is the default.
   *
   * `"flat"` puts them all at one depth, which is what a room wants: its
   * props sit at depth 4 and the local player at 5, so a resident given a
   * depth off their own feet is drawn over the counter they stand behind.
   */
  depth?: "feet" | "flat";
}

export function attachPresence(
  scene: Phaser.Scene,
  self: { x: number; y: number; facing: string },
  options: PresenceOptions = {},
): ScenePresence {
  const manager = new RemotePlayerManager(scene, { sortByY: options.depth !== "flat" });
  let roster: PresencePlayer[] = [];
  /** Sheets already being fetched, so none is asked for twice. */
  const fetching = new Set<string>();

  const live = () => scene.sys?.isActive() === true;

  /**
   * Fetch the sheet for anyone this scene has not loaded, and replay the
   * roster once it lands so the wearer is redrawn in it.
   *
   * Taken off the fetch and not only added to it: a sheet that fails is
   * asked for again on the next roster rather than leaving that person in
   * the default look for as long as they stay.
   */
  const dress = (players: PresencePlayer[]) => {
    for (const player of players) {
      const key = player.spriteKey;
      if (!key || scene.textures.exists(key) || fetching.has(key)) continue;
      const path = WORKER_SPRITES.find((w) => w.key === key)?.path;
      if (!path) continue;
      fetching.add(key);
      ensureSheet(scene, key, path, (ok) => {
        fetching.delete(key);
        if (!ok) {
          log.error(`sheet ${key} failed to load for a person in the room`);
          return;
        }
        if (live()) manager.sync(roster);
      });
    }
  };

  const sync = (players: PresencePlayer[]) => {
    // A roster that lands between a scene stopping and its listeners going
    // must not try to draw into it.
    if (!live()) return;
    roster = players;
    manager.sync(players);
    dress(players);
  };

  const offs = [
    gameEvents.on("presence-updated", sync),
    gameEvents.on("presence-left", (id) => live() && manager.remove(id)),
    gameEvents.on("player-said", (id, text) => live() && manager.say(id, text)),
    gameEvents.on("voice-speaking", (id, speaking) => live() && manager.setSpeaking(id, speaking)),
    ...(options.ownSay ? [gameEvents.on("self-said", options.ownSay)] : []),
  ];

  // Tell the socket where we stand, so it joins this place here and not
  // wherever the last scene left us.
  gameEvents.emit("place-entered", self);

  return {
    update: (deltaMs) => manager.update(deltaMs),
    say: (id, text) => live() && manager.say(id, text),
    detach: () => {
      for (const off of offs) off();
      manager.destroyAll();
    },
  };
}
