import { describe, expect, it, vi } from "vitest";
// Plain .mjs, deliberately dependency-free: the deploy job checks out the repo
// and installs nothing, so it runs on the bare Node setup-node provides.
import { awaitCommit, short } from "../await-deploy.mjs";

/**
 * This decides whether a release is reported as failed, so the branches are
 * worth holding down. In particular the difference between "the commit is not
 * up yet" (keep waiting) and "nothing told this build its commit" (there is
 * nothing to wait for) — collapse those two and every deploy either fails
 * spuriously or passes without ever checking anything.
 */

const SHA = "b87aafaf78cbc3e182f59f9aeb4be2d720bd64ac";
const live = { ok: true, commit: "b87aafa", source: "GIT_SHA" };
const older = { ok: true, commit: "5d42c4a", source: "GIT_SHA" };

/** Answers each call with the next thing in the list, repeating the last. */
const answers = (...bodies: unknown[]) => {
  let i = 0;
  return vi.fn(async () => bodies[Math.min(i++, bodies.length - 1)]);
};

const run = (read: () => Promise<unknown>, attempts = 5) =>
  awaitCommit({ read, want: SHA, attempts, every: 0, sleep: async () => {}, log: () => {} });

describe("short", () => {
  it("is the seven characters git prints, from any length", () => {
    expect(short(SHA)).toBe("b87aafa");
    expect(short("B87AAFA")).toBe("b87aafa");
    expect(short(" b87aafaf78 ")).toBe("b87aafa");
    expect(short(undefined)).toBe("");
  });
});

describe("awaitCommit", () => {
  it("passes as soon as the commit answers", async () => {
    const read = answers(live);
    await expect(run(read)).resolves.toMatchObject({ ok: true, reason: "live", attempt: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  /** The container swap: unreachable, then the old build, then the new one. */
  it("waits through an unreachable host and the previous build", async () => {
    const read = answers(null, older, older, live);
    await expect(run(read)).resolves.toMatchObject({ ok: true, reason: "live", attempt: 4 });
  });

  it("matches a full sha against the short one the health check reports", async () => {
    await expect(run(answers({ commit: SHA, source: "GIT_SHA" }))).resolves.toMatchObject({
      reason: "live",
    });
  });

  /**
   * The deploy worked; nobody told the build its commit. Failing a release
   * over a field only a health check reads would be worse than saying so.
   */
  it("passes with a warning when the build reports no commit at all", async () => {
    await expect(run(answers({ ok: true, commit: null, source: "none" }))).resolves.toMatchObject({
      ok: true,
      reason: "unreported",
    });
  });

  it("fails when the commit never answers", async () => {
    const read = answers(older);
    await expect(run(read, 3)).resolves.toMatchObject({ ok: false, reason: "timeout" });
    expect(read).toHaveBeenCalledTimes(3);
  });

  /**
   * A build that predates the health check reporting one has neither field, so
   * there is no `source: "none"` to short-circuit on — it has to keep waiting
   * for the new container rather than passing on a missing field.
   */
  it("keeps waiting for a build too old to report anything", async () => {
    const read = answers({ ok: true, at: "2026-09-04T00:00:00.000Z" }, live);
    await expect(run(read)).resolves.toMatchObject({ reason: "live", attempt: 2 });
  });

  /** A 503 still carries the build, which is how a broken deploy identifies itself. */
  it("reads the build out of a failing health check", async () => {
    await expect(
      run(answers({ ok: false, error: "no database", commit: "b87aafa", source: "GIT_SHA" })),
    ).resolves.toMatchObject({ reason: "live" });
  });

  it("refuses to wait for nothing", async () => {
    await expect(
      awaitCommit({ read: async () => null, want: "", sleep: async () => {}, log: () => {} }),
    ).rejects.toThrow(/no commit/i);
  });

  /** No sleep after the last attempt: it would add ten dead seconds to a failure. */
  it("does not wait after giving up", async () => {
    const sleep = vi.fn(async () => {});
    await awaitCommit({
      read: async () => older,
      want: SHA,
      attempts: 3,
      every: 1000,
      sleep,
      log: () => {},
    });
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
