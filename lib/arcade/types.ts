/**
 * The arcade cabinet's games share one shape, so the cabinet can run any
 * of them: a state made once, stepped by time and input, drawn to its
 * screen. Nothing here touches React or the DOM; the games are plain
 * functions, and the cabinet is the only thing that knows about a canvas.
 */

/**
 * Every game a cabinet can be, in the order they were written.
 *
 * A list rather than a union spelled out, because three things have to
 * agree about it: the type below, `isArcadeGameId`, and `GAMES` in
 * `lib/map/office.ts`, which gives each one a cabinet to stand in. Adding
 * a game here is what makes it something a lobby can declare.
 */
export const ARCADE_GAME_IDS = ["flappy", "snake", "breakout", "oak-island", "solitaire"] as const;

export type ArcadeGameId = (typeof ARCADE_GAME_IDS)[number];

/**
 * Here rather than beside the games themselves, so that asking "is this an
 * arcade game?" does not drag five games and their drawing code in with
 * the answer. The tenant list asks it, and the tenant list is loaded by
 * the server on every request.
 */
export function isArcadeGameId(value: unknown): value is ArcadeGameId {
  return ARCADE_GAME_IDS.some((id) => id === value);
}

/** The cabinet's screen, in game pixels; the canvas scales it. */
export const SCREEN = { width: 320, height: 480 };

export interface ArcadeInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Held. */
  action: boolean;
  /** Went down this frame: a flap, a launch, a start. */
  actionPressed: boolean;
  /** Where a finger or the mouse is on the screen while held, in game pixels. */
  pointerX: number | null;
  /** A touch or click that began this frame, in game pixels. */
  tap: { x: number; y: number } | null;
}

export const NO_INPUT: ArcadeInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  actionPressed: false,
  pointerX: null,
  tap: null,
};

export interface ArcadeGame<S> {
  id: ArcadeGameId;
  title: string;
  blurb: string;
  /** One line each for keys and touch. */
  keys: string;
  touch: string;
  create(random?: () => number): S;
  step(state: S, input: ArcadeInput, dt: number): void;
  draw(ctx: CanvasRenderingContext2D, state: S): void;
  score(state: S): number;
  over(state: S): boolean;
  /** A game you can abandon for a fresh one mid-way: what its button says. */
  restartLabel?: string;
}

export const FONT = '"Press Start 2P", monospace';
