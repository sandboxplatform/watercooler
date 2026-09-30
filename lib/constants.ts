// ── Game canvas ──────────────────────────────────────────
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// ── Interaction distances (pixels) ───────────────────────
/**
 * Reach of the boards and the counter — anything you stand in front of.
 *
 * It began as the boss terminal's, wide enough to cover where the player
 * starts beside the desk; the terminal went with the work, and the reach
 * stayed as the one every wall fixture uses.
 */
export const BOSS_INTERACT_DISTANCE = 64;

/**
 * How far to the side of the desk the player starts.
 *
 * The desk sits in a nook with walls on three sides: standing in it, the only
 * way out is right, and a first click anywhere else sends the character into
 * a wall before it finds its way round. A step clear of it is a better place
 * to begin, and the desk is still within arm's reach.
 */
export const PLAYER_SPAWN_OFFSET_X = 56;
/**
 * The cauldron is a 2x2 prop with a solid footprint, so a player cannot get
 * within 34px of its middle from any side. Measured from the two sides it can
 * be approached from, the nearest standing spot is about 53px out.
 */
export const CAULDRON_INTERACT_DISTANCE = 62;

/** The bucket sits on a bench, so you reach it from the front or the side. */
export const BUCKET_INTERACT_DISTANCE = 54;

/**
 * The boardroom table, which is five tiles of it.
 *
 * Every other fixture is a thing you stand in front of, so a tile and a
 * half is plenty. A table is something you walk up to anywhere along its
 * near side, and its point of interest is one tile below the middle — so
 * the reach has to cover half the table as well as the standing room, or
 * the two ends of it are furniture you cannot use.
 */
export const TABLE_INTERACT_DISTANCE = 120;

// ── Pathfinder ───────────────────────────────────────────
export const PF_CELL_SIZE = 16;
export const PF_PADDING = 8;
/**
 * The fewest steps a search is allowed before it gives up.
 *
 * The real cap is twice the grid's cells, so a search can cross the whole
 * map; this is the floor under it for a small room. It was a flat twenty
 * thousand, which on the world map is a sixth of the grid.
 */
export const PF_MIN_ITER = 20000;

// ── Persistence keys ─────────────────────────────────────
export const LS_BGM_VOLUME = "watercooler:bgm-volume";
export const LS_PLAYER_NAME = "watercooler:player-name";
export const LS_SIDEBAR_WIDTH = "watercooler:sidebar-width";
/**
 * Sprinting or walking. Kept per browser rather than on the character,
 * because a room change builds a new one and the mode is the person's
 * choice about how they get about, not a property of the room.
 */
export const LS_SPRINTING = "watercooler:sprinting";
/** How far out the world map was left. Rooms are fitted; the map is a choice. */
export const LS_WORLD_ZOOM = "watercooler:world-zoom";

/** How wide the chat and activity column can be dragged. */
export const SIDEBAR_MIN_WIDTH = 280;
export const SIDEBAR_MAX_WIDTH = 680;
export const SIDEBAR_DEFAULT_WIDTH = 380;

/**
 * How long the column takes to come in, and to go away again.
 *
 * Written down here rather than in the stylesheet because both halves need
 * it: the CSS slides on it, and the column keeps its contents mounted for
 * exactly this long on the way out — a panel that empties before it has
 * finished leaving is the flash the slide exists to have removed. It is
 * handed to the CSS as `--sidebar-ms`, so the two cannot drift.
 *
 * Short, because the office resizes with it: the canvas follows the column's
 * edge frame by frame, exactly as it does under a drag, and a long slide is
 * a long time spent rebuilding a framebuffer.
 */
export const SIDEBAR_SLIDE_MS = 180;

// ── Audio ────────────────────────────────────────────────
export const DEFAULT_BGM_VOLUME = 0;

// ── Scene constants ──────────────────────────────────────
export const CAMERA_LERP = 0.1;
export const ZOOM_SENSITIVITY = 0.001;
export const ZOOM_DEFAULT = 0.82;

/**
 * How far out the wheel or a pinch can take the camera.
 *
 * Nothing goes here as a matter of course. A room stops at the whole of the
 * widest room in view (`zoomFloor` in `lib/camera.ts`), and a place out of
 * doors where its edges reach the screen's (`outdoorFloor`) — so both reach
 * this only on a screen small enough to need it, which is a phone.
 * It was 0.5, and rooms stopped at the lobby's fit besides, so Operations —
 * seventy-three tiles long — could only ever be looked at a lobby's width at
 * a time, and a phone, pinned at 0.5 before it had been touched, had nowhere
 * further out to go at all.
 */
export const ZOOM_MIN = 0.25;

/**
 * The least zoom a place *opens* at, which is not how far out it can go.
 *
 * A room opens fitted to the lobby, and on a handset that fit is well under
 * half — so without a floor of its own a phone would open every room with
 * everybody in it a fifth smaller than before. Lowering `ZOOM_MIN` was for
 * the pinch, not for that.
 */
export const ZOOM_OPEN_MIN = 0.5;

/** How far in the camera can go, in any place. */
export const ZOOM_MAX = 2.5;
export const CAMERA_DRAG_THRESHOLD = 3;

/**
 * How often the five counts on Support's wall are read again.
 *
 * Matched to the server's hold on them (`PULSE_CACHE_MS`), so a room full
 * of people watching the wall is still one sweep of the desk a minute and
 * nobody's tick is wasted.
 */
export const PULSE_REFRESH_MS = 60_000;

/**
 * How often the bubbles over the mailboxes on the world map are read again.
 *
 * Matched to the server's hold on them (`CUSTOMERS_CACHE_MS`), like the wall
 * above — and twice as long, because of where it hangs. The world map is the
 * one room everybody passes through, so this is the poll most browsers make;
 * and a mailbox is glanced at on the way past rather than stood in front of,
 * which is a number two minutes old being the truth about who is waiting.
 */
export const MAILBOX_REFRESH_MS = 120_000;

// ── The "Press E" over anything you can walk up to and use ──
export const PRESS_E_STYLE: {
  fontFamily: string;
  fontSize: string;
  color: string;
  backgroundColor: string;
  padding: { x: number; y: number };
  align: string;
} = {
  fontFamily: '"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: "14px",
  color: "#c9a227",
  backgroundColor: "rgba(37, 34, 25, 0.95)",
  padding: { x: 8, y: 4 },
  align: "center",
};

/**
 * How long the wheel has to settle before the world map's zoom is written.
 *
 * One gesture is dozens of wheel events and localStorage is synchronous, so
 * this is the difference between one write and fifty. Short enough that
 * walking to a door always outlasts it, and the flush on the way out covers
 * the rest.
 */
export const ZOOM_SAVE_DEBOUNCE_MS = 250;
