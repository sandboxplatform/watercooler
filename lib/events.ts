import type { SeatState } from "@/types/game";
import type { SeatDef } from "@/components/game/utils/MapHelpers";
import type { PresencePlayer } from "./presence-types";
import { createLogger } from "./logger";

const log = createLogger("GameEventBus");

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
  /** Somebody walked up to the water bucket and pressed E. */
  "open-pingpong": [];
  /** The ping pong table was closed, so the office takes input again. */
  "pingpong-closed": [];
  /** Somebody walked up to the cauldron and pressed E. */
  "open-pinball": [];
  /** Somebody walked up to the help desk board and pressed E. */
  "open-help-desk": [];
  /** The help desk was closed, so the office takes input again. */
  "help-desk-closed": [];
  /** Somebody walked up to the project board on an Operations floor and pressed E. */
  "open-project-board": [];
  /** The project board was closed, so the office takes input again. */
  "project-board-closed": [];
  /** Somebody walked up to the stage counts beside the project board and pressed E. */
  "open-project-flow": [];
  /** The stage counts were closed, so the office takes input again. */
  "project-flow-closed": [];
  /** Somebody walked up to the five counts on Support's wall and pressed E. */
  "open-support-pulse": [];
  /** The counts were closed, so the office takes input again. */
  "support-pulse-closed": [];
  /** Somebody walked up to the boardroom table and pressed E. */
  "open-boardroom": [];
  /** The boardroom was closed, so the office takes input again. */
  "boardroom-closed": [];
  /** Somebody walked up to the arcade cabinet and pressed E. */
  "open-arcade": [];
  /** The arcade was closed, so the office takes input again. */
  "arcade-closed": [];
  /** The cauldron was closed, so the office takes input again. */
  "pinball-closed": [];
  /** Somebody walked up to a board and pressed E. */
  "open-whiteboard": [];
  /** The board was closed, so the office takes input again. */
  "whiteboard-closed": [];
  /** A badge was just earned, by a person or an agent. */
  "achievement-earned": [
    achievement: {
      code: string;
      subjectType: "agent" | "human";
      subjectId: string;
      subjectName: string;
      title: string;
      description: string;
      icon: string;
    },
  ];
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
   * Emitted by `lib/room-travel.ts` for a move the running scene can make
   * itself — riding the lift — and by the back and forward buttons. The
   * scene swaps its map, the store refetches the room, and presence rejoins
   * on the socket it already has. See that file for why.
   */
  "room-changed": [room: string];
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
