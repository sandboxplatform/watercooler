import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ASSET_COUNT, asset, isHashed } from "../index";
import {
  HASHED_DIRS,
  MANIFEST_PATH,
  buildManifest,
  serialise,
} from "../../../scripts/build-assets";

describe("asset", () => {
  it("attaches the content hash of a file it knows", () => {
    const url = asset("/characters/Coop_48x48.png");
    expect(url).toMatch(/^\/characters\/Coop_48x48\.png\?v=[0-9a-f]{8}$/);
  });

  it("gives a different URL to files with different contents", () => {
    expect(asset("/characters/Coop_48x48.png")).not.toBe(asset("/characters/Rob_48x48.png"));
  });

  /**
   * Uploaded characters come from /api/characters/<id>, which is a route
   * rather than a file, and a newly added asset should keep working while
   * somebody gets round to regenerating. Passing through is the safe failure:
   * the old caching, not a broken URL.
   */
  it("leaves a path it does not know alone", () => {
    expect(asset("/api/characters/kai-abc")).toBe("/api/characters/kai-abc");
    expect(asset("/characters/Nobody_48x48.png")).toBe("/characters/Nobody_48x48.png");
    expect(isHashed("/api/characters/kai-abc")).toBe(false);
  });

  it("keeps a query string that is already there", () => {
    expect(asset("/maps/lobby.json?debug=1")).toMatch(/\?debug=1&v=[0-9a-f]{8}$/);
  });

  it("is idempotent enough to survive being applied to its own output", () => {
    const once = asset("/characters/Coop_48x48.png");
    // The lookup strips the query, so the hash is found again and appended —
    // ugly, but it resolves to the same file rather than a 404.
    expect(asset(once).startsWith(once)).toBe(true);
  });

  it("covers every directory that is rewritten in place", () => {
    for (const dir of HASHED_DIRS) {
      expect(
        Object.keys(buildManifest()).some((p) => p.startsWith(`/${dir}/`)),
        dir,
      ).toBe(true);
    }
    expect(ASSET_COUNT).toBeGreaterThan(100);
  });
});

/**
 * The manifest is committed, and a stale one is precisely the bug this whole
 * thing exists to prevent: a URL that does not change when the file does. So
 * it cannot be left to a convention that somebody remembers to run the
 * script.
 *
 * If this fails, run `pnpm assets`.
 */
describe("the committed manifest", () => {
  it("matches the files on disk", () => {
    const onDisk = serialise(buildManifest());
    const committed = readFileSync(join(process.cwd(), MANIFEST_PATH), "utf8");
    if (onDisk !== committed) {
      const a = JSON.parse(onDisk) as Record<string, string>;
      const b = JSON.parse(committed) as Record<string, string>;
      const changed = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
      const added = Object.keys(a).filter((k) => !(k in b));
      const gone = Object.keys(b).filter((k) => !(k in a));
      throw new Error(
        `lib/assets/manifest.json is out of date — run \`pnpm assets\`.\n` +
          `  changed: ${changed.join(", ") || "none"}\n` +
          `  added:   ${added.join(", ") || "none"}\n` +
          `  removed: ${gone.join(", ") || "none"}`,
      );
    }
    expect(onDisk).toBe(committed);
  });
});
