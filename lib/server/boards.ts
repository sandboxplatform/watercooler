/**
 * The boards on an Operations floor, read once for everyone.
 *
 * Every browser on a floor asks on its own timer, and Trello and Zoho both
 * count what they are asked. So each read is held here rather than in any
 * one route — `cachedFetch` shares a load already on its way and holds a
 * failure for a moment too — and a floor of people reading the board at the
 * same moment is still one request to Trello and one to Zoho.
 *
 * And who may read what. These boards hang on private floors, so what is on
 * them is as private as the floor: the routes ask the functions at the foot
 * of this file before they answer, for the reason the socket refuses the
 * room rather than trusting the lift.
 *
 * Server-only. The credentials are read here and never travel further.
 * Read-only, like everything downstream of it.
 */

import {
  BOARD_CACHE_MS,
  BOARD_LIST_CACHE_MS,
  TrelloError,
  fetchBoard,
  fetchBoards,
  readTrelloConfig,
  type TrelloConfig,
} from "../trello/client";
import type { BoardSummary, BoardView } from "../trello/board";
import { toFlow, type Flow } from "../trello/flow";
import { mayRideLift, tenantInRoom } from "../world/floors";
import { TENANTS, operationsBoards, projectBoardAt, projectBoards } from "../world/tenants";
import type { AccessIdentity } from "../identity";
import {
  CUSTOMERS_CACHE_MS,
  DEPARTMENTS_CACHE_MS,
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
import { cachedFetch, forgetCached } from "./outbound";
import { createLogger } from "../logger";

const log = createLogger("Boards");

/**
 * Which board the office is looking at, where a wall offers a choice.
 *
 * Whoever picks one on that wall picks it for everyone, so it is kept here
 * rather than in somebody's localStorage. TRELLO_BOARD_ID still wins when
 * set, and a room that names its own board ignores both.
 */
const BOARD_SETTING = "trello-board";

/** The longest board name or id anybody may pick. Trello's ids are 24. */
export const BOARD_NAME_LIMIT = 128;

export function officeBoard(): string | null {
  try {
    return getRoomStore().getSetting(BOARD_SETTING);
  } catch {
    return null;
  }
}

export function setOfficeBoard(boardId: string): void {
  try {
    getRoomStore().setSetting(BOARD_SETTING, boardId.slice(0, BOARD_NAME_LIMIT));
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

/** Every open board the token can see, held for an hour. */
function boardList(config: TrelloConfig): Promise<BoardSummary[]> {
  return cachedFetch("trello:boards", BOARD_LIST_CACHE_MS, () => fetchBoards(config)).then(
    (held) => held.value,
  );
}

/** A failure from either service, in the shape every answer here takes. */
function failed(err: unknown, what: string, said: string): { error: string; status: number } {
  if (err instanceof TrelloError || err instanceof ZohoError) {
    return { error: err.message, status: err.status };
  }
  log.error(`could not ${what}:`, (err as Error)?.message ?? err);
  return { error: said, status: 500 };
}

/**
 * A project board, by id or by the name somebody would say out loud.
 *
 * `list` is whether the answer carries every board the token can see — the
 * picker's list, and so only for a wall that has a picker on it. With no
 * board named and none configured, a caller given the list gets it to
 * choose from rather than a failure; one without it is told the wall is
 * empty.
 */
export async function readBoard(
  asked?: string | null,
  { list = false }: { list?: boolean } = {},
): Promise<BoardAnswer> {
  const config = readTrelloConfig();
  if (!config) return { configured: false };

  const wanted = asked?.trim() || config.boardId || officeBoard();

  try {
    // A person names a board the way they say it out loud — "Sandbox ERP" —
    // so a name is resolved to its id before anything else.
    let boardId = wanted;
    if (wanted && !/^[a-f0-9]{8,}$/i.test(wanted)) {
      const boards = await boardList(config);
      const found = boards.find((b) => b.name.trim().toLowerCase() === wanted.toLowerCase());
      if (!found) {
        return {
          configured: true,
          ...(list ? { boards } : {}),
          error: `No board here is called "${wanted}".`,
        };
      }
      boardId = found.id;
    }

    if (!boardId) {
      if (!list) return { configured: true, error: "No board is on the wall yet." };
      return { configured: true, boards: await boardList(config) };
    }

    const id = boardId;
    const held = await cachedFetch(`trello:board:${id}`, BOARD_CACHE_MS, () =>
      fetchBoard(config, id),
    );
    // The list is a nicety beside a board, so a failure to read it is not
    // a failure to read the board.
    const boards = list ? await boardList(config).catch(() => undefined) : undefined;
    return { configured: true, board: held.value, boards, fetchedAt: held.at };
  } catch (err) {
    return { configured: true, ...failed(err, "read the board", "The board could not be read.") };
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
 * `undefined` where this room holds no board at all: a slot past the end, a
 * room on a floor with none, a stale link. `picker` is whether this wall is
 * the one with a choice on it.
 */
function boardInRoom(
  room: string | null | undefined,
  slot: number,
): { board: string | null; picker: boolean } | undefined {
  const spec = projectBoardAt(tenantInRoom(room), slot);
  if (!spec) return undefined;
  if (spec.board) return { board: spec.board, picker: false };
  return { board: readTrelloConfig()?.boardId ?? officeBoard(), picker: true };
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
  const wall = boardInRoom(room, slot);
  if (!wall) {
    return { configured: readTrelloConfig() !== null, error: "No board hangs here.", status: 404 };
  }
  // A wall with a picker offers the list, which is what `readBoard` answers
  // when nothing has been picked yet; a named wall shows its board alone.
  return readBoard(wall.board, { list: wall.picker });
}

/**
 * The stage counts on the wall beside a room's project board.
 *
 * No fetch of its own: it counts the board `readBoard` already holds, which
 * is the board hanging beside it on the same wall. So the numbers and the
 * cards cannot disagree about what is on it, and a floor of people reading
 * both is still one request to Trello.
 *
 * Which board, and which lanes, are the room's — see `boardInRoom`.
 */
export async function readFlow(room: string | null | undefined, slot = 1): Promise<FlowAnswer> {
  const config = readTrelloConfig();
  const spec = projectBoardAt(tenantInRoom(room), slot);
  if (!spec || spec.lanes.length === 0) return { configured: config !== null, counts: false };
  if (!config) return { configured: false, counts: true };

  const answer = await readBoard(boardInRoom(room, slot)?.board);
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

/** The support queue, and the desk's departments beside it. */
export async function readDesk(): Promise<DeskAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  try {
    const held = await cachedFetch("zoho:desk", DESK_CACHE_MS, () => fetchTickets(config));
    // Held for an hour, and a nicety: a desk whose departments cannot be
    // read is still a desk.
    const departments = await cachedFetch("zoho:departments", DEPARTMENTS_CACHE_MS, () =>
      fetchDepartments(config),
    ).then(
      (d) => d.value,
      () => [],
    );
    return { configured: true, desk: held.value, departments, fetchedAt: held.at };
  } catch (err) {
    return { configured: true, ...failed(err, "read the desk", "The desk could not be read.") };
  }
}

/**
 * The counts on the Support room's wall.
 *
 * Held separately from the queue and for longer: it costs three sweeps
 * rather than one page, and everybody in the room is looking at the same
 * wall. Same shape of answer as the queue, so the panel and the wall both
 * know an unconfigured desk from a broken one.
 */
export async function readPulse(): Promise<PulseAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  try {
    const held = await cachedFetch("zoho:pulse", PULSE_CACHE_MS, () =>
      fetchPulse(config, Date.now()),
    );
    return { configured: true, pulse: held.value, fetchedAt: held.at };
  } catch (err) {
    return { configured: true, ...failed(err, "count the desk", "The desk could not be counted.") };
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
 *
 * What comes back is numbers by building and nothing else, which is why it
 * is the one read here nobody is asked the lift about: the boxes stand on
 * the public map.
 */
export async function readCustomers(): Promise<CustomersAnswer> {
  const config = readZohoConfig();
  if (!config) return { configured: false };

  try {
    const held = await cachedFetch("zoho:customers", CUSTOMERS_CACHE_MS, async () => {
      const { parties, capped } = await fetchOpenParties(config);
      const { open, unattributed } = tallyCustomers(parties);
      // Worth a line in the log and nothing more: a desk serves people who
      // are not on the record, so this is only ever evidence that the
      // record may be short — never that anything has failed.
      if (unattributed > 0) {
        log.info(`${unattributed} open tickets belong to nobody on the customer record`);
      }
      return { open, capped };
    });
    return {
      configured: true,
      open: held.value.open,
      capped: held.value.capped,
      fetchedAt: held.at,
    };
  } catch (err) {
    return {
      configured: true,
      ...failed(err, "count the customers", "The customers could not be counted."),
    };
  }
}

/** Test seam: forget what is held, so the next read goes out again. */
export function forgetBoards() {
  forgetCached();
}

// ── Who may read what ─────────────────────────────────────

/**
 * Whether somebody may read the boards hanging in this room.
 *
 * The same question the lift asks, of the building the room is in: the
 * boards are on its Operations floor, and a floor you may not ride to is a
 * floor whose walls you may not read by asking the server instead. A room
 * that is no building's hangs no board, so there is nothing to refuse.
 */
export function mayReadRoomBoards(room: string | null | undefined, who: AccessIdentity): boolean {
  const tenant = tenantInRoom(room);
  return tenant ? mayRideLift(tenant.slug, who) : true;
}

/**
 * Whether somebody may read the support desk.
 *
 * Asked of whichever buildings run one — read off the tenants rather than
 * written down, so a second desk is a line there and nothing here. Today
 * that is Sandbox ERP alone.
 */
export function mayReadDesk(who: AccessIdentity): boolean {
  return TENANTS.some(
    (tenant) => operationsBoards(tenant).includes("zoho") && mayRideLift(tenant.slug, who),
  );
}

/**
 * Whether somebody may name a board, see every board, or choose one for the
 * office: `?board=`, the full list, and the POST.
 *
 * Those are the picker's, and a picker hangs only on a wall whose building
 * names no board of its own — Castle Atlantic. Everybody else's walls say
 * which board they carry, so a request naming one is a request for a board
 * that hangs on no wall of theirs.
 */
export function mayPickBoards(who: AccessIdentity): boolean {
  return TENANTS.some(
    (tenant) => projectBoards(tenant).some((spec) => !spec.board) && mayRideLift(tenant.slug, who),
  );
}
