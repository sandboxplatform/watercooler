/**
 * Reading a Trello board.
 *
 * Server-side only, and deliberately so: Trello authenticates with a key
 * and a token passed as *query parameters* on every request, not as a
 * header. A call made from a browser would put the token in the page's
 * network log, where anyone looking at the screen could copy it — and a
 * token reaches every board its account can see. So the office asks its own
 * server, the server asks Trello, and the credentials never leave the
 * machine. For the same reason nothing here logs a full URL.
 *
 * Read-only: only GETs, and no method that writes to a board exists.
 */

import { createLogger } from "../logger";
import {
  toBoardSummaries,
  toBoardView,
  type BoardSummary,
  type BoardView,
  type RawBoard,
} from "./board";

const log = createLogger("Trello");

const API = "https://api.trello.com/1";

/** Long enough to spare Trello's rate limit, short enough to feel live. */
export const BOARD_CACHE_MS = 30_000;

export interface TrelloConfig {
  key: string;
  token: string;
  /** The board to show, when one is named; otherwise the wall offers a choice. */
  boardId: string | null;
}

/**
 * The credentials, from the environment. Absent means the wall says how to
 * set it up rather than failing — the office works without Trello.
 */
export function readTrelloConfig(env: NodeJS.ProcessEnv = process.env): TrelloConfig | null {
  const key = env.TRELLO_API_KEY?.trim();
  const token = env.TRELLO_TOKEN?.trim();
  if (!key || !token) return null;
  return { key, token, boardId: env.TRELLO_BOARD_ID?.trim() || null };
}

/** What went wrong, in words a person reading the wall can act on. */
export class TrelloError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function describe(status: number): string {
  if (status === 401) return "Trello refused the key and token. Check them in .env.local.";
  if (status === 404) return "Trello has no such board, or this token cannot see it.";
  if (status === 429) return "Trello is rate limiting us. The board will refresh shortly.";
  return `Trello answered ${status}.`;
}

async function get(
  path: string,
  params: Record<string, string>,
  config: TrelloConfig,
): Promise<unknown> {
  const url = new URL(`${API}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  // The credentials go on the query string because Trello takes them
  // nowhere else. Added last, and never logged.
  url.searchParams.set("key", config.key);
  url.searchParams.set("token", config.token);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (err) {
    // The path, never the URL: the URL carries the token.
    log.warn(`could not reach Trello for ${path}:`, (err as Error).message);
    throw new TrelloError(502, "Trello could not be reached.");
  }
  if (!response.ok) {
    log.warn(`Trello answered ${response.status} for ${path}`);
    throw new TrelloError(response.status, describe(response.status));
  }
  return response.json();
}

/** Every open board this token can see. */
export async function fetchBoards(config: TrelloConfig): Promise<BoardSummary[]> {
  const raw = await get("/members/me/boards", { filter: "open", fields: "name,url" }, config);
  return toBoardSummaries(raw);
}

/**
 * One board, whole: its lists, its open cards, and the labels and members
 * those cards point at — in a single request, so the wall is one round trip
 * rather than one per column.
 */
export async function fetchBoard(config: TrelloConfig, boardId: string): Promise<BoardView> {
  const raw = (await get(
    `/boards/${encodeURIComponent(boardId)}`,
    {
      fields: "name,url",
      lists: "open",
      list_fields: "name,pos",
      cards: "open",
      card_fields: "name,idList,idLabels,idMembers,due,dueComplete,shortUrl,pos,badges",
      labels: "all",
      label_fields: "name,color",
      members: "all",
      member_fields: "initials,fullName",
    },
    config,
  )) as RawBoard;
  return toBoardView(raw);
}
