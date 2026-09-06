/**
 * Floors.
 *
 * A building has a lobby — the main floor everyone arrives on — and two
 * floors above it: Floor 1, where the building's people have their desks,
 * and Floor 2, where its agents do. The lift is how you move between them.
 * Each floor is its own room (see lib/rooms.ts), with its own people and
 * conversation.
 *
 * URLs carry the whole address:
 *   /r/<slug>            the lobby
 *   /r/<slug>/floor/1    the people's floor
 *   /r/<slug>/floor/2    the agents' floor
 *   /r/<slug>/floor/3    the Operations floor, in a building that has one
 * Add ?via=elevator to step out of the lift, or ?via=door to step in from
 * outside; either way you arrive walking, and clear of the doorway.
 *
 * Nothing here touches Phaser or the DOM.
 */

import { floorRoomSlug, parseFloorRoomSlug, parseRoomPath } from "../rooms";
import type { AccessIdentity } from "../identity";
import {
  ORGANISATIONS,
  hasFloors,
  hasOperationsFloor,
  operationsBoards,
  tenantFor,
  type Tenant,
} from "./tenants";
import { residentsAt } from "./residents";

export type Level = 1 | 2 | 3;
export type Floor = { kind: "lobby" } | { kind: "floor"; level: Level };

export const LOBBY: Floor = { kind: "lobby" };
export const PEOPLE_FLOOR: Floor = { kind: "floor", level: 1 };
export const AGENTS_FLOOR: Floor = { kind: "floor", level: 2 };
/**
 * Where a building's boards hang. Only some buildings have one, and which
 * boards are on the wall is the building's own business — see
 * `operationsBoards`.
 */
export const OPERATIONS_FLOOR: Floor = { kind: "floor", level: 3 };

export interface Address {
  tenant: Tenant;
  floor: Floor;
}

export function addressFromLocation(location: { pathname: string }): Address | null {
  const path = parseRoomPath(location.pathname);
  const tenant = path ? tenantFor(path.slug) : null;
  if (!path || !tenant) return null;
  if (path.floor === null) return { tenant, floor: LOBBY };
  const level = path.floor;
  if (level !== 1 && level !== 2 && level !== 3) return null;
  // The Operations floor is not a floor every building has.
  if (level === 3 && !hasOperationsFloor(tenant)) return null;
  return { tenant, floor: { kind: "floor", level } };
}

export function floorUrl(tenant: Tenant, floor: Floor, via?: "elevator" | "door"): string {
  const base =
    floor.kind === "lobby" ? `/r/${tenant.slug}` : `/r/${tenant.slug}/floor/${floor.level}`;
  return via ? `${base}?via=${via}` : base;
}

/** The room a floor keeps its people in. */
export function roomForFloor(tenant: Tenant, floor: Floor): string {
  return floor.kind === "lobby" ? tenant.slug : floorRoomSlug(tenant.slug, floor.level);
}

export function sameFloor(a: Floor, b: Floor): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "lobby" || b.kind === "lobby" || a.level === b.level;
}

/** Somebody with a desk. */
export interface Occupant {
  id: string;
  name: string;
}

export interface Person extends Occupant {
  /** Slug of the building they belong to. */
  home: string | null;
}

/** Who has a desk on each floor of a building. */
export interface Occupancy {
  /** The organisation's people, from the register. */
  people: Occupant[];
}

export interface FloorStop {
  floor: Floor;
  label: string;
  /** Everyone with a desk there, in slot order. */
  names: string[];
}

export function floorTitle(floor: Floor): string {
  if (floor.kind === "lobby") return "Lobby";
  if (floor.level === 1) return "Floor 1 · People";
  return floor.level === 2 ? "Floor 2 · Agents" : "Floor 3 · Operations";
}

/** The floors of a building, bottom up, with who sits on each. */
export function floorsOf(tenant: Tenant, occupancy: Occupancy): FloorStop[] {
  const floors: FloorStop[] = [
    { floor: LOBBY, label: floorTitle(LOBBY), names: [] },
    {
      floor: PEOPLE_FLOOR,
      label: floorTitle(PEOPLE_FLOOR),
      names: occupancy.people.map((p) => p.name),
    },
    {
      floor: AGENTS_FLOOR,
      label: floorTitle(AGENTS_FLOOR),
      names: residentsAt(tenant.slug).map((r) => r.name),
    },
  ];
  // Nobody sits on the Operations floor; the boards are what it is for.
  if (hasOperationsFloor(tenant)) {
    floors.push({ floor: OPERATIONS_FLOOR, label: floorTitle(OPERATIONS_FLOOR), names: [] });
  }
  return floors;
}

/** Who has a desk on a floor, in slot order. */
export function occupantsOf(tenant: Tenant, floor: Floor, occupancy: Occupancy): Occupant[] {
  if (floor.kind === "lobby") return [];
  if (floor.level === 1) return occupancy.people;
  // The Operations floor has no desks: it is a wall and the room to read it.
  if (floor.level === 3) return [];
  return residentsAt(tenant.slug).map((r) => ({ id: r.id, name: r.name }));
}

/** What the top bar says about where you are: the floor, or nothing for a room with none. */
export function describeFloor(address: Address): string {
  return hasFloors(address.tenant) ? floorTitle(address.floor) : "";
}

export interface ElevatorStop extends FloorStop {
  url: string;
  /** Where the person already is; the button is lit but does nothing. */
  here: boolean;
}

/** The lift's buttons from where you stand. */
export function elevatorStops(address: Address, occupancy: Occupancy): ElevatorStop[] {
  return floorsOf(address.tenant, occupancy).map((stop) => ({
    ...stop,
    url: floorUrl(address.tenant, stop.floor, "elevator"),
    here: sameFloor(stop.floor, address.floor),
  }));
}

/**
 * The map a room is drawn from: a store, warehouse or garage has its own; a
 * lobby with a game has its own; any other lobby the shared one.
 */
/**
 * The map file for an Operations floor carrying these boards.
 *
 * Here rather than in the generator so the two cannot drift: the script
 * writes the files this names, and the scene asks for them by the same
 * rule.
 */
export function operationsMapFile(boards: readonly string[]): string {
  return `/maps/floor-ops-${[...boards].join("-")}.json`;
}

export function mapFileFor(address: Address | null): string {
  if (!address) return "/maps/office3.json";
  if (address.floor.kind === "floor") {
    if (address.floor.level !== 3) return "/maps/floor.json";
    // Named by what hangs on the wall rather than by the building, so two
    // buildings running off the same boards share one map.
    return operationsMapFile(operationsBoards(address.tenant));
  }
  if (!hasFloors(address.tenant)) return `/maps/room-${address.tenant.slug}.json`;
  return address.tenant.game ? `/maps/lobby-${address.tenant.slug}.json` : "/maps/lobby.json";
}

/** Whether a slug names an organisation someone can call home. */
export function isHome(slug: string | null | undefined): slug is string {
  return ORGANISATIONS.some((o) => o.slug === slug);
}

// ── Who may ride the lift ───────────────────────────────

/**
 * Buildings whose upper floors are private, and who may go up.
 *
 * The lobby is always public — a visitor may walk in, look round and talk to
 * whoever is there. It is the floors above that are shut, because that is
 * where the desks and the agents are.
 *
 * Keyed by tenant slug, so making another building private is a line here
 * rather than a change anywhere else.
 */
export const PRIVATE_LIFTS: Record<string, readonly AccessIdentity[]> = {
  "sandbox-erp": ["coop", "rob"],
  "castle-atlantic": ["coop", "rob"],
};

/** What the lift says to somebody it will not carry. */
export const LIFT_REFUSAL = "Thou shall not pass!";

/** Whether a building's floors are anyone's but the public's. */
export function liftIsPrivate(slug: string): boolean {
  return slug in PRIVATE_LIFTS;
}

/**
 * Whether this identity may ride a building's lift.
 *
 * Everywhere not named is open to everybody, so a new building works without
 * being listed.
 */
export function mayRideLift(slug: string, identity: AccessIdentity): boolean {
  const allowed = PRIVATE_LIFTS[slug];
  return !allowed || allowed.includes(identity);
}

/**
 * Whether somebody arriving here should be put outside instead.
 *
 * The root is the default room, and the default room is an *office* —
 * somebody's building. A visitor has no building: no desk, no floors of
 * their own above the lobby. Landing them inside one puts them in the only
 * place on the map that is not really for them, with the door behind them
 * rather than in front. The world map is where the buildings are, so it is
 * where somebody who has not picked one belongs; `WORLD_SPAWN` already
 * stands them on the plaza.
 *
 * Only the root. A typed `/r/<slug>` still opens that lobby, because a lobby
 * is public and a shared link has to work. And only a visitor: somebody
 * whose own code names their building is not a stranger in it.
 */
export function landsOutside(pathname: string, identity: AccessIdentity): boolean {
  return pathname === "/" && identity === "visitor";
}

/** Where such a person is sent. */
export const OUTSIDE_PATH = "/world";

/**
 * Whether this identity may be in a room at all.
 *
 * The same rule as the lift, asked of a room slug instead of a building, so
 * the server can apply it to a socket joining `sandbox-erp-floor-2` without
 * caring how the browser got there. A lobby, the world map and a campus are
 * everyone's; only a private building's floors are not.
 */
export function mayEnterRoom(room: string, identity: AccessIdentity): boolean {
  const floor = parseFloorRoomSlug(room);
  return floor ? mayRideLift(floor.slug, identity) : true;
}
