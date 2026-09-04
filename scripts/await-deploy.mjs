/**
 * Waits for a deployment to actually answer as the commit that was pushed.
 *
 *   node scripts/await-deploy.mjs <healthUrl> <sha> [--attempts 60] [--every 10]
 *
 * `railway up` succeeding means Railway accepted and built the image. It does
 * not mean the container serving requests is that build. This is the step that
 * says so, and it is the whole reason /api/health reports a commit.
 *
 * Three outcomes, and the middle one matters:
 *
 *   live         the health check reports the short sha. Exit 0.
 *   unreported   it reports `source: "none"` — the deploy worked but nothing
 *                told the build which commit it is, so there is nothing to
 *                wait for. A configuration gap, not a broken deploy, so exit
 *                0 with a warning rather than failing a release over a field
 *                only a health check reads.
 *   timeout      it never reported it. Exit 1.
 *
 * Plain .mjs with no dependencies on purpose: the deploy job checks out the
 * repo and installs nothing, so this has to run on the bare Node that
 * setup-node provides. It began as ten lines of bash around `jq`, which is
 * worse in a way worth recording — `jq -r '.commit' 2>/dev/null || echo null`
 * reads a missing jq as "the commit is not live yet", so a runner image
 * without it would poll for ten minutes and then report a deploy failure that
 * had not happened.
 */

import { realpathSync } from "fs";
import { pathToFileURL } from "url";

/** The seven characters git prints, from a sha of any length. */
export const short = (sha) =>
  String(sha ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 7);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the commit answers, or the attempts run out.
 *
 * `read` returns the parsed health body, or null when the host could not be
 * reached or did not answer with JSON — which is ordinary during a container
 * swap and is simply another attempt.
 */
export async function awaitCommit({
  read,
  want,
  attempts = 60,
  every = 10_000,
  sleep = pause,
  log = console.log,
}) {
  const wanted = short(want);
  if (!wanted) throw new Error("no commit to wait for");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const body = await read();
    const commit = body?.commit ?? null;
    const source = body?.source ?? null;

    if (commit && short(commit) === wanted) return { ok: true, reason: "live", attempt };
    if (source === "none") return { ok: true, reason: "unreported", attempt };

    log(`attempt ${attempt}/${attempts}: commit=${commit ?? "-"} source=${source ?? "-"}`);
    if (attempt < attempts) await sleep(every);
  }
  return { ok: false, reason: "timeout", attempt: attempts };
}

/** GitHub's log annotations, which surface on the run's summary page. */
const annotate = (level, message) => console.log(`::${level}::${message}`);

async function main(argv) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    const value = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const [url, sha] = positional;
  if (!url || !sha) {
    console.error("usage: await-deploy.mjs <healthUrl> <sha> [--attempts n] [--every seconds]");
    process.exit(2);
  }

  const read = async () => {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      // A 503 from the health check still carries the build, and is worth
      // reading: it is how a deployment that came up broken identifies itself.
      return await response.json();
    } catch {
      return null;
    }
  };

  console.log(`Waiting for ${url} to report ${short(sha)}`);
  const result = await awaitCommit({
    read,
    want: sha,
    attempts: flag("attempts", 60),
    every: flag("every", 10) * 1000,
  });

  if (result.reason === "live") {
    annotate("notice", `${short(sha)} is live.`);
  } else if (result.reason === "unreported") {
    annotate(
      "warning",
      "Deployed, but the build reports no commit (source=none), so this could " +
        "not be verified. Check that GIT_SHA reached the service.",
    );
  } else {
    annotate(
      "error",
      `${url} never reported ${short(sha)}. The deploy may not have replaced ` +
        "the running container.",
    );
  }
  process.exit(result.ok ? 0 : 1);
}

// Only when run, not when imported by a test. Compared as resolved file URLs
// because argv[1] is a plain path — and on Windows a drive letter's case alone
// is enough to make a string comparison of the two disagree.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) await main(process.argv.slice(2));
