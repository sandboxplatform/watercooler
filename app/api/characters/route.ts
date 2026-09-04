import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { listCharacters } from "@/lib/characters/store";
import { LIBRARY_CHARACTERS, SHARED_CAST, type RosterCharacter } from "@/lib/characters/library";
import { identityOf } from "@/lib/server/access";

/** Every character available to pick: the library, then everything made here. */
export function roster(): RosterCharacter[] {
  const made: RosterCharacter[] = listCharacters().map((c) => ({
    id: c.id,
    key: `generated:${c.id}`,
    name: c.name,
    sheetUrl: `/api/characters/${c.id}`,
    portraitUrl: `/api/characters/${c.id}/portrait`,
    source: c.source,
    layout: c.layout,
    notes: c.notes,
  }));
  return [...LIBRARY_CHARACTERS, ...made];
}

/**
 * A visitor is offered the shared cast only. Filtered here rather than in the
 * picker: hiding a choice in the UI is decoration, and the roster is what the
 * browser would otherwise read straight out of.
 */
export async function GET() {
  const identity = identityOf((await headers()).get("cookie") ?? undefined);
  const characters = identity === "visitor" ? SHARED_CAST : roster();
  return NextResponse.json({ characters });
}
