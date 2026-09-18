/**
 * Production server for WaterCooler (npx / standalone).
 *
 * Reads the Next.js config from the standalone build output and creates
 * an HTTP server with the Next.js request handler.
 *
 * **There is no access gate here.** ACCESS_CODE gates `server.ts`, which is
 * what `pnpm start` and the Docker image run; this file is the separate
 * entry point the published package uses, and it serves everything to
 * whoever can reach the port. It is meant for `npx` on your own machine —
 * localhost, one person — which is the same footing as `pnpm dev` without a
 * code. Do not put it on an address other people can reach.
 *
 * The gate is not duplicated here on purpose: it lives in TypeScript that
 * this file cannot import (the package ships no tsx), and a second
 * implementation of an access check is how the two drift apart — which is
 * precisely how this file came to be the ungated one. The fix, when it
 * matters, is to ship one server rather than two.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";
const prefix = "[Server]";
const log = {
  info: isProd ? () => {} : console.info.bind(console, prefix),
  error: console.error.bind(console, prefix),
};

// Load standalone config before importing next
const requiredServerFiles = JSON.parse(
  readFileSync(join(__dirname, ".next", "required-server-files.json"), "utf-8"),
);
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(requiredServerFiles.config);

const { default: next } = await import("next");

const port = parseInt(process.env.PORT ?? "3000", 10);

process.chdir(__dirname);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res);
    });

    server.listen(port, () => {
      log.info("");
      log.info("  \x1b[36m\x1b[1mWaterCooler\x1b[0m is running!");
      log.info("");
      log.info(`  > Local:   \x1b[4mhttp://localhost:${port}\x1b[0m`);
      log.info("");
      // Said with log.error so it is seen even in production, where info is
      // silenced: somebody putting this on a public address should not have
      // to read the source to learn that ACCESS_CODE does nothing here.
      log.error(
        "This server has no access code: everything is open to whoever can reach it. " +
          "It is meant for localhost. To run it where others can reach it, use the " +
          "gated server (`pnpm start` / the Docker image), which honours ACCESS_CODE.",
      );
    });
  })
  .catch((err) => {
    log.error("Failed to start WaterCooler:", err);
    process.exit(1);
  });
