/**
 * Who is in the room right now.
 *
 * Presence is deliberately not persisted: it changes twenty times a second and
 * means nothing once someone closes the tab. The hub holds it in memory, caps
 * the number of humans, and refuses movement that walking could not produce.
 *
 * The clock is injectable so the timing rules can be tested without waiting.
 */

import {
  IDLE_TIMEOUT_MS,
  MOVE_BUDGET_WINDOW_MS,
  MAX_HUMAN_PLAYERS,
  SPRINT_SPEED_PX_S,
  SPEED_TOLERANCE,
  type Facing,
  type PresencePlayer,
} from "../presence-types";

interface TrackedPlayer extends PresencePlayer {
  lastSeen: number;
  lastMoveAt: number;
  mic?: boolean;
  hidden?: boolean;
}

export interface JoinRequest {
  name: string;
  spriteKey: string;
  x: number;
  y: number;
  facing: Facing;
  /** A server-driven resident: takes no human seat and never times out. */
  resident?: boolean;
}

export type JoinResult =
  | { ok: true; player: PresencePlayer }
  | { ok: false; reason: "full"; capacity: number };

export interface HubOptions {
  capacity?: number;
  now?: () => number;
}

/** The answer to "who is standing here?" when nobody is, shared rather than made. */
const NOBODY: readonly string[] = [];

/** Trim a name to something that fits over a character's head. */
export function sanitiseName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 16);
  return cleaned || "Guest";
}

export class PresenceHub {
  private players = new Map<string, TrackedPlayer>();
  private now: () => number;
  readonly capacity: number;

  constructor(options: HubOptions = {}) {
    this.capacity = options.capacity ?? MAX_HUMAN_PLAYERS;
    this.now = options.now ?? (() => Date.now());
  }

  /** How many people — residents do not count against the room. */
  get count(): number {
    let humans = 0;
    for (const player of this.players.values()) if (!player.resident) humans++;
    return humans;
  }

  /**
   * Whether the room is full, which is a question about people.
   *
   * The cap counts humans, exactly as `count` does. It used to count
   * everybody in the hub, so the residents standing about in a room each
   * took one of its four places — and a lobby with two of them in it had
   * room for two visitors. That went unnoticed while a resident was
   * indoors only; the moment the world map became their room as well,
   * seven of them could be out there at once and the map filled up and
   * refused the next arrival, resident or person.
   */
  get isFull(): boolean {
    return this.count >= this.capacity;
  }

  join(id: string, request: JoinRequest): JoinResult {
    const existing = this.players.get(id);
    if (!existing && this.isFull) {
      return { ok: false, reason: "full", capacity: this.capacity };
    }

    const at = this.now();
    const player: TrackedPlayer = {
      id,
      name: sanitiseName(request.name),
      spriteKey: request.spriteKey,
      x: request.x,
      y: request.y,
      facing: request.facing,
      moving: false,
      resident: request.resident || undefined,
      lastSeen: at,
      lastMoveAt: at,
    };
    this.players.set(id, player);
    return { ok: true, player: strip(player) };
  }

  /**
   * Put a player where a scene says they stand. A join is the scene's word
   * on where a person is — through a door, off a ferry — so unlike a move it
   * is not held to walking speed from wherever they were before.
   */
  place(
    id: string,
    at: { x: number; y: number; facing: Facing; name?: string; spriteKey?: string },
  ): PresencePlayer | null {
    const player = this.players.get(id);
    if (!player) return null;
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return strip(player);
    const now = this.now();
    player.x = at.x;
    player.y = at.y;
    player.facing = at.facing;
    // A new look or name comes with a fresh join too.
    if (at.name) player.name = sanitiseName(at.name);
    if (at.spriteKey) player.spriteKey = at.spriteKey;
    // A scene saying where somebody stands is a scene drawing them, so
    // whatever they had stepped into they are out of it.
    player.hidden = false;
    player.moving = false;
    player.lastSeen = now;
    player.lastMoveAt = now;
    return strip(player);
  }

  /** Their microphone went on or off. */
  setMic(id: string, on: boolean): void {
    const player = this.players.get(id);
    if (player) player.mic = on;
  }

  /**
   * They stepped into the lift, or back out of it.
   *
   * They stay in the room and keep their place in the count — they have gone
   * out of sight, not out of the building. Only the drawing of them stops.
   */
  setHidden(id: string, hidden: boolean): void {
    const player = this.players.get(id);
    if (player) player.hidden = hidden;
  }

  leave(id: string): PresencePlayer | null {
    const player = this.players.get(id);
    if (!player) return null;
    this.players.delete(id);
    return strip(player);
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  /**
   * One player, by connection.
   *
   * `snapshot().find(...)` is the same answer and builds the whole room to
   * get it — a fresh object for every person present, thrown away but for
   * one. That is on the path of every remark, every board stroke and every
   * voice frame, which is exactly where a room with people in it does the
   * most work.
   */
  get(id: string): PresencePlayer | null {
    const player = this.players.get(id);
    return player ? strip(player) : null;
  }

  /**
   * Whether anybody at all is standing within `range` of a point, other
   * than `except` — a connection that is asking about itself.
   *
   * **Residents count here, and they are the only query where they do.** A
   * chicken is startled by whatever comes round the corner, and on a map
   * the locals cross all day half of what comes round it is one of them.
   * Asking this people-only made Michael a bird who could be walked up to
   * by exactly one kind of thing, which is not a fact about chickens.
   * `peopleNear` is still people-only, because what it feeds is a badge and
   * a resident holds none.
   *
   * Out of sight — in the lift — is nobody: there is nothing on the screen
   * to have come round a corner.
   *
   * It takes no allocation for the same reason `get` does not: this is
   * asked of a room on every tick of the simulation, and `snapshot().some(…)`
   * would build the whole room to answer it each time.
   */
  someoneNear(at: { x: number; y: number }, range: number, except?: string): boolean {
    const limit = range * range;
    for (const player of this.players.values()) {
      if (player.hidden || player.id === except) continue;
      const dx = player.x - at.x;
      const dy = player.y - at.y;
      if (dx * dx + dy * dy <= limit) return true;
    }
    return false;
  }

  /**
   * Who is standing nearest within `range`, other than `except`, or null.
   *
   * The third of these, and the narrowest caller: a resident who has just
   * been walked up to needs somewhere to run *away* from, which is a point
   * rather than a yes or a list of ids. `someoneNear` stays the tick check,
   * because it stops at the first it finds and allocates nothing; this
   * scans the room and hands back a point, and is asked only on the tick
   * somebody actually says something.
   *
   * The nearest rather than the first, because a chicken with two people
   * around him should put the near one behind him.
   *
   * Their connection comes back with the point, and whether they are a
   * resident with it, because two things want this answer and they want
   * different halves of it: the bolt wants somewhere to run away from,
   * whoever it is, and the egg a fright may leave behind is credited to
   * whoever caused it — which a resident cannot be, since a local holds
   * nothing. One scan of the room for both, since it is the same body.
   */
  nearestNeighbour(
    at: { x: number; y: number },
    range: number,
    except?: string,
  ): { id: string; x: number; y: number; resident: boolean } | null {
    let best = range * range;
    let found: { id: string; x: number; y: number; resident: boolean } | null = null;
    for (const player of this.players.values()) {
      if (player.hidden || player.id === except) continue;
      const dx = player.x - at.x;
      const dy = player.y - at.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > best) continue;
      best = d2;
      found = { id: player.id, x: player.x, y: player.y, resident: Boolean(player.resident) };
    }
    return found;
  }

  /**
   * Which people are standing within `range` of a point, by connection.
   *
   * `someoneNear` answers whether anybody is, which is all a resident needs
   * to decide whether to speak. This answers who, which is what a badge for
   * having stood beside somebody needs — and it is the one caller, so it
   * hands back the shared empty array rather than a fresh one whenever the
   * answer is nobody, which in a world of mostly empty rooms is nearly
   * always.
   *
   * People only, unlike the two above: what this feeds is a badge, and two
   * residents meeting on the green is the simulation rather than anybody
   * having met anybody.
   */
  peopleNear(at: { x: number; y: number }, range: number): readonly string[] {
    const limit = range * range;
    let near: string[] | null = null;
    for (const player of this.players.values()) {
      if (player.resident || player.hidden) continue;
      const dx = player.x - at.x;
      const dy = player.y - at.y;
      if (dx * dx + dy * dy <= limit) (near ??= []).push(player.id);
    }
    return near ?? NOBODY;
  }

  /**
   * Which people are standing inside a rectangle, by connection.
   *
   * The fourth of these and the only one that is not about a distance: a
   * car is a box rather than a radius, and what is being asked is whether
   * one is driving through somebody. Written like `peopleNear` and for the
   * same reasons — no allocation until there is somebody to name, which
   * out on an empty road is nearly always, and people only, because what
   * it feeds is a badge and a local holds none.
   *
   * Their position rather than their feet or their picture: a person is
   * the middle of their frame, which is about chest height, and a car is
   * eighty-eight pixels of picture through the same patch of road. There
   * is nothing to be exact about here — nothing collides, nothing moves,
   * and the answer is a badge.
   */
  peopleIn(box: { x: number; y: number; width: number; height: number }): readonly string[] {
    let inside: string[] | null = null;
    for (const player of this.players.values()) {
      if (player.resident || player.hidden) continue;
      if (player.x < box.x || player.x > box.x + box.width) continue;
      if (player.y < box.y || player.y > box.y + box.height) continue;
      (inside ??= []).push(player.id);
    }
    return inside ?? NOBODY;
  }

  /**
   * Apply a movement update. Positions are clamped to what sprinting could
   * cover since the player's last move — over a bounded window, so a modified
   * client cannot save up a teleport by standing still — which is what stops
   * one crossing the office in a single message.
   *
   * Being in a room at all is a separate question, and a separate answer:
   * `mayEnterRoom` on the join, not this.
   */
  move(
    id: string,
    update: { x: number; y: number; facing: Facing; moving: boolean },
  ): PresencePlayer | null {
    const player = this.players.get(id);
    if (!player) return null;
    if (!Number.isFinite(update.x) || !Number.isFinite(update.y)) return strip(player);

    const at = this.now();
    // Capped, or standing still banks distance: the budget is measured from
    // the last move, and a player who sends nothing for a minute could spend
    // all sixty seconds of it on one step. See MOVE_BUDGET_WINDOW_MS.
    const elapsedMs = Math.min(Math.max(at - player.lastMoveAt, 0), MOVE_BUDGET_WINDOW_MS);
    const budget = (SPRINT_SPEED_PX_S / 1000) * elapsedMs * SPEED_TOLERANCE;

    const dx = update.x - player.x;
    const dy = update.y - player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > budget && distance > 0) {
      // Move as far along their intended direction as walking allows
      const scale = budget / distance;
      player.x += dx * scale;
      player.y += dy * scale;
    } else {
      player.x = update.x;
      player.y = update.y;
    }

    player.facing = update.facing;
    player.moving = update.moving;
    player.lastSeen = at;
    player.lastMoveAt = at;
    return strip(player);
  }

  /** Note that a client is still alive without moving it. */
  touch(id: string) {
    const player = this.players.get(id);
    if (player) player.lastSeen = this.now();
  }

  /** Drop players who have gone quiet. Returns the ones removed. */
  sweep(): PresencePlayer[] {
    const at = this.now();
    const dropped: PresencePlayer[] = [];
    for (const [id, player] of this.players) {
      if (player.resident) continue;
      if (at - player.lastSeen > IDLE_TIMEOUT_MS) {
        this.players.delete(id);
        dropped.push(strip(player));
      }
    }
    return dropped;
  }

  snapshot(): PresencePlayer[] {
    return [...this.players.values()].map(strip);
  }
}

function strip(player: TrackedPlayer): PresencePlayer {
  return {
    id: player.id,
    name: player.name,
    spriteKey: player.spriteKey,
    x: Math.round(player.x * 100) / 100,
    y: Math.round(player.y * 100) / 100,
    facing: player.facing,
    moving: player.moving,
    ...(player.resident ? { resident: true } : {}),
    ...(player.mic ? { mic: true } : {}),
    ...(player.hidden ? { hidden: true } : {}),
  };
}
