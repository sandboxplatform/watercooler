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
 *   GET /api/trello/flow?room=<slug> → the stages, counted
 */

import { NextResponse } from "next/server";
import { readFlow } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get("room");
  const { status, ...answer } = await readFlow(room);
  return NextResponse.json(answer, status ? { status } : undefined);
}
