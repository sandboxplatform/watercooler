/**
 * A room slug, said the way a person would: "Castle Atlantic · Lobby",
 * "Sandbox ERP · Floor 2 · Agents", "World map", "Apeiron Media · Ireland".
 *
 * Rooms are named by slug on the socket; the People panel turns those back
 * into places. Nothing here touches Phaser or the DOM.
 */

import { CAVE_ROOM_SLUG, VOLCANO_ROOM_SLUG, WORLD_ROOM_SLUG } from "../rooms";
import { CAMPUSES } from "./campus";
import { floorTitle } from "./floors";
import { hasFloors, organisationFor, tenantFor, tenantTitle } from "./tenants";

const CAMPUS_PREFIX = "campus-";
const FLOOR = /^(.+)-floor-(\d{1,2})$/;

/**
 * What the volcano and its cave are called, wherever that is printed — the
 * top bar, the card that covers the crossing, the People panel.
 *
 * Written here rather than in `volcano.ts`, which is the layout and pulls the
 * world's scenery in with it: this module is in the HUD's bundle, and a
 * name is not worth the whole map.
 */
export const VOLCANO_LABEL = "Volcano Island";
export const CAVE_LABEL = `${VOLCANO_LABEL} · Cave`;

export interface Place {
  /** Where, in words. */
  label: string;
  /** Outdoors, a building's ground floor, a floor above it, or somewhere unknown. */
  kind: "world" | "campus" | "volcano" | "lobby" | "floor" | "unknown";
}

export function describeRoom(slug: string): Place {
  if (slug === WORLD_ROOM_SLUG) return { label: "World map", kind: "world" };
  if (slug === VOLCANO_ROOM_SLUG) return { label: VOLCANO_LABEL, kind: "volcano" };
  if (slug === CAVE_ROOM_SLUG) return { label: CAVE_LABEL, kind: "volcano" };

  if (slug.startsWith(CAMPUS_PREFIX)) {
    const org = slug.slice(CAMPUS_PREFIX.length);
    const company = organisationFor(org);
    const campus = CAMPUSES[org];
    if (company) {
      return { label: `${company.name} · ${campus?.place ?? "Campus"}`, kind: "campus" };
    }
  }

  const floor = slug.match(FLOOR);
  if (floor) {
    const tenant = tenantFor(floor[1]);
    const level = Number(floor[2]);
    // Three, because an Operations floor is a floor: it was left out, so a
    // meeting there and a resident standing in Support both read as the raw
    // slug in the People panel — "sandbox-erp-floor-3", where every other
    // place in the list is said the way a person would say it.
    if (tenant && (level === 1 || level === 2 || level === 3)) {
      return {
        label: `${tenantTitle(tenant)} · ${floorTitle({ kind: "floor", level })}`,
        kind: "floor",
      };
    }
  }

  const tenant = tenantFor(slug);
  if (tenant) {
    return {
      label: hasFloors(tenant) ? `${tenantTitle(tenant)} · Lobby` : tenantTitle(tenant),
      kind: "lobby",
    };
  }

  return { label: slug, kind: "unknown" };
}
