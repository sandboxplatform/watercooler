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
 * plainly, rather than being handed somebody else's numbers.
 *
 *   GET /api/trello/flow?room=<slug>&slot=<n> → that room's stages, counted
 *
 * `slot` is which room along the corridor, one-based, as the map letters
 * its points of interest. It defaults to the first, which is the building's
 * own board in Operations.
 */

import { NextResponse } from "next/server";
import { readFlow } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const room = params.get("room");
  const slot = Number(params.get("slot") ?? "1");
  const { status, ...answer } = await readFlow(room, Number.isInteger(slot) && slot > 0 ? slot : 1);
  return NextResponse.json(answer, status ? { status } : undefined);
}
