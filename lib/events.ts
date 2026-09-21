import type { SeatState } from "@/types/game";
import type { SeatDef } from "@/components/game/utils/MapHelpers";
import type { PresencePlayer } from "./presence-types";
import { createLogger } from "./logger";

const log = createLogger("GameEventBus");

/**
 * What a room change carries that the address bar cannot.
 *
 * A URL says which place; it does not say which door you came out of, and
 * out of doors that is the difference between standing on your own
 * building path and being put down on the road like a stranger.
 */
export interface RoomArrival {
  /** The tenant or campus just left, if any. */
  from?: string | null;
  /**
   * Take a few steps on arriving even though no door was come out of.
   *
   * Out of a door it is forced: the key held through the doorway would
   * otherwise walk you straight back in. This is the other reason to walk —
   * a first arrival in the world, where somebody appearing fully formed on
   * the plaza is a worse entrance than somebody walking onto it.
   */
  walkIn?: boolean;
}

export interface GameEventMap {
  "seats-discovered": [seats: SeatDef[]];
  "seat-configs-updated": [seats: SeatState[]];
  /** Gamepad shoulder buttons cycle HUD panels; Back closes the open one. */
  "hud-cycle-panel": [direction: -1 | 1];
  "hud-close-panel": [];
  /** Where this browser's own character is, for the room socket to send on. */
  "player-moved": [position: { x: number; y: number; facing: string; moving: boolean }];
  /**
   * This browser's own character stepped out of sight, or back into it —
   * into the lift, or through a door.
   *
   * Emitted by `Player.board`, which is the one place that hides the local
   * sprite, so the room socket can tell everyone else to stop drawing them.
   * It cannot ride on `player-moved`: a scene stops reporting position
   * while a dialog is up, and the lift's buttons are a dialog.
   */
  "player-boarded": [inside: boolean];
  /**
   * A scene has put the character somewhere: a lobby, a floor, the world
   * map, a campus. The address bar already says which; this carries where
   * the character stands, so the room socket can join that place there.
   */
  "place-entered": [spawn: { x: number; y: number; facing: string }];
  /** Everyone else in the room, as the server last reported them. */
  "presence-updated": [players: PresencePlayer[]];
  /** A remote player disconnected and should be removed immediately. */
  "presence-left": [id: string];
  /** How many humans are in the room, for the HUD. */
  "presence-count": [count: number, capacity: number];
  /**
   * The door was shut on this browser, and it is not trying again.
   *
   * One person holds one session: somebody already in the world on this
   * code keeps their place, and this window is refused. Standing down
   * quietly would leave a person looking at a world with nobody in it —
   * themselves included — and nothing to say why, so the HUD says it.
   */
  "presence-refused": [reason: "already-online"];
  /** Somebody on voice chat started or stopped talking; the scene marks them. */
  "voice-speaking": [id: string, speaking: boolean];
  /**
   * This browser's own place in Global Chat: whether it is in, and talking.
   *
   * Everyone else's mark comes off the roster's `mic` flag and
   * `voice-speaking`, and our own character is in neither — the roster
   * leaves us out of our own copy of it, and our own level is measured
   * here rather than received over a connection. So the one character
   * whose state this browser knows best is the one that needed telling.
   */
  "voice-self": [inChat: boolean, speaking: boolean];
  /** A controller appeared or went away, with its layout for prompts. */
  "gamepad-state": [id: string | null, layout: string];
  /**
   * The on-screen action button, which stands in for the E key. A phone has
   * no keyboard, and walking up to something is only half of using it.
   */
  "interact-pressed": [];
  /**
   * Every fixture's open event carries which of its points was pressed, or
   * nothing where it has only one.
   *
   * A fixture is usually one thing in a room, and where it is several they
   * are several ways into the same panel — a lobby's boards are one shared
   * canvas. An Operations floor broke that: three project boards in three
   * rooms are three different boards, and pressing one has to say which.
   *
   * The subject is the capture in the fixture's own `match` (see
   * `lib/fixtures.ts`), so it is whatever the point of interest is
   * numbered — `"2"` off `Project board 2`. A slot rather than a board
   * name, because the map is shared by every building with this many boards
   * and only the building knows what hangs in each room.
   */
  /** Somebody walked up to the water bucket and pressed E. */
  "open-pingpong": [subject?: string | null];
  /** The ping pong table was closed, so the office takes input again. */
  "pingpong-closed": [];
  /** Somebody walked up to the cauldron and pressed E. */
  "open-pinball": [subject?: string | null];
  /** Somebody walked up to the help desk board and pressed E. */
  "open-help-desk": [subject?: string | null];
  /** The help desk was closed, so the office takes input again. */
  "help-desk-closed": [];
  /** Somebody walked up to the project board on an Operations floor and pressed E. */
  "open-project-board": [subject?: string | null];
  /** The project board was closed, so the office takes input again. */
  "project-board-closed": [];
  /** Somebody walked up to the stage counts beside the project board and pressed E. */
  "open-project-flow": [subject?: string | null];
  /** The stage counts were closed, so the office takes input again. */
  "project-flow-closed": [];
  /** Somebody walked up to the five counts on Support's wall and pressed E. */
  "open-support-pulse": [subject?: string | null];
  /** The counts were closed, so the office takes input again. */
  "support-pulse-closed": [];
  /** Somebody walked up to the boardroom table and pressed E. */
  "open-boardroom": [subject?: string | null];
  /** The boardroom was closed, so the office takes input again. */
  "boardroom-closed": [];
  /**
   * Somebody walked up to Doc and pressed E.
   *
   * The subject is the conversation's URL, which is how the panel comes up
   * already pointed somewhere: the scene has asked the server for it
   * before it would show a prompt at all, so making the panel ask again
   * would be a second round trip in front of an iframe that could have
   * started loading. Null where the panel was opened by `?doc=1`, which
   * names nothing and does its own asking.
   */
  "open-doc-chat": [subject?: string | null];
  /** Doc's conversation was closed, so the world takes input again. */
  "doc-chat-closed": [];
  /** Somebody walked up to the arcade cabinet and pressed E. */
  "open-arcade": [subject?: string | null];
  /** The arcade was closed, so the office takes input again. */
  "arcade-closed": [];
  /** The cauldron was closed, so the office takes input again. */
  "pinball-closed": [];
  /** Somebody walked up to a board and pressed E. */
  "open-whiteboard": [subject?: string | null];
  /** The board was closed, so the office takes input again. */
  "whiteboard-closed": [];
  /** Somebody just earned a badge, somewhere in the world. */
  "badge-earned": [
    badge: {
      code: string;
      /** The holder id — a persona's identity, or `guest:<name>`. */
      person: string;
      name: string;
      /** Where they were standing, so a toast can be narrower than the news. */
      room: string;
    },
  ];
  /**
   * Show somebody's profile: their concept art, who they are, their badges.
   *
   * Carried on the bus rather than held by the column, because the two ends
   * are in different trees — the People panel is in the column beside the
   * office and the window is over the office, and neither is the other's
   * parent. `null` closes it.
   */
  "open-profile": [person: string | null];
  /**
   * Show one kind of egg at a size worth looking at: the shell, how rare it
   * is, what is known about it, and who has found one.
   *
   * On the bus for the reason a profile is — it is opened from the Eggs
   * panel in the column and drawn over the whole app, and neither of those
   * is the other's parent. `null` closes it.
   */
  "open-egg": [tier: string | null];
  /**
   * Show one badge: what it is, the one line saying how to get it, who
   * holds it, and the rest of its group.
   *
   * The third window of this shape and on the bus for the same reason as
   * the other two, with one caller the others do not have: the toast over
   * the office. A badge announces itself for six seconds and then goes,
   * which is the one moment somebody is most likely to want to know what
   * it was — so the toast is pressable and this is what it presses.
   * `null` closes it.
   */
  "open-badge": [code: string | null];
  /** Someone said something out loud: show it over their character. */
  /**
   * The player walked into a doorway. `target` names the room it leads to;
   * nothing loads it yet, so today this is how we prove the seam works.
   */
  "transition-entered": [name: string, target: string];
  /** The person stepped into the lift; the HUD offers the floors. */
  "open-elevator": [];
  /** The lift's menu closed, chosen or not; the keys are the character's again. */
  "elevator-closed": [];
  /**
   * The address bar names a different room, and no page was loaded.
   *
   * Emitted by `lib/room-travel.ts`, which is now the only way a room
   * changes at all — the lift, a front door, a campus gate, the back and
   * forward buttons. `components/game/systems/scene-router.ts` puts up the
   * scene the new address names, the store refetches the room, and presence
   * rejoins on the socket it already has. See `room-travel.ts` for why none
   * of it is a page load any more.
   */
  "room-changed": [room: string, arrival: RoomArrival];
  /**
   * Somebody has just said who they are and is being let into the world.
   *
   * The welcome screen steps aside and the world map comes up in the same
   * page, which takes a moment: a tilemap, the buildings, the sheet they
   * chose. Without a word said that moment is a blank canvas, and the
   * character then simply exists on the plaza. So the arrival covers it —
   * their own face and name, and then their character walking in — and
   * lifts when the map says it is up. See `components/hud/Arrival.tsx`.
   */
  "walking-in": [who: { name: string; spritePath: string | null }];
  /**
   * Where the player is, when it is not the room in the URL: a campus, the
   * world map. Null means the room.
   *
   * **Nothing listens.** The top bar's name plate read it, and that came out
   * — an Operations floor puts rooms against the top of the map and the
   * panel sat on them, and the floor letters its own name on a wall now.
   * The three scenes go on emitting it, the way the room's spend does, for
   * whatever wants to say where somebody is next.
   */
  "place-changed": [label: string | null];
  /**
   * The person chose a different look for themselves. The sheet is fetched
   * and the texture swapped in the scene; nothing about the world changes.
   */
  "player-sprite-chosen": [spriteKey: string, spritePath: string];
  "player-said": [playerId: string, text: string];
}

type Listener<T extends unknown[]> = (...args: T) => void;

class GameEventBus {
  private listeners = new Map<string, Set<Listener<unknown[]>>>();

  on<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<unknown[]>);
    return () => this.off(event, fn);
  }

  off<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown[]>);
  }

  emit<K extends keyof GameEventMap>(event: K, ...args: GameEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        log.error(`listener error on "${event}":`, err);
      }
    });
  }
}

export const gameEvents = new GameEventBus();
