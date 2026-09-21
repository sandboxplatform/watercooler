/**
 * The Trello board on the wall of Sandbox ERP's third floor.
 *
 * Read-only against Trello, and the credentials stay on the server: the
 * browser asks this route, the route asks the shared reader, and that owns
 * the keys and the cache it shares with the agents' tools.
 *
 *   GET  /api/trello                      → the office's board, or the list to pick from
 *   GET  /api/trello?board=<id>           → that board, by id or by name
 *   GET  /api/trello?room=<slug>&slot=<n> → the board hanging in that room
 *   POST /api/trello { board }            → the office looks at this one from now on
 */

import { NextResponse } from "next/server";
import { readBoard, readBoardIn, setOfficeBoard } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Asked by room and slot, the room's own board answers — which is the
  // one on that wall, whatever anybody has picked elsewhere in the office.
  // Asked by name or by nothing, the old question: a board, or the list.
  const room = params.get("room");
  const slot = Number(params.get("slot") ?? "");
  const { status, ...answer } =
    room && Number.isInteger(slot) && slot > 0
      ? await readBoardIn(room, slot)
      : await readBoard(params.get("board"));
  return NextResponse.json(answer, status ? { status } : undefined);
}

/**
 * Choosing on the wall chooses for the whole office, agents included — an
 * agent has no browser, so a pick kept in one is a pick it cannot see.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { board?: unknown };
  const board = typeof body.board === "string" ? body.board.trim() : "";
  if (!board) return NextResponse.json({ error: "No board given" }, { status: 400 });
  setOfficeBoard(board);
  const { status, ...answer } = await readBoard(board);
  return NextResponse.json(answer, status ? { status } : undefined);
}
