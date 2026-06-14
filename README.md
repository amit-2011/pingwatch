# PingWatch

> Self-hosted, free, open-source **uptime + system monitoring** tool — distributed as an npm package (`npx pingwatch`) and a Docker image. Multi-tenant (Organization → Project → Monitor), pluggable notifications, public status pages. Like Uptime Kuma, but tailored for a company + its clients and reusable by any developer.

See [`PLAN.md`](./PLAN.md) for the full architecture and [`TASKS.md`](./TASKS.md) for the phase-wise task breakdown + user stories.

## Quick start

```bash
# npm — zero config, SQLite, single process on http://localhost:3001
npx pingwatch

# Docker
docker run -p 3001:3001 -v pingwatch-data:/data ghcr.io/amit-2011/pingwatch
```

Open http://localhost:3001 and complete first-run setup. Data lives in `~/.pingwatch` (or the
`/data` volume). Scale out with `DATABASE_URL` (Postgres) and `REDIS_URL` + `PINGWATCH_SCHEDULER=bullmq`.
Releases are cut by [`RELEASING.md`](./RELEASING.md).

## Why PingWatch
- **One command to self-host** — `npx pingwatch`, zero external infra (SQLite by default), single process / single port.
- **Full-system monitoring** — uptime checks (HTTP/TCP/Ping/DNS/SSL/keyword) **and** system metrics (CPU/RAM/Disk/Network).
- **Multi-tenant** — monitor your own projects and your clients', with public status pages + incidents + escalation.
- **Pluggable notifications** — Telegram, Slack, Email, Discord, Webhook, MS Teams, Pushover, Gotify, Twilio, WhatsApp.

## Tech stack (locked)
- **Backend:** NestJS (CommonJS) — `MonitorType` + `NotificationProvider` plugin registries
- **Frontend:** Next.js 15 + shadcn/ui + Tailwind v4, embedded in the Nest process
- **DB/ORM:** Prisma 7 — SQLite (default, zero-config) → Postgres (scale)
- **Realtime:** socket.io · **Monorepo:** pnpm + Turborepo

## Monorepo layout
```
apps/server   — NestJS backend (runtime host; embeds the built web UI)
apps/web      — Next.js dashboard + public status pages
packages/shared        — DTOs, zod schemas, plugin interfaces (the wire contract)
packages/db            — Prisma schema + generated clients
packages/monitor-core  — MonitorType implementations
packages/notifications — NotificationProvider implementations
```

## Development
```bash
pnpm install
pnpm dev          # run all apps in watch mode (Turborepo)
pnpm build        # build everything
pnpm lint && pnpm type-check
```

## License
TBD (intended: open-source / free).
