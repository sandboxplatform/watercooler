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
  furnishedLobby,
  hasFloors,
  hasOperationsFloor,
  projectBoards,
  operationsBoards,
  operationsRoomCount,
  TENANTS,
  tenantFor,
  tenantsOf,
  type Tenant,
} from "./tenants";
import { residentsAt } from "./residents";
import { CAST } from "./cast";
import { CUBICLES_HEIGHT, cubicleCount, cubicleWidth } from "../map/cubicles";
import { OPS_HEIGHT, opsWidth } from "../map/floor";
import { HEIGHT as LOBBY_ROWS, TILE, WIDTH as LOBBY_COLS } from "../map/office";

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

/**
 * The building a room slug belongs to, floor or lobby.
 *
 * The other direction from `roomForFloor`, for the two sides that hold a
 * room rather than an address: a panel knows the room it is mounted in, and
 * a route is told one. Null for the world map, a campus, the default room
 * and anything that is not a building's.
 */
export function tenantInRoom(room: string | null | undefined): Tenant | null {
  if (!room) return null;
  const floor = parseFloorRoomSlug(room);
  return tenantFor(floor ? floor.slug : room);
}

/**
 * A room slug in words: the building and the floor — "Sandbox ERP ·
 * Floor 3 · Operations".
 *
 * For the places that hold a room and have to say where it is to somebody
 * standing somewhere else: a meeting called at the boardroom table is
 * announced to the rest of the building, and "sandbox-erp-floor-3" is a
 * slug rather than a place.
 *
 * Anything that is not a building's room — the world map, a campus, the
 * default room — comes back as its own slug rather than as an invented
 * name. Nothing outside a building announces itself today, and a wrong
 * name would be worse than a plain one.
 */
export function describeRoom(room: string): string {
  const tenant = tenantInRoom(room);
  if (!tenant) return room;
  const floor = parseFloorRoomSlug(room);
  const level = floor?.level;
  const where: Floor = level === 1 || level === 2 || level === 3 ? { kind: "floor", level } : LOBBY;
  return `${tenant.name} · ${floorTitle(where)}`;
}

/**
 * Whether this room has the boardroom table in it, which is the one place
 * a meeting can be called from.
 *
 * Every Operations floor has one (`opsBoardroom` in `lib/map/floor.ts`),
 * and nowhere else does. Asked of a room slug so the presence socket can
 * hold a `meeting` message to it without caring how the browser got there
 * — the panel only opens at the table, but a panel is decoration, exactly
 * as the character picker's was.
 */
export function hasBoardroom(room: string): boolean {
  const floor = parseFloorRoomSlug(room);
  return floor?.level === 3 && hasOperationsFloor(tenantFor(floor.slug));
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

/**
 * The building an organisation's people keep their desks in.
 *
 * A persona's `home` is an organisation and a desk stands in a building,
 * which for every organisation but one is the same thing. Homestar is the
 * exception — a campus of six premises — so its people's desks are in the
 * first of its buildings with floors to put them in, rather than one desk
 * each in all three of its office blocks. One person, one desk.
 */
function deskBuilding(orgSlug: string): Tenant | null {
  return tenantsOf(orgSlug).find(hasFloors) ?? null;
}

/**
 * Everyone with a desk on a building's People floor, in desk order.
 *
 * Read off the cast, which is the one place that knows who this world is
 * of — exactly as Floor 2's desks are read off `RESIDENTS`. Their id is
 * their `AccessIdentity`, so a person is one person here for the same
 * reason their badges follow them about.
 *
 * It was a register before: every browser that walked in posted a name and
 * a building under an id minted into its own localStorage, and a desk stood
 * for every row. A code names exactly one person, so that id was the one
 * thing about them that did not hold — a private window, a sign-out, a
 * cleared profile and every fresh machine was a new id, a new row and
 * another desk with the same name on it. Sandbox ERP's floor had seventeen
 * Coops on it and eight desks to draw them at.
 */
export function peopleAt(lobbySlug: string): Occupant[] {
  const tenant = tenantFor(lobbySlug);
  if (!tenant || deskBuilding(tenant.org)?.slug !== tenant.slug) return [];
  return CAST.filter((who) => who.kind === "person" && who.org === tenant.org).map((who) => ({
    id: who.id,
    name: who.name,
  }));
}

/** The floors of a building, bottom up, with who sits on each. */
export function floorsOf(tenant: Tenant): FloorStop[] {
  const floors: FloorStop[] = [
    { floor: LOBBY, label: floorTitle(LOBBY), names: [] },
    {
      floor: PEOPLE_FLOOR,
      label: floorTitle(PEOPLE_FLOOR),
      names: peopleAt(tenant.slug).map((p) => p.name),
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
export function occupantsOf(tenant: Tenant, floor: Floor): Occupant[] {
  if (floor.kind === "lobby") return [];
  if (floor.level === 1) return peopleAt(tenant.slug);
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
export function elevatorStops(address: Address): ElevatorStop[] {
  return floorsOf(address.tenant).map((stop) => ({
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
 *
 * `flow` is how many project boards hang, each in its own room with its own
 * stage counts, and it is in the name for the same reason the room count
 * is: those are points of interest on the walls, so two buildings that
 * differ only in that are different floors and sharing a file would give
 * one of them boards nobody can read. Zero for a building that names none,
 * which hangs one unnamed board and counts nothing — and leaves the name as
 * it always was, so Castle Atlantic's map did not move.
 */
export function operationsMapFile(boards: readonly string[], rooms: number, flow = 0): string {
  return `/maps/floor-ops-${[...boards].join("-")}-${rooms}${flow ? `-flow${flow}` : ""}.json`;
}

/**
 * The map file for a People floor with this many cubicles.
 *
 * Here rather than in the generator, for the reason the Operations one is:
 * the script writes the files this names and the scene asks for them by
 * the same rule.
 *
 * Named by the count and not by the building, so two buildings with the
 * same-sized bank share one map. Who sits in it is nothing the map knows —
 * a spare cubicle and an occupied one are the same tiles, and the name on
 * the wall and the eggs on the shelf are the scene's.
 */
export function cubiclesMapFile(cubicles: number): string {
  return `/maps/floor-cubicles-${cubicles}.json`;
}

/**
 * How many cubicles a building's People floor is drawn with: one per
 * person with a desk there, and never fewer than a floor is worth walking
 * along.
 *
 * Zero people is no floor of cubicles at all — most buildings in this
 * world have nobody with a desk in them, and a bank of four spares with
 * nobody's name on any of them is a room pretending to be about people.
 * Those keep the plain floor, which is what every floor was.
 */
export function cubiclesAt(tenant: Tenant): number {
  const people = peopleAt(tenant.slug).length;
  return people > 0 ? cubicleCount(people) : 0;
}

/**
 * How many cubicles the floor at this address has; zero where it is not a
 * bank of them.
 *
 * The one question the scene asks — it furnishes a People floor quite
 * differently from every other — so the two halves of the answer are put
 * together here rather than at the call site, where the level and the
 * building would be checked separately and could come apart.
 */
export function cubiclesOn(address: Address): number {
  return address.floor.kind === "floor" && address.floor.level === 1
    ? cubiclesAt(address.tenant)
    : 0;
}

/**
 * How many of a building's project boards count their stages, which is how
 * many rooms on its floor carry the five-tile plate.
 *
 * Every declared board does today; the distinction is kept because a
 * building can hang one unnamed board with no lanes at all, and that floor
 * is a different shape of map from one with a plate on the wall.
 */
function countedBoards(tenant: Parameters<typeof projectBoards>[0]): number {
  return projectBoards(tenant).filter((board) => board.lanes.length > 0).length;
}

export function mapFileFor(address: Address | null): string {
  if (!address) return "/maps/office3.json";
  if (address.floor.kind === "floor") {
    if (address.floor.level === 1) {
      // The People floor is a bank of cubicles where anybody has a desk
      // here, and the plain floor where nobody does.
      const cubicles = cubiclesAt(address.tenant);
      return cubicles ? cubiclesMapFile(cubicles) : "/maps/floor.json";
    }
    if (address.floor.level !== 3) return "/maps/floor.json";
    // Named by what hangs on the wall rather than by the building, so two
    // buildings running off the same boards share one map.
    return operationsMapFile(
      operationsBoards(address.tenant),
      operationsRoomCount(address.tenant),
      countedBoards(address.tenant),
    );
  }
  if (!hasFloors(address.tenant)) return `/maps/room-${address.tenant.slug}.json`;
  // Furnished lobbies are particular to their building; the empty ones all
  // share one map. `furnishedLobby` is also what build:map writes from, so
  // the file named here is a file that exists.
  return furnishedLobby(address.tenant)
    ? `/maps/lobby-${address.tenant.slug}.json`
    : "/maps/lobby.json";
}

/**
 * The widest room in the world and the tallest, in pixels: what every
 * room's camera may pull back far enough to see whole, and no further
 * (`zoomFloor` in `lib/camera.ts`).
 *
 * Two kinds of room grow — an Operations floor with its projects and a bank
 * of cubicles with its people — and every other room is a fixed size no
 * bigger than a lobby. So it is read off the buildings rather than written
 * down: a project taken on moves it the day the corridor gets longer, which
 * a 73 in the camera would not. `floors.test.ts` holds it to every map on
 * disk.
 */
export function widestRoom(): { width: number; height: number } {
  let cols = LOBBY_COLS;
  let rows = LOBBY_ROWS;
  for (const tenant of TENANTS) {
    const rooms = operationsRoomCount(tenant);
    if (rooms > 0) {
      cols = Math.max(cols, opsWidth(rooms));
      rows = Math.max(rows, OPS_HEIGHT);
    }
    const cubicles = cubiclesAt(tenant);
    if (cubicles > 0) {
      cols = Math.max(cols, cubicleWidth(cubicles));
      rows = Math.max(rows, CUBICLES_HEIGHT);
    }
  }
  return { width: cols * TILE, height: rows * TILE };
}

/** Whether a slug names an organisation someone can call home. */
export function isHome(slug: string | null | undefined): slug is string {
  return ORGANISATIONS.some((o) => o.slug === slug);
}

// ── Who may ride the lift ───────────────────────────────

/**
 * Buildings whose upper floors are shut to the public.
 *
 * The lobby is always public — a visitor may walk in, look round and talk to
 * whoever is there. It is the floors above that are shut, because that is
 * where the desks and the agents are.
 *
 * A list of slugs, so making another building private is a line here rather
 * than a change anywhere else, and everywhere unlisted is open to whoever
 * walks up. It used to say *who* may go up in each — which could not express
 * either of the rules below: a person barred from the public lifts too, or
 * one who should be carried up in a building nobody has made private yet.
 */
export const PRIVATE_LIFTS: readonly string[] = ["sandbox-erp", "castle-atlantic"];

/**
 * How far up each person may go, where it is their own business rather than
 * the building's.
 *
 * `"every"` is every lift in the world, including any building made private
 * after this was written — which is what "all the elevators" has to mean, or
 * it quietly stops being true the next time a building is shut. A list is
 * exactly those buildings and nowhere else, public lifts included: Hunter
 * works at Castle Atlantic and rides Castle Atlantic's.
 *
 * **An empty list is not the same as no entry.** No entry means the person is
 * held to the building's own rule, which is how a visitor — and Nick, who is
 * a friend rather than an employee — gets every lift but the private ones. An
 * empty list means no lift anywhere, and anything reading this with
 * `if (!reach)` would hand its holder the lot instead. Nobody holds one
 * today; `floors.test.ts` keeps the two apart all the same.
 *
 * The buildings are named one by one rather than by organisation, because
 * this answers a room slug: Homestar is a campus, so Campbell's reach is the
 * three of its buildings with floors above the ground — its store, warehouse
 * and field crew have no lift to ride.
 */
export const LIFT_REACH: Partial<Record<AccessIdentity, "every" | readonly string[]>> = {
  coop: "every",
  rob: "every",
  hunter: ["castle-atlantic"],
  nathan: ["sandbox-erp"],
  sara: ["sandbox-erp"],
  andrew: ["sandbox-erp"],
  campbell: ["homestar-sales", "homestar-finance", "homestar-operations"],
};

/** What the lift says to somebody it will not carry. */
export const LIFT_REFUSAL = "Thou shall not pass!";

/** Whether a building's floors are anyone's but the public's. */
export function liftIsPrivate(slug: string): boolean {
  return PRIVATE_LIFTS.includes(slug);
}

/**
 * Whether this identity may ride a building's lift.
 *
 * Their own reach answers it when they have one; otherwise the building
 * does, so a new building works without being listed anywhere.
 */
export function mayRideLift(slug: string, identity: AccessIdentity): boolean {
  const reach = LIFT_REACH[identity];
  if (reach === undefined) return !liftIsPrivate(slug);
  return reach === "every" || reach.includes(slug);
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
 * is public and a shared link has to work. And only somebody with nowhere of
 * their own: a person whose code names their building is not a stranger in
 * it.
 *
 * `hasBuilding` rather than the identity, because that is the actual
 * question and the two stopped agreeing. Asking whether somebody was a
 * visitor was the same thing only while visitors were the only people
 * without a building — Campbell has a code of his own and works nowhere yet,
 * and the root is no more his than it is a stranger's.
 */
export function landsOutside(pathname: string, hasBuilding: boolean): boolean {
  return pathname === "/" && !hasBuilding;
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
