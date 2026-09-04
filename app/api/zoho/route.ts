/**
 * The Zoho Desk queue on the wall of Sandbox ERP's third floor.
 *
 * Read-only, and the only place the Zoho credentials are used: the browser
 * asks this route, this route asks Zoho. The refresh token never reaches
 * the page, and nothing about it is in the answer.
 *
 *   GET /api/zoho   → the desk's tickets, in columns by status
 */

import { NextResponse } from "next/server";
import {
  DESK_CACHE_MS,
  ZohoError,
  fetchDepartments,
  fetchTickets,
  readZohoConfig,
} from "@/lib/zoho/client";
import type { DeskView } from "@/lib/zoho/tickets";
import { createLogger } from "@/lib/logger";

const log = createLogger("ZohoAPI");

export const dynamic = "force-dynamic";

/**
 * Everyone on the floor sees the same queue, so it is fetched for the
 * first of them and held briefly for the rest. Zoho counts API credits,
 * and a room of people each polling would spend them on nothing.
 */
let held: { at: number; view: DeskView; departments: { id: string; name: string }[] } | null = null;

export async function GET() {
  const config = readZohoConfig();
  if (!config) {
    // Not an error: no desk is connected yet, and the wall says how.
    return NextResponse.json({ configured: false });
  }

  const now = Date.now();
  if (held && now - held.at < DESK_CACHE_MS) {
    return NextResponse.json({
      configured: true,
      desk: held.view,
      departments: held.departments,
      fetchedAt: held.at,
    });
  }

  try {
    const view = await fetchTickets(config);
    // Handy for setting ZOHO_DEPARTMENT_ID, and cheap beside the tickets.
    const departments = await fetchDepartments(config).catch(() => held?.departments ?? []);
    held = { at: now, view, departments };
    return NextResponse.json({ configured: true, desk: view, departments, fetchedAt: now });
  } catch (err) {
    if (err instanceof ZohoError) {
      return NextResponse.json({ configured: true, error: err.message }, { status: err.status });
    }
    log.error("could not read the desk:", (err as Error).message);
    return NextResponse.json(
      { configured: true, error: "The desk could not be read." },
      { status: 500 },
    );
  }
}
