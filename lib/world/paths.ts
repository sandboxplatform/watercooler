/**
 * The addresses of the world, shared by the HUD and the scenes. Nothing here
 * touches Phaser, so the server can render a page that knows about them.
 *
 * Rooms have their own pages, /r/<slug>, and so do the world map and the
 * campuses — but nothing loads one. Every move between them is a `travelTo`,
 * which pushes the address and lets the scene router draw the place; a
 * reload, a bookmark or a shared link then lands where the person was.
 */

/** The world map's address. */
export const WORLD_PATH = "/world";

const CAMPUS_PREFIX = "/campus/";

export function isWorldPath(pathname: string): boolean {
  return pathname === WORLD_PATH || pathname === `${WORLD_PATH}/`;
}

/** A campus's address: /campus/<organisation>. */
export function campusPath(slug: string): string {
  return `${CAMPUS_PREFIX}${slug}`;
}

/** The organisation a campus address names, or null for any other address. */
export function campusFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CAMPUS_PREFIX)) return null;
  const slug = pathname.slice(CAMPUS_PREFIX.length).replace(/\/$/, "");
  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/**
 * Volcano Island, across the water from the second dock, and the cave in
 * the foot of its volcano.
 *
 * Two addresses rather than one with a query, because they are two places:
 * each is its own presence room with its own people standing in it, and a
 * reload or a shared link has to land in the one it names. Neither belongs
 * to an organisation, which is why they are not campuses — see
 * `lib/world/volcano.ts`.
 */
export const VOLCANO_PATH = "/volcano";
export const CAVE_PATH = "/volcano/cave";

/** Which of the volcano's two places an address names, or null for anywhere else. */
export function volcanoPlaceFromPath(pathname: string): "island" | "cave" | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (path === VOLCANO_PATH) return "island";
  if (path === CAVE_PATH) return "cave";
  return null;
}

/**
 * Whether an address is somewhere out of doors — the world map, a campus,
 * or the volcano and its cave — rather than a room.
 *
 * The cave is not out of doors in any sense a person would use, and it is
 * here all the same: what this is asked is whether a place is drawn by an
 * outdoor scene rather than a tilemap, which is what the welcome screen
 * and the router both mean by it.
 */
export function isOutdoorPath(pathname: string): boolean {
  return (
    isWorldPath(pathname) ||
    campusFromPath(pathname) !== null ||
    volcanoPlaceFromPath(pathname) !== null
  );
}
