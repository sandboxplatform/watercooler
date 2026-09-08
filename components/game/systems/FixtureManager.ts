import * as Phaser from "phaser";
import { gameEvents } from "@/lib/events";
import { asset } from "@/lib/assets";
import { PRESS_E_STYLE } from "@/lib/constants";
import { addSign } from "../utils/signs";
import { keepLegible } from "./legible";
import type { POIDef } from "../utils/MapHelpers";
import { FIXTURES, FIXTURE_ART, type FixtureId, type FixtureSpec } from "@/lib/fixtures";

/**
 * Everything you can walk up to and press E at, from `config/fixtures.ts`.
 *
 * One loop over the registry does what six hand-written copies used to do
 * in `OfficeScene`: find the points of interest, stand the art on them,
 * hang the signs, float a prompt when the player is close, emit the panel's
 * open event, and know which panels are open so the character stands still
 * under them.
 *
 * The scene keeps the boss's terminal to itself. It looks like a fixture
 * and is not one: it is only there when the room has seats, it defers to a
 * worker standing nearby, and its prompt hangs off the corner of the seat
 * rather than over a thing. Forcing it into the registry would mean three
 * optional fields used by one entry.
 */

/** The art stands with the room's other props. */
const FIXTURE_DEPTH = 4;
/** Prompts float over everything; the same depth the terminal's uses. */
const PROMPT_DEPTH = 20;

interface Placed {
  spec: FixtureSpec;
  /** Where this fixture is in this room — empty if the room has none. */
  zones: { x: number; y: number }[];
  prompt: Phaser.GameObjects.Text | null;
}

export class FixtureManager {
  private placed: Placed[] = [];
  private unsubs: (() => void)[] = [];
  /**
   * Which panels are up. Kept here rather than on the entries so that
   * `subscribe` works before `place` has run and does not care what this
   * particular room happens to carry.
   */
  private openPanels = new Set<FixtureId>();

  constructor(private scene: Phaser.Scene) {}

  /** Every fixture's art, in one pass, for the scene's `preload`. */
  static preload(scene: Phaser.Scene) {
    for (const art of FIXTURE_ART) scene.load.image(art.key, asset(art.file));
  }

  /**
   * Read the room's points of interest: what it carries, where, with the
   * art standing on it and its sign above.
   *
   * `room` is the building's slug, for the one sign whose words depend on
   * it: the arcade cabinet is the same machine in every lobby and a
   * different game in each, so its sign is asked for rather than written
   * down. Null where there is no building — the default room, a scene that
   * does not know its address.
   */
  place(pois: POIDef[], room: string | null = null) {
    this.placed = FIXTURES.map((spec) => {
      const found = pois.filter((poi) => spec.match.test(poi.name));
      // Every match, or only the first: a lobby hangs several boards and
      // they all open the one shared canvas; there is one cauldron.
      const zones = (spec.many ? found : found.slice(0, 1)).map((poi) => ({ x: poi.x, y: poi.y }));
      for (const zone of zones) this.furnish(spec, zone, room);
      return { spec, zones, prompt: null };
    });
  }

  /** Stand the art on a point and hang its sign over whatever that covers. */
  private furnish(spec: FixtureSpec, zone: { x: number; y: number }, room: string | null) {
    // With no art of its own — the whiteboard, which the map draws — the
    // sign is measured from the point itself.
    let edge = zone.y - (spec.sign?.lift ?? 0);
    if (spec.art) {
      const art = this.scene.add.image(zone.x, zone.y - spec.art.lift, spec.art.key);
      art.setDepth(FIXTURE_DEPTH);
      edge = art.getTopCenter().y;
    }
    if (!spec.sign) return;
    const label = typeof spec.sign.label === "function" ? spec.sign.label(room) : spec.sign.label;
    addSign(this.scene, { x: zone.x + (spec.sign.nudgeX ?? 0), y: zone.y }, label, edge);
  }

  /**
   * The floating `Press E` for each fixture the room actually has. Made
   * once and moved about, since a room can hang several whiteboards and
   * only the nearest is ever prompted for.
   */
  createPrompts() {
    for (const entry of this.placed) {
      if (!entry.zones.length) continue;
      entry.prompt = this.scene.add
        .text(0, 0, entry.spec.prompt, PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
        .setResolution(window.devicePixelRatio * 2)
        .setOrigin(0.5, 1)
        .setDepth(PROMPT_DEPTH)
        .setVisible(false);
      entry.prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      // Grows upward from its anchor, so it clears the thing it is about
      // whatever size it is drawn at.
      keepLegible(this.scene, entry.prompt);
    }
  }

  /**
   * Follow every panel's open and close events.
   *
   * Listening for the open events rather than only setting a flag where
   * they are emitted means a panel opened any other way — the `?pinball=1`
   * and `?board=1` links, say — still stops the character walking about
   * behind it. Returns one teardown for the lot, which is the point: the
   * scene restarts on every lift ride, and a subscription missing from a
   * hand-written list of unsubs is a listener leak per floor.
   */
  subscribe(): () => void {
    for (const spec of FIXTURES) {
      this.unsubs.push(
        gameEvents.on(spec.opens, () => this.openPanels.add(spec.id)),
        gameEvents.on(spec.closes, () => this.openPanels.delete(spec.id)),
      );
    }
    return () => this.destroy();
  }

  /** Whether any fixture's panel is up, so the scene holds the character still. */
  anyOpen(): boolean {
    return this.openPanels.size > 0;
  }

  /**
   * Show the prompt for whatever the player is standing at, and open it if
   * they pressed E. True when the press was taken, so the scene knows to
   * leave the frame alone.
   */
  update(at: { x: number; y: number }, interactPressed: boolean): boolean {
    for (const entry of this.placed) {
      const nearest = this.nearest(at, entry.zones);
      const near = nearest !== null && nearest.distance < entry.spec.radius;
      const open = this.openPanels.has(entry.spec.id);

      entry.prompt?.setVisible(near && !open);
      if (near && nearest) {
        entry.prompt?.setPosition(nearest.zone.x, nearest.zone.y - entry.spec.promptLift);
      }

      if (near && interactPressed) {
        entry.prompt?.setVisible(false);
        gameEvents.emit(entry.spec.opens);
        return true;
      }
    }
    return false;
  }

  private nearest(
    at: { x: number; y: number },
    zones: { x: number; y: number }[],
  ): { zone: { x: number; y: number }; distance: number } | null {
    let best: { zone: { x: number; y: number }; distance: number } | null = null;
    for (const zone of zones) {
      const distance = Phaser.Math.Distance.Between(at.x, at.y, zone.x, zone.y);
      if (!best || distance < best.distance) best = { zone, distance };
    }
    return best;
  }

  private destroy() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.openPanels.clear();
  }
}
