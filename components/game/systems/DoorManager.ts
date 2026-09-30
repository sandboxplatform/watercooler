import * as Phaser from "phaser";
import { gameEvents } from "@/lib/events";
import { anyoneNear, DoorLatch, type DoorZone, type Point } from "@/lib/doors";
import { createLogger } from "@/lib/logger";
import type { Player } from "../entities/Player";

const log = createLogger("Doors");

/** How close anyone has to be for a door to swing open. */
const OPEN_RADIUS = 60;

/** Both sheets are five frames: shut at 0, open at the last. */
const FRAME_COUNT = 5;

/**
 * Which sprite sheet a doorway is drawn with.
 *
 * Named rather than inferred so the map can add a doorway without this file
 * changing, and so a missing sheet degrades to an invisible-but-working
 * transition instead of a crash.
 */
const TEXTURES: Record<string, string> = {
  door: "anim-door",
  elevator: "anim-elevator",
};

interface DoorEntry {
  zone: DoorZone;
  sprite?: Phaser.GameObjects.Sprite;
  open: boolean;
}

/**
 * Doorways: the animation as someone approaches, and the event when they walk
 * through.
 *
 * Positions come from the map's transitions layer and each carries a target.
 * Walking in says so with `transition-entered`, and the scene decides what
 * that door leads to — the room next door, the lift, or out.
 */
export class DoorManager {
  private scene: Phaser.Scene;
  private player: Player;
  private doors: DoorEntry[] = [];
  /** The zones on their own, for the latch, kept rather than mapped out every frame. */
  private zones: DoorZone[] = [];
  /** Who can open a door: the player, and nobody else since the workers went. */
  private bodies: Point[] = [{ x: 0, y: 0 }];
  private latch = new DoorLatch();

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.player = player;
  }

  initDoors(zones: DoorZone[]) {
    this.ensureAnimations();

    this.zones = zones;
    this.doors = zones.map((zone) => {
      const texture = TEXTURES[zone.name] ?? "anim-door";
      if (!this.scene.textures.exists(texture)) {
        // The transition still works; it just has nothing drawn over it.
        log.warn(`no art for doorway "${zone.name}" (texture ${texture})`);
        return { zone, open: false };
      }
      const source = this.scene.textures.get(texture).getSourceImage();
      const frameW = Math.round(source.width / FRAME_COUNT);
      const [x, y] = this.anchor(zone, frameW, source.height);
      const sprite = this.scene.add.sprite(x, y, texture, 0).setOrigin(0, 0).setDepth(4);
      return { zone, sprite, open: false };
    });

    log.info(
      `${this.doors.length} doorways: ${zones.map((z) => `${z.name}→${z.target}`).join(", ")}`,
    );
  }

  /**
   * Where the art sits relative to its doorway.
   *
   * The sheets are three tiles tall but a doorway is one, so the sprite has to
   * hang off it: down from the top wall, up out of the bottom one. Centred
   * horizontally either way, which lets a one-tile door and a two-tile lift
   * share this code.
   */
  private anchor(zone: DoorZone, frameW: number, frameH: number): [number, number] {
    const x = zone.x + (zone.width - frameW) / 2;
    const y = zone.facing === "down" ? zone.y + zone.height - frameH : zone.y;
    return [x, y];
  }

  private ensureAnimations() {
    for (const texture of new Set(Object.values(TEXTURES))) {
      if (!this.scene.textures.exists(texture)) continue;
      const openKey = `${texture}-open`;
      if (this.scene.anims.exists(openKey)) continue;
      const last = FRAME_COUNT - 1;
      this.scene.anims.create({
        key: openKey,
        frames: this.scene.anims.generateFrameNumbers(texture, { start: 0, end: last }),
        frameRate: 12,
        repeat: 0,
      });
      this.scene.anims.create({
        key: `${texture}-close`,
        frames: this.scene.anims.generateFrameNumbers(texture, { start: last, end: 0 }),
        frameRate: 12,
        repeat: 0,
      });
    }
  }

  /**
   * Where someone is standing, not where their chest is.
   *
   * A sprite's origin sits about two thirds of a tile above its feet, which is
   * enough to leave a player visibly inside a doorway while their sprite
   * centre is still in the tile behind it. Everything positional in this scene
   * measures from the body, and doorways have to as well.
   */
  private static footing(sprite: Phaser.GameObjects.Sprite, out: Point): Point {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    out.x = body ? body.center.x : sprite.x;
    out.y = body ? body.center.y : sprite.y;
    return out;
  }

  updateDoors() {
    const player = DoorManager.footing(this.player.sprite, this.bodies[0]);

    for (const door of this.doors) {
      const near = anyoneNear(door.zone, this.bodies, OPEN_RADIUS);
      if (near === door.open) continue;
      door.open = near;
      if (!door.sprite) continue;
      const texture = door.sprite.texture.key;
      door.sprite.play(near ? `${texture}-open` : `${texture}-close`);
    }

    for (const zone of this.latch.step(this.zones, player)) {
      log.info(`entered ${zone.name} → ${zone.target}`);
      gameEvents.emit("transition-entered", zone.name, zone.target);
    }
  }

  /** Called after a scene change so stepping back into a doorway fires again. */
  reset() {
    this.latch.reset();
  }
}
