/**
 * Writes lib/assets/manifest.json: a content hash for every file the game
 * fetches out of public/.
 *
 *   pnpm assets
 *
 * Runs as `prebuild`, so a production build always ships a current one.
 *
 * The problem it solves: these files are rewritten **in place**. `build:map`
 * regenerates public/maps/*.json, `build-character.ts` overwrites
 * public/characters/<Name>_48x48.png, and neither path changes when the
 * contents do. Cache them and a browser keeps yesterday's art; do not cache
 * them and a room change revalidates a hundred-odd files. With a hash in the
 * query the URL changes whenever the bytes do, so caching becomes correct
 * rather than a trade — which is the whole point.
 *
 * Committed rather than gitignored, and `assets.test.ts` fails when it is out
 * of date. A stale manifest is exactly the bug this exists to prevent — a URL
 * that does not change when the file does — so it has to be impossible to
 * leave one lying around, not merely discouraged.
 */

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, posix, relative, sep } from "path";

/**
 * The directories whose files are rewritten in place, and so need this.
 *
 * Not public/audio: that is already immutable for a year, and versioned by
 * changing which file is pointed at rather than by replacing bytes.
 */
export const HASHED_DIRS = ["characters", "maps", "tilesets", "sprites", "ui"] as const;

/** Eight hex characters: enough that a collision is not a thing to think about. */
const LENGTH = 8;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Path in public/ -> hash of its contents, for every file in HASHED_DIRS. */
export function buildManifest(root = process.cwd()): Record<string, string> {
  const manifest: Record<string, string> = {};
  for (const dir of HASHED_DIRS) {
    const base = join(root, "public", dir);
    for (const file of walk(base)) {
      // Forward slashes whatever the platform: this becomes a URL.
      const url = "/" + posix.join(dir, relative(base, file).split(sep).join("/"));
      manifest[url] = createHash("sha256")
        .update(readFileSync(file))
        .digest("hex")
        .slice(0, LENGTH);
    }
  }
  // Sorted, so the file only changes when the assets do rather than when the
  // filesystem feels like listing them differently.
  return Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
}

export const MANIFEST_PATH = join("lib", "assets", "manifest.json");

export function serialise(manifest: Record<string, string>): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}

if (process.argv[1]?.endsWith("build-assets.ts")) {
  const manifest = buildManifest();
  writeFileSync(join(process.cwd(), MANIFEST_PATH), serialise(manifest));
  console.log(`wrote ${MANIFEST_PATH}: ${Object.keys(manifest).length} files`);
}
