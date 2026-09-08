import * as Phaser from "phaser";
import { Player } from "../entities/Player";
import { TapNavigator, isTap } from "../systems/TapNavigator";
import { GamepadInput } from "../systems/GamepadInput";
import { CameraController } from "../systems/CameraController";
import { attachPresence, type ScenePresence } from "../systems/scene-presence";
import { dialogOpen } from "@/lib/gamepad/dialogs";
import { Pathfinder } from "../utils/Pathfinder";
import { ensureSheet } from "../utils/sheets";
import { buildSpriteFrames } from "../utils/MapHelpers";
import { SPRITE_KEY, SPRITE_PATH, MOVE_SPEED } from "../config/animations";
import { PF_PADDING } from "@/lib/constants";
import { DoorLatch, type DoorZone } from "@/lib/doors";
import { ArrivalWalk, type Direction } from "@/lib/arrival";
import { rememberedCharacter } from "@/lib/characters/choice";
import type { Rect } from "@/lib/world/tenants";
import { enterableAt, walkInTo, type Enterable } from "@/lib/world/entrances";
import { showAddress } from "@/lib/world/paths";
import { gameEvents } from "@/lib/events";
import { asset } from "@/lib/assets";
import type { Logger } from "@/lib/logger";
import { cutOutdoorFrames, preloadOutdoors } from "./outdoors";
import { legible } from "../systems/legible";

/**
 * Out of doors: the world map and the campuses.
 *
 * The two are the same place in every way but the drawing of it. You arrive
 * out of a door and take a few steps down the path, you walk with the keys
 * or a stick or a tap, everyone else out here — the residents taking the
 * air among them — is drawn from the room socket, the camera follows and
 * the wheel zooms, and walking into a doorway either starts another scene
 * or loads a lobby's page. All of that is here, once.
 *
 * Residents used to be the exception: they had no room out of doors, so
 * each browser asked the server where they were and painted them itself,
 * every ten seconds and never in between. They are ordinary players now,
 * walked by the server through the same socket as everybody else.
 *
 * What a place says for itself is `layOut`: lay the ground, put up the
 * buildings and the props, and hand back where the character starts, what
 * is solid and where the doors are.
 *
 * `OfficeScene` is deliberately not one of these. A room has a tilemap,
 * seats, fixtures and a lift, and it shares presence through
 * `attachPresence` rather than its whole shape.
 *
 * This was two files that had drifted into being the same file twice — the
 * same eleven fields and eight methods apiece — and one of the copies had
 * quietly stopped redrawing residents on a second visit, because only the
 * other one cleared the map that indexed them. That map is gone with the
 * hand-drawing it served.
 */

/** How far you walk out of a doorway before the keys are yours. */
const ARRIVAL_STEPS = 96;

/** What a place hands back once it has laid itself out. */
export interface OutdoorPlace {
  /** The map's size in pixels. */
  width: number;
  height: number;
  /** Where the character starts, and the way they face. */
  spawn: { x: number; y: number; facing: Direction };
  /**
   * Whether to take a few steps on arriving before the keys are the
   * player's. Coming out of a door they are: the key held through the door
   * would otherwise walk you straight back in.
   */
  walkIn: boolean;
  /** The doorways, in the order they are stepped on. */
  doors: DoorZone[];
  /**
   * The things a tap can be aimed at rather than walked to: the buildings,
   * and the boat. Out here the buildings are the menu, so pointing at one
   * anywhere on its picture means going inside it — see `lib/world/entrances`.
   */
  entrances: readonly Enterable[];
  /** Everything solid, for routing a tapped walk around it. */
  solids: Rect[];
  /** What this place is called, for whatever shows where somebody is. */
  label: string;
  /** The path to put in the address bar, so a reload comes back here. */
  path: string;
  /** Camera behaviour beyond the standard fit-and-follow. */
  camera?: { coverMap?: boolean; remembersZoom?: boolean };
}

export abstract class OutdoorScene<Data> extends Phaser.Scene {
  protected player!: Player;
  protected gamepad!: GamepadInput;
  protected navigator = new TapNavigator();
  protected latch = new DoorLatch();
  protected zones: DoorZone[] = [];
  /** What a tap can be aimed at, from the place's own layout. */
  protected entrances: readonly Enterable[] = [];
  protected pathfinder: Pathfinder | null = null;
  protected leaving = false;
  /** The steps taken on coming out of a door, before the keys are the player's. */
  protected arrival = new ArrivalWalk();
  /** The other people out here, from the room socket. */
  protected presence: ScenePresence | null = null;
  protected cameraController!: CameraController;

  /** Named for the console, so a scene's lines say which place they are from. */
  protected abstract readonly log: Logger;

  /** The pictures this place is drawn from, on top of the outdoor pack. */
  protected abstract loadArt(): void;

  /**
   * Lay this place out: its ground, its buildings, its props, its water.
   * Add anything solid to `walls` as you go.
   *
   * Null means the place could not be found and another scene has been
   * started instead, so nothing more should be built here.
   */
  protected abstract layOut(
    data: Data,
    walls: Phaser.Physics.Arcade.StaticGroup,
  ): OutdoorPlace | null;

  /**
   * A doorway this place opens itself, by starting another scene. True when
   * it has been dealt with; false to load the zone's target as a page.
   */
  protected abstract goThrough(zone: DoorZone): boolean;

  preload() {
    preloadOutdoors(this);
    this.loadArt();
    // Normally already loaded by the office; guarded for a direct arrival.
    if (!this.textures.exists(SPRITE_KEY)) this.load.image(SPRITE_KEY, asset(SPRITE_PATH));
  }

  create(data: Data) {
    this.leaving = false;
    this.latch.reset();
    // A walk that was still under way when a door fired must not resume here.
    this.navigator.cancel();
    if (!this.anims.exists("idle-down")) buildSpriteFrames(this, SPRITE_KEY);
    cutOutdoorFrames(this);

    const walls = this.physics.add.staticGroup();
    const place = this.layOut(data, walls);
    if (!place) return;

    // Reached in-page from a lobby or another scene: say so in the bar, so a
    // reload comes back here.
    showAddress(place.path);
    this.zones = place.doors;
    this.entrances = place.entrances;
    this.pathfinder = new Pathfinder(place.width, place.height, place.solids, PF_PADDING);

    this.player = new Player(this, place.spawn.x, place.spawn.y, place.spawn.facing);
    this.arrival.reset();
    if (place.walkIn) this.arrival.begin(place.spawn.facing, ARRIVAL_STEPS);
    this.player.sprite.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, place.width, place.height);
    this.physics.add.collider(this.player.sprite, walls);

    // Look like yourself out here too.
    const remembered = rememberedCharacter();
    if (remembered && remembered.key !== SPRITE_KEY) {
      ensureSheet(this, remembered.key, remembered.path, (ok) => {
        if (ok) this.player.wearSprite(this, remembered.key);
      });
    }

    // The rooms' camera: their zoom to start, the wheel to zoom in and out,
    // a drag to look around.
    this.cameraController = new CameraController(
      this,
      this.player.sprite,
      place.width,
      place.height,
      place.camera,
    );
    this.cameraController.init();

    this.gamepad = new GamepadInput(this);
    this.initTapToWalk();
    gameEvents.emit("place-changed", place.label);

    // Everyone else out here, and the socket told we are out here now.
    // Depth unsaid, so everyone sorts by their feet: outdoors somebody
    // walking below a building has to be drawn in front of it.
    this.presence?.detach();
    this.presence = attachPresence(this, place.spawn, {
      ownSay: (text) => this.player?.say(text),
    });
    // A new look chosen out here is put on at once, as it is indoors.
    const unsubLook = gameEvents.on("player-sprite-chosen", (spriteKey, spritePath) => {
      ensureSheet(this, spriteKey, spritePath, (ok) => {
        if (ok && this.scene.isActive()) this.player.wearSprite(this, spriteKey);
      });
    });
    // Stopped for another scene, or taken down with the game: either way the
    // listeners go, or a dead scene keeps trying to draw people.
    const letGo = () => {
      unsubLook();
      this.presence?.detach();
      this.presence = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, letGo);
    this.events.once(Phaser.Scenes.Events.DESTROY, letGo);
  }

  private initTapToWalk() {
    let down: { x: number; y: number; at: number } | null = null;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      down = { x: p.x, y: p.y, at: p.downTime };
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const start = down;
      down = null;
      // A pinch is two fingers Phaser reports as ordinary pointers, and one
      // of them barely moves — which is a tap, and would send the character
      // walking off while somebody is only trying to look closer.
      if (this.cameraController.pinching) return;
      if (!start || !isTap(start, { x: p.x, y: p.y, at: p.upTime })) return;
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.walkTo({ x: world.x, y: world.y });
    });
  }

  /**
   * Walk to a tapped point — or, if a building is under it, into that
   * building.
   *
   * The buildings out here are the menu, so pointing at one means going in,
   * not standing beside it. A tap on the picture routes to the standing room
   * at the front door and then steps into the doorway, which is what the
   * arrow keys do too: `DoorLatch` sees the feet arrive and the door opens.
   * There is no second way into a building that could disagree with the
   * first.
   */
  private walkTo(target: { x: number; y: number }) {
    const from = this.feet();
    const building = enterableAt(target, this.entrances);
    if (building) {
      const [approach, doorway] = walkInTo(building);
      // The doorway is inside the pathfinder's padding, so it is planned to
      // the standing room and the last step is walked straight at the door.
      const path = this.pathfinder?.findPath(from.x, from.y, approach.x, approach.y);
      this.navigator.follow([...(path?.length ? path : [approach]), doorway]);
      return;
    }
    // Around the furniture if we can; straight at it if the spot is boxed in.
    const path = this.pathfinder?.findPath(from.x, from.y, target.x, target.y);
    this.navigator.follow(path?.length ? path : [target]);
  }

  protected feet() {
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.center.x, y: body.center.y };
  }

  /** The pad's push on the character; nothing while a dialog has the screen. */
  private padVelocity() {
    return dialogOpen() ? { vx: 0, vy: 0 } : this.gamepad.velocity(this.player.speed);
  }

  /** Sort against the props by where the feet are. */
  private sortByFeet() {
    this.player.sprite.setDepth((this.player.sprite.body as Phaser.Physics.Arcade.Body).bottom);
  }

  update(_time: number, delta: number) {
    if (this.leaving) return;
    // Keep the lettering the size it was written, whatever the camera is at.
    legible(this).update();
    // Read the pad every frame, or it never reports anything out here.
    this.gamepad.poll();
    this.presence?.update(delta);

    if (this.arrival.holdsInput) {
      if (this.arrival.walking) {
        this.player.drive(this.arrival.step(delta, MOVE_SPEED));
      } else {
        // The steps are done; the keys work, except the way back, until they
        // have been let go once.
        const wanted = this.player.inputVelocity(this.padVelocity());
        this.arrival.release(wanted.vx !== 0 || wanted.vy !== 0);
        this.player.drive(this.arrival.allow(wanted));
        for (const zone of this.latch.step(this.zones, this.feet())) this.enter(zone);
      }
      this.sortByFeet();
      this.reportPosition();
      return;
    }

    const padVelocity = this.padVelocity();
    const steering = this.navigator.active
      ? this.navigator.step(this.feet(), this.player.speed)
      : null;
    // A key or a stick means the player has taken over, and the tap they
    // made a moment ago is no longer what they want.
    if (
      this.navigator.active &&
      (this.player.hasKeyboardInput() || padVelocity.vx || padVelocity.vy)
    ) {
      this.navigator.cancel();
    }
    this.player.update(steering ?? padVelocity);
    this.sortByFeet();
    this.reportPosition();
    // Walking after a look around brings the camera back to you.
    if (!this.cameraController.cameraFollowing && this.player.isMoving()) {
      this.cameraController.resumeCameraFollow();
    }

    for (const zone of this.latch.step(this.zones, this.feet())) this.enter(zone);
  }

  /** Where we are, for the room socket to pass on to everyone else out here. */
  private reportPosition() {
    gameEvents.emit("player-moved", {
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      facing: this.player.direction,
      moving: this.player.isMoving(),
    });
  }

  /**
   * Through a doorway: another scene if this place opens it, else a page.
   *
   * They have gone inside, so there is nothing left to draw — the same as
   * stepping into the lift. Two things had to change for that to be true:
   *
   * - `drive` rather than `update`, because `update` re-reads the keyboard.
   *   Walking in on a held arrow key meant the stop was handed that key's
   *   velocity, so the walk cycle carried on — and `leaving` then blocks
   *   every later frame, leaving him running on the spot in the doorway for
   *   the whole second a page load takes.
   * - `board`, which hides the sprite and stops its animation, rather than
   *   idling him on the doorstep as though he had thought better of it.
   */
  private enter(zone: DoorZone) {
    this.leaving = true;
    // A route still in hand would go on steering a character who has left.
    this.navigator.cancel();
    this.player.drive({ vx: 0, vy: 0 });
    this.player.board(true);
    this.log.info(`entering ${zone.name}`);
    if (this.goThrough(zone)) return;
    window.location.assign(zone.target);
  }
}
