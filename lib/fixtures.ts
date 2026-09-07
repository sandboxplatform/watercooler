/**
 * The things in a room you walk up to and press E at.
 *
 * A fixture is a point of interest on the map, the art that stands on it,
 * the sign above it, the prompt that appears when you are close, and the
 * panel that opens. Every one of those used to be six hand-written copies
 * in `OfficeScene` — a zone field, a prompt field, an `open` flag, a
 * placement block, a `Press E` block and two subscriptions apiece — which
 * is how the whiteboard and the project board came to claim `?board=1`
 * between them and open stacked on each other.
 *
 * So they are declarations, and `systems/FixtureManager` is the one piece
 * of code that reads them. Adding something to walk up to is an entry here
 * plus a panel in `components/hud/`; nothing in the scene changes.
 *
 * It lives here rather than in `components/game/` because both layers
 * read it: `systems/FixtureManager` furnishes a room from it, and the
 * HUD's `usePanel` takes each panel's events and parameter from it. One
 * declaration, so the two sides cannot disagree about what opens what.
 *
 * Nothing in this file may import Phaser. It is plain data, which is what
 * lets `__tests__/fixtures.test.ts` hold the registry to being coherent —
 * unique ids and parameters, an open event paired with its close — in the
 * suite's node environment, with no canvas anywhere.
 */

import type { GameEventMap } from "./events";
import {
  BOSS_INTERACT_DISTANCE,
  BUCKET_INTERACT_DISTANCE,
  CAULDRON_INTERACT_DISTANCE,
} from "./constants";
import { TILE, WHITEBOARD } from "./map/office";

/** The fixtures a room can carry. The id is the registry's key. */
export type FixtureId =
  | "whiteboard"
  | "pingpong"
  | "pinball"
  | "arcade"
  | "project-board"
  | "help-desk";

/**
 * An event that carries nothing — which every fixture's pair of events is.
 * Derived from the bus rather than written out, so a typo in an entry is a
 * type error rather than a listener that never fires.
 */
type NoArgEvent = {
  [K in keyof GameEventMap]: GameEventMap[K] extends [] ? K : never;
}[keyof GameEventMap];

export interface FixtureSpec {
  id: FixtureId;
  /** Which points of interest on the map are this fixture. */
  match: RegExp;
  /**
   * Whether every match counts or only the first. A lobby hangs several
   * boards and they all open the one shared canvas; there is one cauldron.
   */
  many?: boolean;
  /** Emitted when somebody standing close enough presses E. */
  opens: NoArgEvent;
  /** The panel says it has closed with this, and the character walks again. */
  closes: NoArgEvent;
  /**
   * `?<param>=1` opens the panel from anywhere, for linking someone
   * straight to it. Unique across the registry — the test insists, because
   * every panel is mounted in every room and two fixtures sharing a
   * parameter open both at once.
   */
  param: string;
  /** What the prompt says while you are close enough. */
  prompt: string;
  /** How close you have to stand. */
  radius: number;
  /** How far above the point of interest the prompt floats. */
  promptLift: number;
  /**
   * The art that stands on the point, where the tile pack has none — the
   * games and the boards are all generated sprites. `lift` is how far above
   * the point its centre sits; the sign goes above whatever that covers.
   */
  art?: { key: string; file: string; lift: number };
  /** The label on the wall, so the far side of the room can read it. */
  sign?: {
    label: string;
    /** Sideways, for a fixture whose point is not its middle. */
    nudgeX?: number;
    /** Above the point, for a fixture with no art to measure from. */
    lift?: number;
  };
}

/**
 * In the order the scene checks them, which is the order they were written
 * in before this file existed. A player can only be close to one at a time,
 * so the order decides nothing in practice — but it is the old behaviour,
 * and a refactor should not quietly reorder anything.
 */
export const FIXTURES: readonly FixtureSpec[] = [
  {
    id: "whiteboard",
    // Any board in the office opens the same shared canvas.
    match: /white ?board|black ?board|chalk ?board/i,
    many: true,
    opens: "open-whiteboard",
    closes: "whiteboard-closed",
    param: "board",
    prompt: "Press E to draw",
    radius: BOSS_INTERACT_DISTANCE,
    promptLift: 8,
    // Drawn by the map, not by us: the only fixture already in the tiles.
    // Its sign is therefore worked out from the point of interest rather
    // than from WHITEBOARD.region, which is where the *lobby* hangs it. An
    // Operations floor puts it on another wall in another room, and taking
    // the constant left the sign at the top of the map with nothing under
    // it while the board itself was two rooms away.
    sign: {
      label: "WHITEBOARD",
      // Its point is on the board's right-hand tile; the sign centres on
      // the board.
      nudgeX: -(WHITEBOARD.region.sw / 2) * TILE,
      lift: TILE + 10,
    },
  },
  {
    // The bucket is a ping pong table, on the same logic by which the
    // cauldron is a pinball machine: the office has never explained either.
    id: "pingpong",
    match: /bucket|pong/i,
    opens: "open-pingpong",
    closes: "pingpong-closed",
    param: "pingpong",
    prompt: "Press E for ping pong",
    radius: BUCKET_INTERACT_DISTANCE,
    promptLift: 36,
    art: { key: "pingpong-table", file: "/sprites/pingpong_table_96x72.png", lift: 66 },
    sign: { label: "PONG" },
  },
  {
    id: "pinball",
    match: /cauldron|pinball/i,
    opens: "open-pinball",
    closes: "pinball-closed",
    param: "pinball",
    prompt: "Press E to play",
    radius: CAULDRON_INTERACT_DISTANCE,
    promptLift: 44,
    // Right up against the top wall: its point is one row below its foot.
    art: { key: "pinball-machine", file: "/sprites/pinball_machine_96x120.png", lift: 60 },
    sign: { label: "PINBALL" },
  },
  {
    id: "arcade",
    match: /arcade/i,
    opens: "open-arcade",
    closes: "arcade-closed",
    param: "arcade",
    prompt: "Press E to play",
    radius: CAULDRON_INTERACT_DISTANCE,
    promptLift: 44,
    // Against the same wall as the pinball machine, one row above its point.
    art: { key: "arcade-cabinet", file: "/sprites/arcade_cabinet_96x120.png", lift: 60 },
    sign: { label: "ARCADE" },
  },
  {
    id: "project-board",
    match: /project board/i,
    opens: "open-project-board",
    closes: "project-board-closed",
    param: "project",
    prompt: "Press E to read the board",
    radius: BOSS_INTERACT_DISTANCE,
    promptLift: 8,
    // Hangs on the wall like the whiteboard: its point is the lower tile,
    // so the picture sits half a tile above it.
    art: { key: "project-board", file: "/sprites/project_board_144x96.png", lift: 24 },
    sign: { label: "PROJECT BOARD" },
  },
  {
    id: "help-desk",
    // Anchored, not fuzzy: the lobby's "Help desk counter" is a different
    // thing in a different room, and drawing the support-queue board on top
    // of it is what a loose match here does.
    match: /^help desk$/i,
    opens: "open-help-desk",
    closes: "help-desk-closed",
    param: "desk",
    prompt: "Press E to read the queue",
    radius: BOSS_INTERACT_DISTANCE,
    promptLift: 8,
    art: { key: "help-desk", file: "/sprites/help_desk_144x96.png", lift: 24 },
    sign: { label: "HELP DESK" },
  },
];

/** The art every fixture stands on, for the scene to preload in one pass. */
export const FIXTURE_ART: readonly { key: string; file: string }[] = FIXTURES.flatMap((f) =>
  f.art ? [{ key: f.art.key, file: f.art.file }] : [],
);

const BY_ID = Object.fromEntries(FIXTURES.map((f) => [f.id, f])) as Record<FixtureId, FixtureSpec>;

/**
 * Total by construction: `FixtureId` is the union of what `FIXTURES`
 * holds, and the test insists every id in it resolves. So nothing that
 * looks a fixture up has a null case to carry around.
 */
export function fixture(id: FixtureId): FixtureSpec {
  return BY_ID[id];
}
