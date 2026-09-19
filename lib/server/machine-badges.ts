/**
 * Badges for the machines in the lobbies.
 *
 * The cauldron and the arcade cabinets record their scores over HTTP rather
 * than on the room socket, which leaves them the two odd ones out: an API
 * route has no connection, so it has no identity in hand and no way to
 * speak into the world. Both are answerable — the access cookie rides on
 * the request like any other, and `currentWorldBroadcast` is the socket's
 * own reach, filled in when it attaches — and doing it twice in two routes
 * is how the two would drift.
 *
 * Whoever plays with no socket up gets their badge and no announcement,
 * which is the right way round: the shelf is what lasts.
 */

import { identityOf } from "./access";
import { onScore } from "./badge-rules";
import { currentWorldBroadcast } from "./room-broadcast";
import { badgeHolder } from "../badges";

/** One row of a high score table, as both machines keep them. */
interface ScoreRow {
  player: string;
  score: number;
}

/**
 * Record what a score earned, and tell the world.
 *
 * `table` is the board as it stands after the write, which both stores hand
 * back — so first place is read off the board rather than worked out again.
 * A score equal to one already at the top does not displace it (the order
 * is `score DESC, scored_at ASC`), so the same player topping their own
 * equal score is the one case this reads generously, and Top of the Board
 * is awarded once ever regardless.
 */
export function awardMachineScore(options: {
  cookie: string | undefined;
  /** The game, which is also the building: no two lobbies hold the same one. */
  machine: string;
  player: string;
  score: number;
  table: readonly ScoreRow[];
  /** Where they were standing, for the toast. */
  room: string;
}): void {
  const { cookie, machine, player, score, table, room } = options;
  const holder = { person: badgeHolder(identityOf(cookie), player), name: player };
  const best = table[0];
  const first = !!best && best.player === player && best.score === Math.max(0, Math.round(score));

  const earned = onScore(holder, machine, first);
  if (!earned.length) return;

  const say = currentWorldBroadcast();
  if (!say) return;
  for (const item of earned) {
    say({
      type: "badge",
      code: item.code,
      person: item.person,
      name: item.name,
      room,
      at: item.earnedAt,
    });
  }
}
