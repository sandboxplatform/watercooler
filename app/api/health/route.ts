/**
 * Liveness check for the host's health probe, and which build answered it.
 *
 * Deliberately shallow: it reports that the process is up and can reach its
 * database, and nothing about agents. A failing API key or an exhausted budget
 * are not reasons to restart the server — recycling the container would drop
 * everyone out of their room without fixing either.
 *
 * The build is here because this is the one route the access gate leaves open
 * (see lib/server/access.ts), which makes it the only way to ask a running
 * deployment what it is from outside. `commit` against `git log --oneline` is
 * the whole point: it turns "the fix is on main" into a checkable claim about
 * the process serving the request, rather than one about a dashboard.
 *
 * That is a deliberate disclosure of the running version to anyone who can
 * reach the port. It costs nothing here — the app is published to npm, so
 * every commit is public already, and a sha only says which public commit is
 * running.
 *
 * It is reported on the failure path too. A 503 is exactly when knowing which
 * build is broken matters most.
 */

import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/server/room-store";
import { STARTED_AT, buildInfo } from "@/lib/server/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const { version, commit, sha, branch, source } = buildInfo();
  const build = { version, commit, sha, branch, source, startedAt: STARTED_AT };
  try {
    getRoomStore().getSpend("health-probe");
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...build });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, at: new Date().toISOString(), ...build },
      { status: 503 },
    );
  }
}
