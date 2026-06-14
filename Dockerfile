# syntax=docker/dockerfile:1
# PingWatch — single self-hostable image. Build the monorepo, then run the embedded
# Nest + Next server via the `pingwatch` CLI. SQLite by default; set DATABASE_URL for Postgres.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# iputils-ping for the Phase-2 ICMP monitor type; tini for clean signal handling.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping tini openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production \
    PINGWATCH_DATA_DIR=/data

COPY --from=build /app /app

VOLUME /data
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--", "node", "apps/server/dist/cli.js", "start", "--data-dir", "/data"]
