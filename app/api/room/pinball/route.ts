/**
 * The cauldron's high score table.
 *
 * Scores belong to the room rather than the browser: the point of a high score
 * is that somebody else has to look at it.
 */

import { getRoomStore } from "@/lib/server/room-store";
import { awardMachineScore } from "@/lib/server/machine-badges";
import { guarded, refuse, roomParam } from "@/lib/server/route";
import { createLogger } from "@/lib/logger";

const log = createLogger("PinballAPI");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    "read the high scores",
    () => Response.json({ scores: getRoomStore().topPinballScores(roomParam(request)) }),
    log,
  );
}

export async function POST(request: Request) {
  return guarded(
    "record the score",
    async () => {
      const body = (await request.json()) as { player?: unknown; score?: unknown };
      const score = Number(body.score);
      const player = typeof body.player === "string" ? body.player.trim() : "";

      // A score is a number of points, not a message: anything else is a bug or
      // somebody poking at the endpoint, and neither belongs on the board.
      if (!Number.isFinite(score) || score < 0) return refuse("A score has to be a number", 400);

      const room = roomParam(request);
      const who = player || "Guest";
      const scores = getRoomStore().recordPinballScore(room, who, score);
      awardMachineScore({
        cookie: request.headers.get("cookie") ?? undefined,
        machine: "pinball",
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
