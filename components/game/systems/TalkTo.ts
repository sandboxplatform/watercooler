import * as Phaser from "phaser";

import { PRESS_E_STYLE } from "@/lib/constants";
import { gameEvents } from "@/lib/events";
import { fixture, type FixtureId } from "@/lib/fixtures";
import { docConversation } from "@/lib/mettara-client";
import { keepLegible, legible } from "./legible";
import type { ScenePresence } from "./scene-presence";

/**
 * The people you can walk up to and press E at.
 *
 * Everything else in the fixture registry is read off the tilemap once,
 * when the room is built, because a board on a wall is where it is. A
 * person is not: Doc paces the floor behind the support queue and spends
 * the rest of his day out on the world map, and where he is standing this
 * frame is the roster's to say. So the registry entry is the same shape as
 * every other — one query parameter, an open event paired with a close, a
 * panel on the far side of the bus — and only the anchor differs, which is
 * what `person` on a `FixtureSpec` is.
 *
 * It is a system rather than a branch inside `FixtureManager` because the
 * office is not the only place it has to work. A resident you can only
 * talk to at his desk is one you would meet on the plaza and find nothing
 * to do with, so `OfficeScene` and `OutdoorScene` both run one of these —
 * the two scenes that have people in them at all.
 */

/** Over everything, which out of doors is a bigger number than it looks. */
const OVER_EVERYTHING = 10_000;

/**
 * Somebody worth walking up to, and what opening them is pointed at.
 *
 * `subject` answers two questions at once, which is why it is one call.
 * What comes back rides out on the open event, so the panel is already
 * pointed somewhere by the time it renders — and **whether anything comes
 * back at all is whether the prompt appears**. Doc's conversation is one
 * person's (see app/api/mettara/route.ts), so for everybody else the
 * answer is null and he is a resident who says his line and no more.
 *
 * A promise because the server is the side that knows, and the browser
 * must not be the one deciding: asked once, and null until it lands, on
 * the same rule every other gate in this app is under — what is open while
 * it waits is not a gate.
 */
export interface Talkable {
  id: FixtureId;
  subject: () => Promise<string | null>;
}

/** Everybody in the world there is anything to say to. One, today. */
export const TALKABLE: readonly Talkable[] = [{ id: "doc-chat", subject: docConversation }];

export class TalkTo {
  private prompts = new Map<FixtureId, Phaser.GameObjects.Text>();
  /** What each one opens onto, once the server has answered for it. */
  private subjects = new Map<FixtureId, string>();
  /** Which of these panels are up, so the prompt goes and the press is spent. */
  private up = new Set<FixtureId>();
  private unsubs: (() => void)[] = [];
  private live = true;

  constructor(
    private scene: Phaser.Scene,
    /**
     * The other people in this place. A function rather than the thing,
     * because a scene builds its systems before it attaches presence and
     * takes presence down again on the way out.
     */
    private presence: () => ScenePresence | null,
    talkable: readonly Talkable[] = TALKABLE,
  ) {
    for (const who of talkable) {
      const spec = fixture(who.id);
      // A `Talkable` naming a fixture with no `person` has nobody to hang
      // its prompt on. The registry's test is what catches that; here it is
      // simply nothing to do.
      if (!spec.person) continue;

      const prompt = scene.add
        .text(0, 0, spec.prompt, PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
        .setResolution(window.devicePixelRatio * 2)
        .setOrigin(0.5, 1)
        // A flat number, and a big one, because the two places this runs
        // stack things differently: a room puts its people at one depth and
        // the world map gives everyone a depth off their own feet, which
        // runs to thousands. A constant right for one would draw this
        // through the scenery in the other.
        .setDepth(OVER_EVERYTHING)
        .setVisible(false);
      prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      // A label floating over the world, so it keeps the size it was
      // written however far out the camera stands.
      keepLegible(scene, prompt);
      this.prompts.set(spec.id, prompt);

      void who.subject().then((subject) => {
        if (subject && this.live) this.subjects.set(spec.id, subject);
      });

      // The panel's own events rather than a flag set where the press is
      // taken: `?doc=1` opens it too, and a prompt still showing under a
      // panel that is already up is an invitation to press E twice.
      this.unsubs.push(
        gameEvents.on(spec.opens, () => this.up.add(spec.id)),
        gameEvents.on(spec.closes, () => this.up.delete(spec.id)),
      );
    }
  }

  /** Whether one of these panels is up, so the scene holds the character still. */
  anyOpen(): boolean {
    return this.up.size > 0;
  }

  /**
   * Show the prompt over whoever is worth talking to, and open them if the
   * press was for it. True when the press was taken, so a scene can keep
   * one press from doing two things.
   */
  update(at: { x: number; y: number }, interactPressed: boolean): boolean {
    let took = false;
    for (const [id, prompt] of this.prompts) {
      const spec = fixture(id);
      const subject = this.subjects.get(id);
      // Nothing to say to us, or the server has not answered yet: no
      // prompt, and a press goes past to whatever else wanted it.
      const them = subject ? this.whereIs(spec.person!) : null;
      const near =
        them !== null && Phaser.Math.Distance.Between(at.x, at.y, them.x, them.y) < spec.radius;
      const open = this.up.has(id);

      prompt.setVisible(near && !open);
      if (near && them) prompt.setPosition(them.x, them.y - spec.promptLift);

      if (near && them && subject && interactPressed && !open && !took) {
        prompt.setVisible(false);
        gameEvents.emit(spec.opens, subject);
        took = true;
      }
    }
    return took;
  }

  /**
   * Where somebody is, if they are here and there is anything to see of
   * them.
   *
   * **Where they are drawn**, not where the roster says they are, and the
   * two are different whenever anybody is walking: a remote character eases
   * toward the position the server reported rather than snapping to it, so
   * a prompt hung off the roster runs ahead of the person it is about —
   * about half a tile for a resident pacing a floor, which reads as a label
   * belonging to whoever happens to be standing under it.
   *
   * It answers null for somebody out of sight as well as for somebody who
   * is not here: in the lift, or through a door and not yet arrived. A
   * prompt over a character nobody can see is a prompt floating in an empty
   * doorway.
   */
  private whereIs(id: string): { x: number; y: number } | null {
    return this.presence()?.drawnAt(id) ?? null;
  }

  destroy() {
    this.live = false;
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    const keeper = legible(this.scene);
    for (const prompt of this.prompts.values()) {
      keeper.forget(prompt);
      prompt.destroy();
    }
    this.prompts.clear();
    this.up.clear();
  }
}
