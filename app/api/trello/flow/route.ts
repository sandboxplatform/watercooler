/**
 * The stage counts on the wall beside a building's project board.
 *
 * Read-only, and the credentials stay on the server exactly as the board
 * beside them does: the browser asks this route, the route asks the shared
 * reader, and that owns the keys and the cache it shares with everyone else
 * on the floor.
 *
 * Asked by room rather than by board, because which stages are counted is
 * the building's own business — so a room that counts none is told so,
 * plainly, rather than being handed somebody else's numbers. And asked of
 * the lift first, since the numbers are as private as the floor they hang on.
 *
 *   GET /api/trello/flow?room=<slug>&slot=<n> → that room's stages, counted
 *
 * `slot` is which room along the corridor, one-based, as the map letters
 * its points of interest. It defaults to the first, which is the building's
 * own board in Operations.
 */

import { mayReadRoomBoards, readFlow } from "@/lib/server/boards";
import { identityOf } from "@/lib/server/access";
import { answerWith, refuse, roomParam } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const room = roomParam(request, null);
  if (!mayReadRoomBoards(room, identityOf(request.headers.get("cookie") ?? undefined))) {
    return refuse("Those counts hang on a floor that is not yours.", 403);
  }
  const slot = Number(new URL(request.url).searchParams.get("slot") ?? "1");
  return answerWith(await readFlow(room, Number.isInteger(slot) && slot > 0 ? slot : 1));
}
