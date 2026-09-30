import { characterCache, isCharacterId, readPortrait } from "@/lib/characters/store";
import { decodePng, encodePng } from "@/lib/pixel/png";
import { sliceFrame, PORTRAIT_COLUMN, PORTRAIT_ROW } from "@/lib/pixel/compose";
import { refuse } from "@/lib/server/route";

/**
 * A character's face, as a 48x96 PNG.
 *
 * Exists so a gallery of characters costs a few kilobytes per card rather
 * than a full sheet each — the sheet is 21 megapixels once decoded, and a
 * browser showing five of them as CSS backgrounds decodes all five.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isCharacterId(id)) return refuse("Unknown character", 400);

  const portrait = readPortrait(id, (sheet) =>
    encodePng(sliceFrame(decodePng(sheet), PORTRAIT_COLUMN, PORTRAIT_ROW)),
  );
  if (!portrait) return refuse("Unknown character", 404);

  return new Response(new Uint8Array(portrait), {
    headers: { "Content-Type": "image/png", "Cache-Control": characterCache(id, request) },
  });
}
