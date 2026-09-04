/**
 * Character spritesheet animation configuration.
 *
 * All Premade_Character_48x48_XX.png sheets share the same layout:
 *   48×96 frames, 56 cols × ~20 rows
 *     Row 0: preview/idle thumbnails
 *     Row 1: idle — right(6) · up(6) · left(6) · down(6)
 *     Row 2: walk — right(6) · up(6) · left(6) · down(6)
 */

import { MOVE_SPEED_PX_S, SPRINT_SPEED_PX_S } from "@/lib/presence-types";

export const FRAME_WIDTH = 48;
export const FRAME_HEIGHT = 96;
export const SHEET_COLUMNS = 56;

const FRAMES_PER_DIR = 6;

/**
 * How fast a person moves, in px/s, and how much faster sprinting is.
 *
 * Taken from lib/presence-types.ts rather than written here, because the
 * server clamps a player's movement against the same numbers and two copies
 * of a speed is one drift away from the server hauling back somebody who is
 * only running.
 */
export const MOVE_SPEED = MOVE_SPEED_PX_S;
export const SPRINT_SPEED = SPRINT_SPEED_PX_S;

export interface AnimDef {
  key: string;
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
}

/**
 * The sheets themselves live in `lib/characters/sprites.ts` and are re-exported
 * here, so game code carries on importing them from this file.
 *
 * They are not defined here because the server reads them too, and the server
 * cannot import from `components/game/` — the runtime image does not carry it.
 * A server module reaching in here once crashed the container on startup.
 */
export {
  BOSS_SPRITE_KEY,
  BOSS_SPRITE_PATH,
  WORKER_SPRITES,
  type WorkerSpriteConfig,
} from "@/lib/characters/sprites";

import {
  BOSS_SPRITE_KEY as BOSS_KEY,
  BOSS_SPRITE_PATH as BOSS_PATH,
} from "@/lib/characters/sprites";

// Keep legacy exports for Player.ts compatibility
export const SPRITE_KEY = BOSS_KEY;
export const SPRITE_PATH = BOSS_PATH;

const directions = ["right", "up", "left", "down"] as const;
export type Direction = (typeof directions)[number];

export function makeAnims(
  spriteKey: string,
  prefix: string,
  row: number,
  frameRate: number,
): AnimDef[] {
  return directions.map((dir, i) => ({
    key: `${spriteKey}:${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }));
}

// Boss anims (legacy format without spriteKey prefix for backward compat)
function rowAnims(prefix: string, row: number, frameRate: number): AnimDef[] {
  return directions.map((dir, i) => ({
    key: `${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }));
}

export const IDLE_ANIMS = rowAnims("idle", 1, 8);
export const WALK_ANIMS = rowAnims("walk", 2, 10);
export const ALL_ANIMS: AnimDef[] = [...IDLE_ANIMS, ...WALK_ANIMS];
