/**
 * Residents: the AI agents who live in the buildings.
 *
 * A resident belongs to one organisation. Those with a home lobby have a
 * desk on the agents' floor above it; a store's resident has no desk and
 * lives between the shop and the warehouse instead. They are not people
 * at keyboards: the server walks them about on a loose routine through
 * their haunts — the desk, the organisation's rooms, its campus yard, and
 * the green between the buildings — and everyone who is there sees them.
 *
 * Nothing here touches Phaser, the DOM or the server; the server's
 * simulation and the scenes both read from this.
 */

import type { Facing } from "../presence-types";
import { floorRoomSlug, WORLD_ROOM_SLUG } from "../rooms";
import {
  BUILDINGS,
  WORLD_SPAWN,
  TILE as WORLD_TILE,
  hasCampus,
  hasFloors,
  tenantsOf,
  operationsRoomCount,
  tenantFor,
  type BuildingKind,
} from "./tenants";
import { CENTRE_AVENUE, EAST_AVENUE, NORTH_ROAD, SOUTH_ROAD, WEST_AVENUE } from "./scenery";
import { TILE, WIDTH as LOBBY_COLS } from "../map/office";
import { opsSupportPost } from "../map/floor";
import { standingSpot } from "./desks";
import { CAMPUSES } from "./campus";

export interface Resident {
  /** Stable id; also the second half of their office's URL segment. */
  id: string;
  name: string;
  title: string;
  /** Slug of the organisation they work for; null for someone who works nowhere. */
  org: string | null;
  /** The lobby whose agents' floor holds their desk; null for someone with no desk. */
  home: string | null;
  /** A library sheet key (see WORKER_SPRITES). */
  spriteKey: string;
  /**
   * Wandering mode: they keep to the world map and never go indoors.
   *
   * A mode rather than a kind of character, so anyone here can be put into
   * it — give them `wanders: true` and their whole routine becomes the one
   * haunt, the road outside. Somebody who wanders has no office and no desk,
   * so `org` and `home` are both null.
   */
  wanders?: boolean;
  /**
   * A post they work from: somewhere they stand still, in a room, rather
   * than a desk on the agents' floor.
   *
   * It is the counter in a lobby, and having one is a whole routine: someone
   * posted at one is either at it or out wandering the world map, and goes
   * nowhere else. `home` stays null, so they take no desk upstairs.
   */
  station?: Station;
  /**
   * What they remark on arriving somewhere, if they are the remarking kind.
   *
   * Two lines, because a station is a two-place routine: `onDuty` at the
   * post, `away` anywhere else. Most residents have neither and say nothing,
   * which is the right amount for somebody walking past.
   */
  lines?: { onDuty: string; away: string };
}

/** A post in a room, by the sprite's centre, and the way they face at it. */
export interface Station {
  room: string;
  x: number;
  y: number;
  facing: Facing;
  /**
   * The floor they pace while they are on duty, as bounds for the sprite's
   * centre; without it they stand at the post and do not move.
   *
   * It has to be a patch a random point of which is never solid and never
   * behind the furniture, exactly as WANDER_AREAS is — which is what lets the
   * pacing be the same code that walks a resident round a lobby.
   */
  paces?: Rect;
}

/** The Operations floor, where Support is. */
export const OPERATIONS_LEVEL = 3;

/**
 * Doc's post, read off the floor he stands on rather than written out here.
 *
 * Sandbox ERP's corridor is as long as its project count, so the room moves
 * when that changes; asking the floor for the spot is what keeps him inside
 * the walls when it does.
 */
const SUPPORT_POST = opsSupportPost(operationsRoomCount(tenantFor("sandbox-erp")));

export const RESIDENTS: readonly Resident[] = [
  {
    id: "yoshi",
    name: "Yoshi",
    title: "Data Scientist",
    org: "castle-atlantic",
    home: "castle-atlantic",
    spriteKey: "character_data_scientist",
  },
  {
    id: "sara",
    name: "Sara",
    title: "Operations",
    org: "sandbox-erp",
    home: "sandbox-erp",
    spriteKey: "character_sara",
  },
  {
    id: "spud",
    name: "Bud",
    title: "Support",
    org: "sandbox-erp",
    home: "sandbox-erp",
    spriteKey: "character_spud",
  },
  {
    id: "yash",
    name: "Yash",
    title: "Research",
    org: "mettara",
    home: "mettara",
    spriteKey: "character_yash",
  },
  {
    id: "steve",
    name: "Steve",
    title: "Store Manager",
    org: "chester",
    home: null,
    spriteKey: "character_steve",
  },
  {
    id: "mark",
    name: "Mark",
    title: "Sales",
    org: "homestar",
    home: "homestar-sales",
    spriteKey: "character_mark",
  },
  // In Support on Sandbox ERP's Operations floor, or out on the map. No desk
  // on the agents' floor: the room with the support queue in it is his work.
  {
    id: "doc",
    name: "Doc",
    title: "Help Desk",
    org: "sandbox-erp",
    home: null,
    spriteKey: "character_doc",
    // Support, on the Operations floor, rather than the lobby counter he was
    // built for. The counter is still down there; nobody works it now.
    station: {
      room: floorRoomSlug("sandbox-erp", OPERATIONS_LEVEL),
      x: SUPPORT_POST.post.x,
      y: SUPPORT_POST.post.y,
      facing: "down",
      paces: SUPPORT_POST.paces,
    },
    lines: {
      onDuty: "I'm about to be hooked up to Mettara!",
      away: "I just needed some fresh air!",
    },
  },
  // Works nowhere and goes indoors never: he is out on the road, always.
  {
    id: "michael",
    name: "Michael",
    title: "Wanderer",
    org: null,
    home: null,
    spriteKey: "character_michael",
    wanders: true,
  },
];

/** Everyone who works for an organisation. */
export function residentsOf(orgSlug: string): Resident[] {
  return RESIDENTS.filter((r) => r.org === orgSlug);
}

/** Everyone with a desk above a lobby, in desk order. */
export function residentsAt(lobbySlug: string): Resident[] {
  return RESIDENTS.filter((r) => r.home === lobbySlug);
}

export function residentById(id: string): Resident | null {
  return RESIDENTS.find((r) => r.id === id) ?? null;
}

/** The floor the agents' desks are on. */
export const AGENTS_LEVEL = 2;

/** Which desk slot a resident has on their building's agents' floor; -1 without one. */
export function deskOf(resident: Resident): number {
  if (!resident.home) return -1;
  return residentsAt(resident.home).findIndex((r) => r.id === resident.id);
}

/** Where a resident stands when at their desk: the sprite's centre. */
export function deskSpot(resident: Resident): { x: number; y: number } {
  return standingSpot(Math.max(0, deskOf(resident)));
}

// ── Haunts ──────────────────────────────────────────────

/** What kind of floor a room has, for where one may wander in it. */
export type Area = "lobby" | BuildingKind | "world";

/** Somewhere a resident goes. */
export type Haunt =
  | { kind: "office" }
  | { kind: "station" }
  | { kind: "room"; room: string; area: Area }
  | { kind: "campus"; campus: string }
  | { kind: "outside" };

export type PlaceKind = Haunt["kind"];

/** One string per haunt, to tell them apart. */
export function hauntKey(haunt: Haunt): string {
  switch (haunt.kind) {
    case "room":
      return `room:${haunt.room}`;
    case "campus":
      return `campus:${haunt.campus}`;
    default:
      return haunt.kind;
  }
}

/**
 * Everywhere a resident goes: their desk, every room of their
 * organisation — each lobby, or the store and the rooms behind it — the
 * campus yard if there is one, and outside.
 *
 * Someone in wandering mode has one haunt and one only: the world map. It is
 * a `room` haunt because the world map *is* a presence room, which is what
 * lets them walk it the way a resident walks a lobby — everyone watching sees
 * the same steps, rather than each browser inventing its own.
 *
 * Somebody with a station has two: the post, and that same world map. Manning
 * a counter is not a stop on a round of the building — it is the job — so it
 * replaces the routine rather than joining it, and the only other place they
 * turn up is outside, wandering, which is what a break looks like from the
 * lobby's point of view.
 */
export function hauntsOf(resident: Resident): Haunt[] {
  if (resident.wanders) return [{ kind: "room", room: WORLD_ROOM_SLUG, area: "world" }];
  if (resident.station)
    return [{ kind: "station" }, { kind: "room", room: WORLD_ROOM_SLUG, area: "world" }];
  const haunts: Haunt[] = [];
  if (resident.home) haunts.push({ kind: "office" });
  if (resident.org) {
    for (const tenant of tenantsOf(resident.org)) {
      const area: Area = hasFloors(tenant) ? "lobby" : (tenant.kind ?? "lobby");
      haunts.push({ kind: "room", room: tenant.slug, area });
    }
    if (hasCampus(resident.org)) haunts.push({ kind: "campus", campus: resident.org });
  }
  haunts.push({ kind: "outside" });
  return haunts;
}

/** The presence room a resident is in at a haunt; none outside or on a yard. */
export function roomForHaunt(resident: Resident, haunt: Haunt): string | null {
  if (haunt.kind === "office")
    return resident.home ? floorRoomSlug(resident.home, AGENTS_LEVEL) : null;
  if (haunt.kind === "station") return resident.station?.room ?? null;
  if (haunt.kind === "room") return haunt.room;
  return null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a resident may wander in a room, as bounds for the sprite's centre.
 * They are drawn, not simulated, so they must simply never be sent
 * anywhere solid: each is the open floor of its kind of room, clear of
 * the furniture and the lift.
 */
/** Where residents stand when they are outside: in front of the fountain, by the feet. */
export const OUTSIDE_SPOT = { x: 760, y: 668 };

/**
 * The middle of a two-tile promenade or avenue, by the feet, in world pixels
 * — the roads and avenues are named as the first of their pair of tiles.
 */
const onRoad = (road: number) => (road + 1) * WORLD_TILE;
const onAvenue = onRoad;
/** Where a building's own path meets the ground in front of its door. */
const front = (org: string) => BUILDINGS.find((b) => b.org.slug === org)?.outside ?? WORLD_SPAWN;

/**
 * The twenty places a wanderer walks between, by the feet, in world pixels.
 *
 * A rectangle was the wrong shape for this. It began as one — a strip of road
 * a few tiles long, because nothing collides a wanderer and bounds were the
 * only thing keeping them out of the walls — and it read as pacing, not
 * wandering. What makes the map feel inhabited is somebody crossing it: from
 * the stores in the west to the campus gate in the east, down to the dock, up
 * to a doorway. So instead of bounds there are places, and the way between
 * any two is planned around the buildings (see route.ts).
 *
 * Each is somewhere the map already means people to stand — a doorstep, a
 * promenade, an avenue, the plaza by the fountain, the shore end of the dock
 * — and `residents.test.ts` holds every one of them to it: clear of the
 * buildings, the props and the sea, and reachable from the spawn. The car
 * park's spot is the strip in front of the vans rather than the middle of it,
 * because the vans wall off everything behind them.
 */
export const WORLD_WANDER_SPOTS: readonly { x: number; y: number }[] = [
  // The doorsteps, west to east.
  front("blockhouse"),
  front("chester"),
  front("castle-atlantic"),
  front("sandbox-erp"),
  front("homestar"),
  front("mettara"),
  // The plaza, by the fountain, where the residents stand when they are out.
  OUTSIDE_SPOT,
  // Along the north promenade: the ends, the three avenue junctions, and the
  // stretches between.
  { x: 144, y: onRoad(NORTH_ROAD) },
  { x: onAvenue(WEST_AVENUE), y: onRoad(NORTH_ROAD) },
  { x: 960, y: onRoad(NORTH_ROAD) },
  { x: onAvenue(CENTRE_AVENUE), y: onRoad(NORTH_ROAD) },
  { x: 2064, y: onRoad(NORTH_ROAD) },
  { x: 2880, y: onRoad(NORTH_ROAD) },
  // Half way down the outer avenues, between the two promenades.
  { x: onAvenue(WEST_AVENUE), y: 1152 },
  { x: onAvenue(EAST_AVENUE), y: 1152 },
  // The car park by the campus, in front of the vans.
  { x: 2760, y: 1080 },
  // The south promenade.
  { x: onAvenue(WEST_AVENUE), y: onRoad(SOUTH_ROAD) },
  { x: onAvenue(CENTRE_AVENUE), y: onRoad(SOUTH_ROAD) },
  { x: onAvenue(EAST_AVENUE), y: onRoad(SOUTH_ROAD) },
  // The shore end of the dock — near the water, and well short of the
  // gangway, so a wanderer never boards the ferry.
  { x: onAvenue(CENTRE_AVENUE), y: 1560 },
];

export const WANDER_AREAS: Record<Exclude<Area, "world">, Rect> = {
  // The wide part of the lobby: inside the walls with a margin, below the
  // top wall's furniture, and clear of the lift in the bottom corner.
  lobby: { x: 2 * TILE, y: 7 * TILE, width: (LOBBY_COLS - 5) * TILE, height: 5 * TILE },
  // The front of the shop, left of the window shelving and above the first aisle.
  store: { x: 1.5 * TILE, y: 4 * TILE, width: 8.5 * TILE, height: 1.5 * TILE },
  // The aisle between the two rows of racks.
  warehouse: { x: 1.5 * TILE, y: 6.5 * TILE, width: 13 * TILE, height: 0.75 * TILE },
  // Between the workbenches and the van bays.
  garage: { x: 1.5 * TILE, y: 4.75 * TILE, width: 15 * TILE, height: 1.25 * TILE },
  // An office on a campus is a lobby with floors, and wanders as one.
  office: { x: 2 * TILE, y: 7 * TILE, width: (LOBBY_COLS - 5) * TILE, height: 5 * TILE },
};

/**
 * Where a resident may wander at a haunt; nowhere at the desk, outside or on
 * a yard, and nowhere as an area on the world map — that one has spots
 * instead, since a patch of ground the size of the world would put a
 * wanderer in the sea.
 *
 * A station's patch belongs to the post rather than to the kind of room, so
 * that one needs the resident: it is the floor around their own counter.
 */
export function wanderArea(haunt: Haunt, resident?: Resident): Rect | null {
  if (haunt.kind === "station") return resident?.station?.paces ?? null;
  if (haunt.kind !== "room" || haunt.area === "world") return null;
  return WANDER_AREAS[haunt.area];
}

/**
 * The places a resident walks between at a haunt, for somewhere too big and
 * too built-up to wander by bounds. Only the world map has them.
 */
export function wanderSpots(haunt: Haunt): readonly { x: number; y: number }[] | null {
  return haunt.kind === "room" && haunt.area === "world" ? WORLD_WANDER_SPOTS : null;
}

/** The paved yard of a campus, in campus pixels, as bounds for the feet: well inside its edges. */
export function yardArea(campus: string): Rect {
  const yard = CAMPUSES[campus]?.paved[0];
  if (!yard) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: (yard.x + 0.5) * TILE,
    y: yard.y * TILE + 24,
    width: (yard.width - 1) * TILE,
    height: yard.height * TILE - 32,
  };
}

/** How long a resident stays somewhere before moving on, in milliseconds. */
export const DWELL_MS: Record<PlaceKind, [min: number, max: number]> = {
  office: [4 * 60_000, 8 * 60_000],
  // Longest of any haunt, and much longer than the wander that follows it:
  // somebody asking the help desk something wants to find it staffed.
  station: [8 * 60_000, 14 * 60_000],
  room: [2 * 60_000, 4 * 60_000],
  campus: [2 * 60_000, 3 * 60_000],
  outside: [2 * 60_000, 3 * 60_000],
};

/**
 * Somewhere else: never the same haunt twice in a row — unless there is
 * nowhere else, as for a wanderer, who is handed back the one they are in.
 */
export function nextHaunt(
  resident: Resident,
  current: Haunt,
  random: () => number = Math.random,
): Haunt {
  const key = hauntKey(current);
  const options = hauntsOf(resident).filter((h) => hauntKey(h) !== key);
  if (options.length === 0) return current;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

export function dwell(place: PlaceKind, random: () => number = Math.random): number {
  const [min, max] = DWELL_MS[place];
  return min + Math.floor(random() * (max - min));
}

// ── Outside ─────────────────────────────────────────────

/**
 * Where a resident may stand on the world map, by the feet: their own
 * place by the fountain, or beside the path to their building's door.
 */
export function outsideSpots(resident: Resident): { x: number; y: number }[] {
  const index = Math.max(
    0,
    RESIDENTS.findIndex((r) => r.id === resident.id),
  );
  const spots = [{ x: OUTSIDE_SPOT.x + index * 40, y: OUTSIDE_SPOT.y }];
  const building = BUILDINGS.find((b) => b.org.slug === resident.org);
  if (building) spots.push({ x: building.outside.x + 60, y: building.outside.y + 43 });
  return spots;
}

/** What the server tells the scenes about a resident right now. */
export interface Whereabouts {
  id: string;
  name: string;
  title: string;
  spriteKey: string;
  /** Null for someone who works nowhere, such as a wanderer. */
  org: string | null;
  place: PlaceKind;
  /** The presence room they are in, for rooms and the office. */
  room: string | null;
  /** The yard they are on, for a campus. */
  campus: string | null;
  /** Where they stand, by the feet, on the world map or a yard. */
  spot: { x: number; y: number } | null;
  since: number;
}
