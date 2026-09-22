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
import { toFlow, type Flow } from "../trello/flow";
import { tenantInRoom } from "../world/floors";
import { projectBoardAt } from "../world/tenants";
import {
  CUSTOMERS_CACHE_MS,
  DESK_CACHE_MS,
  PULSE_CACHE_MS,
  ZohoError,
  fetchDepartments,
  fetchOpenParties,
  fetchPulse,
  fetchTickets,
  readZohoConfig,
} from "../zoho/client";
import { tallyCustomers } from "./customers";
import type { DeskView } from "../zoho/tickets";
import type { Pulse } from "../zoho/pulse";
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

export interface FlowAnswer {
  configured: boolean;
  /**
   * Whether this room counts stages at all. False for every room but the
   * one the numbers hang in, which is not a failure — it is the answer to
   * "is there a board on this wall", and the panel says so plainly rather
   * than sitting on an error.
   */
  counts?: boolean;
  flow?: Flow;
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

export interface PulseAnswer {
  configured: boolean;
  pulse?: Pulse;
  error?: string;
  status?: number;
  fetchedAt?: number;
}

/** What hangs over the mailboxes on the world map. */
export interface CustomersAnswer {
  configured: boolean;
  /**
   * Open tickets standing against each customer, by the slug of the
   * organisation whose building the box stands outside. Every one of them is
   * in here, a nought included — what to make of a nought is the map's.
   */
  open?: Record<string, number>;
  /** Every figure is a floor: the sweep ran out of pages before the desk did. */
  capped?: boolean;
  error?: string;
  status?: number;
  fetchedAt?: number;
}

const boards = new Map<string, { at: number; board: BoardView }>();
let boardList: { at: number; boards: BoardSummary[] } | null = null;
let desk: { at: number; view: DeskView; departments: { id: string; name: string }[] } | null = null;
let pulse: { at: number; view: Pulse } | null = null;
let customers: { at: number; open: Record<string, number>; capped: boolean } | null = null;

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

/**
 * Which board hangs in a given room of a building's Operations floor.
 *
 * The room's own, and nothing else. A floor used to hang one project board
 * and the wall carried a picker, so the answer was "whatever the office
 * last chose" with the building's declaration as a fallback underneath it.
 * Three boards in three rooms make that the wrong way round: a room that
 * deferred to an office-wide choice would be the one switching wall again,
 * wearing three doors. So a named board wins over `TRELLO_BOARD_ID` and
 * over anything picked, and the pick is only consulted where the building
 * names nothing — which is a building with one board and a picker on it.
 *
 * Null where this room holds no board: a slot past the end, a room on a
 * floor with none. A stale link asks for exactly that.
 */
function boardInRoom(room: string | null | undefined, slot: number): string | null {
  const spec = projectBoardAt(tenantInRoom(room), slot);
  if (!spec) return null;
  if (spec.board) return spec.board;
  return readTrelloConfig()?.boardId ?? officeBoard();
}

/**
 * The project board on a room's wall, by the slot the map gave it.
 *
 * The browser presses a point of interest and says which — `2` — rather
 * than naming a board, for the reason it never names the room it is
 * standing in: which board hangs where is the building's business, and a
 * request that named one could name any board the token can see.
 */
export async function readBoardIn(
  room: string | null | undefined,
  slot: number,
): Promise<BoardAnswer> {
  const wanted = boardInRoom(room, slot);
  // No board declared and nothing picked: the wall offers the list, which
  // is what `readBoard` answers when it is asked for nothing.
  return readBoard(wanted);
}

/**
 * The stage counts on the wall beside a room's project board.
 *
 * No fetch and no cache of its own: it counts the board `readBoard` already
 * holds, which is the board hanging beside it on the same wall. So the
 * numbers and the cards cannot disagree about what is on it, and a floor of
 * people reading both is still one request to Trello.
 *
 * Which board, and which lanes, are the room's — see `boardInRoom`.
 */
export async function readFlow(room: string | null | undefined, slot = 1): Promise<FlowAnswer> {
  const config = readTrelloConfig();
  const spec = projectBoardAt(tenantInRoom(room), slot);
  if (!spec || spec.lanes.length === 0) return { configured: config !== null, counts: false };
  if (!config) return { configured: false, counts: true };

  const answer = await readBoard(boardInRoom(room, slot));
  if (!answer.board) {
    return {
      configured: true,
      counts: true,
      error: answer.error ?? "No board is on the wall yet.",
      status: answer.status,
    };
  }
  return {
    configured: true,
    counts: true,
    flow: toFlow(answer.board, spec.lanes),
    fetchedAt: answer.fetchedAt,
  };
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

/**
 * The five counts on the Support room's wall.
 *
 * Held separately from the queue and for longer: it costs three sweeps
 * rather than one page, and everybody in the room is looking at the same
 * wall. Same shape of answer as the queue, so the panel and the wall both
 * know an unconfigured desk from a broken one.
 */
export async function readPulse(): Promise<PulseAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  const now = Date.now();
  if (pulse && now - pulse.at < PULSE_CACHE_MS) {
    return { configured: true, pulse: pulse.view, fetchedAt: pulse.at };
  }

  try {
    const view = await fetchPulse(config, now);
    pulse = { at: now, view };
    return { configured: true, pulse: view, fetchedAt: now };
  } catch (err) {
    if (err instanceof ZohoError) {
      return { configured: true, error: err.message, status: err.status };
    }
    log.error("could not count the desk:", (err as Error).message);
    return { configured: true, error: "The desk could not be counted.", status: 500 };
  }
}

/**
 * What is standing against each customer, for the mailboxes on the world map.
 *
 * Held here with the rest, and for longer than any of them: the world map is
 * the one room everybody passes through, so this is the read most likely to
 * be asked for by twenty browsers in the same minute — and a mailbox is
 * glanced at on the way past rather than stood in front of.
 *
 * A sweep of its own rather than the standing sweep `fetchPulse` already
 * makes, which asks Zoho for very nearly the same page. Two reasons, and the
 * first decides it: this one needs `include=contacts`, because a great many
 * tickets are raised by email from somebody Zoho has not linked to an
 * account, and the address is then the only thing saying whose they are. And
 * the two are allowed to mean different things — `ZOHO_OPEN_STATUSES`
 * against the wall's three bays — so sharing the read would be sharing that
 * decision with it.
 */
export async function readCustomers(): Promise<CustomersAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  const now = Date.now();
  if (customers && now - customers.at < CUSTOMERS_CACHE_MS) {
    return {
      configured: true,
      open: customers.open,
      capped: customers.capped,
      fetchedAt: customers.at,
    };
  }

  try {
    const { parties, capped } = await fetchOpenParties(config);
    const { open, unattributed } = tallyCustomers(parties);
    // Worth a line in the log and nothing more: a desk serves people who are
    // not on the record, so this is only ever evidence that the record may be
    // short — never that anything has failed.
    if (unattributed > 0) {
      log.info(`${unattributed} open tickets belong to nobody on the customer record`);
    }
    customers = { at: now, open, capped };
    return { configured: true, open, capped, fetchedAt: now };
  } catch (err) {
    if (err instanceof ZohoError) {
      return { configured: true, error: err.message, status: err.status };
    }
    log.error("could not count the customers:", (err as Error).message);
    return { configured: true, error: "The customers could not be counted.", status: 500 };
  }
}

/** Test seam: forget what is held, so the next read goes out again. */
export function forgetBoards() {
  boards.clear();
  boardList = null;
  desk = null;
  pulse = null;
  customers = null;
}
