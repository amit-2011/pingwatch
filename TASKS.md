# PingWatch — Phase-wise Tasks + User Stories

> Companion to `PLAN.md`. Every task has a 🎭 user story (primary + optional secondary).
> Roles: **Operator** (self-hoster) · **Admin** (org owner) · **Member** (team engineer) ·
> **Viewer** (read-only) · **On-call** (alert responder) · **Client** (public-page visitor) ·
> **Maintainer** (PingWatch dev). Markers: 🔴 critical-path/high-risk · 🟢 parallel-safe · _dep_ = depends-on.

---

## 🟦 PHASE 1 — MVP
*HTTP monitor + Telegram + dashboard + SQLite; single-tenant UI but full multi-tenant schema.*

### M1 — Foundation (T0–T4)

**T0 — Fix repo** · _dep: —_
🎭 As a **Maintainer**, I want the repository fixed to a single clean root git history, so that I have a sane version-control baseline to build on without a broken nested `.git`.
→ `rm -rf` orphaned `./pingwatch/.git`, `git init -b main` at root, baseline config files. *(no commit yet)*

**T1 — Monorepo scaffold + CI** · _dep: T0_
🎭 As a **Maintainer**, I want a pnpm + Turborepo monorepo (apps/server, apps/web, packages/shared|db|monitor-core|notifications) with CI guards, so that I can develop across backend and frontend with enforced structure from day one.
→ Workspaces + Turborepo; CI: single-`.git`, no-`enum`/`Json`, lint/type-check.

**T2 — `packages/shared` (wire contract)** 🟢 · _dep: T1_
🎭 As a **Maintainer**, I want one shared package of union constants, zod schemas, and provider interfaces, so that backend and frontend agree on a single strict wire contract and never drift apart.
→ Consts, zod schemas, `MonitorType` + `NotificationProvider` interfaces, error envelope.

**T3 — `packages/db` (Prisma, both providers)** · _dep: T1_
🎭 As a **Maintainer**, I want one canonical Prisma schema that generates both SQLite and Postgres clients with a runtime selector and migrations, so that the same codebase runs on either database without maintaining two schemas.
🎭 As an **Operator**, I want the tool to work on plain SQLite *or* Postgres, so that I can self-host with zero external database setup if I choose.
→ Canonical schema (both folders), both clients + selector, first migration, migrate-both + schema↔zod CI.

**T4 — CLI + bootstrap** · _dep: T3_
🎭 As an **Operator**, I want a single `pingwatch start` command that resolves config, auto-generates secrets, picks the database, and runs migrations on first boot, so that I get a running monitor with one command and no manual setup.
→ `cac` CLI (`--port=3001`/`--data-dir`/`--config`), config resolution, `secret.key`, `migrate deploy`, SQLite WAL pragmas.

### M2 — The risky spike (T5)

**T5 — Single-process embed (Nest ⊕ Next)** 🔴 · _dep: T1_
🎭 As an **Operator**, I want the API, WebSocket, and dashboard served from one process on one port, so that I deploy a single thing with no CORS or reverse-proxy juggling.
→ Next 15 `output:'standalone'` embedded in Nest; `main.ts` wiring; **gate: dashboard loads with css/js.** *(do this EARLY)*

### M3 — Auth (T6–T7)

**T6 — Auth core** · _dep: T3, T4_
🎭 As an **Operator**, I want strong password hashing, rotating refresh tokens with reuse detection, and sealed secrets, so that my self-hosted instance is secure by default without me configuring anything.
→ hash-wasm argon2id, JWT access + opaque DB-refresh, AES-256-GCM SecretBox, ValidationPipe + pino + global error filter.

**T7 — First-run setup + login** · _dep: T6_
🎭 As an **Operator**, I want a guarded first-run setup that forces me to create the admin and org instead of shipping a default password, so that my instance is never exposed with known credentials.
🎭 As an **Admin**, I want org-scoped queries and role guards, so that each tenant's data stays isolated and only authorized users act on it.
→ `SetupState` gate, `POST /api/setup`, login/refresh/logout, `JwtAuthGuard→OrgGuard→RolesGuard`, org-filter Prisma extension.

### M4 — Monitoring engine (T8–T11) ❤️

**T8 — Engine interfaces + HTTP type** · _dep: T2_
🎭 As a **Member**, I want to create HTTP/HTTPS monitors with timeout, status-range, keyword, and redirect checks, so that I can verify my services are actually responding correctly, not just reachable.
→ `MonitorTypeRegistry` + `http.monitor.ts` on undici, p-limit concurrency.

**T9 — Scheduler + anti-flap** · _dep: T8_
🎭 As an **On-call**, I want a confirmation state machine that only marks a monitor DOWN after retries are exhausted, so that a single transient blip never wakes me with a false alert.
→ In-process recursive-`setTimeout` scheduler + `MonitorRuntime.applyResult` state machine; unit-tested.

**T10 — Heartbeat writer + rollups + uptime%** · _dep: T9_
🎭 As a **Viewer**, I want accurate cached 24h/7d/30d uptime percentages backed by duration-weighted rollups, so that I can trust the reliability numbers without slow raw scans.
→ Serialized writes (coverageMs), StatHourly/StatDaily (upMs/downMs), cached uptime, retention + purge gated on aggregation.

**T11 — Boot rehydration** · _dep: T10_
🎭 As an **On-call**, I want monitors to restore their last confirmed status and recent history after a restart, so that restarting PingWatch never loses state or fires spurious re-alerts.
→ `startAll()` restores last CONFIRMED status + 24h ring before scheduling; test restart-mid-confirmation.

### M5 — Notifications + self-health (T12–T13)

**T12 — Telegram + incidents** · _dep: T11, T7_
🎭 As an **On-call**, I want confirmed up/down transitions to auto-open and resolve incidents and reliably notify me on Telegram, so that I learn about outages immediately and have a clean incident record.
→ EventEmitter2 transitions, TelegramProvider (+test), find-or-create/resolve (one open/monitor), dispatch with retry.

**T13 — Observability-of-self** 🟢 · _dep: T10_
🎭 As an **Operator**, I want health and system endpoints exposing rollup-cron success, active monitors, and in-flight checks plus structured logs, so that I can confirm the monitor itself is actually healthy and working.
→ `/api/health` (liveness) + `/api/system` (authed) + pino structured logs.

### M6 — Frontend (T14–T16)

**T14 — Dashboard shell + data layer** · _dep: T5, T7_
🎭 As a **Member**, I want an authenticated dashboard shell with reusable status, heartbeat, uptime, and latency components and dark mode, so that I have a fast, consistent UI to manage and read my monitors.
→ `(dashboard)` layout, TanStack Query, shadcn primitives, StatusBadge/HeartbeatBar/UptimeStat/LatencySparkline, login/setup.

**T15 — Realtime** · _dep: T14, T12_
🎭 As a **Viewer**, I want live heartbeat and status updates pushed over one socket connection that survives token expiry, so that I see real-time monitor state without refreshing or polling.
→ Single scoped socket.io-client, deltas patch the cache (no polling), `auth-expired` → refresh → silent re-handshake.

**T16 — MVP screens** · _dep: T15_
🎭 As a **Member**, I want core screens to list monitors live, view detail with uptime/latency charts, add/edit HTTP monitors with test-now, and manage channels and settings, so that I can run the full monitoring workflow from the UI.
→ Monitors list, monitor detail (uptime cards + Recharts + 90d bar), add/edit, channels, settings.

### M7 — Ship (T17)

**T17 — Distribution + DoD gate** · _dep: all_
🎭 As an **Operator**, I want a minimal Docker image with docker-compose and a verified `pingwatch start` smoke test passing the Definition of Done, so that I can deploy a known-good build with confidence.
🎭 As a **Maintainer**, I want the 13-point Definition of Done gate run before release, so that the MVP ships only when it provably boots and works.
→ Multi-stage Dockerfile + compose, verify pruned build boots, CI smoke test, run `PLAN.md` §8 gate.

---

## 🟩 PHASE 2 — Multi-tenant + more monitor types + channels

**P2.1 — Multi-org/project UI + switcher**
🎭 As an **Admin**, I want to navigate between my organizations and projects through a visible switcher, so that I can manage the right tenant's monitors without confusion or leakage between accounts.
🎭 As a **Viewer**, I want the org/project I belong to surfaced in the UI, so that I only see dashboards relevant to me and never another tenant's data.

**P2.2 — RBAC enforcement + members + invites**
🎭 As an **Admin**, I want to invite people and assign member or viewer roles that are actually enforced, so that each person can do exactly what their job requires and nothing more.
🎭 As a **Viewer**, I want my read-only access guaranteed by the system, so that I can safely explore dashboards without fear of breaking a monitor or setting.

**P2.3 — Monitor types: TCP / Ping / DNS / SSL / Keyword**
🎭 As a **Member**, I want to monitor TCP ports, ICMP pings, DNS records, SSL certificate expiry, and page keywords, so that I can catch failures across all our infrastructure, not just plain HTTP endpoints.

**P2.4 — Slack provider**
🎭 As a **Member**, I want incidents delivered to Slack as richly formatted Block Kit messages, so that my team sees outages in the channel we already watch and can react immediately.

**P2.5 — Email/SMTP provider**
🎭 As a **Member**, I want to send alert emails through our own SMTP server, so that stakeholders get notified reliably without depending on any third-party alerting service.

**P2.6 — Repeat/re-notify + template overrides**
🎭 As an **On-call**, I want recurring reminders for incidents that stay open plus the ability to tailor each channel's message wording, so that an unresolved outage keeps nagging me in the format my team expects until it's fixed.

**P2.7 — Postgres hardening/validation**
🎭 As an **Operator**, I want PingWatch to run safely on a validated, hardened Postgres setup, so that I can scale up to many monitors and clients with confidence in data integrity and performance.

**P2.8 — Charts polish + filter/group**
🎭 As a **Viewer**, I want polished charts plus the ability to filter and group monitors, so that I can quickly find the status that matters to me without wading through every monitor at once.

---

## 🟨 PHASE 3 — System metrics + public status pages + incidents UX

**P3.1 — MetricSample + MaintenanceWindow migration**
🎭 As a **Maintainer**, I want an additive migration introducing MetricSample and MaintenanceWindow tables, so that the system can persist metric history and planned-downtime records without breaking existing installations.
🎭 As an **Operator**, I want this schema change applied automatically and safely on upgrade, so that I gain metrics and maintenance features without manual database work or data loss.

**P3.2 — Local system metrics (CPU/RAM/Disk/Net)**
🎭 As a **Member**, I want CPU, RAM, disk, and network metrics collected from the local host behind a swappable MetricSource interface, so that I can watch the health of the machine running my services and later plug in other sources without code changes.

**P3.3 — `pingwatch-agent` (remote push)**
🎭 As an **Operator**, I want a lightweight pingwatch-agent that pushes a remote machine's metrics back to PingWatch using an agent token, so that I can monitor servers beyond the host running PingWatch without exposing them or standing up extra infrastructure.

**P3.4 — Public status pages**
🎭 As a **Client**, I want a shareable, branded public status page showing service health, uptime, and active incidents without logging in, so that I can instantly check whether the services I depend on are working.
🎭 As an **Admin**, I want a public status page I can hand to stakeholders, so that I cut down on status inquiries and keep clients informed during outages.

**P3.5 — Status page editor + branding**
🎭 As an **Admin**, I want to curate which monitors appear on the status page with custom display names, branding, and a logo upload, so that the public page reflects my organization and exposes only the services I choose to share.

**P3.6 — Incidents UX + timeline**
🎭 As an **On-call**, I want an incident timeline with comments and the ability to publish updates to the status page, so that I can coordinate the response internally while keeping affected users informed in one workflow.
🎭 As a **Client**, I want to read posted incident updates on the status page, so that I know what is broken and when it is expected to be fixed.

**P3.7 — Maintenance windows**
🎭 As a **Member**, I want to schedule maintenance windows that suppress alerts during planned downtime, so that expected outages don't trigger false alarms or wake on-call engineers.
🎭 As an **On-call**, I want alerts muted during scheduled maintenance, so that I'm not paged for downtime my team already planned.

---

## 🟥 PHASE 4 — Scale + public distribution

**P4.1 — npm publish + multi-arch Docker**
🎭 As an **Operator**, I want to install PingWatch via a published npm package and run it from a multi-arch Docker image, so that I can deploy it on any machine or CPU architecture with one standard command and no custom build steps.
🎭 As a **Maintainer**, I want a repeatable publish pipeline for the npm package and Docker images, so that every release reaches users consistently across architectures without manual artifact handling.

**P4.2 — BullMQ + Redis (horizontal scale)**
🎭 As an **Operator**, I want monitor checks scheduled through a BullMQ + Redis queue, so that I can run multiple PingWatch instances in parallel and keep checks reliable and on-time as my number of monitors grows.

**P4.3 — Escalation policies**
🎭 As an **On-call**, I want unacknowledged incidents to automatically escalate to the next responder, so that a missed alert never leaves an outage unhandled and someone always picks it up.
🎭 As an **Admin**, I want to define escalation policies for my organization, so that incident response follows a guaranteed chain of accountability instead of relying on a single person noticing.

**P4.4 — More providers (Discord/Webhook/Teams/Pushover/Gotify/Twilio/WhatsApp)**
🎭 As a **Member**, I want to send alerts through Discord, generic Webhook, MS Teams, Pushover, Gotify, Twilio SMS, and WhatsApp, so that my team gets notified on whatever channels we already use without building custom integrations.

**P4.5 — Reverse-proxy/SSO + KMS secrets**
🎭 As an **Admin**, I want to authenticate users through my reverse-proxy SSO or OIDC provider and store secrets in a KMS backend, so that access is centrally governed and sensitive credentials are never kept in plaintext.
🎭 As an **Operator**, I want PingWatch to integrate with Authelia/Authentik/OIDC and an external secret store, so that I can fold it into my existing identity and security infrastructure.

**P4.6 — YAML import/export + token scopes/rotation**
🎭 As an **Admin**, I want to import/export my full configuration as YAML and manage scoped, rotatable API tokens from the UI, so that I can version-control my setup, reproduce it elsewhere, and revoke or limit programmatic access safely.
🎭 As an **Operator**, I want a `pingwatch import` command to apply YAML config, so that I can provision or migrate an instance reproducibly as code rather than clicking through manual setup.

---

## Role coverage (sanity check)
- **Operator** → T3,T4,T5,T6,T7,T13,T17,P2.7,P3.1,P3.3,P4.1,P4.2,P4.5,P4.6
- **Maintainer** → T0,T1,T2,T3,T17,P3.1,P4.1
- **Member** → T8,T14,T16,P2.3,P2.4,P2.5,P3.2,P3.7,P4.4
- **On-call** → T9,T11,T12,P2.6,P3.6,P3.7,P4.3
- **Viewer** → T10,T15,P2.1,P2.2,P2.8
- **Admin** → T7,P2.1,P2.2,P3.4,P3.5,P4.3,P4.5,P4.6
- **Client** → P3.4,P3.6
