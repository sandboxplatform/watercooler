import { describe, it, expect } from "vitest";
import config from "../../next.config";

/**
 * What the browser is allowed to keep.
 *
 * Everything in `public/` is served with `max-age=0` by default, so a room
 * change — which is a page load — revalidated around fifty assets and
 * re-fetched three and a half megabytes of music. Caching them is the fix,
 * and the danger of caching is stale art: none of these paths carries a
 * content hash, so a regenerated sheet keeps its URL.
 *
 * These assertions are about that balance rather than about the numbers. The
 * tempting mistake is to make everything immutable, which would strand
 * people on old art until they cleared their cache.
 */

async function rules() {
  const headers = await config.headers?.();
  return headers ?? [];
}

const ruleFor = async (path: string) => (await rules()).find((rule) => rule.source.includes(path));

const cacheControlOf = async (path: string) => {
  const rule = await ruleFor(path);
  return rule?.headers.find((h) => h.key === "Cache-Control")?.value ?? null;
};

describe("what the browser may keep", () => {
  it("lets the music be kept for a year, since it never changes in place", async () => {
    const value = await cacheControlOf("/audio/");
    expect(value).toContain("immutable");
    expect(value).toContain("max-age=31536000");
  });

  /**
   * The art is rewritten in place by `pnpm build:map` and
   * `build-character.ts`, so it has to expire on its own. An hour covers
   * walking from room to room, which is what this is for.
   */
  it("keeps the art for an hour, and never marks it immutable", async () => {
    const value = await cacheControlOf("characters|maps");
    expect(value).toBe("public, max-age=3600");
    expect(value).not.toContain("immutable");
  });

  it("covers every directory a room loads from", async () => {
    const rule = await ruleFor("characters|maps");
    for (const dir of ["characters", "maps", "tilesets", "sprites", "ui"]) {
      expect(rule?.source, dir).toContain(dir);
    }
  });

  /**
   * The cache rules are extra entries, not replacements. Losing the security
   * headers on the art paths would be a poor trade for a faster load.
   */
  it("leaves the security headers applying to everything", async () => {
    const all = (await rules()).find((rule) => rule.source === "/(.*)");
    const keys = all?.headers.map((h) => h.key) ?? [];
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-Content-Type-Options");
  });
});
