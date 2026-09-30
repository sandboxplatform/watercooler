import * as Phaser from "phaser";
import { Player } from "../entities/Player";
import { SPRITE_KEY, SPRITE_PATH, MOVE_SPEED } from "../config/animations";
import { PIXEL_FONT } from "../config/drawing";
import { Pathfinder } from "../utils/Pathfinder";
import {
  buildSpriteFrames,
  parseSpawns,
  parsePOIs,
  parseTransitions,
  buildCollisionRects,
  renderTileObjectLayer,
} from "../utils/MapHelpers";
import { gameEvents } from "@/lib/events";
import { travelTo } from "@/lib/room-travel";
import { WORLD_PATH, campusPath } from "@/lib/world/paths";
import { rememberCharacter, rememberedCharacter } from "@/lib/characters/choice";
import { roomFromLocation } from "@/lib/rooms";
import {
  addressFromLocation,
  cubiclesOn,
  describeFloor,
  LIFT_REFUSAL,
  mapFileFor,
  mayRideLift,
  widestRoom,
  type Address,
} from "@/lib/world/floors";
import { UNKNOWN_IDENTITY, type AccessIdentity } from "@/lib/identity";
import { ArrivalWalk } from "@/lib/arrival";
import { HELP_COUNTER, TILE } from "@/lib/map/office";
import { opsSign } from "@/lib/map/floor";
import { loadEggArt } from "../systems/EggShelf";
import { legible } from "../systems/legible";
import { hasCampus, hasFloors, operationsRoomCount, tenantFor } from "@/lib/world/tenants";
import { GARAGE_BAYS } from "@/lib/map/premises";
import { ensureSheet } from "../utils/sheets";
import { WALL_DETAIL, WALL_NAME, paintOnWall } from "../utils/wall-lettering";
import { addSolid } from "../utils/solids";
import { createLogger } from "@/lib/logger";
import { PLAYER_SPAWN_OFFSET_X, PF_PADDING } from "@/lib/constants";

import { CameraController } from "../systems/CameraController";
import { TapNavigator } from "../systems/TapNavigator";
import { GamepadInput } from "../systems/GamepadInput";
import { dialogOpen, typingInAField } from "@/lib/gamepad/dialogs";
import { attachPresence, type ScenePresence } from "../systems/scene-presence";
import { TalkTo } from "../systems/TalkTo";
import { DoorManager } from "../systems/DoorManager";
import { FixtureManager } from "../systems/FixtureManager";
import { furnishFloor } from "../systems/PeopleFloor";
import { furnishOperationsFloor, onOperationsFloor } from "../systems/OperationsFloor";
import { feetOf, onTap, padVelocity } from "../systems/walker";
import { addSign } from "../utils/signs";
import { asset } from "@/lib/assets";

/** The body's centre sits this far below the sprite's centre. */
const BODY_BELOW_CENTRE = 33;
/** How far you walk on arriving somewhere before the keys are yours again. */
const ARRIVAL_STEPS = 96;

const log = createLogger("OfficeScene");

/**
 * Who the door let this browser in as, asked once a page.
 *
 * Straight to the API rather than through the HUD's copy of the answer: the
 * game layer holds no React, and going over the event bus would mean racing
 * the HUD's own fetch — miss that one emit and the identity would never
 * arrive. Once a page rather than once a room, because the answer is the
 * cookie's and a cookie changes only with a page load; it used to be asked
 * again at every door and every lift ride. A failed ask is not kept, so the
 * next room asks again, and leaves the safe default in place meanwhile.
 */
let whoIAm: Promise<AccessIdentity | null> | null = null;

function askWhoIAm(): Promise<AccessIdentity | null> {
  whoIAm ??= fetch("/api/me")
    .then((res) => res.json() as Promise<{ access?: { identity?: AccessIdentity } }>)
    .then((body) => body.access?.identity ?? null)
    .catch(() => {
      log.warn("could not ask who this is; treating them as a visitor");
      whoIAm = null;
      return null;
    });
  return whoIAm;
}

export class OfficeScene extends Phaser.Scene {
  private player!: Player;
  /** Whether this lobby staffs a help desk, from its map. */
  private counterHere = false;
  private navigator = new TapNavigator();
  private pathfinder: Pathfinder | null = null;
  /** The steps taken on arrival, before the keys are the player's. */
  private arrival = new ArrivalWalk();
  private walkMarker: Phaser.GameObjects.Arc | null = null;
  /** Set for one frame when something asks for an interaction without a key. */
  private virtualInteract = false;
  private elevatorOpen = false;
  /**
   * Who the door let this browser in as, for the lift.
   *
   * A visitor until the server says otherwise: the answer is asked for on
   * arriving and the walk to the lift takes far longer than the round trip,
   * but a gate that is open while it waits is not a gate.
   */
  private identity: AccessIdentity = UNKNOWN_IDENTITY;
  /** Settles once the door has answered, so the lift can wait on it. */
  private identityKnown: Promise<void> | null = null;
  private eKey!: Phaser.Input.Keyboard.Key;
  private gamepad!: GamepadInput;
  /**
   * Everyone else in the room, on the same helper the world map and the
   * campuses use. The office used to wire this by hand and that is how two
   * residents came to be drawn as each other.
   */
  private presence: ScenePresence | null = null;
  /** Everything this visit subscribed to or set going, taken down on the way out. */
  private cleanupPresence: (() => void) | null = null;
  /** Where the feet are, filled in again each time it is asked. */
  private feetAt = { x: 0, y: 0 };

  private cameraController!: CameraController;
  private doorManager!: DoorManager;
  /** Everything in the room you walk up to and press E at. */
  private fixtures!: FixtureManager;
  /** The people in the room worth walking up to, which is Doc and his conversation. */
  private talk: TalkTo | null = null;

  constructor() {
    super({ key: "OfficeScene" });
  }

  preload() {
    // Both maps are generated — see scripts/build-map.ts. The lobby is
    // lib/map/office.ts; a person's own floor is lib/map/private-office.ts.
    // Point this back at office2.json to get the old partitioned office.
    this.load.tilemapTiledJSON("office", asset(mapFileFor(addressFromLocation(window.location))));

    this.load.once("filecomplete-tilemapJSON-office", () => {
      const cached = this.cache.tilemap.get("office");
      if (!cached?.data?.tilesets) return;
      for (const ts of cached.data.tilesets) {
        const basename = (ts.image as string).split("/").pop()!;
        this.load.image(ts.name, asset(`/tilesets/${basename}`));
      }
    });

    this.load.image(SPRITE_KEY, asset(SPRITE_PATH));

    // The player's own look, and nothing else. This used to load the whole
    // cast — fifteen sheets, 114MB of RGBA decoded and cut into frames on the
    // way into every room, to draw two or three of them. Caching never
    // touched it because the bytes were already local; the decode was the
    // cost, and it was most of the black screen on entering a building.
    //
    // Everyone else arrives through `ensureSheet`, via scene-presence as they
    // turn up. Loading the remembered look *here* rather than leaving it to
    // `wearCharacter` is what keeps the player from appearing as the default
    // for a frame first.
    const mine = rememberedCharacter();
    if (mine && mine.key !== SPRITE_KEY) this.load.image(mine.key, asset(mine.path));

    this.load.spritesheet("boss-arrow", asset("/sprites/arrow_down_48x48.png"), {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.spritesheet("anim-door", asset("/sprites/animated_door_big_4_48x48.png"), {
      frameWidth: 48,
      frameHeight: 144,
    });

    // Every fixture's art in one pass, off config/fixtures.ts.
    FixtureManager.preload(this);
    // Furniture, not a board: the counter in Sandbox ERP's lobby.
    this.load.image("help-desk-counter", asset("/sprites/help_desk_counter_192x96.png"));
    this.load.image("van", asset("/sprites/world/van_96x144.png"));
    // The eggs on the cubicle shelves, and only where there are shelves:
    // the People floor of a building somebody has a desk in.
    const here = addressFromLocation(window.location);
    if (here && cubiclesOn(here)) loadEggArt(this);
    // Generated by scripts/make-elevator-sprite.mjs — two tiles wide, because
    // a lift car is, and the same five-frame format as the swing door.
    this.load.spritesheet("anim-elevator", asset("/sprites/animated_elevator_96x144.png"), {
      frameWidth: 96,
      frameHeight: 144,
    });
  }

  create() {
    // Frames for what was actually loaded. `buildSpriteFrames` measures the
    // sheet's own grid, so it has to run per texture; `ensureSheet` does it
    // for anything that arrives later.
    buildSpriteFrames(this, SPRITE_KEY);
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith("character_") || key.startsWith("generated:")) {
        buildSpriteFrames(this, key);
      }
    }

    const map = this.make.tilemap({ key: "office" });

    const allTilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const ts of map.tilesets) {
      const added = map.addTilesetImage(ts.name, ts.name);
      if (added) allTilesets.push(added);
    }
    if (allTilesets.length === 0) {
      log.error("No tilesets loaded");
      return;
    }

    map.createLayer("floor", allTilesets);
    map.createLayer("walls", allTilesets);
    map.createLayer("ground", allTilesets);
    map.createLayer("furniture", allTilesets);
    map.createLayer("objects", allTilesets);

    renderTileObjectLayer(this, map, "props", allTilesets, 5);
    renderTileObjectLayer(this, map, "props-over", allTilesets, 11);

    const overheadLayer = map.createLayer("overhead", allTilesets);
    if (overheadLayer) overheadLayer.setDepth(10);

    const collisionGroup = this.physics.add.staticGroup();
    const collisionRects = buildCollisionRects(map, collisionGroup);

    const { bossSpawn } = parseSpawns(map);
    const pois = parsePOIs(map);

    // Furniture, not a fixture: the counter has nothing to press E at.
    this.counterHere = pois.some((poi) => /^help desk counter$/i.test(poi.name));

    // Beside the desk, not in it — the nook has walls on three sides
    this.player = new Player(
      this,
      bossSpawn.x + PLAYER_SPAWN_OFFSET_X,
      bossSpawn.y,
      bossSpawn.facing,
    );
    // Everyone else in the room, and the socket told we are in it now:
    // `attachPresence` emits `place-entered` from the position given here,
    // where the character stands, rather than wherever the last scene left
    // it. A lift ride restarts this scene, so anything still attached from
    // the floor below goes first.
    this.presence?.detach();
    this.presence = attachPresence(
      this,
      { x: this.player.sprite.x, y: this.player.sprite.y, facing: this.player.direction },
      {
        ownVoice: (inChat, speaking) => this.player?.setVoice(inChat, speaking),
        // A room stacks people at one depth. Its props sit at 4 and the
        // local player at 5, so a resident given a depth off their own feet
        // is drawn over the counter they stand behind.
        depth: "flat",
      },
    );
    // Doc is a fixture who walks about, so his prompt comes off the roster
    // rather than off the map. Built after presence for the roster it reads,
    // and taken down with it: a lift ride restarts this scene.
    this.talk?.destroy();
    this.talk = new TalkTo(this, () => this.presence);

    this.physics.add.collider(this.player.sprite, collisionGroup);

    // Upstairs, everyone with a desk gets one, with their name on it. The
    // desks go into the room's walls, and come back as solids the map
    // knows nothing of, so the one route planner is built after them.
    const address = addressFromLocation(window.location);
    const floor =
      address?.floor.kind === "floor" ? furnishFloor(this, address, collisionGroup) : null;
    this.pathfinder = new Pathfinder(
      map.widthInPixels,
      map.heightInPixels,
      [...collisionRects, ...(floor?.solids ?? [])],
      PF_PADDING,
    );

    this.identityKnown = askWhoIAm().then((identity) => {
      if (identity) this.identity = identity;
    });

    // Arriving by a doorway — the lift, the front door, the door from the
    // room next door: start in it and walk out of it, rather than appear at
    // the desk. The doorway's latch is not stepped while the walk holds the
    // keys, so standing in it does not fire it.
    this.arrival.reset();
    // And the walk that brought them here is over.
    //
    // A route is a list of points in the room it was planned in, and this
    // scene object outlives the room: riding the lift restarts the scene
    // rather than building a new one, so `navigator` — a field, made once
    // when the scene was constructed — is still following the tap that
    // ended at the lift downstairs. Those coordinates are somewhere else
    // entirely up here. Tapping the lift on Floor 1 of Sandbox ERP and
    // riding to Operations walked the character out of the car and away up
    // the corridor to the west wall, which is where the lobby's lift is.
    //
    // It survives because the walk was never finished: the last step into
    // the car opens the lift's dialog, and `update` stands the character
    // still under a dialog rather than stepping the route — so it is still
    // live when the floor above comes up. The arrival walk above is reset
    // here for the same reason, and this was the half that was forgotten.
    this.navigator.cancel();
    this.walkMarker?.destroy();
    this.walkMarker = null;

    const via = new URLSearchParams(window.location.search).get("via");
    const zones = parseTransitions(map);
    const arrivedBy = via ? zones.find((zone) => zone.name === via) : undefined;
    if (arrivedBy?.name === "elevator") {
      // The zone's top row is the floor in front of the car; stand in it.
      this.player.sprite.setPosition(
        arrivedBy.x + arrivedBy.width / 2,
        arrivedBy.y + 24 - BODY_BELOW_CENTRE,
      );
      this.arrival.begin("up", ARRIVAL_STEPS);
    } else if (arrivedBy) {
      // Just inside, on the floor below the doorway, and walk in.
      this.player.sprite.setPosition(
        arrivedBy.x + arrivedBy.width / 2,
        arrivedBy.y + arrivedBy.height + 24 - BODY_BELOW_CENTRE,
      );
      this.arrival.begin("down", ARRIVAL_STEPS);
    }
    // Doors to the rooms next door say where they go.
    // A lobby's front door needs no sign; a store's does, since it is one of several.
    const lobbyHere = address ? hasFloors(address.tenant) : true;
    for (const zone of zones) {
      if (zone.target.startsWith("room:") || (zone.name === "door" && !lobbyHere)) {
        this.addDoorSign(zone);
      }
    }
    if (address && address.tenant.kind === "garage") this.parkVans(collisionGroup);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.player.sprite.setCollideWorldBounds(true);

    // Say what things are, from across the room. Each fixture stands on
    // its point of interest, with its sign above whatever that covers —
    // where, how high and what the sign reads are all in config/fixtures.ts.
    this.fixtures = new FixtureManager(this);
    // The building, for the one sign that reads differently in each: the
    // arcade cabinet's, which names the game this lobby's is.
    this.fixtures.place(pois, address?.tenant.slug ?? null);
    if (this.counterHere) {
      // Placed from the spec rather than from its point of interest: the
      // footprint is what the collision box was cut from, so drawing it
      // corner to corner is the one way the art and the solid part agree.
      const { dx, dy, sw, sh } = HELP_COUNTER.region;
      this.add
        .image(dx * TILE, dy * TILE, "help-desk-counter")
        .setOrigin(0, 0)
        .setDepth(4);
      // Below it, which no other sign in the room is. Above the art is
      // where whoever works the counter stands, and above them is the
      // whiteboard, so a sign up there labels the wrong thing twice.
      addSign(
        this,
        { x: (dx + sw / 2) * TILE, y: (dy + sh) * TILE },
        "HELP DESK",
        (dy + sh) * TILE + 20,
        "below",
      );
    }
    // The building's name on the wall, so a glance says whose lobby this is,
    // and whatever an Operations floor hangs and stands up besides.
    if (address) this.addWallSign(address);
    const stopOps = address ? furnishOperationsFloor(this, address) : null;

    this.input.keyboard?.disableGlobalCapture();
    this.initTapToWalk();
    gameEvents.emit("place-changed", null);

    // ── Systems ───────────────────────────────────────────
    // Every room stops pulling back at the whole of the widest one, which
    // is as much as anybody indoors needs to see — see `zoomFloor`.
    this.cameraController = new CameraController(
      this,
      this.player.sprite,
      map.widthInPixels,
      map.heightInPixels,
      { zoomOutTo: widestRoom() },
    );
    this.cameraController.init();

    this.doorManager = new DoorManager(this, this.player);
    this.doorManager.initDoors(zones);

    this.gamepad = new GamepadInput(this);
    // Every fixture's open and close events, in one subscription with one
    // teardown — see FixtureManager.subscribe for why that matters here.
    const unsubFixtures = this.fixtures.subscribe();

    const unsubInteract = gameEvents.on("interact-pressed", () => {
      this.virtualInteract = true;
    });

    const unsubSprite = gameEvents.on("player-sprite-chosen", (spriteKey, spritePath) => {
      this.wearCharacter(spriteKey, spritePath);
    });

    // Out through the door is the world map; the lift offers the floors.
    //
    // Every one of them travels rather than navigating: the router puts up
    // whatever the new address names, and the room socket, the voice chat
    // and the HUD carry straight on. Walking out of a building used to be a
    // page load, which is what made a front door cost a reconnection.
    const unsubDoor = gameEvents.on("transition-entered", (name, target) => {
      // They have gone through, so stop drawing them here — on everyone's
      // screen, not only ours. The next place has to build its map before
      // it joins, and until it does the room being left still has us
      // standing in its doorway with a name tag over it.
      const gone = () => this.player?.board(true);

      // A door into the room next door: arriving at the matching door there.
      if (target.startsWith("room:")) {
        const [, slug, door] = target.split(":");
        log.info(`through the ${name} to ${slug}`);
        gone();
        travelTo(`/r/${slug}?via=${door}`);
        return;
      }
      if (target === "elevator") {
        void this.ride();
        return;
      }
      if (target !== "world") {
        log.info(`${name} leads to "${target}", which is not built yet`);
        return;
      }
      const from = roomFromLocation(window.location);
      log.info(`leaving ${from} by the ${name}`);
      // A store's or campus's lobby opens onto its yard; a head office onto the world.
      const tenant = tenantFor(from);
      const out = tenant && hasCampus(tenant.org) ? campusPath(tenant.org) : WORLD_PATH;
      gone();
      travelTo(out, { from });
    });

    // Put on whatever was chosen last time, so a look survives a reload.
    const remembered = rememberedCharacter();
    if (remembered && remembered.key !== SPRITE_KEY) {
      this.wearCharacter(remembered.key, remembered.path);
    }

    const unsubElevatorClosed = gameEvents.on("elevator-closed", () => {
      this.elevatorOpen = false;
      this.player?.board(false);
    });

    // A badge used to be drawn over somebody's head from here, off the bus.
    // It cannot be: the badge names its *holder* — a code's identity, or a
    // guest's name — and `presence.say` addresses a connection, so the
    // lookup was a name being passed where a uuid was wanted and the bubble
    // never appeared for anybody. It is the server's now, which is the only
    // side that holds both halves: `announce` in `presence-socket` sends an
    // ordinary `said` over the earner's head, and the room draws it the way
    // it draws a resident's remark. What the browser shows for its own
    // badge is the toast.
    this.cleanupPresence = () => {
      stopOps?.();
      floor?.stop?.();
      unsubSprite();
      unsubDoor();
      unsubFixtures();
      unsubElevatorClosed();
      unsubInteract();
    };
    this.initInteraction();

    // Whichever comes first takes the other with it. The scene object is
    // reused for every room, so a DESTROY listener left behind by each
    // SHUTDOWN was one more closure over a room nobody was in per door.
    const cleanup = () => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      this.cleanup();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  /**
   * Open the lift — after the door has said who this is.
   *
   * Waiting on that answer is the whole point. `UNKNOWN_IDENTITY` is
   * `visitor`, deliberately, because a gate that is open while it waits is
   * not a gate; but deciding on that default is a different thing from
   * defaulting to it. Arriving straight at a floor's URL stands you in the
   * lift, so the zone fires in the same breath as `create()` and the answer
   * is still in flight — which had Coop's own lift telling Coop he shall not
   * pass, on Coop's own floor. The default still governs, for exactly as
   * long as it takes to ask.
   */
  private async ride() {
    await this.identityKnown;
    if (!this.scene.isActive()) return;

    // Some buildings' floors are private. The lift is where that is felt,
    // so it is where it is said — the server refuses the floor's room and
    // its page regardless, and this is the part a person sees.
    const here = addressFromLocation(window.location);
    if (here && !mayRideLift(here.tenant.slug, this.identity)) {
      log.info(`the lift in ${here.tenant.slug} is not this visitor's to ride`);
      this.player?.say(LIFT_REFUSAL);
      return;
    }
    this.elevatorOpen = true;
    this.player?.board(true);
    gameEvents.emit("open-elevator");
  }

  /** What a doorway in the top wall leads to, lettered above it. */
  private addDoorSign(zone: { name: string; target: string; x: number; y: number; width: number }) {
    // A store's rooms are named by what they are, whatever the store is
    // called, so a long name does not hang off the wall by the door.
    const to = tenantFor(zone.target.split(":")[1]);
    const short = to?.kind === "store" ? "Store" : to?.kind === "warehouse" ? "Warehouse" : null;
    const label =
      zone.target === "world" ? "EXIT" : (short ?? to?.location ?? zone.name).toUpperCase();
    this.add
      .text(zone.x + zone.width / 2, zone.y + 30, label, {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "#ffe9a8",
        backgroundColor: "rgba(27,27,42,0.85)",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12)
      .setResolution(2);
  }

  /** The field crew's vans, in their bays, solid. */
  private parkVans(collisionGroup: Phaser.Physics.Arcade.StaticGroup) {
    if (!this.textures.exists("van")) return;
    for (const bay of GARAGE_BAYS) {
      this.add.image(bay.x, bay.y, "van").setOrigin(0, 0).setDepth(4);
      addSolid(collisionGroup, { x: bay.x + 4, y: bay.y + 7, width: 88, height: 130 });
    }
  }

  /**
   * The tenant's name and where you are, lettered large on a wall, so a
   * glance says whose building this is.
   */
  private addWallSign(address: Address) {
    // A People floor letters nothing of its own, because there is no wall
    // left that is not already somebody's: the top one is the cubicles'
    // names and the corridor's is the two rooms'. The building and the
    // floor are in the top bar of the HUD in any case — what a glance in
    // here is for is whose desk you are looking at.
    if (cubiclesOn(address)) return;
    // Right of the board in a lobby, where the wall is widest; right of the
    // shop window in a store, warehouse or garage. The longest names fit
    // either at this size.
    const lobby = hasFloors(address.tenant);
    // An Operations floor is a corridor, and the wall across the top of the
    // map is behind the rooms — so it writes its name on the wall the
    // corridor actually looks at. Either way both lines are centred on the
    // band of that wall, as every other piece of paint in the world is.
    const ops = onOperationsFloor(address) ? opsSign(operationsRoomCount(address.tenant)) : null;
    const x = ops ? ops.tx * TILE : lobby ? 15 * 48 : 17 * 48;
    const where = [address.tenant.location, describeFloor(address)].filter(Boolean).join(" · ");
    paintOnWall(this, x, ops ? ops.ty * TILE : 0, [
      { text: address.tenant.name.toUpperCase(), ink: WALL_NAME },
      // Wrapped to the wall it has, so "Building Supply Warehouse" takes two lines.
      { text: where.toUpperCase(), ink: WALL_DETAIL, wrap: lobby ? 340 : 200 },
    ]);
  }

  /** The "Press E" over everything in the room you can walk up to, and the key. */
  private initInteraction() {
    // A prompt for each fixture the room carries, made from its entry.
    this.fixtures.createPrompts();

    const kb = this.input.keyboard;
    if (!kb) return;
    this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
  }

  // ── Cleanup ────────────────────────────────────────────

  private cleanup() {
    this.cleanupPresence?.();
    this.cleanupPresence = null;
    this.presence?.detach();
    this.presence = null;

    this.talk?.destroy();
    this.talk = null;
  }

  // ── Update ─────────────────────────────────────────────

  /** A tap or the on-screen button standing in for the E key, once. */
  private takeVirtualInteract(): boolean {
    if (!this.virtualInteract) return false;
    this.virtualInteract = false;
    return true;
  }

  // ── Tapping the floor ──────────────────────────────────

  /**
   * Walk to where the player tapped, and do whatever is there when we arrive.
   *
   * On a phone this is the only way to move at all, and on a desktop it sits
   * happily alongside the keys — either takes over from the other.
   */
  private initTapToWalk() {
    onTap(
      this,
      () => this.cameraController.pinching,
      (world) => {
        // Anything with a panel over the office is driving its own input.
        if (this.fixtures.anyOpen()) return;
        this.walkTo(world.x, world.y);
      },
      () => {
        // Touching the office means you have finished with whatever field
        // had the keys. A canvas cannot hold focus of its own, and the scene
        // stands down entirely while a text field is focused, which would
        // leave the character unable to move by any means at all.
        const focused = document.activeElement as HTMLElement | null;
        if (focused && (focused.tagName === "TEXTAREA" || focused.tagName === "INPUT")) {
          focused.blur();
        }
      },
    );

    // The office is somewhere you tap, so a long press must not offer to
    // select the canvas or hand the phone's own menu instead
    this.game.canvas.style.touchAction = "none";
    this.game.canvas.oncontextmenu = (event) => event.preventDefault();
  }

  /**
   * Swaps the player's sprite sheet at runtime.
   *
   * Generated sheets are not known at build time — they are made from a photo
   * while the game is running — so the texture is fetched on demand and cached
   * by key. Loading a key twice is a no-op, which makes re-picking a character
   * instant.
   */
  private wearCharacter(spriteKey: string, spritePath: string) {
    ensureSheet(this, spriteKey, spritePath, (ok) => {
      if (!ok) {
        log.error(`sheet ${spriteKey} failed to load from ${spritePath}`);
        // Forget it, or the picker goes on saying "you're wearing this"
        // about a look that never went on.
        rememberCharacter(null);
        return;
      }
      this.player.wearSprite(this, spriteKey);
      log.info(`player is now wearing ${spriteKey}`);
    });
  }

  private feet(): { x: number; y: number } {
    return feetOf(this.player, this.feetAt);
  }

  /** Route to a point and walk it, acting on whatever is there on arrival. */
  private walkTo(x: number, y: number) {
    if (!this.pathfinder) return;

    const from = this.feet();
    const path = this.pathfinder.findPath(from.x, from.y, x, y);
    if (!path || path.length === 0) return;

    // Whatever is at the end gets the same treatment as pressing E there,
    // so tapping a board or a machine does the obvious thing
    this.navigator.follow(path, () => {
      this.virtualInteract = true;
    });
    this.showWalkMarker(path[path.length - 1]);
    this.cameraController.resumeCameraFollow();
  }

  private showWalkMarker(at: { x: number; y: number }) {
    this.walkMarker?.destroy();
    this.walkMarker = this.add.circle(at.x, at.y, 6, 0xc9a227, 0.9).setDepth(5);
    this.tweens.add({
      targets: this.walkMarker,
      alpha: 0,
      scale: 2,
      duration: 550,
      onComplete: () => {
        this.walkMarker?.destroy();
        this.walkMarker = null;
      },
    });
  }

  /** The pad's push on the character; nothing while a dialog has the screen. */
  private padVelocity() {
    return padVelocity(this.player, this.gamepad);
  }

  update(_time: number, delta: number) {
    // Before any early return: the camera can be zoomed while a panel is up
    // or a menu is open, and lettering that stopped following would be the
    // wrong size the moment the panel closed.
    legible(this).update();
    this.gamepad.poll();

    // Remote characters keep easing toward their last reported position even
    // while this player is in a menu or typing.
    this.presence?.update(delta);

    // Just arrived: the character takes its steps and the keys wait. Doors
    // are not stepped meanwhile, so the doorway being stood in stays quiet.
    if (this.arrival.holdsInput) {
      if (this.arrival.walking) {
        this.player.drive(this.arrival.step(delta, MOVE_SPEED));
      } else {
        // The steps are done; the keys work, except the way back, until
        // they have been let go once. Doors are live again from here.
        const wanted = this.player.inputVelocity(this.padVelocity());
        this.arrival.release(wanted.vx !== 0 || wanted.vy !== 0);
        this.player.drive(this.arrival.allow(wanted));
        this.doorManager.updateDoors();
      }
      this.reportPosition();
      return;
    }

    // A dialog is up: the HUD's controller driver has the pad, the keys
    // belong to the dialog, and the character stands still under it.
    if (
      this.elevatorOpen ||
      this.fixtures.anyOpen() ||
      this.talk?.anyOpen() ||
      dialogOpen() ||
      typingInAField()
    ) {
      this.doorManager.updateDoors();
      return;
    }

    // A key or a stick means the player has taken over, and the tap they
    // made a moment ago is no longer what they want
    const padVelocity = this.padVelocity();
    const steering = this.navigator.active
      ? this.navigator.step(this.feet(), this.player.speed)
      : null;

    if (
      this.navigator.active &&
      (this.player.hasKeyboardInput() || padVelocity.vx || padVelocity.vy)
    ) {
      this.navigator.cancel();
      this.walkMarker?.destroy();
      this.walkMarker = null;
    }

    this.player.update(steering ?? padVelocity);

    this.reportPosition();
    if (!this.cameraController.cameraFollowing && this.player.isMoving()) {
      this.cameraController.resumeCameraFollow();
    }
    this.doorManager.updateDoors();

    // E on the keyboard, or confirm on the pad
    const interactPressed =
      Phaser.Input.Keyboard.JustDown(this.eKey) ||
      this.gamepad.justPressed("interact") ||
      this.takeVirtualInteract();

    // Everything you walk up to and press E at: the boards, the games,
    // the support queue. One loop over config/fixtures.ts, which is where
    // the distances, the prompts and the panels each one opens live.
    const took = this.fixtures.update(this.player.sprite, interactPressed);

    // And the one fixture that is a person. Offered the press only if
    // nothing on the wall took it: somebody standing at the support queue
    // with Doc beside them is within reach of both, and one press of E is
    // one thing opened.
    this.talk?.update(this.player.sprite, interactPressed && !took);
  }

  /** Where we are, for the room socket to pass on to everyone else in the room. */
  private reportPosition() {
    gameEvents.emit("player-moved", {
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      facing: this.player.direction,
      moving: this.player.isMoving(),
    });
  }
}
