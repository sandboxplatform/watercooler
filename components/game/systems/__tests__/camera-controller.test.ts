import { describe, expect, it, vi } from "vitest";
import type * as PhaserTypes from "phaser";

/**
 * Phaser cannot be imported here — it probes a real 2D canvas context at
 * load — and none of it is wanted: `init` reaches for `Math.Clamp` inside
 * the wheel and pinch handlers, and nothing else.
 */
vi.mock("phaser", () => ({
  Math: {
    Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
  },
}));

const { CameraController } = await import("../CameraController");

/**
 * The one thing about the camera worth a test, and it is not arithmetic —
 * `lib/camera.ts` holds the zoom rules and they are checked there, without
 * a canvas.
 *
 * This is about *who owns a listener*. The scale manager belongs to the
 * game, not to a scene, so a handler put on it outlives the scene that
 * added it. A scene that has shut down has no `cameras.main` — Phaser sets
 * it to undefined — so a stale handler asked to refit throws; and because
 * the scale manager checks its parent's size from `PRE_STEP`, that throw
 * lands inside the animation frame, where Phaser asks for the next frame
 * only *after* the step returns. One exception and the loop is over: the
 * game freezes, with the HUD still going as though it were thinking.
 *
 * It was reachable by walking out of a lobby onto the world map, which is
 * the app's one room change that swaps scenes without reloading the page.
 *
 * A stubbed scene rather than a real `Phaser.Game`: `init` needs a camera,
 * two emitters and a canvas, and the point here is the bookkeeping.
 */

/** Enough of an emitter to count what is listening. */
class Emitter {
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      handler(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    const list = this.handlers.get(event);
    if (!list) return;
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.length ?? 0;
  }
}

function stubScene() {
  const scale = new Emitter();
  const events = new Emitter();
  const input = new Emitter();

  const camera = {
    width: 1200,
    height: 800,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    scaleManager: { displayScale: { x: 1, y: 1 } },
    setBackgroundColor: () => camera,
    setRoundPixels: () => camera,
    setZoom: (zoom: number) => {
      camera.zoom = zoom;
      return camera;
    },
    startFollow: () => camera,
    stopFollow: () => camera,
    setBounds: () => camera,
    getWorldPoint: () => ({ x: 0, y: 0 }),
  };

  const cameras: { main: typeof camera | undefined } = { main: camera };
  const canvas = { style: {}, addEventListener: () => {}, removeEventListener: () => {} };
  const scene = { scale, events, input, cameras, game: { canvas } };

  return { scene, scale, events, cameras, camera };
}

function controllerFor(scene: unknown) {
  // The world map's shape: the place that actually reaches this, and the one
  // whose camera both covers the map and remembers its zoom.
  return new CameraController(
    scene as PhaserTypes.Scene,
    {} as PhaserTypes.Physics.Arcade.Sprite,
    2976,
    1872,
    { coverMap: true, remembersZoom: true },
  );
}

describe("CameraController", () => {
  it("takes its resize listener off the game's scale manager when the scene shuts down", () => {
    const stub = stubScene();
    controllerFor(stub.scene).init();
    expect(stub.scale.listenerCount("resize")).toBe(1);

    stub.events.emit("shutdown");

    // Left on, every scene change adds another and the oldest one throws.
    expect(stub.scale.listenerCount("resize")).toBe(0);
  });

  it("does not throw when the scale manager fires after its scene is gone", () => {
    const stub = stubScene();
    controllerFor(stub.scene).init();

    // What Phaser does on shutdown: the camera manager clears `main`, and
    // the scene's own `shutdown` listeners run. Which of the two goes first
    // is not ours to rely on, so the camera is taken away first.
    stub.cameras.main = undefined;
    stub.events.emit("shutdown");

    // A refit skipped is nothing; a throw here stops the game loop for good.
    expect(() => stub.scale.emit("resize")).not.toThrow();
  });

  it("still refits a live scene on resize", () => {
    const stub = stubScene();
    controllerFor(stub.scene).init();
    const fitted = stub.camera.zoom;

    // A smaller viewport covers the map at a different zoom, and a live
    // scene must still hear about it — the teardown must not cost us this.
    stub.camera.width = 600;
    stub.camera.height = 400;
    stub.scale.emit("resize");

    expect(stub.camera.zoom).not.toBe(fitted);
  });
});
