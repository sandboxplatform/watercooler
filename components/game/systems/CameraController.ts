import * as Phaser from "phaser";
import {
  CAMERA_LERP,
  ZOOM_SENSITIVITY,
  ZOOM_DEFAULT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_SAVE_DEBOUNCE_MS,
  CAMERA_DRAG_THRESHOLD,
} from "@/lib/constants";
import { coverZoom, frameZoom, reopenZoom } from "@/lib/camera";
import { loadWorldZoom, saveWorldZoom } from "@/lib/persistence";

export class CameraController {
  private scene: Phaser.Scene;
  private playerSprite: Phaser.Physics.Arcade.Sprite;

  cameraDragging = false;
  cameraFollowing = true;

  /**
   * Two fingers are on the glass.
   *
   * Read by everything else that answers to a touch. Phaser sees each finger
   * as an ordinary pointer, so without this a pinch is also a drag of the
   * camera and — if the fingers barely move — a tap on the floor, and the
   * character sets off walking while you are trying to look at something.
   */
  pinching = false;
  mapWidth = 0;
  mapHeight = 0;

  /** A map rather than a room: zoom out until it fills the view, not just to the lobby's fit. */
  private coverMap: boolean;

  /**
   * Whether this place opens at the zoom it was left on.
   *
   * The world map does; rooms do not. A room is fitted so the door, the lift
   * and the games are all on screen at once, and fitting it again on every
   * visit is the point of the fitting. The map is bigger than a screen, so
   * how far out to stand is a choice — and remaking it after every errand
   * into a building is the chore this removes.
   */
  private remembersZoom: boolean;

  /** Pending write, so a zoom gesture is one trip to localStorage and not fifty. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    scene: Phaser.Scene,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    mapWidth: number,
    mapHeight: number,
    options: { coverMap?: boolean; remembersZoom?: boolean } = {},
  ) {
    this.scene = scene;
    this.playerSprite = playerSprite;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.coverMap = options.coverMap ?? false;
    this.remembersZoom = options.remembersZoom ?? false;
  }

  init() {
    const cam = this.scene.cameras.main;
    cam.setBackgroundColor("#1a1814");
    cam.setRoundPixels(true);
    cam.setZoom(ZOOM_DEFAULT);
    this.applyFillZoom(cam);
    this.updateCameraBounds();
    cam.startFollow(this.playerSprite, true, CAMERA_LERP, CAMERA_LERP);

    this.scene.scale.on("resize", () => {
      // Zoom first, then bounds: bounds are derived from the zoomed viewport,
      // so recalculating them against the old zoom leaves the room adrift.
      this.applyFillZoom(this.scene.cameras.main);
      this.updateCameraBounds();
    });
    this.initWheel(cam);
    this.initPinch(cam);
    this.initCameraDrag(cam);
  }

  /**
   * The zoom that fits the whole lobby on screen, capped either way. The
   * lobby's size, not this room's: every floor is shown at the same scale.
   * Also the floor for the scroll wheel: zooming out past this only adds
   * background.
   */
  private coverZoom(cam: Phaser.Cameras.Scene2D.Camera): number {
    if (this.coverMap) {
      return coverZoom(cam.width, cam.height, this.mapWidth, this.mapHeight, ZOOM_MIN, ZOOM_MAX);
    }
    return frameZoom(cam.width, cam.height, ZOOM_MIN, ZOOM_MAX);
  }

  /**
   * Fit the lobby to the viewport. Called at start and whenever the
   * viewport changes. Every place starts at this scale, so people and
   * signs are the same size out of doors as in; on a map the wheel can then
   * go further out.
   *
   * Somewhere that remembers its zoom opens on the remembered one instead —
   * including after a resize, where re-fitting would throw away a setting
   * the person is still using. `reopenZoom` clamps it, because the floor is
   * derived from the viewport and the window it was saved from may have
   * been a different shape.
   */
  private applyFillZoom(cam: Phaser.Cameras.Scene2D.Camera) {
    const fitted = Math.max(
      frameZoom(cam.width, cam.height, ZOOM_MIN, ZOOM_MAX),
      this.coverZoom(cam),
    );
    const next = this.remembersZoom
      ? (reopenZoom(loadWorldZoom(), fitted, Math.max(ZOOM_MIN, this.coverZoom(cam)), ZOOM_MAX) ??
        fitted)
      : fitted;
    if (next !== cam.zoom) cam.setZoom(next);
  }

  /**
   * Keep this zoom for next time, once the wheel has settled.
   *
   * Trailing rather than per-tick: one gesture is dozens of events, and
   * localStorage is synchronous. Flushed on the way out, so walking into a
   * building keeps the last turn of the wheel rather than dropping it.
   */
  private rememberZoom(zoom: number) {
    if (!this.remembersZoom) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveWorldZoom(zoom);
    }, ZOOM_SAVE_DEBOUNCE_MS);
  }

  private flushZoom(cam: Phaser.Cameras.Scene2D.Camera) {
    if (!this.remembersZoom || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    saveWorldZoom(cam.zoom);
  }

  private initWheel(cam: Phaser.Cameras.Scene2D.Camera) {
    const canvas = this.scene.game.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      const oldZoom = cam.zoom;
      const floor = Math.max(ZOOM_MIN, this.coverZoom(cam));
      const newZoom = Phaser.Math.Clamp(oldZoom - delta * ZOOM_SENSITIVITY, floor, ZOOM_MAX);
      if (newZoom === oldZoom) return;

      if (!this.cameraFollowing) {
        const sx = e.offsetX / cam.scaleManager.displayScale.x;
        const sy = e.offsetY / cam.scaleManager.displayScale.y;
        const worldBefore = cam.getWorldPoint(sx, sy);
        cam.setZoom(newZoom);
        this.updateCameraBounds();
        const worldAfter = cam.getWorldPoint(sx, sy);
        cam.scrollX += worldBefore.x - worldAfter.x;
        cam.scrollY += worldBefore.y - worldAfter.y;
      } else {
        cam.setZoom(newZoom);
        this.updateCameraBounds();
      }
      this.rememberZoom(newZoom);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.scene.events.once("shutdown", () => {
      canvas.removeEventListener("wheel", onWheel);
      this.flushZoom(cam);
    });
  }

  /**
   * Pinch to zoom, for a phone or any other glass.
   *
   * The wheel already covers a trackpad — a browser reports that pinch as a
   * wheel with ctrl held, which is what the `ctrlKey` line above is for —
   * but a touchscreen sends touches, and there was no way to zoom on one at
   * all. Two fingers apart zooms in, together zooms out, and the point
   * between them stays under them, so you pull open the part of the map you
   * are looking at rather than the middle of the screen.
   *
   * Raw touch events on the canvas, like the wheel, rather than Phaser's
   * pointers: Phaser is given one active pointer by default, so the second
   * finger is not reported at all without asking for it, and the drag and
   * the tap are both already listening to the pointers this would have to
   * share. `pinching` is how they are told to stand back.
   *
   * The zoom is remembered on the way out exactly as the wheel's is, so a
   * map pinched on a phone opens where it was left.
   */
  private initPinch(cam: Phaser.Cameras.Scene2D.Camera) {
    const canvas = this.scene.game.canvas;
    // A browser's own pinch-zoom would otherwise eat the gesture before the
    // page sees it, and take the whole HUD with it.
    canvas.style.touchAction = "none";

    let startGap = 0;
    let startZoom = 1;

    /** Where a touch is on the canvas, in the camera's own pixels. */
    const at = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (touch.clientX - rect.left) / cam.scaleManager.displayScale.x,
        y: (touch.clientY - rect.top) / cam.scaleManager.displayScale.y,
      };
    };
    const gapBetween = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      startGap = gapBetween(e.touches[0], e.touches[1]);
      startZoom = cam.zoom;
      this.pinching = true;
      // A finger already down had begun a drag; the gesture is not that.
      this.cameraDragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!this.pinching || e.touches.length < 2 || startGap <= 0) return;
      e.preventDefault();

      const floor = Math.max(ZOOM_MIN, this.coverZoom(cam));
      const gap = gapBetween(e.touches[0], e.touches[1]);
      const next = Phaser.Math.Clamp((startZoom * gap) / startGap, floor, ZOOM_MAX);
      if (next === cam.zoom) return;

      // Hold the ground between the fingers still, the way the wheel holds
      // the ground under the cursor — but only when the camera is not
      // following, since following puts the player back in the middle.
      const mid = {
        x: (at(e.touches[0]).x + at(e.touches[1]).x) / 2,
        y: (at(e.touches[0]).y + at(e.touches[1]).y) / 2,
      };
      const before = this.cameraFollowing ? null : cam.getWorldPoint(mid.x, mid.y);
      cam.setZoom(next);
      this.updateCameraBounds();
      if (before) {
        const after = cam.getWorldPoint(mid.x, mid.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      }
      this.rememberZoom(next);
    };

    const onEnd = (e: TouchEvent) => {
      if (!this.pinching || e.touches.length >= 2) return;
      this.pinching = false;
      startGap = 0;
      this.flushZoom(cam);
    };

    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    canvas.addEventListener("touchcancel", onEnd, { passive: true });
    this.scene.events.once("shutdown", () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
    });
  }

  initCameraDrag(cam: Phaser.Cameras.Scene2D.Camera) {
    let lastX = 0;
    let lastY = 0;

    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.pinching) return;
      if (pointer.leftButtonDown()) {
        this.cameraDragging = true;
        lastX = pointer.x;
        lastY = pointer.y;
      }
    });

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.pinching || !this.cameraDragging || !pointer.leftButtonDown()) return;

      const dx = lastX - pointer.x;
      const dy = lastY - pointer.y;
      lastX = pointer.x;
      lastY = pointer.y;

      if (Math.abs(dx) > CAMERA_DRAG_THRESHOLD || Math.abs(dy) > CAMERA_DRAG_THRESHOLD) {
        if (this.cameraFollowing) {
          cam.stopFollow();
          this.cameraFollowing = false;
        }
        cam.scrollX += dx / cam.zoom;
        cam.scrollY += dy / cam.zoom;
      }
    });

    this.scene.input.on("pointerup", () => {
      this.cameraDragging = false;
    });
  }

  resumeCameraFollow() {
    if (!this.cameraFollowing) {
      this.scene.cameras.main.startFollow(this.playerSprite, true, CAMERA_LERP, CAMERA_LERP);
      this.cameraFollowing = true;
    }
  }

  /** Recalculate camera bounds so the map is centered when viewport > map at current zoom. */
  updateCameraBounds() {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const mw = this.mapWidth;
    const mh = this.mapHeight;

    // Centred. The lobby always covers the viewport sideways — the zoom is
    // fitted to it — so slack only appears around a room smaller than the
    // lobby, and a small room belongs in the middle of the screen, not
    // pushed into a corner.
    const bx = viewW > mw ? -(viewW - mw) / 2 : 0;
    const by = viewH > mh ? -(viewH - mh) / 2 : 0;
    const bw = viewW > mw ? viewW : mw;
    const bh = viewH > mh ? viewH : mh;

    cam.setBounds(bx, by, bw, bh);
  }
}
