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
 * a basket is answered by people times the six rungs of the ladder.
 */

import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/server/room-store";
import { createLogger } from "@/lib/logger";

const log = createLogger("EggsAPI");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ eggs: getRoomStore().eggTallies() });
  } catch (err) {
    log.error("could not read the baskets:", (err as Error).message);
    return NextResponse.json({ error: "Failed to read the baskets" }, { status: 500 });
  }
}
