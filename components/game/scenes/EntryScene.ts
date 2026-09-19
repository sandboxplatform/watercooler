import * as Phaser from "phaser";
import { routeScenes } from "../systems/scene-router";

/**
 * The way in, and the doorkeeper after that.
 *
 * It draws nothing. It is the scene Phaser starts on boot — the first in the
 * list, which is the only reason it exists as a scene at all — and its whole
 * job is to hold the router: put up the place the address bar names, and put
 * up another whenever the address changes.
 *
 * It used to read the address once, start one of the three place scenes and
 * never be heard from again, because a change of place was a change of page.
 * It is not any more: a room change is a `travelTo`, which pushes the URL and
 * says so, and this is what listens. Staying alive is the point — a router
 * that hands over and shuts down has nobody to hear the next move.
 */
export class EntryScene extends Phaser.Scene {
  private stopRouting: (() => void) | null = null;

  constructor() {
    super({ key: "EntryScene" });
  }

  create() {
    this.stopRouting = routeScenes(this.game);
    const letGo = () => {
      this.stopRouting?.();
      this.stopRouting = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, letGo);
    this.events.once(Phaser.Scenes.Events.DESTROY, letGo);
  }
}
