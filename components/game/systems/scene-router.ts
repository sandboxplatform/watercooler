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
 * Run something once the browser has had a frame to paint in.
 *
 * Swapping scenes is one long synchronous stretch of work — the room being
 * left torn down, and the next one's ground laid, buildings put up and a
 * couple of thousand trees planted — and on a second visit there is nothing
 * left to fetch, so Phaser runs the new scene's `create` inside the call
 * that asked for it. That call is a door firing in the old scene's own
 * `update`, which means the browser never gets between the two: the frame it
 * holds on screen for the length of the build is the one from **before** the
 * door fired, with the character still standing in the doorway. Hence the
 * complaint that the sprite freezes on the door rather than going through it.
 *
 * A paint first is the whole fix, and it buys two things at once: the
 * doorway's last frame is the one with the character already hidden, and
 * whatever the HUD put up on hearing the move — see `components/hud/Arrival`
 * — is on screen before the thread goes away.
 *
 * Two frames rather than one. The cover is React's, and React commits on a
 * schedule of its own that is not guaranteed to have landed by the first
 * callback; by the second, a paint has certainly happened.
 */
function afterPaint(run: () => void): () => void {
  if (typeof requestAnimationFrame !== "function") {
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(run);
  });
  return () => {
    cancelAnimationFrame(first);
    if (second) cancelAnimationFrame(second);
  };
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
 * Three details are load-bearing:
 *
 * - **The tilemap cache is cleared before the office comes back up.** Every
 *   floor and every lobby is cached under the key `office`, so a stale one
 *   would be reused in silence — the right room in the address bar and the
 *   wrong map drawn in it.
 * - **Scenes are swapped through the SceneManager, not through a scene's
 *   own `scene.start`.** `ScenePlugin.start` shuts down the scene it is
 *   called on, which is right when one place hands over to another and
 *   wrong for a router that has to still be here for the next move.
 * - **The swap waits for a paint**, rather than happening in the tick that
 *   asked for it. See `afterPaint` above: the build is long and synchronous,
 *   so without it the browser holds the doorway's last frame for the whole
 *   of it and there is no moment in which anything could be shown instead.
 */
export function routeScenes(game: PhaserTypes.Game): () => void {
  let showing: string | null = null;
  let cancel: (() => void) | null = null;

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

  // The first place goes up here and now: nothing is on screen to protect,
  // and nothing has been told that a move is under way.
  const unsub = gameEvents.on("room-changed", (_room, arrival) => {
    // Only the newest move is worth making. Two of them inside a pair of
    // frames is not a journey anybody took, and `go` reads the address bar
    // rather than what it was handed, so the later one is the true one.
    cancel?.();
    cancel = afterPaint(() => {
      cancel = null;
      go(arrival);
    });
  });

  return () => {
    cancel?.();
    cancel = null;
    unsub();
  };
}
