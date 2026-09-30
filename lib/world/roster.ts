/**
 * The roster: who the residents are, and nothing about where they go.
 *
 * A resident is a character who lives in the buildings — somebody the server
 * walks about on a routine rather than somebody at a keyboard. This is the
 * list of them, what each looks like, who they work for and which desk is
 * theirs; `residents.ts` beside it is where they go and how they get there.
 *
 * **Two files because two different things read them.** The HUD and the
 * scenes want the names — the People panel, the lift's list of who works on
 * a floor, the picker that keeps a resident's face out of everybody else's
 * reach — and the server wants the routes. The routes are read off the world
 * map, and the world map is a couple of thousand trees planted at module
 * load: a fifth of a second of work before first paint, which is what every
 * page paid for a list of seven names while this was one file. So this one
 * imports nothing that knows where a tree is.
 *
 * Nothing here touches Phaser, the DOM or the server.
 */

import type { Facing } from "../presence-types";
import { floorRoomSlug } from "../rooms";
import { operationsRoomCount, tenantFor, type Rect } from "./tenants";
import { opsSupportPost } from "../map/floor";
import { standingSpot } from "./desks";

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
  /**
   * What they say when somebody walks up to them.
   *
   * Not one of `lines`: those are remarks on arriving somewhere, which is a
   * thing the resident does, and this is an answer to somebody else turning
   * up. The simulation is what decides how near is near and how often it
   * bears saying.
   */
  greeting?: string;
  /**
   * Whether a fright now and then leaves an egg behind.
   *
   * A mode like `wanders`, rather than a check for a particular id: what
   * lays eggs is a chicken, and the day a second one turns up the rule
   * should already be written. It only ever fires alongside a `greeting`,
   * since the egg comes of the fright and the fright comes of the cluck —
   * see `EGG_CHANCE` in lib/world/eggs.ts for how often.
   */
  lays?: boolean;
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

/** The floor the agents' desks are on. */
export const AGENTS_LEVEL = 2;

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
  // Sara is not here: she holds a code of her own and walks in as herself,
  // at a keyboard rather than on a routine (`PERSONAS` in
  // lib/server/access.ts). Which is also what frees her sheet — `RESERVED`
  // in lib/characters/library.ts is built from this list, and a reserved
  // look is out of the library `looksFor` searches, so a persona named
  // after a resident could not have been dressed in their own face.
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
    greeting: "Cluck!",
    lays: true,
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

/** Which desk slot a resident has on their building's agents' floor; -1 without one. */
export function deskOf(resident: Resident): number {
  if (!resident.home) return -1;
  return residentsAt(resident.home).findIndex((r) => r.id === resident.id);
}

/** Where a resident stands when at their desk: the sprite's centre. */
export function deskSpot(resident: Resident): { x: number; y: number } {
  return standingSpot(Math.max(0, deskOf(resident)));
}
