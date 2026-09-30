import { characterCache, isCharacterId, readSheet } from "@/lib/characters/store";
import { refuse } from "@/lib/server/route";

/**
 * Serves a character's sprite sheet.
 *
 * Uploaded ones live under .data/ rather than public/, so they need a
 * handler — the static server never sees them.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isCharacterId(id)) return refuse("Unknown character", 400);

  const sheet = readSheet(id);
  if (!sheet) return refuse("Unknown character", 404);

  return new Response(new Uint8Array(sheet), {
    headers: { "Content-Type": "image/png", "Cache-Control": characterCache(id, request) },
  });
}
