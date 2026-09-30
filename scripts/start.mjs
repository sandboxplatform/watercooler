/**
 * Starts the production server, on any operating system.
 *
 *   pnpm start                  on a machine
 *   node scripts/start.mjs      in the image, where it is PID 1
 *
 * The script used to be `NODE_ENV=production tsx server.ts`, which is shell
 * syntax that cmd.exe does not have: on Windows `pnpm start` answered with
 * `'NODE_ENV' is not recognized` and stopped. CI and the Docker image are
 * Linux, so nothing went red — it just meant the one machine the app is
 * developed on could not run the build it ships, and a production-only
 * change had to be taken on trust. Two of them have been.
 *
 * A launcher rather than `cross-env` for the reason `await-deploy.mjs` is a
 * script rather than bash around jq: this is the file that starts the thing,
 * and it should not be able to fail because of what is or is not installed
 * around it. Node spawns Node — no shell, no `.cmd` shim, no PATH lookup.
 *
 * `NODE_ENV` has to be in the child's environment rather than assigned here,
 * because `server.ts` reads it at module scope to decide `dev`, and half of
 * Next and React read it while they are being imported.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// tsx's CLI is a plain .mjs file, so this runs it the way `node file.js`
// runs anything — the shim in .bin is what would need a shell.
const tsx = require.resolve("tsx/cli");

const child = spawn(process.execPath, [tsx, "server.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" },
});

/**
 * Pass a stop on to the server rather than dying under it.
 *
 * In the image this process is PID 1, so the host's SIGTERM arrives here and
 * nowhere else: left to Node's default it ended the launcher and the server
 * was killed with it, mid-write, instead of being asked to finish. Forwarded,
 * the server gets to shut down in its own time, and this waits for it below.
 */
const STOPS = ["SIGTERM", "SIGINT"];
const forward = (signal) => child.kill(signal);
for (const signal of STOPS) process.on(signal, forward);

// Carry the child's fate: a host watching this process for a crash loop, or
// a shell reading $?, should see what the server saw. A server killed by a
// signal is re-raised here, which needs the forwarding taken off first or
// the launcher would only forward it to a child that has already gone.
child.on("exit", (code, signal) => {
  for (const stop of STOPS) process.off(stop, forward);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(`could not start the server: ${err.message}`);
  process.exit(1);
});
