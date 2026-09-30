/**
 * The whiteboard — the one board, shared by every room — for a client that
 * has just opened it.
 *
 * Live changes arrive on the room socket; this is the catch-up: the strokes
 * already on the board, in the order they were drawn.
 */

import { getRoomStore } from "@/lib/server/room-store";
import { SHARED_BOARD } from "@/lib/whiteboard";
import { guarded } from "@/lib/server/route";
import { createLogger } from "@/lib/logger";

const log = createLogger("BoardAPI");

export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(
    "read the board",
    () => Response.json({ strokes: getRoomStore().listStrokes(SHARED_BOARD) }),
    log,
  );
}
