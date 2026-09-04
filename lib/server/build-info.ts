/**
 * Which build is running.
 *
 * There was no way to answer that from outside the box. `/api/health` said
 * `{ ok: true }` and nothing else, so "is the fix live?" could only be
 * answered from the host's dashboard — and a dashboard saying "deployed"
 * is not the same claim as "the process serving this request is that
 * commit". Three separate times this session a fix sat on `main` while the
 * running container was older, and nothing on the box could have told us.
 *
 * So the sha comes in from the environment and back out of the health
 * check. Two sources, in this order:
 *
 *   GIT_SHA                  set deliberately — the Dockerfile takes it as a
 *                            build argument, so `docker build --build-arg`
 *                            and `railway up` can both say what they built
 *   RAILWAY_GIT_COMMIT_SHA   Railway sets this itself, but only on a deploy
 *                            it triggered from the connected repository
 *
 * Neither is guaranteed: a build nobody told is a legitimate outcome, and
 * `source: "none"` says so rather than reporting a wrong answer. That
 * distinction is the point — "this build was not told which commit it is"
 * and "this endpoint does not report commits" look identical if the field
 * is simply absent, and they call for completely different fixes.
 */

import pkg from "../../package.json";

/** Where a sha was read from; "none" when nothing said. */
export type ShaSource = "GIT_SHA" | "RAILWAY_GIT_COMMIT_SHA" | "none";

export interface BuildInfo {
  /** From package.json, so it is always known. */
  version: string;
  /** The full commit, or null when the build was not told. */
  sha: string | null;
  /** The first seven characters, the way git prints one. */
  commit: string | null;
  /** Which variable the sha came from. */
  source: ShaSource;
  /** The branch, when the host says; Railway does. */
  branch: string | null;
}

/**
 * A commit, and not something else that happened to be in the variable.
 *
 * Hexadecimal and between a short sha and a full one. An empty string is
 * what an unset Docker build argument becomes, and a CI system putting
 * `$GIT_SHA` through unexpanded is the other thing that turns up here —
 * reporting either as the running commit is worse than reporting nothing,
 * because it looks like an answer.
 */
export function isSha(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value);
}

const SOURCES: readonly Exclude<ShaSource, "none">[] = ["GIT_SHA", "RAILWAY_GIT_COMMIT_SHA"];

/** Reads the build out of an environment. Pure, so it can be driven in tests. */
export function resolveBuild(env: Record<string, string | undefined>): BuildInfo {
  const source = SOURCES.find((name) => isSha(env[name]));
  const sha = source ? env[source]!.toLowerCase() : null;
  const branch = env.RAILWAY_GIT_BRANCH?.trim() || null;
  return {
    version: pkg.version,
    sha,
    commit: sha ? sha.slice(0, 7) : null,
    source: source ?? "none",
    branch,
  };
}

/**
 * When this process came up.
 *
 * Read at module load, which for a server is start-up. It answers the
 * question a sha cannot: whether a redeploy actually replaced the process,
 * or the same container is still running and the sha is stale because
 * nobody rebuilt.
 */
export const STARTED_AT = new Date().toISOString();

let cached: BuildInfo | null = null;

/** The running build. Worked out once — the environment does not change. */
export function buildInfo(): BuildInfo {
  return (cached ??= resolveBuild(process.env));
}

/** One line for the start-up log, so a deploy's own output says what deployed. */
export function describeBuild(info: BuildInfo = buildInfo()): string {
  if (!info.commit) {
    return `Build: v${info.version}, commit unknown (set GIT_SHA to report one)`;
  }
  return `Build: v${info.version} ${info.commit}${info.branch ? ` on ${info.branch}` : ""}`;
}
