# syntax=docker/dockerfile:1
# PingWatch — single self-hostable image. Build the monorepo, prune to just the server + its
# inlined workspace/prod deps, then run the embedded Nest + Next server via the `pingwatch` CLI.
# SQLite by default; set DATABASE_URL for Postgres, REDIS_URL + PINGWATCH_SCHEDULER=bullmq to scale.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Prune to a self-contained artifact: `pnpm deploy` inlines every @pingwatch/* workspace dep plus
# prod deps under /app/out/node_modules. The isolated linker's symlinks resolve fine inside the
# image. buildx builds each platform natively/emulated, so better-sqlite3's prebuild matches the arch.
RUN pnpm --filter pingwatch deploy --prod --legacy /app/out

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# iputils-ping for the ICMP monitor type; tini for clean signal handling; openssl + CA certs for TLS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping tini openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PINGWATCH_DATA_DIR=/data

COPY --from=build /app/out /app

VOLUME /data
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--", "node", "dist/cli.js", "start", "--data-dir", "/data"]
