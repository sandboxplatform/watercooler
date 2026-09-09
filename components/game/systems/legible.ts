import * as Phaser from "phaser";
import { legibleScale } from "@/lib/legible";

/**
 * The lettering in a scene that has to stay readable, kept in step with the
 * camera.
 *
 * `lib/legible.ts` is the rule; this is what applies it. Anything registered
 * here is rescaled whenever the zoom changes, so a prompt, a name tag or a
 * sign is the size it was written however far out the camera is standing.
 *
 * **Not everything lettered into the world belongs here.** Two kinds of text
 * live in a room and they want opposite things:
 *
 * - **Labels** float above the world and are read one at a time — a `Press
 *   E`, somebody's name, the chip over a fixture. Growing one costs nothing,
 *   because there is nothing underneath it that it has to line up with.
 * - **Lettering painted into the layout** is sized to the geometry around it:
 *   the building's name across a wall, `SUPPORT` in the two tiles the
 *   pictures leave it, the five counts inside their bays. Growing one of
 *   those does not make it readable, it makes it overlap the thing next to
 *   it. They are decoration and dashboards respectively, and the way to read
 *   a dashboard on a handset is the panel behind it.
 *
 * So the boards' own figures and the wall signs stay out, deliberately, and
 * the prompt that opens the panel is in.
 *
 * The registry is found by scene rather than passed down, because the objects
 * that want it are built five constructors deep — a remote player's name tag
 * is made by `RemotePlayerManager`, which `attachPresence` builds, which
 * every scene shares. Threading a handle through all of that to set one
 * number is worse than looking it up. It is keyed weakly and holds nothing
 * but the scene's own objects, so it goes when the scene does.
 */

/** Anything with a scale, which is every game object and every container. */
type Scalable = Phaser.GameObjects.GameObject & {
  setScale(x: number, y?: number): unknown;
  scaleX: number;
};

const registries = new WeakMap<Phaser.Scene, Legible>();

export class Legible {
  private objects = new Set<Scalable>();
  /** The scale currently written on them, so a still camera costs nothing. */
  private applied = 0;

  constructor(private scene: Phaser.Scene | null) {}

  /** Keep these readable. Returns nothing: the objects are the caller's. */
  keep(...objects: Scalable[]) {
    // Every add is a chance to let go of what has been destroyed, and adds
    // are the only thing that grows this — which matters out of doors, where
    // the residents standing about are taken down and put up again every ten
    // seconds and nobody need ever touch the zoom.
    this.prune();
    for (const object of objects) this.objects.add(object);
    // Everything, not just what arrived: a scene registers in two waves
    // either side of the camera being fitted — the room's signs during
    // `create`, and the people in it after — and the zoom is different by
    // then. Scaling only the new arrivals and recording their scale is what
    // left the signs at the size they were made and `update` with nothing
    // to notice, so a room's own labels stayed small while every name tag
    // in it was right.
    this.apply(this.scale());
  }

  /** Stop tracking one — for an object destroyed before its scene is. */
  forget(...objects: Scalable[]) {
    for (const object of objects) this.objects.delete(object);
  }

  /**
   * Call from the scene's `update`.
   *
   * Polled rather than subscribed, because the zoom is moved from four
   * places — the wheel, a pinch, the viewport resizing, and the fit a room
   * opens at — and Phaser announces none of them. A float comparison a frame
   * is cheaper than the bug where one of the four forgets to say so.
   */
  update() {
    const scale = this.scale();
    if (scale === this.applied) return;
    this.prune();
    this.apply(scale);
  }

  private apply(scale: number) {
    this.applied = scale;
    for (const object of this.objects) object.setScale(scale);
  }

  /** Let go of anything destroyed: Phaser clears an object's scene on destroy. */
  private prune() {
    for (const object of this.objects) {
      if (!object.scene) this.objects.delete(object);
    }
  }

  private scale(): number {
    return legibleScale(this.scene?.cameras.main?.zoom ?? 1);
  }
}

/**
 * This scene's registry, made on first use.
 *
 * The scene may be gone, which is why it is allowed to be null rather than
 * merely typed as though it never is. A destroy path asks for the registry
 * to `forget` what it is taking down — and it asks the way everything in
 * this layer does, off the object it is destroying: `legible(sprite.scene)`.
 * Phaser clears an object's `scene` when it destroys it, and a scene's
 * shutdown destroys its display list *before* the shutdown handlers that do
 * our own cleanup run, so by then that is null.
 *
 * A loose registry is the right answer to it: nothing is left to keep
 * legible, and there is nothing to key one to. Writing the null into the map
 * is what used to happen, and `WeakMap.set` throws on it — which took the
 * lift down with it. The throw landed inside `Systems.shutdown`, half-way
 * through swapping a floor's map, so riding a lift with anybody else in the
 * room left you on the new floor's URL looking at the old floor's room,
 * invisible, with nothing on screen to say why.
 */
export function legible(scene: Phaser.Scene | null | undefined): Legible {
  const found = scene ? registries.get(scene) : undefined;
  if (found) return found;
  const made = new Legible(scene ?? null);
  if (scene) registries.set(scene, made);
  return made;
}

/** Shorthand for the common case: register and forget about it. */
export function keepLegible(scene: Phaser.Scene, ...objects: Scalable[]) {
  legible(scene).keep(...objects);
}
