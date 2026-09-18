/**
 * When achievements are earned.
 *
 * Evaluated on the server rather than in the browser: a client could simply
 * claim a badge. Each rule is cheap — a single counter query at most —
 * because these run on every arrival.
 */

import { getRoomStore } from "./room-store";
import { achievementFor, type EarnedAchievement } from "../achievements";
import { createLogger } from "../logger";

const log = createLogger("Achievements");

function grant(
  room: string,
  subjectType: "agent" | "human",
  subjectId: string,
  subjectName: string,
  code: string,
  earned: EarnedAchievement[],
) {
  const definition = achievementFor(code);
  if (!definition) return;

  if (!getRoomStore().award(room, subjectType, subjectId, code, subjectName)) return;

  log.info(`${subjectName} earned "${definition.title}" in ${room}`);
  earned.push({
    code,
    subjectType,
    subjectId,
    subjectName,
    earnedAt: new Date().toISOString(),
  });
}

export function onPlayerJoined(room: string, name: string): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];
  grant(room, "human", name, name, "walked-in", earned);
  return earned;
}

/** Everyone present when the office filled up shares the moment. */
export function onRoomFull(room: string, names: string[]): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];
  for (const name of names) grant(room, "human", name, name, "full-house", earned);
  return earned;
}
