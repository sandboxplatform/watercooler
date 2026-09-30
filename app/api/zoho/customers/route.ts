/**
 * How many tickets each customer has open, for the mailboxes on the world map.
 *
 * Read-only, and the credentials stay on the server exactly as they do for
 * the queue and the counts: the browser asks this route, the route asks the
 * shared reader, and that owns the keys and the cache it shares with
 * everybody else standing on the map.
 *
 * **What comes back is numbers by building and nothing else.** Which Zoho
 * account a customer is, and which domains their people write in from, are
 * how a ticket is attributed — and both stay in `lib/server/customers.ts`,
 * for the reason the id of Doc's Mettara conversation does. That is also
 * why this is the one read of the desk nobody is asked the lift about: the
 * boxes stand on the public map, and a count is all a box says.
 *
 *   GET /api/zoho/customers → the open count outside each building
 */

import { readCustomers } from "@/lib/server/boards";
import { answerWith } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return answerWith(await readCustomers());
}
