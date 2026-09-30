/**
 * Doorway geometry and the rule for when stepping into one counts.
 *
 * Kept apart from the Phaser scene so it can be reasoned about and tested
 * without a canvas: the scene supplies positions, this decides whether a door
 * should be open and whether someone has just gone through it.
 */

export interface DoorZone {
  name: string;
  /** Where this doorway leads. A scene key, resolved by the caller. */
  target: string;
  /** Pixel rectangle of the opening. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Which way you leave through it. Also decides how the art hangs: a doorway
   * in the top wall drops down from it, one in the bottom wall stands up out
   * of it, and the sprite is three tiles tall either way.
   */
  facing?: "up" | "down" | "left" | "right";
}

export interface Point {
  x: number;
  y: number;
}

/** Centre of a zone, which is what proximity is measured against. */
export function centreOf(zone: DoorZone): Point {
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

/**
 * Whether anyone is close enough for the door to open.
 *
 * Doors open for agents as well as people — a worker walking past should not
 * have to phase through a shut door — so this takes every body in the room.
 */
export function anyoneNear(zone: DoorZone, bodies: Point[], radius: number): boolean {
  const c = centreOf(zone);
  return bodies.some((b) => {
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    return dx * dx + dy * dy < radius * radius;
  });
}

/** Whether a point is within the doorway itself. */
export function insideZone(zone: DoorZone, p: Point): boolean {
  return p.x >= zone.x && p.x < zone.x + zone.width && p.y >= zone.y && p.y < zone.y + zone.height;
}

const NONE_ENTERED: readonly DoorZone[] = Object.freeze([]);

/**
 * Fires once per entry, not once per frame.
 *
 * Standing in a doorway is a dozen frames at 60fps, and each would otherwise
 * be another attempt to load the next room. The latch only reports the
 * transition on the frame the player crosses in, and re-arms when they leave.
 */
export class DoorLatch {
  private inside = new Set<string>();
  /** The other half of a double buffer, so a frame allocates no set of its own. */
  private next = new Set<string>();

  /**
   * Returns the zones just entered this frame — almost always none, which is
   * one shared empty list rather than a fresh one sixty times a second.
   *
   * Passing every zone each call, rather than one at a time, is what lets a
   * player leave one doorway and enter another in the same frame without the
   * first staying latched.
   */
  step(zones: readonly DoorZone[], player: Point): readonly DoorZone[] {
    let entered: DoorZone[] | null = null;
    this.next.clear();

    for (const zone of zones) {
      if (!insideZone(zone, player)) continue;
      this.next.add(zone.name);
      if (!this.inside.has(zone.name)) (entered ??= []).push(zone);
    }

    const was = this.inside;
    this.inside = this.next;
    this.next = was;
    return entered ?? NONE_ENTERED;
  }

  /** Forget where the player was, so re-entry fires again. Used after a scene change. */
  reset() {
    this.inside.clear();
  }
}
