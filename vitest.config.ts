import { defineConfig } from "vitest/config";
import path from "path";

// Git worktrees created by tooling live under .claude/ inside the project.
// Collecting their tests runs a second copy of the suite whose "@/" imports
// resolve against *this* source tree, producing phantom failures.
const NEVER = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.claude/**"];

/**
 * The two tests that cost more than the other 1,053 put together.
 *
 * Both earn their keep and neither is wasteful — they are simply expensive in
 * a way the rest are not, and paying for them on every unrelated edit is what
 * made the suite feel like something to avoid running.
 *
 *   presence-identity  ~6.5s. Drives real sockets against a real server,
 *                      because the bug it covers — meeting yourself at the
 *                      door for fifteen seconds — only ever reproduced behind
 *                      a proxy, never against a local server.
 *   pinball/stuck      ~4.8s. Drops the ball 1,620 times looking for a place
 *                      it can wedge. The point is the number of drops.
 *
 * Twelve tests, a third of the runtime. So they move to their own project:
 * `pnpm test` skips them, `pnpm test:all` includes them, and CI runs the
 * latter — the trade is that a local run no longer guards those two, which is
 * why the push gate and CI both use `test:all` rather than `test`.
 */
const SLOW = [
  "**/lib/server/__tests__/presence-identity.test.ts",
  "**/lib/pinball/__tests__/stuck.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    exclude: NEVER,
    /**
     * Threads rather than the default forks: same 1,065 tests, about a fifth
     * off the wall clock, because the cost here is starting workers and
     * transforming 85 files rather than anything the tests do. Measured at
     * ~26s against ~32s. Nothing in the suite needs process isolation — the
     * few that touch process.env set their own keys and clean up after
     * themselves.
     */
    pool: "threads",
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/__tests__/**", "lib/hooks/**"],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 40,
        lines: 40,
      },
    },
    // Between them these cover every test file exactly once — `projects.test.ts`
    // holds them to that, so a file cannot fall down the gap between the two
    // and quietly stop running anywhere.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          exclude: [...NEVER, ...SLOW],
        },
      },
      {
        extends: true,
        test: {
          name: "slow",
          environment: "node",
          include: SLOW,
          exclude: NEVER,
          // Real sockets and 1,620 ball drops; the default 5s is not enough.
          testTimeout: 30_000,
        },
      },
    ],
  },
});
