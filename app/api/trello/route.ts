/**
 * The Trello board on the wall of Sandbox ERP's third floor.
 *
 * Read-only against Trello, and the credentials stay on the server: the
 * browser asks this route, the route asks the shared reader, and that owns
 * the keys and the cache it shares with the agents' tools.
 *
 *   GET  /api/trello              → the office's board, or the list to pick from
 *   GET  /api/trello?board=<id>   → that board, by id or by name
 *   POST /api/trello { board }    → the office looks at this one from now on
 */

import { NextResponse } from "next/server";
import { readBoard, setOfficeBoard } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("board");
  const { status, ...answer } = await readBoard(asked);
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
