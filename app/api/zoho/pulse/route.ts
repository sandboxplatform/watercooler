/**
 * The five counts on the wall of Sandbox ERP's Support room.
 *
 * Read-only, and the credentials stay on the server, exactly as the queue
 * beside it does: the browser asks this route, the route asks the shared
 * reader, and that owns the keys and the cache it shares with everyone
 * else in the room.
 *
 *   GET /api/zoho/pulse → the five counts, and what they were measured from
 */

import { NextResponse } from "next/server";
import { readPulse } from "@/lib/server/boards";

export const dynamic = "force-dynamic";

export async function GET() {
  const { status, ...answer } = await readPulse();
  return NextResponse.json(answer, status ? { status } : undefined);
}
