/**
 * Every badge anybody in the world holds.
 *
 * Earning one is announced on the socket as it happens; this is the
 * catch-up, so a panel opened cold and a profile opened for somebody who is
 * not online both have something to show.
 *
 * No room parameter, and that is the change from what this replaced: a
 * badge belongs to the person rather than to the place it was earned in, so
 * there is one list and everybody is on it. It is a small table — one row
 * per person per badge, and the catalogue is short — so it comes back
 * whole rather than paged or filtered.
 */

import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/server/room-store";
import { createLogger } from "@/lib/logger";

const log = createLogger("BadgesAPI");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ badges: getRoomStore().listBadges() });
  } catch (err) {
    log.error("could not read the badges:", (err as Error).message);
    return NextResponse.json({ error: "Failed to read the badges" }, { status: 500 });
  }
}
