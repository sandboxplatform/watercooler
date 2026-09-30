/**
 * Where generated characters live.
 *
 * Under .data/ rather than public/, for the same reason the databases are:
 * public/ is baked into the container image at build time, so anything written
 * there is lost on the next deploy. .data/ is the directory that survives.
 * The sheets are served back by a route handler instead of the static server.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { createLogger } from "../logger";
import { LIBRARY_PREFIX, librarySheetPath } from "./library";

const log = createLogger("Characters");

export const CHARACTER_DIR =
  process.env.CHARACTER_DIR ?? join(process.cwd(), ".data", "characters");

const MANIFEST = "index.json";

export interface StoredCharacter {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  /**
   * "photo": built by re-skinning the library sheet with colours read from a
   * picture. "sheet": a whole character sheet, uploaded in the game's format
   * and stored as it arrived. Neither is made any more — the generate and
   * ingest routes are gone — but characters made both ways are still on disk,
   * and the colours a photo was read into still sit in their JSON unread.
   */
  source: "photo" | "sheet";
  /**
   * For sheets: "exact" was stored as uploaded, already in the game's format.
   *
   * Only "exact" is produced now — a sheet is delivered on the grid or it is
   * refused. The other two are kept because characters uploaded before that
   * are still on disk under them: "loose" was a sheet found, read and re-laid
   * onto the grid, and "library" a whole library-style sheet of which only
   * the two animated rows were used.
   */
  layout?: "exact" | "loose" | "library";
}

/** Ids go in URLs and in filenames, so they are deliberately dull. */
export function isCharacterId(value: string): boolean {
  return /^[a-z0-9_-]{4,64}$/.test(value);
}

function ensureDir() {
  mkdirSync(CHARACTER_DIR, { recursive: true });
}

export function sheetPath(id: string): string {
  return join(CHARACTER_DIR, `${id}.png`);
}

/**
 * A sheet's content hash: the same eight hex characters of SHA-256 that
 * `pnpm assets` writes into the manifest, so a library portrait's `?v=` and
 * the file it was cut into name the same bytes.
 */
export const SHEET_VERSION_LENGTH = 8;
export function sheetVersion(sheet: Buffer): string {
  return createHash("sha256").update(sheet).digest("hex").slice(0, SHEET_VERSION_LENGTH);
}

/** Where the face cut from one version of a sheet is kept. */
export function portraitPath(id: string, version: string): string {
  return join(CHARACTER_DIR, `${id}.${version}.portrait.png`);
}

/**
 * The 48x96 face frame, cut from the sheet on first request and kept.
 *
 * Made lazily rather than at save time so sheets written before portraits
 * existed get one too, and so a failed cut never stops a character saving.
 *
 * Kept under the sheet's own hash. It was kept under the id alone, and a
 * library sheet is redrawn in place under the same id — so the face cut from
 * yesterday's sheet was served for ever, immutable, as today's. Reading the
 * sheet to hash it costs a file read per request, which the year-long cache
 * in front of this makes rare.
 */
export function readPortrait(id: string, cut: (sheet: Buffer) => Buffer): Buffer | null {
  if (!isCharacterId(id)) return null;
  const sheet = readSheet(id);
  if (!sheet) return null;
  const file = portraitPath(id, sheetVersion(sheet));
  try {
    return readFileSync(file);
  } catch {
    // fall through to cutting one
  }
  const portrait = cut(sheet);
  try {
    ensureDir();
    writeFileSync(file, portrait);
  } catch (err) {
    log.warn(`could not keep portrait for ${id}: ${(err as Error).message}`);
  }
  return portrait;
}

export function listCharacters(): StoredCharacter[] {
  try {
    const raw = readFileSync(join(CHARACTER_DIR, MANIFEST), "utf8");
    const parsed = JSON.parse(raw) as StoredCharacter[];
    if (!Array.isArray(parsed)) return [];
    // Characters written before sheets existed have no source; they were all
    // built from photos, and the HUD shows colour swatches only for those.
    return parsed.map((c) => ({ ...c, source: c.source ?? "photo" }));
  } catch {
    // No manifest yet is the normal state on a fresh install.
    return [];
  }
}

export function readSheet(id: string): Buffer | null {
  if (!isCharacterId(id)) return null;
  // A library id resolves to the shipped file; everything else to .data/.
  const shipped = librarySheetPath(id);
  const path = shipped ? join(process.cwd(), "public", shipped) : sheetPath(id);
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/**
 * Writes the sheet and records it.
 *
 * The manifest is written to a temporary file and renamed, so a crash midway
 * leaves the previous list intact rather than a half-written one that would
 * take every existing character down with it.
 */
export function saveCharacter(character: StoredCharacter, sheet: Buffer): StoredCharacter {
  ensureDir();
  writeFileSync(sheetPath(character.id), sheet);

  const next = [character, ...listCharacters().filter((c) => c.id !== character.id)];
  const tmp = join(CHARACTER_DIR, `${MANIFEST}.tmp`);
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, join(CHARACTER_DIR, MANIFEST));

  log.info(`saved character ${character.id} ("${character.name}")`);
  return character;
}

// ── How long a browser may keep one ─────────────────────

/** A year, for a response whose URL cannot outlive its bytes. */
export const IMMUTABLE = "public, max-age=31536000, immutable";
/** An hour, for one that can: the tier `next.config.ts` gives unversioned art. */
export const UNVERSIONED = "public, max-age=3600";

/**
 * How long a character's sheet or face may be kept.
 *
 * An uploaded character never changes — a new one is a new id — so it is
 * held for ever. A library one is a file in `public/` that is redrawn in
 * place under the same id, so it is only held for ever when the URL carries
 * its content hash (`?v=`, as the roster's portrait URLs do); asked for bare,
 * it gets the hour the rest of the unversioned art gets.
 */
export function characterCache(id: string, request: Request): string {
  if (!id.startsWith(LIBRARY_PREFIX)) return IMMUTABLE;
  return new URL(request.url).searchParams.has("v") ? IMMUTABLE : UNVERSIONED;
}
