/**
 * What every API route says the same way. Server only.
 *
 * Each route had its own copy of the try, the log line and the 500, and its
 * own reading of `?room=` — two of them normalised it and one did not, so the
 * same slug could name a room in one route and a different string in the
 * next. One of each, here.
 */

import { createLogger, type Logger } from "../logger";
import { normaliseRoomSlug } from "../rooms";
import { DEFAULT_ROOM } from "./room-store";

const fallbackLog = createLogger("API");

/** A JSON refusal: `{ error }` and the status that goes with it. */
export function refuse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

/**
 * The room a request names in `?room=`, normalised the one way slugs are.
 *
 * With no room given it is the default room — or `null`, when the caller
 * passes that, for a route where no room is a different question rather
 * than the default one.
 */
export function roomParam(request: Request): string;
export function roomParam(request: Request, fallback: null): string | null;
export function roomParam(request: Request, fallback: string | null = DEFAULT_ROOM) {
  const raw = new URL(request.url).searchParams.get("room");
  if (raw === null || raw.trim() === "") return fallback === null ? null : fallback;
  return normaliseRoomSlug(raw);
}

/**
 * Run a handler and answer a throw with a logged 500 in JSON.
 *
 * `what` is the thing being done, in the words both halves use: "read the
 * badges" logs `could not read the badges: …` and answers `Failed to read
 * the badges`. The error's own message goes to the log and never to the
 * browser — it names files, SQL and hosts.
 */
export async function guarded(
  what: string,
  run: () => Response | Promise<Response>,
  log: Logger = fallbackLog,
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    log.error(`could not ${what}:`, (err as Error)?.message ?? err);
    return refuse(`Failed to ${what}`, 500);
  }
}

/**
 * An answer from a reader that carries its own HTTP status beside the body
 * — the boards and the desk do, since "Trello refused the token" is a 401
 * the browser should see as one. The status is taken off the body.
 */
export function answerWith<T extends { status?: number }>(answer: T): Response {
  const { status, ...body } = answer;
  return Response.json(body, status ? { status } : undefined);
}
