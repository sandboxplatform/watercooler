import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Everything the server imports must be in the image that runs it.
 *
 * The Dockerfile's runtime stage copies a named few directories, not the whole
 * tree — `components/` is absent, because Phaser is no business of the server's.
 * So an import that wanders from `lib/` into `components/` costs nothing here
 * and nothing in dev: it crashes the container on startup with a module it
 * cannot find, which the host reports as a bare 502.
 *
 * That happened. The presence socket grew a check against the shared cast, the
 * cast came from `lib/characters/library.ts`, and that file read the sprite
 * table out of `components/game/config/animations.ts`. Four hops from
 * `server.ts` to a file the image does not carry.
 */

const ROOT = resolve(__dirname, "../../..");

/** The paths the Dockerfile's runtime stage copies, read from the Dockerfile. */
function copiedPaths(): string[] {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
  const runtime = dockerfile.slice(dockerfile.indexOf("AS runtime"));
  const paths: string[] = [];
  for (const m of runtime.matchAll(/^COPY\s+--from=\S+\s+\S+\s+\.\/(\S+)\s*$/gm)) {
    paths.push(m[1].replace(/\/$/, ""));
  }
  // `COPY --from=build /app/server.ts ./server.ts` and friends land as files.
  return paths;
}

function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package: it comes from node_modules, which is copied
  for (const ext of ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Every file `server.ts` pulls in, by repo-relative path. */
function serverImports(): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    const rel = file
      .split("\\")
      .join("/")
      .replace(`${ROOT.split("\\").join("/")}/`, "");
    if (seen.has(rel)) return;
    seen.add(rel);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return;
    }
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const next = resolveSpec(m[1], file);
      if (next) walk(next);
    }
  };
  walk(join(ROOT, "server.ts"));
  return [...seen];
}

describe("what the server needs at runtime", () => {
  it("only imports files the Dockerfile copies into the image", () => {
    const copied = copiedPaths();
    expect(copied.length, "no COPY lines parsed out of the Dockerfile").toBeGreaterThan(3);

    const stowaways = serverImports().filter(
      (file) => !copied.some((p) => file === p || file.startsWith(`${p}/`)),
    );

    expect(stowaways, `not in the runtime image: ${stowaways.join(", ")}`).toEqual([]);
  });

  /** The specific hop that broke it, kept as its own line so the cause is named. */
  it("keeps the server out of components/, where Phaser lives", () => {
    expect(serverImports().filter((f) => f.startsWith("components/"))).toEqual([]);
  });
});
