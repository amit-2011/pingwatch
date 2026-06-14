# PingWatch — Master Plan (Final, Reconciled)

## 0. TL;DR + Locked Stack

PingWatch is a self-hosted, free, open-source monitoring tool distributed as an npm package (`npx pingwatch`) and a Docker image. It does uptime checks + system metrics, multi-tenant (Organization → Project → Monitor), with pluggable notification providers and public status pages. Owner priorities: **single-command self-host, zero external infra by default, top-tier UI/UX, performance**.

**Locked stack:**
- **Backend:** NestJS (Express adapter), **CommonJS**, SWC build. Modular: `MonitorType` + `NotificationProvider` plugin registries.
- **Frontend:** Next.js 15 App Router (React 19) + **shadcn/ui** + Tailwind v4, **ESM internally**. Built `output:'standalone'` and **embedded into Nest** — one process, one port, no CORS.
- **Realtime:** socket.io gateway (authed dashboard only; deltas only; never for public pages).
- **DB/ORM:** Prisma 7 (`prisma-client` generator, rust-free CJS). **SQLite default** (zero-config), Postgres for scale. One model, two datasource folders.
- **Monorepo:** pnpm workspaces + Turborepo. **Repo root is `~/Desktop/Work/hack/pingwatch` itself** (one `.git`).
- **TypeScript strict everywhere, no `any`/`unknown`/`object`.** `packages/shared` is the single source of DTOs + zod schemas across the wire.
- **Default port: `3001`** (project-wide, locked — no longer an open question).
- **Password hashing: `hash-wasm` argon2id (pure WASM, zero native binary)** — preserves the "npx just works on any platform / multi-arch trivial" thesis. No native `argon2`/`@node-rs/argon2`.

**MVP = exactly one monitor type (HTTP/HTTPS) + one notification provider (Telegram), single-tenant UI, full multi-tenant schema, SQLite, dashboard + realtime, anti-flap, rollups.** Everything else is additive through the two plugin interfaces.

---

## 1. Final Repo Layout & Distribution

### 1.1 Fix the repo first (before any scaffolding)
The orphaned nested repo at `./pingwatch/.git` has 0 commits and no files — verified, safe to delete.
```bash
rm -rf /home/techvoot/Desktop/Work/hack/pingwatch/pingwatch   # drop orphaned nested repo
cd /home/techvoot/Desktop/Work/hack/pingwatch
git init -b main
# add baseline files (1.3), then:
git add -A && git commit -m "chore: init pingwatch monorepo"
```
After this there is **exactly one `.git`, at the root**. A CI guard fails if `find . -mindepth 2 -name .git` returns anything.

### 1.2 Tooling (LOCKED)
- **pnpm workspaces** (already on 10.33.1) + **Turborepo** task runner (content-hash caching speeds the cacheable Next build on every publish; `dependsOn:["^build"]` enforces `db`/`shared` → `server`/`web` order).
- Rejected: Nx (overkill for ~6 packages), pnpm-only (loses Next build caching).

### 1.3 Monorepo tree (LOCKED)
```
pingwatch/                          # the ONLY .git (repo root)
├─ .git/  .gitignore  .nvmrc(22)  .npmrc
├─ package.json                     # private:true, packageManager:"pnpm@10.33.1", engines.node:">=22.12"
├─ pnpm-workspace.yaml              # apps/* , packages/*
├─ turbo.json
├─ tsconfig.base.json               # strict, noUncheckedIndexedAccess; bans any/unknown leaks
├─ Dockerfile  docker-compose.yml  .dockerignore  README.md
├─ .github/workflows/ci.yml         # guards (1.9) — actually authored, not promised
│
├─ apps/
│  ├─ server/                       # @pingwatch/server — NestJS, CJS, the runtime host
│  │  ├─ package.json               # NO "type":"module"
│  │  ├─ nest-cli.json              # builder: swc
│  │  └─ src/
│  │     ├─ main.ts                 # createNestApp() (used by CLI, not a user entry)
│  │     ├─ cli.ts                  # #!/usr/bin/env node — the bin
│  │     ├─ bootstrap/{next-host,migrate,seed,secret,rehydrate}.ts
│  │     ├─ engine/                 # scheduler, monitor types, rollups (Section 3)
│  │     ├─ notifications/          # dispatch, incident, providers wiring (Section 4)
│  │     ├─ auth/  crypto/  realtime/  health/  config/   (Sections 6/obs)
│  │     └─ ...
│  └─ web/                          # @pingwatch/web — Next.js App Router, ESM, build input only
│     ├─ next.config.ts             # output:'standalone'
│     ├─ tailwind.config.ts  components.json
│     └─ src/app/                   # (dashboard) + (public)/status/[slug]
│
├─ packages/
│  ├─ shared/                       # @pingwatch/shared — DTOs, zod, union consts, plugin interfaces,
│  │                                #   ERROR ENVELOPE type, MonitorType + NotificationProvider contracts
│  ├─ db/                           # @pingwatch/db — Prisma (Section 2 owns schema)
│  │  ├─ prisma/sqlite/   schema.prisma + migrations/    (DEFAULT)
│  │  ├─ prisma/postgres/ schema.prisma + migrations/    (scale)
│  │  └─ src/generated-{sqlite,postgres}/   # see 1.6 — one client per provider
│  ├─ monitor-core/                 # @pingwatch/monitor-core — MonitorType impls (Section 3)
│  └─ notifications/                # @pingwatch/notifications — provider impls (Section 4)
│
└─ (published `pingwatch` tarball = built server + built web standalone + packages/db)
```
**Boundaries:** `packages/shared` imported by both `apps/server` and `apps/web` (the strict wire contract). `packages/db` imported **only** by `apps/server`. Only `apps/server` has a runtime entry; `apps/web` is a build input.

`.gitignore`: `node_modules/ dist/ .next/ .turbo/ *.tsbuildinfo data/ *.db *.db-wal *.db-shm .env*` (commit `.env.example`).

### 1.4 Single-process serving: Nest embeds Next (LOCKED — core decision)
One Node process, one port. Nest (Express adapter) owns the port: serves `/api`, the WebSocket gateway, and delegates everything else to an embedded Next request handler.
- `output:'standalone'` for the trimmed file set, but **do NOT run the generated `server.js`** — embed via `next({dev:false, dir:webDir})`, `await app.prepare()`, `app.getRequestHandler()`.
- `main.ts` order (load-bearing): (1) `NestFactory.create(AppModule, new ExpressAdapter(server), { bodyParser:false })` — **bodyParser:false prevents the Nest+Next body double-parse hang**; attach body parsers scoped to `/api` only. (2) `setGlobalPrefix('api')`. (3) attach socket.io gateway. (4) `express.static` for `/_next/static` + `/public` (embedded Next disables Automatic Static Optimization — you must serve these yourself or the dashboard loads with no CSS/JS). (5) **catch-all LAST**: `server.all('*', (req,res)=>handle(req,res))`.
- Rejected: `output:'export'` (kills SSR + dynamic status pages); two-process default (breaks single-command promise).
- **Escape hatch (documented, LATER):** `PINGWATCH_SEPARATE=1` splits only the **WEB tier** to a second process behind a reverse proxy. **The SERVER/scheduler tier remains strictly single-instance until BullMQ (Phase 4).** Running two server instances double-fires every monitor — explicitly forbidden in docs (resolves the 1.4-vs-3.3 conflict).

### 1.5 `npx pingwatch` CLI + config / env / data-dir (LOCKED)
One npm package, name `pingwatch`, `bin: { pingwatch: "./dist/cli.js" }` (shebang). Tarball bundles: built server `dist/`, built web (`.next/standalone` + `.next/static` + `public/`), `packages/db` (both schemas + both migration folders + **both generated clients**, 1.6), and `prisma` CLI as a **runtime** dep (for `migrate deploy` on first boot). End users never build, never run prisma directly.

CLI (using `cac`): `pingwatch start` (default) · `--port <n>` (default **3001**) · `--data-dir <p>` (default `~/.pingwatch`, `/data` in Docker) · `--config <file>` · `pingwatch migrate` · `--version|--help`.

**Config precedence:** CLI flag → env (`PINGWATCH_*`) → cosmiconfig file → default.
**cosmiconfig file scope (MVP, LOCKED):** **runtime/infra knobs ONLY** — `port, dataDir, scheduler, rawRetentionDays, hourlyRetentionDays, maxConcurrency, separate`. It does **NOT** declare monitors in MVP. Declarative monitor-as-config (Gatus-style YAML) is **deferred** to a later phase as an explicit **`pingwatch import <file>` one-shot CLI command** (import-once, DB stays the single source of truth — no auto-reconcile-on-boot). (Resolves the cosmiconfig gap.)

**Data dir (single mountable folder — backup = copy this folder):**
```
~/.pingwatch/   (or /data in Docker)
├─ pingwatch.db (+ -wal, -shm)   # SQLite, auto-created by Prisma on first boot
├─ config/                       # optional cosmiconfig file; Phase-3 status-page logo uploads
└─ secret.key                    # auto-generated APP_SECRET (0600); MUST be in backups
```

**First-boot sequence (`pingwatch start`):**
1. Resolve config (flag → env → file → default).
2. Ensure data dir; generate + persist `secret.key` (0600) if absent.
3. Select schema/migrations + generated client by `DATABASE_URL` (`postgres://`/`postgresql://` → postgres; else SQLite `file:<dataDir>/pingwatch.db`).
4. Run **`prisma migrate deploy`** (idempotent; never `migrate dev`/`db push`/reset). SQLite file auto-created.
5. Apply SQLite pragmas on connect: `journal_mode=WAL; synchronous=NORMAL; busy_timeout=5000` (prevents `SQLITE_BUSY` false-DOWN).
6. **Rehydrate engine state** from DB (Section 3.0) — restore each monitor's last confirmed status + 24h ring.
7. Seed default Org + Project + (if `SetupState` incomplete) gate to setup mode (Section 6.3).
8. Boot Nest, embed Next, listen on **3001**, print `http://localhost:3001`.

### 1.6 Prisma generated-client story for two datasources (RESOLVED GAP)
A Prisma client is generated against one provider. We therefore **generate two clients** — `packages/db/src/generated-sqlite` and `generated-postgres` — both committed (Prisma 7 `prisma-client`, `moduleFormat="cjs"`, `runtime="nodejs"`, rust-free so no per-arch binary). A thin `packages/db/src/index.ts` selects the client at runtime by `DATABASE_URL` and re-exports a single typed surface. Both are produced by `pnpm turbo db:generate` (one `prisma generate` per schema folder) and verified in CI (1.9). This removes the "single committed client may be invalid for Postgres" gap.

### 1.7 Module-system standard (LOCKED)
- `apps/server`, `packages/{db,shared,monitor-core,notifications}` = **CommonJS** (`module:"CommonJS"`/`Node16`, SWC). No `"type":"module"` on the server.
- `apps/web` owns ESM internally (isolated).
- `engines.node >= 22.12` so `require(ESM)` works flag-free (`p-limit`, `nanoid`, `cac`). Prefer CJS-compatible versions where trivial.

### 1.8 Docker (recommended install path; image lands minimal in Phase 1, polished in Phase 4)
Multi-stage `node:22-bookworm-slim`, multi-arch amd64+arm64 (trivial: Prisma rust-free + WASM argon2 → **zero native binaries**). Stage 1 builds via `pnpm turbo build` then `pnpm deploy --filter=pingwatch --prod /out` (verify the pruned `/out` actually boots before relying on it). Stage 2 installs `iputils-ping` (for Phase-2 ICMP), `ENV PINGWATCH_DATA_DIR=/data`, `VOLUME /data`, `EXPOSE 3001`, `ENTRYPOINT ["node","dist/cli.js","start"]`.
```yaml
# docker-compose.yml (documented default)
services:
  pingwatch:
    image: pingwatch/pingwatch:latest
    ports: ["3001:3001"]
    volumes: ["pingwatch-data:/data"]
    restart: unless-stopped
    # scale to Postgres: environment: { DATABASE_URL: "postgresql://..." }
volumes: { pingwatch-data: {} }
```

### 1.9 CI guards (AUTHORED, not promised — `.github/workflows/ci.yml`)
1. **Single-git guard:** fail if `find . -mindepth 2 -name .git` is non-empty.
2. **SQLite-safety guard:** fail if either `schema.prisma` contains the tokens `enum ` or ` Json` (enforces Section 2's no-DB-enum/no-Json rule; would have caught the old `config Json`).
3. **Migrate-both job:** `prisma migrate deploy` + `prisma generate` for **both** sqlite and postgres folders against throwaway DBs, so the Postgres path can't silently rot.
4. **Schema↔zod contract test** (Section "Testing"): every `packages/shared` zod schema's keys match the corresponding Prisma model columns.
5. **lint + type-check + unit + smoke** (`pingwatch start` on temp data-dir → asserts migrate+seed+listen).

---

## 2. Data Model (Prisma — the SINGLE source of truth)

**Multi-tenant from the first migration.** SQLite default + Postgres share **one identical model**; only the `datasource` block + migrations folder differ. **No DB enums, no native `Json`** — string columns validated against shared TS unions; JSON config stored as **`String`** (stringified). This Section is the **only** place models are defined; Sections 4 and 6 *contribute fields*, they do not redefine.

**Canonical naming (RESOLVED conflicts):** the tenant FK is **`organizationId`** everywhere (Membership/ApiToken/RefreshToken included); URL segments may stay `:orgId` but resolve to `organizationId`. User uses **`name`** (not `displayName`). The timeline child is **`IncidentUpdate`** (drop `IncidentEvent`). Channel active flag is **`isActive`** (drop `enabled`). Channel/Incident secret + config columns are **`config String`** (no `configEnc`, no `Json`).

### 2.1 Shared unions (`packages/shared/src/constants.ts`)
```ts
export const MONITOR_TYPES = ['http','tcp','ping','dns','ssl','keyword','system'] as const;   // MVP: 'http' only
export const MONITOR_STATUS = ['up','down','pending','paused','maintenance'] as const;
export const HEARTBEAT_STATUS = { DOWN:0, UP:1, PENDING:2, MAINTENANCE:3 } as const;          // compact Int
export const USER_ROLES = ['admin','member','viewer'] as const;
export const ROLE_RANK = { viewer:0, member:1, admin:2 } as const;
export const CHANNEL_TYPES = ['telegram','slack','email','discord','webhook'] as const;        // MVP: 'telegram' only
export const TOKEN_TYPES = ['agent','api'] as const;
export const INCIDENT_STATUS = ['open','acknowledged','resolved'] as const;
export const INCIDENT_SEVERITY = ['minor','major','critical'] as const;
export const NOTIFY_EVENT_TYPES = ['down','up','repeat','test','cert-expiry','threshold'] as const;
```

### 2.2 Schema sketch (key models; sqlite datasource shown)
```prisma
generator client { provider="prisma-client" output="../src/generated-sqlite" moduleFormat="cjs" runtime="nodejs" }
datasource db   { provider="sqlite" url=env("DATABASE_URL") }   // postgres variant: provider="postgresql"

model Organization {
  id String @id @default(cuid())
  name String
  slug String @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  memberships Membership[]  projects Project[]  monitors Monitor[]
  notificationChannels NotificationChannel[]  statusPages StatusPage[]
  incidents Incident[]  apiTokens ApiToken[]
  @@index([slug])
}

model User {
  id String @id @default(cuid())
  email String @unique
  name String?
  passwordHash String          // argon2id via hash-wasm
  isActive Boolean @default(true)
  lastLoginAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  memberships Membership[]  refreshTokens RefreshToken[]  apiTokens ApiToken[]
}

model Membership {
  id String @id @default(cuid())
  userId String
  organizationId String
  role String @default("member")           // USER_ROLES
  user User @relation(fields:[userId], references:[id], onDelete:Cascade)
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  @@unique([userId, organizationId])
  @@index([organizationId]) @@index([userId])
}

model Project {
  id String @id @default(cuid())
  organizationId String
  name String  slug String
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  monitors Monitor[]
  @@unique([organizationId, slug]) @@index([organizationId])
}

model Monitor {
  id String @id @default(cuid())
  organizationId String                    // denormalized for single-index tenant filtering
  projectId String
  name String
  type String @default("http")             // MONITOR_TYPES
  config String                            // stringified JSON, type-specific
  intervalSeconds Int @default(60)
  retries Int @default(3)                   // maxRetries before DOWN (anti-flap)
  retryIntervalSeconds Int @default(30)
  timeoutMs Int @default(30000)
  isActive Boolean @default(true)
  // denormalized live state (engine writes; instant render — no heartbeat scan)
  status String @default("pending")        // MONITOR_STATUS  (was 'currentStatus' in S3 — aligned to 'status')
  lastCheckedAt DateTime?
  lastStatusChangeAt DateTime?             // ADDED for instant status-page render / recent-events
  lastResponseTime Int?
  uptime24h Float?  uptime7d Float?  uptime30d Float?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  project Project @relation(fields:[projectId], references:[id], onDelete:Cascade)
  heartbeats Heartbeat[]  statHourly StatHourly[]  statDaily StatDaily[]
  notifications MonitorNotification[]  incidents Incident[]  statusItems StatusPageItem[]
  apiTokens ApiToken[]                     // back-relation for agent tokens
  @@index([organizationId]) @@index([projectId]) @@index([organizationId, isActive])
}

model Heartbeat {
  id String @id @default(cuid())
  monitorId String
  status Int                               // HEARTBEAT_STATUS 0/1/2/3
  responseTime Int?
  statusCode Int?
  message String?
  important Boolean @default(false)        // true ONLY on confirmed transitions
  retryCount Int @default(0)
  coverageMs Int @default(0)               // ADDED: interval this beat 'covers' -> duration-weighted uptime
  createdAt DateTime @default(now())
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  @@index([monitorId, createdAt]) @@index([monitorId, important, createdAt]) @@index([createdAt])
}

// rollups: uptime%/charts read ONLY from these, never raw Heartbeat
model StatHourly {
  id String @id @default(cuid())
  monitorId String
  bucket DateTime                          // truncated to the hour (UTC)
  upCount Int @default(0)  downCount Int @default(0)  maintenanceCount Int @default(0)
  upMs Int @default(0)  downMs Int @default(0)        // ADDED: duration-weighted uptime source
  avgResponseTime Float?  minResponseTime Int?  maxResponseTime Int?   // canonical names (S3)
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  @@unique([monitorId, bucket]) @@index([monitorId, bucket])
}
model StatDaily { /* identical shape, bucket = day */ }

model NotificationChannel {
  id String @id @default(cuid())
  organizationId String
  name String
  type String                              // CHANNEL_TYPES (provider id)
  config String                            // stringified JSON; secret fields SecretBox-sealed (Section 6.7)
  isActive Boolean @default(true)
  isDefault Boolean @default(false)        // (merged from S4) auto-attach to new monitors
  lastError String?                        // (merged from S4)
  lastTestedAt DateTime?                   // (merged from S4)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  monitorLinks MonitorNotification[]
  @@index([organizationId])
}

model MonitorNotification {                 // composite PK (S2) + policy fields (merged from S4)
  monitorId String
  channelId String
  notifyOn String @default("down,up")      // CSV of NOTIFY_EVENT_TYPES
  resendEveryMin Int?                       // null = no repeat
  createdAt DateTime @default(now())
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  channel NotificationChannel @relation(fields:[channelId], references:[id], onDelete:Cascade)
  @@id([monitorId, channelId]) @@index([channelId])
}

model Incident {                            // S2 fields + S4 fields merged
  id String @id @default(cuid())
  organizationId String
  monitorId String
  status String @default("open")           // INCIDENT_STATUS
  severity String @default("major")        // INCIDENT_SEVERITY  (kept from S2)
  title String                              // kept from S2
  cause String?                             // merged from S4 (first failing message)
  startedAt DateTime @default(now())
  acknowledgedAt DateTime?  acknowledgedBy String?    // merged from S4
  resolvedAt DateTime?
  lastNotifiedAt DateTime?  notifyCount Int @default(0)  // merged from S4 (repeat cadence)
  isPublished Boolean @default(false)       // kept from S2 (public status page)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  updates IncidentUpdate[]
  @@index([organizationId, status]) @@index([monitorId, status])
}

model IncidentUpdate {                      // ONE timeline model (IncidentEvent deleted), S4 richer fields merged
  id String @id @default(cuid())
  incidentId String
  kind String                               // 'opened'|'notified'|'acknowledged'|'comment'|'resolved'
  message String?
  meta String?                              // stringified JSON (e.g. {channelId, providerMessageId, errorKind})
  status String?                            // incident status at time of update
  createdAt DateTime @default(now())
  incident Incident @relation(fields:[incidentId], references:[id], onDelete:Cascade)
  @@index([incidentId, createdAt])
}

model StatusPage {
  id String @id @default(cuid())
  organizationId String
  slug String @unique                       // nanoid(16), unguessable public segment
  title String  description String?  logoUrl String?  themeColor String?
  passwordHash String?                      // optional gate (argon2id)
  isPublished Boolean @default(false)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  items StatusPageItem[]
  @@index([organizationId]) @@index([slug])
}
model StatusPageItem {
  id String @id @default(cuid())
  statusPageId String  monitorId String
  displayName String?  groupName String?  sortOrder Int @default(0)   // curated -> never leak internal names
  statusPage StatusPage @relation(fields:[statusPageId], references:[id], onDelete:Cascade)
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  @@unique([statusPageId, monitorId]) @@index([statusPageId])
}

// ----- Auth/machine models (Section 6) — in the FIRST migration -----
model RefreshToken {
  id String @id @default(cuid())
  userId String
  tokenHash String @unique                  // sha256(opaque)
  family String                             // rotation family (reuse detection)
  expiresAt DateTime  revokedAt DateTime?
  userAgent String?  ip String?
  createdAt DateTime @default(now())
  user User @relation(fields:[userId], references:[id], onDelete:Cascade)
  @@index([userId])
}
model ApiToken {
  id String @id @default(cuid())
  name String
  type String                               // TOKEN_TYPES 'agent'|'api'
  tokenHash String @unique                  // sha256(secret); raw shown once
  prefix String                             // first 8 chars for UI
  organizationId String
  monitorId String?                         // agent tokens bind to one system-metric monitor
  scopes String                             // JSON-string array e.g. ["metrics:write"]
  createdById String?
  lastUsedAt DateTime?  expiresAt DateTime?  revokedAt DateTime?
  createdAt DateTime @default(now())
  organization Organization @relation(fields:[organizationId], references:[id], onDelete:Cascade)
  monitor Monitor? @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  @@index([organizationId]) @@index([prefix])
}
model SetupState { id String @id @default("singleton")  completedAt DateTime? }

// ----- System metrics (Phase 3) — see decision below -----
model MetricSample {                         // multi-value sample CANNOT fit a single-value Heartbeat
  id String @id @default(cuid())
  monitorId String
  bucket DateTime
  cpu Float?  memPct Float?  diskPct Float?  netInKbps Float?  netOutKbps Float?
  createdAt DateTime @default(now())
  monitor Monitor @relation(fields:[monitorId], references:[id], onDelete:Cascade)
  @@index([monitorId, createdAt])
}
```

### 2.3 System-metrics storage decision (RESOLVED fork)
A single-value `Heartbeat.responseTime` cannot hold CPU+RAM+disk+network simultaneously, so Section 3's "reuse heartbeat pipeline verbatim" is impossible for multi-value samples. **Decision:** add a dedicated **`MetricSample`** table. Because adding it later would contradict "all tables in the first migration," we **relax that principle to: all MVP + Phase-2 tables ship in the first migration; the Phase-3 `MetricSample` (and a `MaintenanceWindow`) ship via a single additive, non-destructive migration.** `MetricSample` rolls up/retains through the *same rollup mechanics* (its own hourly/daily aggregate later), reusing the anti-flap gate for threshold alerts — but not the literal `Heartbeat` row.

### 2.4 Indexing & retention
- Heartbeat indexes: `[monitorId,createdAt]` (charts/rollup window), `[monitorId,important,createdAt]` (last transition / incident logic), `[createdAt]` (purge sweep). Always order by `createdAt` (cuid is not strictly time-sortable).
- **Retention (canonical names + values, RESOLVED):** raw `Heartbeat` = **`PINGWATCH_RAW_RETENTION_DAYS` (default 7)**; `StatHourly` = **`PINGWATCH_HOURLY_RETENTION_DAYS` (default 90)** — hourly only ever backs the 90-day status-page bar, so 90d is the locked value (drops the 400 figure and the `PINGWATCH_KEEP_DATA_DAYS`/`keepDataPeriodDays` aliases); `StatDaily` = retained indefinitely. Settings UI (Section 5) uses these exact env names.
- Purge runs **only after** a successful aggregation pass per monitor (gated on watermark AND aggregation success — Section 3/Observability). Periodic SQLite `VACUUM` in a low-traffic window.

---

## 3. Monitoring Engine

Per-monitor, in-process scheduler. Zero external infra by default. The whole engine depends only on the `MonitorType` interface so Phase 2+ types are new files, no core edits. Lives in `apps/server/src/engine`; interfaces + enums in `packages/shared`.

### 3.0 Boot-time rehydration (ADDED — closes the named-but-unbuilt gap)
`startAll()` does NOT just "load active monitors and start." For each active monitor it:
1. Loads the **last `Heartbeat`** to restore `MonitorRuntime.status` to the **last CONFIRMED status** (never `pending`) and `retryCount=0` — a monitor mid-confirmation at crash resets to its last confirmed status, **not** pending, so a restart can't spuriously re-alert.
2. Backfills the in-memory **24h ring** from raw heartbeats within the 24h window (so 24h uptime is correct immediately after restart).
3. Schedules the first beat jittered.
This is a first-class MVP task and part of the DoD.

### 3.1 Plugin seam — `MonitorType` (in `packages/shared`)
```ts
export interface CheckResult { status:'up'|'down'; responseTimeMs:number; message:string; statusCode?:number; meta?:Record<string,string|number|boolean> }
export interface MonitorType<TConfig=unknown> {
  readonly type: string;
  readonly configSchema: ZodType<TConfig>;
  validateConfig(raw: unknown): TConfig;
  check(ctx: { signal: AbortSignal; config: TConfig; now: () => number }): Promise<CheckResult>;
}
```
Rules: `check()` returns `{status:'down'}` on unreachable target (must **not** throw — scheduler wraps defensively); must honor `ctx.signal` timeout; is **stateless** (no DB, retries, or flap logic). Registered via a Nest `MonitorTypeRegistry` (Map); each type is an `@Injectable()` registering itself in `onModuleInit`.

### 3.2 Scheduler — `InProcessScheduler` (MVP)
Each monitor owns a **recursive `setTimeout`** loop (never `setInterval` — avoids overlap/drift), registered in Nest `SchedulerRegistry`. First beat jittered `random(0, min(intervalMs, 5000))`. Lifecycle: monitor create→`start`, update→`restart`, delete/pause→`stop`. `@Cron`/`@Interval` decorators are reserved for the static rollup job only. `SchedulerStrategy` interface graduates to `BullMqScheduler` at Phase 4 via `PINGWATCH_SCHEDULER=bullmq`. **Hard rule (single-instance):** never run two `InProcessScheduler` instances behind a load balancer — `PINGWATCH_SEPARATE` splits only the web tier (Section 1.4).

### 3.3 HTTP/HTTPS executor (only MVP type) — `undici`
`performance.now()` timing; `AbortSignal.timeout(timeoutMs)`; status-range assertions (`2XX`/`200`/`200-299`); in-body keyword match (incl. inverted, with a ~1MB read cap); `ignoreTls` option; `maxRedirects` cap. Any network error → `{status:'down', message: err.code ?? err.message}`. (`axios` rejected.)

### 3.4 Concurrency & timeout
Global `p-limit` (`PINGWATCH_MAX_CONCURRENCY`, default 50) across all checks; hard per-check `AbortSignal` timeout (default 30s) so a hung target can't hold a slot.

### 3.5 Anti-flap confirmation gate (mandatory)
**Never alert on the first failed check.** State machine in `MonitorRuntime.applyResult`: `up→pending` on first down; `pending` counts up to `maxRetries` (rescheduling at the shorter `retryIntervalMs`); `pending→DOWN` only when retries exhausted → set `important=true`; recovery `down→up` → `important=true` (recover on first up by default — downtime cost is asymmetric). `important` heartbeats are the **sole contract** handed to Section 4; the engine never calls notification code directly — it emits an event. Optional `resendEveryNFails` re-flag signal for ongoing-incident re-notification.

### 3.6 Heartbeat write path
Per beat: insert one `Heartbeat` (with `coverageMs = intervalMs` for duration-weighted uptime); update in-memory 24h ring; **on confirmed transition only**, write denormalized `Monitor.status` + **`lastStatusChangeAt`** + `lastResponseTime`/`lastCheckedAt` (aligned to Section 2's actual columns — `currentStatus` renamed to `status`). All writes funnel through a **single serialized write path**; DB opened WAL+`synchronous=NORMAL`+`busy_timeout=5000`. A write failure logs but **never flips monitor status** (a DB hiccup is not an outage).

### 3.7 Uptime % — duration-weighted, never raw-scanned (RESOLVED gap)
`uptime% = Σ upMs / Σ(upMs + downMs)` over the window — **duration-weighted, not row-count**. The in-memory **24h ring stores per-beat `coverageMs`** so its math matches the rollups. `7d/30d` summed from `StatHourly`/`StatDaily` `upMs`/`downMs` (the columns added in Section 2). Cached on `Monitor.uptime24h/7d/30d`, pushed as deltas over the socket. This is what makes "never repeat Uptime-Kuma's raw-scan bug" actually true.

### 3.8 Rollups + retention
Single `@Cron('*/5 * * * *')`: per monitor, aggregate raw heartbeats newer than the per-monitor **watermark** into `StatHourly`/`StatDaily` (`upsert`, summing `upMs`/`downMs`/counts, recomputing avg/min/maxResponseTime), advance watermark, then **prune raw rows older than retention only if that monitor's aggregation pass succeeded** (hard gate beyond the watermark — Observability). Nightly `VACUUM` in a low-traffic window.

### 3.9 Later types (Phase 2+, additive, zero core changes)
TCP (`net`), DNS (`dns.promises` + `Promise.race` vs signal), SSL expiry (`tls.connect` → `valid_to`), ICMP ping (**unprivileged shell-out `ping` npm package**; `iputils-ping` in the image; raw-socket opt-in; recommend defaulting ICMP→TCP-connect), keyword (thin HTTP wrapper). **System metrics (Phase 3):** `systeminformation` behind a `MetricSource` interface, LOCAL self-sample + REMOTE `pingwatch-agent` push to an agent-token endpoint → writes **`MetricSample`** rows (not Heartbeat), reusing the rollup/retention/anti-flap *mechanics*.

---

## 4. Notification System (pluggable)

Two decoupled halves: **incident/alert lifecycle** (when to notify) and **providers** (how to deliver). They talk only via `NotificationProvider` + `NotificationEvent`. **Section 4 does NOT redefine schema** — it contributed `isDefault/lastError/lastTestedAt` (channel), `notifyOn/resendEveryMin` (join), `cause/lastNotifiedAt/notifyCount/acknowledgedBy` (incident), all now merged into Section 2 with Section 2's naming/typing winning (`config String`, `isActive`, `IncidentUpdate`).

### 4.1 Packages
`packages/notifications` (framework-free: `NotificationProvider` interface, `NotificationProviderRegistry` Map, templating, provider impls). `apps/server/src/notifications` (Nest wiring: `notification-dispatch.service`, `alert-policy.service`, `incident.service`, `incident.listener`, `channel-test.controller`).

### 4.2 Provider interface (LOCKED)
```ts
export interface SendResult { ok:boolean; errorKind?:'transient'|'permanent'; message?:string; providerMessageId?:string }
export interface NotificationProvider<TConfig=unknown> {
  readonly id: string;
  readonly meta: { label:string; description:string; icon?:string };
  readonly configSchema: ZodType<TConfig>;
  send(args:{ config:TConfig; event:NotificationEvent; rendered:{title:string; body:string} }): Promise<SendResult>;
}
```
Providers are **stateless**: get `{config,event,rendered}`, return `SendResult`; must not throw for normal failures, must not touch DB/scheduler/other providers. Adding one = a file + one `registry.register()`. `GET /api/notification-providers` exposes the registry so the frontend auto-generates config forms from each `configSchema`.

### 4.3 Incident lifecycle (state machine)
The engine emits exactly two **confirmed** (post-anti-flap) transitions: `monitor.transition {to:'down'}` and `{to:'up'}` via in-process `EventEmitter2` (`@OnEvent`). Rules: **one open incident per monitor** (idempotent find-or-create on confirmed DOWN — this *is* the structural debounce, no extra cooldown); DOWN notifies once to channels whose `notifyOn` includes `down`; UP resolves + notifies `up` channels (recovery always sent if any DOWN was sent — not configurable in MVP); **acknowledge** stops `repeat` but not recovery. Repeat/re-notify (`resendEveryMin`) and escalation are a single `@Cron(EVERY_MINUTE)` scanning open incidents — **schema-ready in MVP, cron logic in Phase 2/4**. The repeat cron must move behind the same single-instance/leader seam as the scheduler when scaling (Section 3/6).

### 4.4 Dispatch (delivery)
`dispatch(event, channelIds)`: load channels **filtered to the event's org**; skip `isActive=false`; parse `config` with the provider's schema (invalid → set `lastError`, skip, don't crash); render once; call `send()` with `AbortSignal.timeout(10s)` + **delivery retry** (2 retries on `transient` only, backoff 1s/4s; never on `permanent`); `p-limit(5)` across channels. Outcome persisted to `IncidentUpdate`/`channel.lastError`. **A failed notification never blocks the incident state machine.** (Delivery retry is transport-level; distinct from the engine's check-retry.)

### 4.5 Templating & providers
`{{token}}` substitution over a typed token map; built-in DOWN/UP templates; per-channel overrides Phase 2. Providers may build native payloads. **MVP: Telegram** over raw Bot API via `undici` (no SDK; MarkdownV2 escaping; 429/5xx→transient, 401/400→permanent; "send test" button). **Phase 2:** Slack (incoming webhook + Block Kit), SMTP (`nodemailer` — vetted CJS-friendly). **Phase 4:** Discord/Webhook/Teams/Pushover/Gotify/Twilio/WhatsApp — each one file.

### 4.6 Secrets
Channel `config` is a single `String` column holding stringified JSON; **secret fields are SecretBox-sealed** as `v1:<iv>:<tag>:<ciphertext>` (Section 6.7) — there is **no `configEnc` column**. API never returns raw secrets (redacted `••••`; unchanged placeholder on update = keep existing).

---

## 5. Frontend (Dashboard + Realtime + Public Status Pages)

`apps/web` — Next.js 15 App Router (React 19, TS strict, no `any`) + shadcn/ui + Tailwind v4, built `output:'standalone'` and embedded in Nest (single process, port 3001, no CORS). Two surfaces: authed **dashboard** (SSR + WebSocket deltas) and **public status pages** (anonymous, ISR/poll, no sockets). UI polish is the #1 priority: skeletons not spinners, optimistic updates, dark mode default.

### 5.1 Stack
Recharts (via shadcn `ChartContainer`), TanStack Query v5 (WS deltas patch the cache via `setQueryData`, never refetch), socket.io-client, react-hook-form + zod (schemas from `packages/shared`), Zustand (UI-only state), TanStack Table, lucide-react, next-themes, date-fns.

### 5.2 Routes
```
app/
├─ (public)/  login  setup  status/[slug] (ISR revalidate=30, Phase 3) + opengraph-image
└─ (dashboard)/  layout(auth+AppShell+SocketProvider+QueryProvider)
   └─ [org]/[project]/
       monitors (list, live) · monitors/new · monitors/[id] (detail+charts) · monitors/[id]/edit
       notifications (Telegram) · incidents (P3) · status-pages (P3) · settings(general+account; members P2)
```
Org/project segments exist from day one; MVP auto-selects the single seeded org and hides the switcher.

### 5.3 Realtime (RESOLVED gap)
Single shared socket.io connection in `SocketProvider`; **scoped subscriptions** (`subscribe {orgId, projectId}`), **deltas only** (`heartbeat`, `monitor:status`, `incident`). Handshake uses the **in-memory access token** via `socket.handshake.auth.token` (NOT the HttpOnly refresh cookie, which is `Path=/api/auth` and unavailable to `/ws`). **`auth-expired` handling (ADDED to MVP checklist):** on `auth-expired` (or 15-min expiry), call `/api/auth/refresh` then **silently re-handshake** — so the dashboard socket does not drop every 15 minutes. On disconnect → `ConnectionIndicator` "reconnecting"; on reconnect → TanStack Query `refetchOnReconnect` resyncs.

### 5.4 Key MVP screens
- **Monitors list** — SSR initial + live deltas; per-row `StatusBadge`, **`HeartbeatBar`** (signature component: colored beats, newest right, slide-in on socket event), 24h uptime, latency sparkline; search/filter; pause/resume/edit/delete (optimistic). Illustrated empty state.
- **Monitor detail** — 24h/7d/30d uptime cards (rollup-backed, frontend never recomputes), Recharts latency chart with range toggle (server picks raw vs hourly vs daily by `range`), 90-day HeartbeatBar, recent `important`-heartbeat events list.
- **Add/Edit monitor** — rhf+zod (`createMonitorSchema` from shared); type `<Select>` lists all but disables non-HTTP; **retries + retryInterval surfaced prominently**; "Test now" one-off check before save; NotificationChannel multi-select.
- **Notification channels** — list with enabled switch + "Send test"; add-channel dialog with **provider-driven form auto-generated from `configSchema`** (Telegram only enabled).
- **Settings** — general (app name, default interval, retention using `PINGWATCH_RAW_RETENTION_DAYS`/`PINGWATCH_HOURLY_RETENTION_DAYS` names), account (change password, theme). **login/setup** first-run screens.

### 5.5 Public status pages (Phase 3, designed now)
`(public)/status/[slug]` — anonymous, ISR `revalidate=30`, **no socket**. Data from a **curated public projection API** (`GET /api/public/status/:slug`) returning only published fields with opaque display ids (never internal `organizationId`/`monitorId`/config). Branded header, overall-status banner, grouped services with 90-day HeartbeatBar + uptime%, published incident timeline; OG image; light client poll for freshness. Editor (dashboard side, Phase 3).

### 5.6 Error handling contract
The frontend consumes the single error envelope `{ code:string; message:string; details?: ... }` from `packages/shared` (Section 6); TanStack Query error handling keys off `code` (e.g. `SETUP_REQUIRED` → redirect to `/setup`).

---

## 6. Auth & Security

Owns auth, RBAC, first-run setup, machine tokens, public-page access, rate limiting, secrets-at-rest, the REST/WS surface, the global error filter, and observability-of-self. Contributes the auth models (Section 2 owns them in the first migration).

### 6.1 Session model (LOCKED)
**Stateless JWT access token (HS256, 15 min) + opaque rotating refresh token** stored as `sha256` in `RefreshToken`, delivered as `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie. DB-backed refresh = real logout/revoke with zero extra infra; reuse of a revoked token revokes the whole `family` (theft signal). `Secure` auto-dropped on `localhost`-over-http (self-host without TLS).

### 6.2 Password & token primitives (RESOLVED native-module conflict)
**Password hashing: `hash-wasm` argon2id (pure WASM)** — preserves the zero-native-binary / multi-arch-trivial distribution thesis (no `argon2`/`@node-rs/argon2` native build, no per-arch prebuild matrix). Generic `401 INVALID_CREDENTIALS` + constant-time dummy verify (no enumeration). Opaque tokens: `crypto.randomBytes(32).toString('base64url')`, stored as `sha256` only; API/agent tokens formatted `pwt_<...>` with an 8-char `prefix` for UI.

### 6.3 First-run setup (no default password)
`SetupState` singleton gates **all** routes to `409 SETUP_REQUIRED` (except `GET /api/setup/state`, `POST /api/setup`, static) until `POST /api/setup {email,password,orgName?}` creates admin + default org + `Membership(admin)` + auto-login. Optional `PINGWATCH_ADMIN_EMAIL`/`PINGWATCH_ADMIN_PASSWORD` consumed once for unattended Docker. CLI prints the setup URL on first boot.

### 6.4 RBAC & guards
`@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)`. `OrgGuard` resolves `organizationId` (from `:orgId` param/body/token binding → field `organizationId`) and asserts membership; every downstream query is org-scoped (the tenant boundary). MVP seeds only `admin` (gate live, zero rewrites for Phase 2). Role matrix locked: viewer=read; member=+CRUD monitors/channels, ack incidents; admin=+users/roles/tokens/org settings/status pages. **A base Prisma extension/repository injects the `organizationId` filter** so a single missed filter can't leak cross-tenant (mitigation for app-layer isolation).

### 6.5 Machine auth
`Authorization: Bearer pwt_...` resolved in `JwtAuthGuard` before JWT parsing → look up `ApiToken` by `sha256`; reject if missing/revoked/expired; `lastUsedAt` write throttled ≤1/60s. **Agent** tokens → role `member` + `scopes:["metrics:write"]` + `monitorId` binding (`@RequireScope`/`ScopeGuard`); can only post metrics to their own monitor.

### 6.6 Public status pages
`nanoid(16)` slug; unpublished → `404` (not 403); optional argon2 password → short-lived per-slug `HttpOnly` cookie; **never a socket**; `Cache-Control: public, s-maxage=20, stale-while-revalidate=60`; rate-limited 60/min/IP; read-only curated projection.

### 6.7 Secrets at rest (RESOLVED column conflict)
Single `APP_SECRET` (env → `<dataDir>/secret.key` 0600 → auto-generate). Signs JWTs + HKDF-derives the data key. **Notification secrets are AES-256-GCM SecretBox-sealed and stored inside the existing single `config String` column** (per-secret-field sealing within the JSON) as `v1:<base64 iv>:<base64 tag>:<base64 ciphertext>` — **there is no `configEnc` column.** `SecretBox.seal/open` in `apps/server/src/crypto`. Versioned `v1:` enables future KMS/rotation. `secret.key` MUST be in the one-folder backup (docs warn).

### 6.8 Transport, CORS, rate limiting, errors
`helmet`; same-origin (CORS off by default; `PINGWATCH_CORS_ORIGINS` allowlist only for split mode); CSRF immunity via `SameSite=Lax` + bearer-header on state-changing routes. **`@nestjs/throttler` in-memory** (pluggable to Redis at Phase 4); named limiters (login 10/60s/IP, refresh 30/60s/IP, public 60/60s/IP, global 300/60s/principal); `trust proxy` documented. Global `ValidationPipe({whitelist,forbidNonWhitelisted,transform})`. **Global exception filter emits the one error envelope `{ code, message, details? }`** typed in `packages/shared` and consumed by Section 5.

### 6.9 Observability-of-self (ADDED — non-negotiable for a monitoring product)
1. **Logger:** `pino` via `nestjs-pino` — leveled, structured JSON logs.
2. **Self-status endpoint** (`GET /api/system`, authed) + liveness `GET /api/health` (unauthed): exposes **rollup-cron last-success timestamp**, scheduler active-monitor count, p-limit in-flight count.
3. **Purge hard-gate:** raw-heartbeat purge is skipped unless that monitor's aggregation pass succeeded (Section 3.8) — a failing cron can never purge un-aggregated data.

### 6.10 API surface (under `/api`, unversioned; `/api/v1` reserved)
`auth/{setup,login,refresh,logout,me,change-password}` · `orgs/:orgId/{members,projects,channels,status-pages,tokens}` · `projects/:projectId/monitors` · `monitors/:id` (+`/pause`,`/resume`,`/heartbeats?window=`,`/uptime`) · `projects/:projectId/incidents` + `incidents/:id` · `agent/{metrics,config}` (`@RequireScope('metrics:write')`) · `public/status/:slug` (+`/unlock`) · `health` · `system`. **WS** `/ws`: access token in handshake, `subscribe` verified by membership, scoped deltas only, `auth-expired` → client re-handshakes.

---

## 7. Phased Roadmap

- **Phase 1 (MVP):** monorepo + repo fix + CI guards; full multi-tenant **schema** (first migration) + two-provider generated clients; first-boot migrate+seed+rehydrate; SQLite WAL pragmas; auth (argon2id-wasm, JWT+DB-refresh, setup, single admin, guards wired admin-only); engine (HTTP type, InProcessScheduler, p-limit, anti-flap, serialized writer, rollups+retention, duration-weighted uptime); Telegram provider + incident open/resolve + dispatch; dashboard (monitors list+detail, add/edit, channels, settings, login/setup) + scoped realtime + `auth-expired` rehandshake; pino logging + `/api/system`; error envelope + global filter; minimal Docker image. Org/project switcher hidden.
- **Phase 2:** multi-org/project UI + switcher; remaining monitor types (TCP/ping/DNS/SSL/keyword — unlock existing UI); Slack + SMTP providers; member/viewer RBAC enforcement + members UI + invites; repeat/re-notify cron; per-channel template overrides; Postgres path hardening/validation; charts polish.
- **Phase 3:** system metrics (`MetricSample` additive migration, `systeminformation` LOCAL + `pingwatch-agent` REMOTE push); public status pages + editor (logo upload via data-dir static path, decided in this phase) + OG images; incidents UX + timeline; maintenance windows (`MaintenanceWindow` additive migration, suppress alerts).
- **Phase 4 (scale/distribution):** npm publish + multi-arch Docker publish (`pingwatch/pingwatch` namespace TBD); BullMQ scheduler (`PINGWATCH_SCHEDULER=bullmq`) + Redis throttler store + leader-elected repeat cron; escalation policies; Discord/Webhook/Teams/Pushover/Gotify/Twilio/WhatsApp; reverse-proxy/SSO auth; KMS secret backend; YAML import/export (`pingwatch import`); token scopes/rotation UI.

---

## 8. MVP Definition of Done (objective gate)

1. `rm -rf` nested repo done; **exactly one `.git` at root**; first commit made; CI single-git guard green.
2. `npx pingwatch` (or `node dist/cli.js start`) on a clean temp data-dir: **migrate + seed + listen on 3001** in one command, no external infra — proven by an automated smoke test.
3. Nest serves `/api`, the socket gateway, AND the embedded Next dashboard with **CSS/JS loading correctly** (no double-parse hang, `_next/static` served).
4. SQLite opens WAL+`busy_timeout`; sustained monitoring produces **no `SQLITE_BUSY` false-DOWN**.
5. First-run `/setup` creates the admin (no default password); login/refresh/logout work; secrets are **never** returned raw.
6. HTTP monitor: create/edit/pause/delete; **anti-flap proven** — a single transient failure does NOT alert; DOWN fires only after `retries` exhausted; recovery alerts.
7. Telegram channel: configured (token **sealed** in `config`), "send test" succeeds, real DOWN/UP alerts delivered.
8. Incident auto-opens on confirmed DOWN, auto-resolves on UP; one-open-incident-per-monitor holds.
9. Dashboard shows **live heartbeat bars** via scoped socket deltas (cache-patched, no polling); socket survives 15-min token expiry via `auth-expired` re-handshake.
10. Uptime 24h/7d/30d shown, **duration-weighted, read only from rollups/in-memory ring** — never a raw `Heartbeat` scan (verified on a large seeded DB).
11. **Boot rehydration** verified: restart restores last confirmed status + 24h ring; no spurious re-alert for a monitor that was mid-confirmation.
12. Rollup cron runs; **raw purge is hard-gated on successful aggregation**; `/api/system` exposes cron last-success + active-monitor count; pino structured logs present.
13. CI green: lint, type-check (no `any`), unit (anti-flap state machine), **schema↔zod contract test**, **both-providers migrate**, **no `enum `/` Json` in schema**, smoke test.

**Explicitly OUT of MVP:** multi-org UI, TCP/ping/DNS/SSL/keyword, Slack/SMTP, system metrics/agent, public status pages, RBAC enforcement UI, BullMQ, Postgres validation, declarative YAML import, npm publish. (Minimal Docker image is IN; publishing it is Phase 4.)



---

# Appendix A — MVP Build Sequence (T0–T17)

- T0 — Fix repo: rm -rf the orphaned ./pingwatch nested .git, run `git init -b main` at the root, add baseline files (.gitignore, .nvmrc, package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json), first commit.
- T1 — Scaffold monorepo: pnpm workspaces + Turborepo; create apps/{server,web} and packages/{shared,db,monitor-core,notifications} package skeletons with strict tsconfig (no any). Add .github/workflows/ci.yml with the single-git, no-enum/no-Json, and lint/type-check guards.
- T2 — packages/shared: union constants (MONITOR_TYPES, MONITOR_STATUS, HEARTBEAT_STATUS, USER_ROLES, ROLE_RANK, CHANNEL_TYPES, TOKEN_TYPES, INCIDENT_*), zod schemas (createMonitorSchema, channel configs), MonitorType + NotificationProvider interfaces, NotificationEvent, and the error envelope { code, message, details? }.
- T3 — packages/db: author the single canonical Prisma model (Section 2) in sqlite + postgres schema folders (identical model, swapped datasource). Add upMs/downMs/coverageMs, Monitor.lastStatusChangeAt, merged channel/incident/join fields, RefreshToken/ApiToken/SetupState/MetricSample. Generate BOTH provider clients (generated-sqlite, generated-postgres) and the runtime selector in src/index.ts. Create the first migration for both. Add the migrate-both + schema↔zod CI jobs.
- T4 — CLI + bootstrap: cac-based dist/cli.js (start/migrate/--port=3001/--data-dir/--config); config resolution (flag>env>cosmiconfig runtime-knobs-only>default); ensure data dir + generate/persist secret.key (0600); select schema/client by DATABASE_URL; run `prisma migrate deploy`; apply SQLite WAL pragmas on connect.
- T5 — Single-process embed (highest risk, spike first): apps/web Next 15 + shadcn/Tailwind, output:'standalone'; next-host.ts embedding next().getRequestHandler(); main.ts wiring (bodyParser:false, /api prefix, express.static for _next/static + public, socket gateway, catch-all LAST). Verify dashboard loads WITH CSS/JS.
- T6 — Auth core: hash-wasm argon2id helpers, JWT (HS256) access + opaque DB-refresh token (sha256, rotation family, reuse detection), HttpOnly SameSite=Lax cookie; SecretBox AES-256-GCM (v1: envelope) using APP_SECRET; global ValidationPipe, helmet, pino/nestjs-pino logger, global exception filter emitting the shared error envelope.
- T7 — First-run setup + login: SetupState gate (409 SETUP_REQUIRED); POST /api/setup creates admin+default org+project+Membership(admin)+seed; login/refresh/logout/me; JwtAuthGuard+OrgGuard+RolesGuard wired (admin-only exercised); base Prisma extension injecting organizationId filter.
- T8 — Engine interfaces + HTTP type: MonitorTypeRegistry (Nest DI); http.monitor.ts on undici (timing, AbortSignal timeout, status-range + keyword assertions, redirects, ignoreTls); p-limit concurrency gate.
- T9 — Scheduler + anti-flap: InProcessScheduler (recursive setTimeout via SchedulerRegistry, jittered first beat, CRUD lifecycle hooks); MonitorRuntime.applyResult confirmation state machine (retries -> important flag); unit-test the state machine.
- T10 — Heartbeat writer + rollups + uptime: serialized write path (Heartbeat w/ coverageMs, denormalized Monitor.status/lastStatusChangeAt on confirmed transitions); in-memory 24h ring (coverageMs-weighted); RollupService @Cron('*/5 * * * *') aggregating upMs/downMs/counts/avg-min-max into StatHourly/StatDaily with per-monitor watermark; purge hard-gated on successful aggregation; nightly VACUUM; cached uptime24h/7d/30d.
- T11 — Boot rehydration (closes the gap): startAll() restores each monitor's last CONFIRMED status (not pending) + retryCount=0 from last Heartbeat, and backfills the 24h ring from raw heartbeats in-window before scheduling. Test restart-mid-confirmation does not re-alert.
- T12 — EngineEvents + Telegram + incidents: emit confirmed monitor.transition {to} via EventEmitter2; NotificationProviderRegistry + TelegramProvider (raw Bot API over undici, MarkdownV2 escaping, transient/permanent mapping); incident.listener find-or-create/resolve one-open-incident-per-monitor; notification-dispatch (org-scoped, 10s timeout, 2x transient retry, p-limit 5, IncidentUpdate/lastError persistence); POST /api/channels/:id/test.
- T13 — Observability-of-self: /api/health (liveness) + /api/system (authed) exposing rollup-cron last-success, active-monitor count, p-limit in-flight; structured pino logs at key engine/auth events.
- T14 — Dashboard shell + data layer: (dashboard) layout (auth guard, AppShell, QueryProvider), TanStack Query, shadcn primitives, status CSS-var tokens, StatusBadge/HeartbeatBar/UptimeStat/LatencySparkline, dark mode default, login/setup pages.
- T15 — Realtime: SocketProvider (single socket.io-client, access token in handshake.auth), scoped subscribe/unsubscribe, delta handlers patching TanStack Query cache (setQueryData, no refetch), ConnectionIndicator, refetchOnReconnect, and auth-expired -> /api/auth/refresh -> silent re-handshake.
- T16 — MVP screens: monitors list (live), monitor detail (rollup-backed 24h/7d/30d + Recharts latency by range + 90d HeartbeatBar + recent important events), add/edit monitor (HTTP-only with prominent retries/retryInterval + Test-now + channel multi-select), notification channels (Telegram, schema-driven form), settings (general w/ retention env names + account).
- T17 — Distribution + gate: minimal multi-stage Dockerfile (node:22-bookworm-slim, iputils-ping, pnpm deploy prune, VOLUME /data, EXPOSE 3001, ENTRYPOINT cli start) + docker-compose.yml; verify pruned /out boots; `pingwatch start` smoke test in CI; run the full 13-point DoD; commit (confirm git author first).


---

# Appendix B — Locked Key Decisions

1. Repo root is ~/Desktop/Work/hack/pingwatch itself (one .git at root); rm -rf the orphaned 0-commit nested ./pingwatch then git init -b main. CI guard fails on any nested .git.
2. Monorepo = pnpm workspaces + Turborepo. Layout: apps/{server(NestJS CJS, runtime host), web(Next ESM, build input)}, packages/{shared, db, monitor-core, notifications}. packages/shared is the strict wire contract imported by both apps; packages/db only by server.
3. Single process, single port (3001 locked project-wide): Nest (Express adapter) embeds Next via next().getRequestHandler(); bodyParser:false + /api-scoped parsers + express.static for _next/static + catch-all LAST. PINGWATCH_SEPARATE splits ONLY the web tier; the server/scheduler tier is strictly single-instance until BullMQ (Phase 4).
4. One published npm package `pingwatch` (bin -> dist/cli.js) + Docker. Bundles built server + built web standalone + packages/db (both schemas, both migration folders, BOTH provider-generated clients) + prisma CLI runtime dep. End users never build.
5. Prisma 7 prisma-client generator, rust-free CJS, runtime nodejs. TWO committed generated clients (generated-sqlite, generated-postgres) selected at boot by DATABASE_URL via a thin re-export — resolves the single-client-invalid-for-Postgres gap.
6. Multi-tenant schema from the first migration (Organization->Project->Monitor->Heartbeat), organizationId denormalized for single-index tenant filtering. App-layer isolation via a base Prisma extension that injects organizationId; no RLS, no per-tenant DB.
7. Prisma schema (Section 2) is the SINGLE source of truth; Sections 4 & 6 only contribute fields. Conflicts resolved: organizationId everywhere (not orgId), User.name (not displayName), IncidentUpdate (IncidentEvent deleted), NotificationChannel.isActive + config String (not enabled / Json / configEnc). No DB enums, no native Json (CI-enforced) for SQLite/Postgres parity.
8. Rollups store duration-weighted upMs/downMs (added to StatHourly/StatDaily) and Heartbeat stores coverageMs; uptime% = Σ upMs / Σ(upMs+downMs), never a raw-heartbeat scan. The in-memory 24h ring is coverageMs-weighted to match. This is what avoids Uptime Kuma's raw-scan bug.
9. Engine: one MonitorType (HTTP via undici) + one InProcessScheduler (recursive setTimeout via SchedulerRegistry, never setInterval) in MVP, both behind plugin/strategy seams. p-limit global concurrency (50) + hard per-check AbortSignal timeout. BullMqScheduler is a Phase-4 env flip.
10. Anti-flap mandatory: never alert on first failure; up->pending->DOWN only after maxRetries; important=true ONLY on confirmed transitions and is the SOLE contract to the notification layer (engine never calls notify code). Boot rehydration restores last CONFIRMED status (not pending) + 24h ring, so restarts don't re-alert.
11. All heartbeat writes funnel through one serialized write path; SQLite opened WAL + synchronous=NORMAL + busy_timeout=5000 to eliminate SQLITE_BUSY false-DOWN; a write failure logs but never flips status. Engine writes denormalized Monitor.status + lastStatusChangeAt (aligned to Section 2's real columns; no 'currentStatus').
12. Retention canonicalized: PINGWATCH_RAW_RETENTION_DAYS=7 (raw Heartbeat), PINGWATCH_HOURLY_RETENTION_DAYS=90 (StatHourly), StatDaily forever. Single env-name set used in Sections 2/3/5. Raw purge is HARD-gated on a successful per-monitor aggregation pass (not just the watermark).
13. Notifications: framework-free packages/notifications with a stateless NotificationProvider (config/event/rendered -> SendResult{transient|permanent}); Map registry exposed via GET /api/notification-providers so the frontend auto-generates config forms from zod configSchema. MVP = Telegram (raw Bot API, no SDK). One-open-incident-per-monitor IS the debounce. Delivery retry (transport) is separate from engine check retry.
14. Auth = JWT access (HS256, 15 min) + opaque rotating DB-refresh token (sha256, HttpOnly SameSite=Lax cookie) for real revoke with zero infra. Password hashing = hash-wasm argon2id (pure WASM, ZERO native binary) — preserves the npx/multi-arch thesis; native argon2 rejected. Guards JwtAuthGuard->OrgGuard->RolesGuard wired; only admin seeded in MVP, role matrix locked.
15. Secrets at rest: single APP_SECRET (env > <dataDir>/secret.key 0600 > generated) signs JWTs + HKDF-derives the data key. Notification secrets AES-256-GCM SecretBox-sealed as v1:<iv>:<tag>:<ciphertext> INSIDE the single config String column — no configEnc column. secret.key MUST be in backups.
16. Frontend: Next 15 App Router + shadcn/ui + Tailwind v4, embedded in Nest (no CORS). Recharts + TanStack Query (WS deltas patch cache via setQueryData, no polling). Single scoped socket.io connection, deltas only (never full-state broadcast), handshake uses the in-memory access token; auth-expired -> /api/auth/refresh -> silent re-handshake. Public status pages are ISR + curated projection, NEVER sockets.
17. System metrics get a dedicated MetricSample table (a single-value Heartbeat can't hold CPU+RAM+disk+net). 'All tables in first migration' is relaxed to 'all MVP+Phase-2 tables in first migration; Phase-3 MetricSample/MaintenanceWindow via a single additive non-destructive migration'.
18. Observability-of-self is in MVP: pino/nestjs-pino structured logs, /api/health (liveness) + /api/system (rollup-cron last-success, active-monitor count, p-limit in-flight). A single error envelope { code, message, details? } in packages/shared + a Nest global exception filter consumed by the frontend.
19. Testing/CI is authored, not promised: vitest for framework-free packages/*, anti-flap state-machine unit test, schema<->zod contract test (kills cross-section drift), both-providers-migrate job, no-enum/no-Json + single-.git guards, and a `pingwatch start` smoke test on a temp data-dir (migrate+seed+listen).
20. cosmiconfig file is scoped to runtime/infra knobs ONLY in MVP (port, dataDir, scheduler, retention, concurrency); declarative monitor-as-config (Gatus YAML) deferred to a `pingwatch import` one-shot CLI command so the DB stays the single source of truth (no auto-reconcile-on-boot).


---

# Appendix C — Open Questions for Owner

1. Git commit author: the machine is configured as 'Amit Tank <amit@techvooot.com>' but the project owner is koen@revivesharing.com. Which identity should author the first and subsequent PingWatch commits?

2. npm package + Docker registry namespace for Phase-4 publish: confirm ownership/name for the npm package `pingwatch` and the Docker image namespace (Docker Hub `pingwatch/pingwatch` vs ghcr.io/<you>/pingwatch).

3. Token lifetimes: access token 15 min + refresh 30 days sliding-with-rotation is proposed — acceptable for your self-host UX, or do you want longer/shorter?

4. Default monitor knobs shown to users: interval 60s, timeout 30s, maxRetries 3, retryInterval 30s, recover-on-first-up. Confirm these defaults or adjust.

5. StatHourly retention is locked to 90 days (hourly only backs the 90-day status bar). Confirm 90d is enough, or do you want a longer hourly window (at higher storage cost)?

6. Optional reverse-proxy/SSO header auth (Authelia/Authentik/OIDC) as a documented escape hatch: do you want it noted for MVP docs, or strictly Phase 4?

