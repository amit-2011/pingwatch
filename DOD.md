# Phase 1 (MVP) — Definition of Done

Status of the 13-point objective gate from `PLAN.md` §8. Every item was verified during the task
that delivered it (see the task commit), and the CI smoke test re-checks boot on every push.

| # | Gate | Status | Verified by |
|---|------|--------|-------------|
| 1 | Single `.git` at root; CI single-git guard green | ✅ | T0 + CI guard |
| 2 | `pingwatch start` on a clean data-dir: migrate + listen in one command, no external infra | ✅ | T4 + CI smoke |
| 3 | Nest serves `/api`, the socket gateway, AND the embedded Next dashboard with CSS/JS loading | ✅ | T5 (curl 200 text/css + application/javascript) |
| 4 | SQLite opens WAL + busy_timeout; no `SQLITE_BUSY` false-DOWN | ✅ | T4 (`journal_mode=wal` confirmed) |
| 5 | First-run `/setup` creates the admin (no default password); secrets never returned raw | ✅ | T7 + T12 (sealed `v1:`, redacted) |
| 6 | HTTP monitor CRUD; **anti-flap proven** — a single transient failure does NOT alert | ✅ | T9 (state-machine unit test) |
| 7 | Telegram channel configured (token sealed), "send test" works, DOWN/UP delivered | ✅ | T12 (mock Bot API) |
| 8 | Incident auto-opens on confirmed DOWN, auto-resolves on UP; one-open-per-monitor | ✅ | T12 |
| 9 | Dashboard shows **live heartbeat** via scoped socket deltas (cache-patched, no polling) | ✅ | T15 (socket delta e2e) |
| 10 | Uptime 24h/7d/30d shown, **duration-weighted**, read only from rollups/ring (never raw scan) | ✅ | T10 (upMs/downMs) |
| 11 | **Boot rehydration** — restart restores last confirmed status; no spurious re-alert | ✅ | T11 (unit test) |
| 12 | Rollup cron runs; **raw purge hard-gated on aggregation**; `/api/system` + pino logs | ✅ | T10 + T13 |
| 13 | CI green: lint, type-check (no `any`), build, single-git + no-`enum`/`Json` guards, smoke | ✅ | CI (`.github/workflows/ci.yml`) |

## Deferred to later phases (explicitly out of MVP)

- Postgres **migrations** (schema + client kept in parity; validated in **P2.7**)
- schema↔zod + both-providers-migrate CI jobs (**P2.7**)
- Constant-time dummy verify on login not-found path; `OrgGuard` param-based org resolution + base
  Prisma org-filter extension (**P2.2**)
- Multi-org UI, TCP/Ping/DNS/SSL/keyword, Slack/SMTP, system metrics, public status pages, BullMQ,
  npm/Docker **publish** (Phase 2–4)
