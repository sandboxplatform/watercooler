import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { listCharacters } from "@/lib/characters/store";
import {
  LIBRARY_CHARACTERS,
  SHARED_CAST,
  looksFor,
  type RosterCharacter,
} from "@/lib/characters/library";
import { identityOf, personaFor } from "@/lib/server/access";

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
 * Two lists, because they answer two questions.
 *
 * `characters` is what a seat may be dressed in — the roster, or the shared
 * cast for a visitor, who has no business handing an agent somebody's face
 * either. `wearable` is what the person at the keyboard may put on
 * themselves, which for anyone whose own code names their sheet is that
 * sheet and nothing else.
 *
 * Filtered here rather than in the picker: hiding a choice in the UI is
 * decoration, and the roster is what the browser would otherwise read
 * straight out of. The presence socket clamps the claim as well, since this
 * is still only what the browser was told.
 */
export async function GET() {
  const identity = identityOf((await headers()).get("cookie") ?? undefined);
  const characters = identity === "visitor" ? SHARED_CAST : roster();
  return NextResponse.json({ characters, wearable: looksFor(personaFor(identity)) });
}
