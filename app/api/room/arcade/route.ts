/**
 * The arcade cabinet's high score tables, one per game.
 *
 * Scores belong to the room rather than the browser: the point of a high
 * score is that somebody else has to look at it.
 */

import { getRoomStore } from "@/lib/server/room-store";
import { isArcadeGameId } from "@/lib/arcade";
import { awardMachineScore } from "@/lib/server/machine-badges";
import { guarded, refuse, roomParam } from "@/lib/server/route";
import { createLogger } from "@/lib/logger";

const log = createLogger("ArcadeAPI");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game");
  if (!isArcadeGameId(game)) return refuse("Unknown game", 400);
  return guarded(
    "read the high scores",
    () => Response.json({ scores: getRoomStore().topArcadeScores(roomParam(request), game) }),
    log,
  );
}

export async function POST(request: Request) {
  return guarded(
    "record the score",
    async () => {
      const body = (await request.json()) as { game?: unknown; player?: unknown; score?: unknown };
      const score = Number(body.score);
      const player = typeof body.player === "string" ? body.player.trim() : "";
      if (!isArcadeGameId(body.game)) return refuse("Unknown game", 400);
      if (!Number.isFinite(score) || score < 0) return refuse("A score has to be a number", 400);
      const room = roomParam(request);
      const who = player || "Guest";
      const scores = getRoomStore().recordArcadeScore(room, body.game, who, score);
      awardMachineScore({
        cookie: request.headers.get("cookie") ?? undefined,
        machine: body.game,
        player: who,
        score,
        table: scores,
        room,
      });
      return Response.json({ scores });
    },
    log,
  );
}
