/**
 * The Zoho Desk queue on the wall of Sandbox ERP's third floor.
 *
 * Read-only, and the credentials stay on the server: the browser asks this
 * route, the route asks the shared reader, and that owns the keys and the
 * cache it shares with the agents' tools.
 *
 *   GET /api/zoho → the desk's tickets, in columns by status
 */

import { NextResponse } from "next/server";
import { readDesk } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET() {
  const { status, ...answer } = await readDesk();
  return NextResponse.json(answer, status ? { status } : undefined);
}
