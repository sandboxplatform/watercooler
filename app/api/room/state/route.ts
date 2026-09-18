/**
 * Room state — the world as the server sees it.
 *
 * GET returns a snapshot for the client to render; PUT writes back the slices
 * that changed. Slices are whole collections for now because the client still
 * owns their ordering and trimming; per-entity events arrive with the
 * shared-world phase.
 */

import { NextResponse } from "next/server";
import { DEFAULT_ROOM, getRoomStore } from "@/lib/server/room-store";
import { createLogger } from "@/lib/logger";

const log = createLogger("RoomAPI");

export const dynamic = "force-dynamic";

function roomFrom(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("room") || DEFAULT_ROOM;
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(getRoomStore().getSnapshot(roomFrom(request)));
  } catch (err) {
    log.error("snapshot failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to read room state" }, { status: 500 });
  }
}

interface StatePatch {
  seats?: Record<string, unknown>[];
}

export async function PUT(request: Request) {
  const room = roomFrom(request);

  let patch: StatePatch;
  try {
    patch = (await request.json()) as StatePatch;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const store = getRoomStore();
    if (Array.isArray(patch.seats)) store.replaceSeats(room, patch.seats);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("write failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to write room state" }, { status: 500 });
  }
}
