/**
 * The mailbox outside a customer's building, and where its bubble hangs.
 *
 * Six of the businesses on the world map are customers of Sandbox ERP's
 * support desk. Each has a mailbox standing beside its front corner with a
 * little speech bubble over it saying how many tickets they have open — so
 * walking the map is how you see who is waiting on a lot, without opening a
 * panel or going up to anybody's Operations floor.
 *
 * **Who the customers are is the desk's business and stays on the server**
 * (`lib/server/customers.ts`): the Zoho account ids and the email domains
 * their people write in from are how a ticket is attributed, and this
 * module is imported by the scene, so anything in it ships in the bundle to
 * every visitor. What is here is the half of the fact the map needs — which
 * building, and what the desk calls them — and `customers.test.ts` holds the
 * two lists to agreeing about both.
 *
 * Nothing here touches Phaser, so where the boxes stand can be checked
 * without a browser.
 */

import { BUILDINGS } from "./tenants";

/**
 * The mailbox's picture, in pixels.
 *
 * Written here rather than in `PROPS`, because three things want it: the
 * prop's own entry in `scenery.ts`, the bubble that hangs above it, and
 * `make-world-art.mjs`, which draws it and writes the numbers a third time
 * because a `.mjs` cannot import a `.ts` — the arrangement the eggs' shell
 * tones and the basketball board's measurements are already under.
 */
export const MAILBOX = { width: 40, height: 72 } as const;

/**
 * How far above the box's feet the bubble sits: clear of the picture, with
 * a gap for the tail to point down through.
 */
export const BUBBLE_ABOVE = MAILBOX.height + 10;

/**
 * Which organisation on the map is a customer of the desk, and what Zoho
 * calls them — which is not always the name over the door: the company that
 * runs the desk is filed as plain "Sandbox".
 *
 * Four of the desk's ten customers have no premises in this world and so
 * have no mailbox; five of the buildings on the map are not customers and
 * get none either. Both lists are the honest ones — see
 * `lib/server/customers.ts`.
 */
export const CUSTOMER_ORGS: readonly {
  org: string;
  customer: string;
  /** Which corner the box stands at. The right, unless there is a reason. */
  side?: "left";
}[] = [
  // Castle Atlantic's right-hand corner is the plaza's top-left one — the
  // slabs begin at the tile the box would stand on — so it takes the other
  // corner. The one exception, and `scenery.test.ts` is what found it: a
  // prop on a walkway is something everybody walks round for ever, and the
  // plaza is the busiest ground in the world.
  { org: "castle-atlantic", customer: "Castle Atlantic", side: "left" },
  { org: "sandbox-erp", customer: "Sandbox" },
  { org: "homestar", customer: "Homestar" },
  { org: "maccallum", customer: "MacCallum" },
  { org: "masstown", customer: "Masstown" },
  { org: "targetts", customer: "Targetts" },
];

/**
 * How far off the building's bottom-right corner the box stands.
 *
 * Beside the corner rather than at the door, which is where the first
 * attempt put it: every building on this map carries the same door
 * furniture — two bushes at the frame's edges and two lamps at the door's
 * centre give or take sixty-eight pixels — so a box measured off the door
 * landed on a lamp at three of the six, and moving it clear of the lamps put
 * it out on the path or, for the two shops standing two rows off the
 * promenade, in the road. The corner is free at all six, and it reads as the
 * box being *this* shop's rather than as another thing on the path to it.
 *
 * `down` is what puts it a shade in front of its own building: out of doors
 * everything sorts by the bottom of its own picture, and a box drawn at
 * exactly the wall's foot is a box and a wall at one depth arguing about
 * which is in front.
 */
const BESIDE = 24;
const DOWN = 8;

export interface Mailbox {
  /** The organisation whose building it stands at. */
  org: string;
  /** What the desk calls them. */
  customer: string;
  /** Feet: bottom centre, in world pixels, like every other prop. */
  x: number;
  y: number;
}

/**
 * Every mailbox on the world map, read off the buildings so that one moving
 * carries its box with it.
 */
export const MAILBOXES: readonly Mailbox[] = CUSTOMER_ORGS.map(({ org, customer, side }) => {
  // `!` with a test behind it, the way `tenants.ts` names an organisation: a
  // customer naming a building that is not on the map is a mistake to fail
  // on rather than a mailbox to quietly not draw.
  const { frame } = BUILDINGS.find((b) => b.org?.slug === org)!;
  return {
    org,
    customer,
    x: side === "left" ? frame.x - BESIDE : frame.x + frame.width + BESIDE,
    y: frame.y + frame.height + DOWN,
  };
});

/** The box outside a given organisation's building, if it has one. */
export function mailboxFor(org: string | null | undefined): Mailbox | null {
  return MAILBOXES.find((m) => m.org === org) ?? null;
}
