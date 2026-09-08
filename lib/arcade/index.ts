import { breakout } from "./breakout";
import { flappy } from "./flappy";
import { snake } from "./snake";
import { oakIsland } from "./oak-island";
import { solitaire } from "./solitaire";
import type { ArcadeGame } from "./types";

export { isArcadeGameId } from "./types";

// Any state: the cabinet holds one game at a time and never looks inside.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyArcadeGame = ArcadeGame<any>;

/**
 * Every game there is, in the order they were written.
 *
 * No cabinet offers a menu of them any more — a lobby's cabinet is one
 * game, named on its sign — so this is the catalogue rather than a running
 * order: what a building may declare, and what a score can be recorded
 * against.
 */
export const ARCADE_GAMES: AnyArcadeGame[] = [oakIsland, flappy, snake, breakout, solitaire];

export function arcadeGame(id: string): AnyArcadeGame | null {
  return ARCADE_GAMES.find((g) => g.id === id) ?? null;
}
