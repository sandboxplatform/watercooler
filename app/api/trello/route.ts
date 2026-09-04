/**
 * The Trello board on the wall of Sandbox ERP's third floor.
 *
 * Read-only, and the credentials stay on the server: the browser asks this
 * route, the route asks the shared reader, and that owns the keys and the
 * cache it shares with the agents' tools.
 *
 *   GET /api/trello              → the configured board, or the list to pick from
 *   GET /api/trello?board=<id>   → that board
 */

import { NextResponse } from "next/server";
import { readBoard } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("board");
  const { status, ...answer } = await readBoard(asked);
  return NextResponse.json(answer, status ? { status } : undefined);
}
