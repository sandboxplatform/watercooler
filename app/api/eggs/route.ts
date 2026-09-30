/**
 * Every basket in the world: who has found how many of each kind.
 *
 * Finding one is announced on the socket as it happens; this is the
 * catch-up, so a panel opened cold and a profile opened for somebody who
 * is not online both have something to show. The badges' route beside it
 * does the same job for the same reason.
 *
 * A tally rather than the rows behind it. One row per egg is what the
 * store keeps — an egg is a thing that happened at a time — but the rows
 * grow for as long as the world runs, and every question anybody asks of
 * a basket is answered by people times the rungs of the ladder.
 */

import { getRoomStore } from "@/lib/server/room-store";
import { guarded } from "@/lib/server/route";
import { createLogger } from "@/lib/logger";

const log = createLogger("EggsAPI");

export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(
    "read the baskets",
    () => Response.json({ eggs: getRoomStore().eggTallies() }),
    log,
  );
}
