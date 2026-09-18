# syntax=docker/dockerfile:1

# Node 24 matches local development and ships the built-in SQLite the room
# store is built on.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

# ── Dependencies ───────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ──────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The TURN relay voice chat falls back to when two networks have no route
# between them. NEXT_PUBLIC_* is inlined into the browser bundle by the build,
# so setting these on the running service does nothing at all — they have to
# be here, which with a Dockerfile builder means build arguments Railway is
# told to pass. Without them the browser has STUN and nothing else, and two
# people behind strict NATs never hear each other however well the handshake
# works.
ARG NEXT_PUBLIC_TURN_URL=""
ARG NEXT_PUBLIC_TURN_USERNAME=""
ARG NEXT_PUBLIC_TURN_CREDENTIAL=""
ENV NEXT_PUBLIC_TURN_URL=${NEXT_PUBLIC_TURN_URL}
ENV NEXT_PUBLIC_TURN_USERNAME=${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_CREDENTIAL=${NEXT_PUBLIC_TURN_CREDENTIAL}
RUN pnpm build

# ── Runtime ────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/lib ./lib
COPY --from=build /app/types ./types
# What CMD runs. The runtime stage copies a named list rather than the repo,
# so a file the start script needs has to be named here or the container
# comes up with nothing to run.
COPY --from=build /app/scripts/start.mjs ./scripts/start.mjs

# Mounted storage: without this the room database is wiped on each deploy and
# the office resets
ENV ROOM_DB_PATH=/data/watercooler.sqlite
# The company's data lives on the volume too, and is seeded on first boot
ENV ERP_DB_PATH=/data/erp.sqlite

# Which commit this image is, for /api/health and the start-up log. Railway
# sets RAILWAY_GIT_COMMIT_SHA itself on a deploy it triggered from the
# connected repository; this argument is for everything else —
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) .
# Last in the file on purpose: it changes with every commit, so anything
# placed under it would rebuild every time.
ARG GIT_SHA=""
ENV GIT_SHA=${GIT_SHA}

EXPOSE 3000
CMD ["pnpm", "start"]
