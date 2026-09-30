/**
 * The Trello boards on the walls of an Operations floor.
 *
 * Read-only against Trello, and the credentials stay on the server: the
 * browser asks this route, the route asks the shared reader, and that owns
 * the keys and the cache everybody on the floor shares.
 *
 *   GET  /api/trello?room=<slug>&slot=<n> → the board hanging in that room
 *   GET  /api/trello                      → the office's board, or the list to pick from
 *   GET  /api/trello?board=<id|name>      → that board, by id or by name
 *   POST /api/trello { board }            → the office looks at this one from now on
 *
 * A board is as private as the floor it hangs on, so each is asked of the
 * lift first. A room's board is the building's; the other three are the
 * picker's, and only somebody who can ride up to a wall with a picker on it
 * may use one — see `mayPickBoards`.
 */

import {
  BOARD_NAME_LIMIT,
  mayPickBoards,
  mayReadRoomBoards,
  readBoard,
  readBoardIn,
  setOfficeBoard,
} from "@/lib/server/boards";
import { identityOf } from "@/lib/server/access";
import { answerWith, refuse, roomParam } from "@/lib/server/route";

export const dynamic = "force-dynamic";

/** What somebody is told about a board on a floor that is not theirs. */
const NOT_YOUR_BOARD = "That board hangs on a floor that is not yours.";

function who(request: Request) {
  return identityOf(request.headers.get("cookie") ?? undefined);
}

export async function GET(request: Request) {
  const identity = who(request);
  const params = new URL(request.url).searchParams;
  // Asked by room and slot, the room's own board answers — which is the
  // one on that wall, whatever anybody has picked elsewhere in the office.
  const room = roomParam(request, null);
  const slot = Number(params.get("slot") ?? "");
  if (room && Number.isInteger(slot) && slot > 0) {
    if (!mayReadRoomBoards(room, identity)) return refuse(NOT_YOUR_BOARD, 403);
    return answerWith(await readBoardIn(room, slot));
  }

  // Asked by name or by nothing, the picker's question: a board, or the list.
  if (!mayPickBoards(identity)) return refuse(NOT_YOUR_BOARD, 403);
  const board = params.get("board");
  if (board && board.length > BOARD_NAME_LIMIT) return refuse("That is not a board", 400);
  return answerWith(await readBoard(board, { list: true }));
}

/** Choosing on the wall chooses for the whole office. */
export async function POST(request: Request) {
  if (!mayPickBoards(who(request))) return refuse(NOT_YOUR_BOARD, 403);
  const body = (await request.json().catch(() => ({}))) as { board?: unknown };
  const board = typeof body.board === "string" ? body.board.trim() : "";
  if (!board) return refuse("No board given", 400);
  if (board.length > BOARD_NAME_LIMIT) return refuse("That is not a board", 400);
  setOfficeBoard(board);
  return answerWith(await readBoard(board, { list: true }));
}
