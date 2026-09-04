/**
 * The boards on an Operations floor, read once for everyone.
 *
 * Three callers want the same thing: the HUD panels, and the agents through
 * their MCP tools. Each fetch is held briefly here rather than in any one
 * of them, so a floor of people and a room of agents reading the board at
 * the same moment is still one request to Trello and one to Zoho — both of
 * which count what you ask of them.
 *
 * Server-only. The credentials are read here and never travel further.
 * Read-only, like everything downstream of it.
 */

import {
  BOARD_CACHE_MS,
  TrelloError,
  fetchBoard,
  fetchBoards,
  readTrelloConfig,
} from "../trello/client";
import type { BoardSummary, BoardView } from "../trello/board";
import {
  DESK_CACHE_MS,
  ZohoError,
  fetchDepartments,
  fetchTickets,
  readZohoConfig,
} from "../zoho/client";
import type { DeskView } from "../zoho/tickets";
import { getRoomStore } from "./room-store";
import { createLogger } from "../logger";

const log = createLogger("Boards");

/**
 * Which board the office is looking at.
 *
 * Whoever picks one on the wall picks it for everyone, agents included:
 * an agent has no browser, so a choice kept only in someone's localStorage
 * is a choice it can never see. TRELLO_BOARD_ID still wins when set.
 */
const BOARD_SETTING = "trello-board";

export function officeBoard(): string | null {
  try {
    return getRoomStore().getSetting(BOARD_SETTING);
  } catch {
    return null;
  }
}

export function setOfficeBoard(boardId: string): void {
  try {
    getRoomStore().setSetting(BOARD_SETTING, boardId);
  } catch (err) {
    log.warn("could not remember the board:", (err as Error).message);
  }
}

export interface BoardAnswer {
  configured: boolean;
  board?: BoardView;
  boards?: BoardSummary[];
  error?: string;
  status?: number;
  fetchedAt?: number;
}

export interface DeskAnswer {
  configured: boolean;
  desk?: DeskView;
  departments?: { id: string; name: string }[];
  error?: string;
  status?: number;
  fetchedAt?: number;
}

const boards = new Map<string, { at: number; board: BoardView }>();
let boardList: { at: number; boards: BoardSummary[] } | null = null;
let desk: { at: number; view: DeskView; departments: { id: string; name: string }[] } | null = null;

/**
 * The project board. With no board named and none configured, the answer
 * is the list to choose from rather than a failure.
 */
export async function readBoard(asked?: string | null): Promise<BoardAnswer> {
  const config = readTrelloConfig();
  if (!config) return { configured: false };

  const wanted = asked?.trim() || config.boardId || officeBoard();
  const now = Date.now();

  try {
    // A person names a board the way they say it out loud — "Sandbox ERP" —
    // so a name is resolved to its id before anything else.
    let boardId = wanted;
    if (wanted && !/^[a-f0-9]{8,}$/i.test(wanted)) {
      if (!boardList || now - boardList.at > BOARD_CACHE_MS) {
        boardList = { at: now, boards: await fetchBoards(config) };
      }
      const found = boardList.boards.find(
        (b) => b.name.trim().toLowerCase() === wanted.toLowerCase(),
      );
      if (!found) {
        return {
          configured: true,
          boards: boardList.boards,
          error: `No board here is called "${wanted}".`,
        };
      }
      boardId = found.id;
    }

    if (!boardId) {
      if (!boardList || now - boardList.at > BOARD_CACHE_MS) {
        boardList = { at: now, boards: await fetchBoards(config) };
      }
      return { configured: true, boards: boardList.boards };
    }

    const held = boards.get(boardId);
    if (held && now - held.at < BOARD_CACHE_MS) {
      return { configured: true, board: held.board, boards: boardList?.boards, fetchedAt: held.at };
    }

    const board = await fetchBoard(config, boardId);
    boards.set(boardId, { at: now, board });
    if (!boardList || now - boardList.at > BOARD_CACHE_MS) {
      boardList = {
        at: now,
        boards: await fetchBoards(config).catch(() => boardList?.boards ?? []),
      };
    }
    return { configured: true, board, boards: boardList.boards, fetchedAt: now };
  } catch (err) {
    if (err instanceof TrelloError) {
      return { configured: true, error: err.message, status: err.status };
    }
    log.error("could not read the board:", (err as Error).message);
    return { configured: true, error: "The board could not be read.", status: 500 };
  }
}

/** The support queue. */
export async function readDesk(): Promise<DeskAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  const now = Date.now();
  if (desk && now - desk.at < DESK_CACHE_MS) {
    return { configured: true, desk: desk.view, departments: desk.departments, fetchedAt: desk.at };
  }

  try {
    const view = await fetchTickets(config);
    const departments = await fetchDepartments(config).catch(() => desk?.departments ?? []);
    desk = { at: now, view, departments };
    return { configured: true, desk: view, departments, fetchedAt: now };
  } catch (err) {
    if (err instanceof ZohoError) {
      return { configured: true, error: err.message, status: err.status };
    }
    log.error("could not read the desk:", (err as Error).message);
    return { configured: true, error: "The desk could not be read.", status: 500 };
  }
}

/** Test seam: forget what is held, so the next read goes out again. */
export function forgetBoards() {
  boards.clear();
  boardList = null;
  desk = null;
}
