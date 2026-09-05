import { describe, it, expect } from "vitest";
import config from "../../next.config";

/**
 * What the browser is allowed to keep.
 *
 * Everything in `public/` is served with `max-age=0` by default, so a room
 * change — which is a page load — revalidated around fifty assets and
 * re-fetched three and a half megabytes of music. Caching them is the fix,
 * and the danger of caching is stale art: build:map and build-character.ts
 * rewrite files in place.
 *
 * The art now carries a content hash in `?v=` (lib/assets), so a request
 * that has one names its own bytes and may be kept for ever, while a bare
 * path may not. These assertions are about keeping those two apart. Marking
 * the bare path immutable is the tempting mistake, and it would strand
 * anything that slipped past `asset()` on old art for a year rather than an
 * hour.
 */

async function rules() {
  const headers = await config.headers?.();
  return headers ?? [];
}

type Rule = Awaited<ReturnType<typeof rules>>[number];

const rulesFor = async (path: string) => (await rules()).filter((r) => r.source.includes(path));
const ruleFor = async (path: string) => (await rulesFor(path))[0];
const cacheControl = (rule: Rule | undefined) =>
  rule?.headers.find((h) => h.key === "Cache-Control")?.value ?? null;
const cacheControlOf = async (path: string) => cacheControl(await ruleFor(path));

describe("what the browser may keep", () => {
  it("lets the music be kept for a year, since it never changes in place", async () => {
    const value = await cacheControlOf("/audio/");
    expect(value).toContain("immutable");
    expect(value).toContain("max-age=31536000");
  });

  /**
   * Art asked for by content may be kept for ever: `?v=` is a hash of the
   * bytes, so the URL changes whenever the file does.
   */
  it("keeps hashed art for a year", async () => {
    const [versioned] = await rulesFor("characters|maps");
    expect(versioned.has).toEqual([{ type: "query", key: "v" }]);
    expect(cacheControl(versioned)).toBe("public, max-age=31536000, immutable");
  });

  /**
   * And the same file asked for without one may not. The art is rewritten in
   * place, so a bare path has to expire on its own; an hour covers walking
   * from room to room, which is what the caching is for.
   */
  it("keeps art asked for without a hash to an hour, never immutable", async () => {
    const [, bare] = await rulesFor("characters|maps");
    expect(bare.missing).toEqual([{ type: "query", key: "v" }]);
    expect(cacheControl(bare)).toBe("public, max-age=3600");
    expect(cacheControl(bare)).not.toContain("immutable");
  });

  /**
   * The two have to exclude each other rather than merely be ordered. Next
   * applies *every* matching rule and lets the last one win, so with only a
   * `has` on the first, a versioned request matched both and came back with
   * the hour — which is how this was found.
   */
  it("cannot match both tiers with one request", async () => {
    const [versioned, bare] = await rulesFor("characters|maps");
    expect(versioned.source).toBe(bare.source);
    expect(versioned.has).toBeDefined();
    expect(bare.missing).toBeDefined();
    expect(versioned.has?.[0].key).toBe(bare.missing?.[0].key);
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
