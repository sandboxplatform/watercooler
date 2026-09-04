/**
 * The Trello board on the wall of Sandbox ERP's third floor.
 *
 * Read-only, and the only place the Trello credentials are used: the
 * browser asks this route, this route asks Trello. The key and token never
 * reach the page, and nothing about them is in the answer.
 *
 *   GET /api/trello              → the configured board, or the list to pick from
 *   GET /api/trello?board=<id>   → that board
 */

import { NextResponse } from "next/server";
import {
  BOARD_CACHE_MS,
  TrelloError,
  fetchBoard,
  fetchBoards,
  readTrelloConfig,
} from "@/lib/trello/client";
import type { BoardSummary, BoardView } from "@/lib/trello/board";
import { createLogger } from "@/lib/logger";

const log = createLogger("TrelloAPI");

export const dynamic = "force-dynamic";

/**
 * Everyone on the floor sees the same board, so it is fetched for the
 * first of them and held briefly for the rest. Trello rate limits per
 * token, and a room of people each polling would spend that on nothing.
 */
const cache = new Map<string, { at: number; board: BoardView }>();
let boardList: { at: number; boards: BoardSummary[] } | null = null;

export async function GET(request: Request) {
  const config = readTrelloConfig();
  if (!config) {
    // Not an error: the office simply has no board connected yet, and the
    // wall says how to connect one.
    return NextResponse.json({ configured: false });
  }

  const asked = new URL(request.url).searchParams.get("board")?.trim();
  const boardId = asked || config.boardId;
  const now = Date.now();

  try {
    if (!boardId) {
      if (!boardList || now - boardList.at > BOARD_CACHE_MS) {
        boardList = { at: now, boards: await fetchBoards(config) };
      }
      return NextResponse.json({ configured: true, boards: boardList.boards });
    }

    const held = cache.get(boardId);
    if (held && now - held.at < BOARD_CACHE_MS) {
      return NextResponse.json({ configured: true, board: held.board, fetchedAt: held.at });
    }

    const board = await fetchBoard(config, boardId);
    cache.set(boardId, { at: now, board });
    // The picker needs names too, and this is a cheap moment to have them.
    if (!boardList || now - boardList.at > BOARD_CACHE_MS) {
      boardList = {
        at: now,
        boards: await fetchBoards(config).catch(() => boardList?.boards ?? []),
      };
    }
    return NextResponse.json({
      configured: true,
      board,
      boards: boardList.boards,
      fetchedAt: now,
    });
  } catch (err) {
    if (err instanceof TrelloError) {
      return NextResponse.json({ configured: true, error: err.message }, { status: err.status });
    }
    log.error("could not read the board:", (err as Error).message);
    return NextResponse.json(
      { configured: true, error: "The board could not be read." },
      { status: 500 },
    );
  }
}
