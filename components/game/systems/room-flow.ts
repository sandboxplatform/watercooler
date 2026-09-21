import { currentRoom } from "@/lib/room-client";
import type { Flow } from "@/lib/trello/flow";
import { createLogger } from "@/lib/logger";

const log = createLogger("RoomFlow");

/**
 * One read of a project room's board, shared by everything drawn from it.
 *
 * Two things in a project room are the same fetch: the five stage counts
 * on the wall and the roadblock standing on the floor. Each keeps its own
 * timer — a board and a marker are different objects with different
 * teardowns — and left alone that is two requests where the server is
 * going to answer both off one cached read of Trello anyway.
 *
 * So an answer stands here for a moment and a second asker inside that
 * moment gets it rather than the network. Short, because this is not a
 * cache: it is the width of the gap between two timers that were started
 * in the same tick and drift apart by a frame. Anything longer would be a
 * second opinion about how fresh the wall is, and `PULSE_REFRESH_MS` is
 * already the one that exists.
 *
 * Keyed by room as well as slot: a lift ride is a new scene in a new room
 * and slot 1 there is a different board entirely.
 */
const SHARE_MS = 2_000;

interface Held {
  at: number;
  flow: Flow | null;
}

const held = new Map<string, Held>();
const reading = new Map<string, Promise<Flow | null>>();

/**
 * The stages and the roadblocks in a room, from the room's own server.
 *
 * Null where there are none to show: an unconfigured Trello, a board that
 * could not be read, a room that counts nothing. The callers all draw
 * nothing rather than drawing zeroes, because a wall reading 0 and a wall
 * reading nothing mean opposite things.
 */
export async function readRoomFlow(slot: number): Promise<Flow | null> {
  const room = currentRoom();
  const key = `${room}:${slot}`;
  const now = Date.now();

  const standing = held.get(key);
  if (standing && now - standing.at < SHARE_MS) return standing.flow;

  // Whoever asked first is already asking; join them rather than making a
  // second request for the same answer.
  const already = reading.get(key);
  if (already) return already;

  const request = fetchFlow(room, slot).then((flow) => {
    sweep(Date.now());
    held.set(key, { at: Date.now(), flow });
    reading.delete(key);
    return flow;
  });
  reading.set(key, request);
  return request;
}

/** Forget what has gone stale, so a session of lift rides is not a leak. */
function sweep(now: number) {
  for (const [key, entry] of held) if (now - entry.at >= SHARE_MS) held.delete(key);
}

async function fetchFlow(room: string, slot: number): Promise<Flow | null> {
  try {
    const response = await fetch(`/api/trello/flow?room=${encodeURIComponent(room)}&slot=${slot}`, {
      cache: "no-store",
    });
    const answer = (await response.json()) as { flow?: Flow };
    return answer.flow ?? null;
  } catch (err) {
    log.warn("could not count the board:", (err as Error).message);
    return null;
  }
}
