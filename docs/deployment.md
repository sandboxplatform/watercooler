# Deployment

The image, the npm package, the health endpoint and verifying a deploy. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Deployment

Dockerfile, Railway (`railway.json`). `prepublishOnly` runs
`scripts/prepare-package.mjs`, which builds _and_ lays the tree out; the
published package ships only `bin/` and `.next/standalone/`.

**`output: "standalone"` is asked for only by a publish** —
`BUILD_STANDALONE=1`, which that script sets. Nothing else wants the tree:
`pnpm start` and the image both run `server.ts` against a plain `.next`,
because the custom server is what holds the socket upgrades and the gate.
Asking for it always meant every build wrote a second copy of the app nobody
ran, and every production boot logged Next advising `node
.next/standalone/server.js` — which would start Next's own server in place of
ours, with no presence socket and no door on the world.

**The image's runtime stage copies a named list of files, not the repo.** A
new file the server needs at runtime has to be named there or the container
comes up with nothing to run. `scripts/start.mjs` was added and the image
went out without it once.

`pnpm start` is a launcher (`scripts/start.mjs`) rather than
`NODE_ENV=production tsx server.ts`, which is shell syntax Windows does not
have: `pnpm start` failed there while CI and the image, both Linux, stayed
green. It means the machine this is developed on can run the build it ships,
which is how a production-only change gets checked rather than trusted.

**The image runs `node scripts/start.mjs` as PID 1**, on `node:22-slim` —
the Node that `.nvmrc`, CI and development all run; it was 24, which is a
production nobody tested. Not `pnpm start`: pnpm as PID 1 is one more process
between the host's stop and the server. The launcher passes SIGTERM and
SIGINT on to the server and exits with its code, and `server.ts` closes down
on either — stops accepting, drops the upgraded sockets, closes Next and the
room store — with a ten-second fallback. It takes a second signal calmly,
since Ctrl+C in a terminal arrives twice (the terminal's and the launcher's).
An uncaught exception is logged and stops the server with code 1; an
unhandled rejection is logged and it stays up.

Deferred, because nothing here can build the image to check them and Railway
deploys whatever is on `main`: bundling the server with esbuild instead of
transpiling it with tsx on every boot, a production-only install (it would
need `next`, `react` and `tsx` moved to `dependencies`, which changes what
the npm package declares), and BuildKit cache mounts (Railway wants their ids
prefixed with the service id). CI caches `.next/cache` as well as the pnpm
store. The package ships a `LICENSE` now; it had none.

**Which build is live** comes back from `/api/health`, the one route the gate
leaves open:

```json
{
  "ok": true,
  "version": "0.4.1",
  "commit": "5d42c4a",
  "branch": "main",
  "source": "GIT_SHA",
  "startedAt": "..."
}
```

`commit` compares against `git log --oneline` by eye, and `startedAt` answers the
other half — whether a redeploy actually replaced the process, or the same
container is still up. The same line is printed at start-up, so a deploy's own
log says what it brought up.

The sha comes from `GIT_SHA` if it is set, else `RAILWAY_GIT_COMMIT_SHA`. The
second is the one that normally answers: Railway sets it on any deploy it
triggered from the connected repository, which is every deploy here, so nothing
has to be configured for this to work. `GIT_SHA` is for the cases Railway did
not trigger — a `railway up` from a laptop, or a plain
`docker build --build-arg GIT_SHA=$(git rev-parse HEAD)`.

A build nobody told answers `source: "none"` with a null commit rather than
guessing: "this build was not told which commit it is" and "this endpoint does
not report commits" look identical if the field is simply absent, and they need
different fixes. Anything that is not commit-shaped hex is refused for the same
reason — an unexpanded `$GIT_SHA` reported as the running commit looks like an
answer.

None of this existed until three separate fixes were each believed to be
un-deployed while nothing on the box could confirm either way.

**Railway deploys this repository itself**, on every push to `main`. CI does
not do it and cannot gate it — by the time the checks run, the push that
triggered the deploy has already happened. So `ci.yml`'s `verify-deploy` job
does not deploy anything; it polls `HEALTH_URL` until the pushed commit
answers, which is the part nothing else could tell you. Set a `HEALTH_URL`
repository variable (`https://host/api/health`) or the job is skipped.

It deliberately does not `needs: build`. Railway deploys whether or not the
checks pass, so what is live is worth reporting either way — and starting
alongside them means the poll is already running while the container swaps.
Two pushes close together cancel the older poll, which would otherwise time
out waiting for a commit that has been superseded.

Gating a deploy on the checks would mean CI owning the deploy instead, with
`railway up` and a project token. That was written and then taken out: with
Railway already deploying from the repository it meant two things deploying
one service, racing on every push.

`scripts/await-deploy.mjs` is the poll, and it is a script rather than bash
around `jq` for a reason worth keeping: `jq -r '.commit' 2>/dev/null || echo
null` reads a _missing jq_ as "not live yet", so a runner image that dropped
it would poll for ten minutes and then report a deploy failure that never
happened — which is exactly what it did the first time it ran on a machine
without jq. Dependency-free `.mjs` because the job installs nothing.
