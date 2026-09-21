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
  TABLE_INTERACT_DISTANCE,
} from "./constants";
import { TILE } from "./map/office";
import { arcadeGame } from "./arcade";
import { arcadeGameIn } from "./world/tenants";

/**
 * The title of the game in a room's cabinet, for the sign over it.
 *
 * Null where the room has no cabinet — a floor above a lobby, the default
 * room, anywhere the point of interest is not on the map. The registry is
 * the same in every room; this is the one thing on it that is not.
 */
function arcadeTitleIn(room: string | null): string | null {
  const id = arcadeGameIn(room);
  return id ? (arcadeGame(id)?.title ?? null) : null;
}

/** The fixtures a room can carry. The id is the registry's key. */
export type FixtureId =
  | "whiteboard"
  | "pingpong"
  | "pinball"
  | "arcade"
  | "project-board"
  | "project-flow"
  | "help-desk"
  | "support-pulse"
  | "boardroom";

/**
 * An event that carries nothing, which every fixture's close event is.
 * Derived from the bus rather than written out, so a typo in an entry is a
 * type error rather than a listener that never fires.
 */
type NoArgEvent = {
  [K in keyof GameEventMap]: GameEventMap[K] extends [] ? K : never;
}[keyof GameEventMap];

/**
 * An event that carries which of a fixture's points was pressed, which
 * every fixture's open event is.
 *
 * Derived the same way and for the same reason. Every one of them takes the
 * subject whether or not it has anything to say — one type for the lot
 * beats a union the emitter has to narrow, and a fixture with a single
 * point simply passes nothing.
 */
type SubjectEvent = {
  // Both ways round, and both halves earn their place: the subject has to
  // be optional, or every event carrying one required argument would count,
  // and it has to take a subject, or every event carrying none would.
  [K in keyof GameEventMap]: [] extends GameEventMap[K]
    ? [subject: string | null] extends GameEventMap[K]
      ? K
      : never
    : never;
}[keyof GameEventMap];

export interface FixtureSpec {
  id: FixtureId;
  /**
   * Which points of interest on the map are this fixture.
   *
   * A capture group, where it has one, is the **subject**: what tells one
   * of this fixture's points from another, carried on the open event so the
   * panel knows which it is looking at. Only the project boards have one —
   * `Project board 2` is the second room along the corridor — and the
   * group is optional, so the same pattern matches an unnumbered point in
   * a building that hangs a single board.
   */
  match: RegExp;
  /**
   * Whether every match counts or only the first. A lobby hangs several
   * boards and they all open the one shared canvas; there is one cauldron.
   */
  many?: boolean;
  /**
   * Emitted when somebody standing close enough presses E, carrying which
   * point it was where the fixture has several that differ — see `match`.
   */
  opens: SubjectEvent;
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
    /**
     * The words, or how to work them out from the room they are hanging
     * in. Only the arcade cabinet needs the second: it is one machine and
     * a different game in every building, so its sign reads BREAKOUT in
     * one lobby and OAK ISLAND in another. Given the room's slug, or null
     * where there is no room to ask about.
     */
    label: string | ((room: string | null) => string);
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
      // Its point is the board's right-hand tile, so the middle of the
      // board is half a tile to the left of it — whatever the board is
      // wide, since the point is a tile rather than a share of the width.
      // Half the width is what this was, which hung the sign and its arrow
      // a full tile off centre in a lobby and half a tile off on an
      // Operations floor: close enough to read as a wonky sign rather than
      // as the wrong number.
      nudgeX: -TILE / 2,
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
    // In the corner against the top wall, where the pinball machine stands
    // in the building that has that instead: one machine to a lobby.
    art: { key: "arcade-cabinet", file: "/sprites/arcade_cabinet_96x120.png", lift: 60 },
    // The cabinet is one game, so the sign says which — and a cabinet with
    // no game behind it is a room nobody has furnished, which reads better
    // as ARCADE than as a blank board.
    sign: { label: (room) => arcadeTitleIn(room)?.toUpperCase() ?? "ARCADE" },
  },
  {
    id: "project-board",
    // Numbered where a building hangs several: one to a room, and each a
    // different board, so every match counts and the number rides along as
    // the subject. Anchored, or "project flow" would match this too.
    match: /^project board(?: (\d+))?$/i,
    many: true,
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
    // The stage counts beside the project board. Anchored like the help
    // desk's: it is one thing in one room, and a loose match is how a
    // picture ends up drawn over another one.
    id: "project-flow",
    match: /^project flow(?: (\d+))?$/i,
    many: true,
    opens: "open-project-flow",
    closes: "project-flow-closed",
    param: "flow",
    prompt: "Press E for the detail",
    radius: BOSS_INTERACT_DISTANCE,
    promptLift: 8,
    // No art and no sign, for the same reason the support counts have
    // neither: this is a fixture whose picture is its numbers, so
    // `systems/ProjectFlow` draws the plate and letters its own headings.
    // A static image here would be a second, wrong copy of it underneath.
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
  {
    /**
     * The boardroom table, in the far room at the top of an Operations
     * floor. The one fixture that is furniture rather than something on a
     * wall: you walk round it, and pressing E at it starts or ends a
     * meeting the rest of the building can see is happening.
     */
    id: "boardroom",
    match: /^boardroom table$/i,
    opens: "open-boardroom",
    closes: "boardroom-closed",
    param: "meeting",
    prompt: "Press E for the meeting",
    // Five tiles of table, so the reach covers its near side rather than
    // one spot in the middle of it.
    radius: TABLE_INTERACT_DISTANCE,
    promptLift: 8,
    // Its point of interest is the tile below the table, which is where you
    // stand: the picture is three rows of table and chairs above that.
    art: { key: "boardroom-table", file: "/sprites/boardroom_table_240x144.png", lift: 96 },
    // Hung over the table rather than on a wall — there is no wall behind
    // it — so the lift is measured from the art, as the games' are.
    sign: { label: "BOARDROOM" },
  },
  {
    id: "support-pulse",
    match: /^support pulse$/i,
    opens: "open-support-pulse",
    closes: "support-pulse-closed",
    param: "pulse",
    prompt: "Press E for the detail",
    radius: BOSS_INTERACT_DISTANCE,
    promptLift: 8,
    // No art and no sign: this is the one fixture whose picture is its
    // numbers, so `systems/SupportPulse` draws the board and keeps it
    // current, and the board letters its own five headings. A static image
    // here would be a second, wrong copy of it underneath.
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
