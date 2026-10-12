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

/**
 * The copied paths the image makes for itself rather than takes from the
 * checkout: `node_modules`, which the `deps` stage installs, and `.next`, which
 * `pnpm build` writes in the build stage. Neither is checked in — git and
 * `.dockerignore` both leave them out — so a fresh clone has neither, and their
 * absence from the repo says nothing about whether the image will build.
 */
const MADE_BY_THE_IMAGE = new Set(["node_modules", ".next"]);

/**
 * Whether a `.dockerignore` keeps a repo-relative path out of the build
 * context, matched the way Docker matches it — which is not the way git does.
 * A pattern is anchored at the root (`*.log` is `a.log`, never `lib/a.log`),
 * `*` stops at a slash and `**` does not, a pattern that names a directory
 * takes everything under it, and the last pattern to match wins, so a `!` line
 * can bring back something an earlier line left out.
 */
function ignoredBy(dockerignore: string): (path: string) => boolean {
  const rules = dockerignore
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pattern = line
        .replace(/^!\s*/, "")
        .replace(/^\.?\/+/, "")
        .replace(/\/+$/, "");
      return {
        keep: line.startsWith("!"),
        depth: pattern.split("/").length,
        re: globToRegExp(pattern),
      };
    });
  return (path) => {
    const parts = path.split("/");
    let ignored = false;
    for (const rule of rules) {
      // Against the path itself, then against its ancestor at the pattern's own
      // depth: `art` has to reach `art/x.png` through `art`.
      if (rule.re.test(path) || rule.re.test(parts.slice(0, rule.depth).join("/"))) {
        ignored = !rule.keep;
      }
    }
    return ignored;
  };
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      // `**/` may stand for no directories at all, so `**/x` matches `x` too.
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[" && glob.includes("]", i)) {
      const end = glob.indexOf("]", i);
      re += glob.slice(i, end + 1);
      i = end;
    } else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
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

/**
 * The other direction: whatever the runtime stage names has to be there to
 * copy. A COPY whose source is gone does not leave a hole in the image — it
 * fails the build at that line, and Railway builds on every push to `main`, so
 * nothing ships at all while the last good deploy keeps running.
 *
 * That happened too. The audit (07370ab) deleted `types/` and left
 * `COPY --from=build /app/types ./types` behind, and every image built from it
 * failed until the line came out (fc2548b). This file passed throughout: the
 * check above asks whether what the server imports is copied, never whether
 * what is copied still exists.
 */
describe("what the Dockerfile copies", () => {
  it("names only paths the repo still has", () => {
    const missing = copiedPaths().filter(
      (p) => !MADE_BY_THE_IMAGE.has(p) && !existsSync(join(ROOT, p)),
    );

    expect(missing, `copied into the image but not in the repo: ${missing.join(", ")}`).toEqual([]);
  });

  /**
   * Being in the repo is not the same as reaching the build. The build stage's
   * `COPY . .` brings the build context, and the context is the repo less
   * whatever `.dockerignore` names — `art` and `docs` are left out on purpose.
   * A runtime COPY of either fails the image build just as the deleted
   * `types/` did, while the check above passes, because the repo has them.
   */
  it("names nothing .dockerignore keeps out of the build", () => {
    const ignored = ignoredBy(readFileSync(join(ROOT, ".dockerignore"), "utf8"));
    const kept = copiedPaths().filter((p) => !MADE_BY_THE_IMAGE.has(p) && ignored(p));

    expect(kept, `copied into the image but left out by .dockerignore: ${kept.join(", ")}`).toEqual(
      [],
    );
  });

  /** The matcher above is ours, not Docker's, so it is held to Docker's rules here. */
  it("reads .dockerignore the way Docker does", () => {
    const ignored = ignoredBy(
      ["# art-free", "art", "/docs/", "*.log", "**/*.tmp", "dist/**", "!dist/keep"].join("\n"),
    );
    const cases: Record<string, boolean> = {
      art: true,
      "art/x.png": true, // a directory takes what is under it
      "lib/art": false, // anchored at the root, unlike .gitignore
      docs: true, // leading and trailing slashes change nothing
      "a.log": true,
      "lib/a.log": false, // `*` stops at a slash
      "lib/deep/a.tmp": true, // `**` does not
      "a.tmp": true, // and may stand for no directories at all
      "dist/out.js": true,
      "dist/keep": false, // the last pattern to match wins
      "art-free": false, // a comment is not a pattern
    };

    const read = Object.fromEntries(Object.keys(cases).map((p) => [p, ignored(p)]));
    expect(read).toEqual(cases);
  });
});
