/**
 * Production server for WaterCooler (npx / standalone).
 *
 * Reads the Next.js config from the standalone build output and creates
 * an HTTP server with the Next.js request handler + agent bridge.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { attachAuggieBridge } from "./lib/auggie-bridge.mjs";

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
const { WebSocket, WebSocketServer } = await import("ws");

const port = parseInt(process.env.PORT ?? "3000", 10);
const AGENT_PROVIDER = process.env.AGENT_PROVIDER ?? "auggie";

process.chdir(__dirname);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res);
    });

    if (AGENT_PROVIDER === "auggie") {
      attachAuggieBridge(server, WebSocket, WebSocketServer);
    } else {
      log.error(
        `AGENT_PROVIDER=${AGENT_PROVIDER} is not wired into the published package yet — only "auggie" is. ` +
          "The office will still load, but task assignment has no agent to connect to.",
      );
    }

    server.listen(port, () => {
      log.info("");
      log.info("  \x1b[36m\x1b[1mWaterCooler\x1b[0m is running!");
      log.info("");
      log.info(`  > Local:   \x1b[4mhttp://localhost:${port}\x1b[0m`);
      if (AGENT_PROVIDER === "auggie") {
        log.info("  > Provider: Auggie (bridging via auggie CLI)");
      }
      log.info("");
    });
  })
  .catch((err) => {
    log.error("Failed to start WaterCooler:", err);
    process.exit(1);
  });
