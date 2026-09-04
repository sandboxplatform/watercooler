import { describe, expect, it } from "vitest";
import { describeBuild, isSha, resolveBuild } from "../build-info";

/**
 * The point of this is answering "is the fix live?" from outside the box, so
 * what matters is that it never reports a commit it is not running — a wrong
 * sha is worse than no sha, because it looks like an answer.
 */

const SHA = "5d42c4a1b2c3d4e5f60718293a4b5c6d7e8f9012";

describe("isSha", () => {
  it("takes a full sha and a short one", () => {
    expect(isSha(SHA)).toBe(true);
    expect(isSha("5d42c4a")).toBe(true);
  });

  it("refuses what an unset build argument leaves behind", () => {
    // ARG GIT_SHA="" with nothing passed in.
    expect(isSha("")).toBe(false);
    expect(isSha(undefined)).toBe(false);
    expect(isSha("   ")).toBe(false);
  });

  it("refuses a variable that was never expanded", () => {
    expect(isSha("$GIT_SHA")).toBe(false);
    expect(isSha("${{ github.sha }}")).toBe(false);
  });

  it("refuses anything that is not a commit-shaped hex string", () => {
    expect(isSha("main")).toBe(false);
    expect(isSha("5d42c4")).toBe(false); // a character short
    expect(isSha(SHA + "0")).toBe(false); // one too long
    expect(isSha("zzzzzzz")).toBe(false);
  });
});

describe("resolveBuild", () => {
  it("prefers the sha it was told deliberately", () => {
    const build = resolveBuild({ GIT_SHA: SHA, RAILWAY_GIT_COMMIT_SHA: "a".repeat(40) });
    expect(build.source).toBe("GIT_SHA");
    expect(build.sha).toBe(SHA);
    expect(build.commit).toBe("5d42c4a");
  });

  /** What a deploy triggered from the connected repository looks like. */
  it("falls back to the host's own, with the branch", () => {
    const build = resolveBuild({ RAILWAY_GIT_COMMIT_SHA: SHA, RAILWAY_GIT_BRANCH: "main" });
    expect(build.source).toBe("RAILWAY_GIT_COMMIT_SHA");
    expect(build.commit).toBe("5d42c4a");
    expect(build.branch).toBe("main");
  });

  it("skips a source holding something that is not a sha", () => {
    const build = resolveBuild({ GIT_SHA: "", RAILWAY_GIT_COMMIT_SHA: SHA });
    expect(build.source).toBe("RAILWAY_GIT_COMMIT_SHA");
  });

  /**
   * The distinction the `source` field exists for: a build nobody told is a
   * legitimate outcome, and it has to be told apart from an endpoint that
   * does not report commits at all — they look identical if the field is
   * simply missing, and they need completely different fixing.
   */
  it("says so plainly when nothing told it", () => {
    const build = resolveBuild({});
    expect(build).toMatchObject({ sha: null, commit: null, source: "none", branch: null });
    // And still knows the version, which does not depend on the deploy.
    expect(build.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reports a sha in one case, so it compares against git by eye", () => {
    expect(resolveBuild({ GIT_SHA: SHA.toUpperCase() }).commit).toBe("5d42c4a");
  });
});

describe("describeBuild", () => {
  it("is one line naming the commit and branch", () => {
    const line = describeBuild(resolveBuild({ GIT_SHA: SHA, RAILWAY_GIT_BRANCH: "main" }));
    expect(line).toContain("5d42c4a");
    expect(line).toContain("on main");
  });

  /** Says what to do about it, rather than printing a blank. */
  it("names the variable to set when there is no commit", () => {
    expect(describeBuild(resolveBuild({}))).toContain("GIT_SHA");
  });
});
