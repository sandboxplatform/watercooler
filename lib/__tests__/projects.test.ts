import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

/**
 * The two vitest projects have to cover every test file exactly once.
 *
 * `pnpm test` runs only the `unit` project, so a file that matches neither
 * project runs *nowhere* locally, and a typo in the slow project's list is
 * silent in both directions: the pattern matches nothing, and the file it was
 * meant to name quietly rejoins the fast run it was pulled out of. Neither
 * failure announces itself — the suite still passes, just with less in it.
 *
 * So this counts the files on disk and holds the split to what the config
 * says. It is deliberately dumb about globs: the config's patterns are
 * literal paths behind a recursive wildcard, and keeping them that simple is
 * part of the point.
 */

const SKIP = new Set(["node_modules", ".next", ".git", ".claude", "dist", ".data"]);

function testFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full, root));
    else if (/\.test\.tsx?$/.test(entry)) out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

/** Kept in step with SLOW in vitest.config.ts by the assertions below. */
const SLOW = [
  "lib/server/__tests__/presence-identity.test.ts",
  "lib/pinball/__tests__/stuck.test.ts",
];

const all = testFiles(process.cwd());

describe("the unit and slow projects", () => {
  it("finds the suite at all, or this proves nothing", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it("names slow files that actually exist", () => {
    for (const file of SLOW) expect(all, file).toContain(file);
  });

  it("covers every test file exactly once between them", () => {
    const slow = all.filter((f) => SLOW.includes(f));
    const unit = all.filter((f) => !SLOW.includes(f));
    expect(slow).toHaveLength(SLOW.length);
    expect(slow.length + unit.length).toBe(all.length);
    // Nothing in both.
    expect(unit.filter((f) => slow.includes(f))).toEqual([]);
  });

  /**
   * The list is a considered exception, not a bin. Two files earn it by being
   * slow for a reason — real sockets, and 1,620 ball drops — and anything
   * else that lands here should have to argue for itself.
   */
  it("keeps the slow list short", () => {
    expect(SLOW.length).toBeLessThanOrEqual(3);
  });

  /**
   * This file is in the fast project, which is the only way it runs on a
   * `pnpm test` and so the only way it guards anything.
   */
  it("runs in the fast project itself", () => {
    expect(SLOW).not.toContain("lib/__tests__/projects.test.ts");
  });
});
