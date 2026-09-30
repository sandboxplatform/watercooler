/**
 * The counts on the wall of Sandbox ERP's Support room, and the two weeks
 * lettered in the corridor outside it.
 *
 * Read-only, and the credentials stay on the server, exactly as the queue
 * beside it does: the browser asks this route, the route asks the shared
 * reader, and that owns the keys and the cache it shares with everyone
 * else in the room. Asked of the lift first, like the queue.
 *
 *   GET /api/zoho/pulse → the counts, and what they were measured from
 */

import { mayReadDesk, readPulse } from "@/lib/server/boards";
import { identityOf } from "@/lib/server/access";
import { answerWith, refuse } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!mayReadDesk(identityOf(request.headers.get("cookie") ?? undefined))) {
    return refuse("The desk is on a floor that is not yours.", 403);
  }
  return answerWith(await readPulse());
}
