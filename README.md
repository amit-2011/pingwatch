# PingWatch

> Self-hosted, free, open-source **uptime + full-system monitoring** — distributed as an npm package
> (`npx pingwatch`) and a multi-arch Docker image. Multi-tenant (Organization → Project → Monitor),
> pluggable notifications, public status pages, incidents + escalation. Like Uptime Kuma, but tailored
> for a company + its clients and reusable by any developer.

See [`PLAN.md`](./PLAN.md) for the architecture and [`TASKS.md`](./TASKS.md) for the phase-wise task
breakdown + user stories. All four phases are complete.

## Quick start

```bash
# npm — zero config, SQLite, single process on http://localhost:3001
npx pingwatch

# Docker
docker run -p 3001:3001 -v pingwatch-data:/data ghcr.io/amit-2011/pingwatch
```

Open http://localhost:3001 and complete first-run setup. Data lives in `~/.pingwatch` (or the `/data`
volume). Releases are cut by [`RELEASING.md`](./RELEASING.md).

## Features

- **Monitors** — HTTP/HTTPS, TCP, Ping (ICMP), DNS, SSL cert expiry, keyword, and system metrics
  (CPU/RAM/Disk/Network — local, or pushed from remote hosts via `pingwatch agent`).
- **Anti-flap engine** — confirmed up/down after retries, duration-weighted uptime (24h/7d/30d),
  boot rehydration so restarts don't re-alert.
- **Notifications (10 channels)** — Telegram, Slack, Email/SMTP, Discord, generic Webhook, MS Teams,
  Pushover, Gotify, Twilio SMS, WhatsApp — each a plugin behind a common interface.
- **Incidents & escalation** — auto-opened incidents with a timeline + comments, publishable to status
  pages, and escalation policies that page the next responder when an incident goes unacknowledged.
- **Maintenance windows** — suppress alerts during planned downtime.
- **Public status pages** — branded, shareable, curated; expose only what you choose (never internal ids/config).
- **Multi-tenant + RBAC** — Organization → Project → Monitor, with `admin` / `member` / `viewer` roles.
- **Config as code** — export/import an org's full config as YAML (`pingwatch import`), plus scoped,
  rotatable API tokens for programmatic access.
- **Scale (opt-in)** — Postgres + a BullMQ/Redis distributed scheduler to run multiple instances.
- **Auth & secrets (opt-in)** — reverse-proxy (Authelia/Authentik) or OIDC SSO, and a pluggable
  file/env/KMS secret backend. Local password auth + a file secret are the defaults.

## Scaling out (all opt-in via env)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/pingwatch   # Postgres instead of SQLite
REDIS_URL=redis://host:6379                                # + ...
PINGWATCH_SCHEDULER=bullmq                                 # distributed scheduler across instances
PINGWATCH_AUTH_MODE=oidc                                   # or trusted-header (reverse-proxy SSO)
PINGWATCH_SECRET_BACKEND=kms                               # external KMS for the master secret
```

## Tech stack

- **Backend:** NestJS 11 (CommonJS) — `MonitorType` + `NotificationProvider` plugin registries.
- **Frontend:** Next.js 15 (App Router, React 19) + Tailwind v4, embedded in the Nest process (one port).
- **DB/ORM:** Prisma 7 (rust-free driver adapters) — SQLite (default, zero-config) → Postgres (scale).
- **Realtime:** socket.io · **Queue (opt-in):** BullMQ + Redis · **Monorepo:** pnpm + Turborepo.

## Monorepo layout

```
apps/server            — NestJS backend (runtime host; embeds the built web UI) → published as `pingwatch`
apps/web               — Next.js dashboard + public status pages
packages/shared        — DTOs, zod schemas, plugin interfaces (the wire contract)
packages/db            — Prisma schema + generated clients
packages/monitor-core  — MonitorType implementations
packages/notifications — NotificationProvider implementations
```

## Development

```bash
pnpm install
pnpm dev                    # run all apps in watch mode (Turborepo)
pnpm build                  # build everything
pnpm lint && pnpm type-check
```

## License

MIT
