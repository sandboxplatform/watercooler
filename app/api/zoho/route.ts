/**
 * The Zoho Desk queue on the wall of Sandbox ERP's third floor.
 *
 * Read-only, and the credentials stay on the server: the browser asks this
 * route, the route asks the shared reader, and that owns the keys and the
 * cache everybody in the room shares. Asked of the lift first — the queue
 * names customers and what they wrote in about, and it hangs on a private
 * floor.
 *
 *   GET /api/zoho → the desk's tickets, in columns by status
 */

import { mayReadDesk, readDesk } from "@/lib/server/boards";
import { identityOf } from "@/lib/server/access";
import { answerWith, refuse } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!mayReadDesk(identityOf(request.headers.get("cookie") ?? undefined))) {
    return refuse("The desk is on a floor that is not yours.", 403);
  }
  return answerWith(await readDesk());
}
