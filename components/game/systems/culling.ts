import * as Phaser from "phaser";
import { CULL_CHUNK_PX } from "../config/drawing";

/**
 * Stops drawing what is nowhere near the camera, out of doors.
 *
 * Phaser draws everything on the display list every frame whether a camera
 * can see it or not — only a tilemap layer culls itself. The world map puts
 * a couple of thousand trees, bushes, lamps and buildings down on a map
 * three screens wide, and every one of them was batched sixty times a
 * second to be clipped by the GPU.
 *
 * So the pictures that never move are filed by the squares of the map they
 * cover, a camera's width or so on a side, and only the squares near the
 * view are visible. The toggling happens when the view crosses from one
 * square to the next rather than every frame, and it runs a square wide of
 * the view in every direction: the camera reads where it was last drawn, so
 * a frame's lag or a turn of the wheel never shows the edge of the culling.
 *
 * Nothing about depth changes. A hidden picture keeps its place in the
 * display list and sorts exactly as before; it is only not drawn.
 *
 * Only for what is laid down once and left: the ground, the props, the
 * buildings and their lettering. Anything that moves or hides itself — a
 * person, the ball, an egg, a car — is not filed, since this would fight it
 * over `visible`.
 */
type Cullable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Visible & {
    getBounds(): Phaser.Geom.Rectangle;
  };

interface Filed {
  object: Cullable;
  /** The squares it covers, inclusive. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const registries = new WeakMap<Phaser.Scene, Culler>();

export class Culler {
  private chunks = new Map<number, Filed[]>();
  /** The squares last made visible, or null before the first look. */
  private shown: { x0: number; y0: number; x1: number; y1: number } | null = null;

  add(object: Cullable) {
    const b = object.getBounds();
    const filed: Filed = {
      object,
      x0: Math.floor(b.left / CULL_CHUNK_PX),
      y0: Math.floor(b.top / CULL_CHUNK_PX),
      x1: Math.floor(b.right / CULL_CHUNK_PX),
      y1: Math.floor(b.bottom / CULL_CHUNK_PX),
    };
    for (let cy = filed.y0; cy <= filed.y1; cy++) {
      for (let cx = filed.x0; cx <= filed.x1; cx++) {
        const key = chunkKey(cx, cy);
        const here = this.chunks.get(key);
        if (here) here.push(filed);
        else this.chunks.set(key, [filed]);
      }
    }
    // Filed after the first look, it has to be told where the view is.
    if (this.shown) object.setVisible(overlaps(filed, this.shown));
  }

  /** How many pictures are filed, for anybody counting what a place costs. */
  get size(): number {
    const all = new Set<Filed>();
    for (const list of this.chunks.values()) for (const f of list) all.add(f);
    return all.size;
  }

  /** Show what is near the camera and hide the rest, if the view has moved squares. */
  update(camera: Phaser.Cameras.Scene2D.Camera) {
    if (this.chunks.size === 0) return;
    // Worked out from the scroll and the zoom as they stand now rather than
    // from `worldView`, which is only brought up to date when the camera is
    // drawn — a turn of the wheel since then is already in the zoom.
    const w = camera.width / camera.zoom;
    const h = camera.height / camera.zoom;
    const left = camera.scrollX + (camera.width - w) / 2;
    const top = camera.scrollY + (camera.height - h) / 2;
    const next = {
      x0: Math.floor(left / CULL_CHUNK_PX) - 1,
      y0: Math.floor(top / CULL_CHUNK_PX) - 1,
      x1: Math.floor((left + w) / CULL_CHUNK_PX) + 1,
      y1: Math.floor((top + h) / CULL_CHUNK_PX) + 1,
    };
    const was = this.shown;
    if (was && same(was, next)) return;
    this.shown = next;

    if (!was) {
      // The first look decides every picture once.
      for (const list of this.chunks.values()) {
        for (const f of list) f.object.setVisible(overlaps(f, next));
      }
      return;
    }
    // Afterwards only the squares either range touches can have changed.
    const x0 = Math.min(was.x0, next.x0);
    const y0 = Math.min(was.y0, next.y0);
    const x1 = Math.max(was.x1, next.x1);
    const y1 = Math.max(was.y1, next.y1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.chunks.get(chunkKey(cx, cy));
        if (!list) continue;
        for (const f of list) f.object.setVisible(overlaps(f, next));
      }
    }
  }
}

function chunkKey(cx: number, cy: number): number {
  // Maps are a few dozen squares on a side; the offset keeps a picture
  // hanging off the top or left edge from sharing a key with the far side.
  return (cy + 1024) * 4096 + (cx + 1024);
}

function overlaps(
  f: { x0: number; y0: number; x1: number; y1: number },
  r: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return f.x1 >= r.x0 && f.x0 <= r.x1 && f.y1 >= r.y0 && f.y0 <= r.y1;
}

function same(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/**
 * The scene's culler, made on first use and forgotten when the scene shuts
 * down. A scene object is reused for every visit, so a registry that
 * outlived the visit would hold the last place's pictures for good.
 */
export function culler(scene: Phaser.Scene): Culler {
  const found = registries.get(scene);
  if (found) return found;
  const made = new Culler();
  registries.set(scene, made);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (registries.get(scene) === made) registries.delete(scene);
  });
  return made;
}

/** File a picture that never moves, so it is only drawn while near the camera. */
export function cull<T extends Cullable>(scene: Phaser.Scene, object: T): T {
  culler(scene).add(object);
  return object;
}
