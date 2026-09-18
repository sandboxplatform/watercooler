#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pkgPath = resolve(root, "package.json");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  \x1b[36m\x1b[1mWaterCooler\x1b[0m  A pixel office you walk around with other people

  Usage
    $ watercooler [options]

  Options
    --port <number>  Port to listen on   (default: 3000)
    -v, --version    Show version
    -h, --help       Show this help message

  Examples
    $ watercooler
    $ watercooler --port 8080
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  console.log(pkg.version);
  process.exit(0);
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const port = getArg("--port");

if (port) process.env.PORT = port;
process.env.NODE_ENV = "production";

const serverPath = resolve(root, ".next", "standalone", "server.prod.mjs");
await import(serverPath);
