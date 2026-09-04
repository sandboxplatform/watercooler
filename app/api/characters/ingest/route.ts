import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { decodePng } from "@/lib/pixel/png";
import { ANIMATED_FRAMES, describeSheetFaults, emptySlots, sheetFaults } from "@/lib/pixel/exact";
import {
  makeCharacterId,
  nameFromFile,
  saveCharacter,
  type StoredCharacter,
} from "@/lib/characters/store";

const log = createLogger("Characters");

/** A drawn sheet is bigger than a photo; a 2688-wide sheet runs to a few MB. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Takes a character sheet in the game's format and nothing else.
 *
 * The uploaded bytes are stored as they arrived — no model, no re-layout, no
 * re-encoding, no API key needed, and nothing done to the pixels. The only
 * work here is checking the sheet and reporting what is missing from it.
 *
 * A sheet that is not in the format is refused with the same words the
 * install script uses (see lib/pixel/exact.ts). This route used to fall back
 * to interpreting one: find the figures, ask a model which way each faces,
 * cut them out, scale them to a common height and lay them on the grid. It
 * worked, in the sense that something always came out — and what came out was
 * the sum of half a dozen guesses, none of which the artist had asked for.
 * Refusing is the feature.
 *
 * Only PNG is accepted, on purpose. The browser converts whatever was chosen
 * to PNG before uploading, which means any format the browser can open works
 * without this server needing a decoder for each of them.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("sheet");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a sprite sheet to upload" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That sheet is over 12MB" }, { status: 413 });
  }

  // Kept whole: this buffer is what gets stored, so the character is served
  // the file that was uploaded rather than a re-encoding of it.
  const bytes = Buffer.from(await file.arrayBuffer());

  let image;
  try {
    image = decodePng(bytes);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read that image: ${(err as Error).message}` },
      { status: 415 },
    );
  }

  const faults = sheetFaults(image);
  if (faults.length) {
    log.warn(
      `sheet refused [${image.width}x${image.height}, colour type ${image.colourType}]: ` +
        faults.map((f) => f.kind).join(", "),
    );
    return NextResponse.json(
      {
        error: describeSheetFaults(faults, file.name || "That sheet"),
        faults,
        width: image.width,
        height: image.height,
      },
      { status: 422 },
    );
  }

  const missing = emptySlots(image);
  const name = nameFromFile(form.get("name")) || "New hire";
  const character: StoredCharacter = {
    id: makeCharacterId(name, Date.now()),
    name,
    notes: [
      "Uploaded sheet in the game's format.",
      missing.length ? `${missing.length} of ${ANIMATED_FRAMES} animated frames are empty.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    createdAt: new Date().toISOString(),
    source: "sheet",
    layout: "exact",
  };
  saveCharacter(character, bytes);

  return NextResponse.json({ character, mode: "exact", emptySlots: missing });
}
