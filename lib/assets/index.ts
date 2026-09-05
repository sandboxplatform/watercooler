/**
 * Asset URLs that change when the file does.
 *
 * Everything under public/characters, maps, tilesets, sprites and ui is
 * rewritten **in place** — `build:map` regenerates the maps,
 * `build-character.ts` overwrites a sheet, and the path stays the same while
 * the bytes change underneath it. That left one setting to pick between two
 * bad outcomes: cache the files and somebody walks around as yesterday's
 * sprite for an hour, or do not and every room change revalidates a hundred
 * files. It bit for real — a redrawn walk cycle went out and the browser went
 * on showing the old one, legs and all.
 *
 * A content hash in the query settles it. `/characters/Coop_48x48.png?v=1a2b3c4d`
 * is a different URL from the same path with different bytes, so a cache hit
 * is only ever a hit on the right file, and caching stops being a trade.
 *
 * Use it at the point a URL becomes a fetch — `this.load.image(...)`, an
 * `<img src>`, a CSS `url()` — rather than where a path is computed. The
 * functions that work out which map or sheet to use stay pure, and their
 * tests go on comparing plain paths.
 */

import manifest from "./manifest.json";

const HASHES = manifest as Record<string, string>;

/**
 * The given path with its content hash attached, or unchanged when there is
 * nothing to attach.
 *
 * Unknown paths pass through rather than throwing: uploaded characters are
 * served from /api/characters/<id>, which is a route and not a file, and an
 * asset added without regenerating the manifest should keep working — just
 * with the old caching. `assets.test.ts` is what stops that going unnoticed.
 */
export function asset(path: string): string {
  const [file, query] = path.split("?");
  const hash = HASHES[file];
  if (!hash) return path;
  return query ? `${file}?${query}&v=${hash}` : `${file}?v=${hash}`;
}

/** Whether a path is one this knows a hash for. For tests and diagnostics. */
export function isHashed(path: string): boolean {
  return Boolean(HASHES[path.split("?")[0]]);
}

/** How many files the manifest covers. */
export const ASSET_COUNT = Object.keys(HASHES).length;
