import type * as PhaserTypes from "phaser";
import { gameEvents, type RoomArrival } from "@/lib/events";
import { campusFromPath, isWorldPath } from "@/lib/world/paths";
import { createLogger } from "@/lib/logger";

const log = createLogger("SceneRouter");

/** The scenes a room address can name, and what each wants to be told. */
type Destination =
  | { key: "WorldScene"; data: { from?: string | null; walkIn?: boolean } }
  | { key: "CampusScene"; data: { campus: string; from?: string | null } }
  | { key: "OfficeScene"; data: Record<string, never> };

/**
 * Which place an address names.
 *
 * The only reading of the address bar in the game layer. Everything else
 * asks this, so a new kind of place is a line here rather than a branch in
 * four scenes.
 */
export function destinationFor(location: { pathname: string }, arrival: RoomArrival): Destination {
  if (isWorldPath(location.pathname)) {
    return { key: "WorldScene", data: { from: arrival.from, walkIn: arrival.walkIn } };
  }
  const campus = campusFromPath(location.pathname);
  if (campus) return { key: "CampusScene", data: { campus, from: arrival.from } };
  return { key: "OfficeScene", data: {} };
}

/**
 * Put up the scene the address bar names, and swap it whenever the address
 * changes — which is every room change in the world, since `travelTo` is
 * the only way one happens.
 *
 * This used to be three separate jobs that had grown apart. `EntryScene`
 * read the address once at boot and was never heard from again; the office
 * restarted itself on `room-changed` so the lift could change floors in the
 * page; and every other move between places was `location.assign`, which
 * threw the whole client away — game, HUD, room socket, voice chat and all —
 * to draw a room next door. The last of those is what made walking through a
 * front door cost a reconnection, and a reconnection is what the Online
 * count flickered on and what Global Chat went silent on. So the three are
 * one thing here, and no room change reloads anything.
 *
 * Two details are load-bearing:
 *
 * - **The tilemap cache is cleared before the office comes back up.** Every
 *   floor and every lobby is cached under the key `office`, so a stale one
 *   would be reused in silence — the right room in the address bar and the
 *   wrong map drawn in it.
 * - **Scenes are swapped through the SceneManager, not through a scene's
 *   own `scene.start`.** `ScenePlugin.start` shuts down the scene it is
 *   called on, which is right when one place hands over to another and
 *   wrong for a router that has to still be here for the next move.
 */
export function routeScenes(game: PhaserTypes.Game): () => void {
  let showing: string | null = null;

  const go = (arrival: RoomArrival) => {
    const next = destinationFor(window.location, arrival);
    const manager = game.scene;

    // Both the office's floors and its lobbies live under one cache key.
    if (next.key === "OfficeScene") game.cache.tilemap.remove("office");

    if (showing === next.key) {
      // The same scene, a different place in it: restart rather than stop
      // and start, so `preload` runs again and reads the address just
      // pushed. Everything already decoded — both tilesets, every character
      // sheet — is skipped rather than fetched a second time.
      log.info(`${next.key} again, for a different place`);
      manager.getScene(next.key)?.scene.restart(next.data);
      return;
    }

    if (showing) manager.stop(showing);
    showing = next.key;
    log.info(`showing ${next.key}`);
    manager.start(next.key, next.data);
  };

  go({});
  return gameEvents.on("room-changed", (_room, arrival) => go(arrival));
}
