# Phase 1 — Standards Audit Report

_5-dimension adversarial audit run before Phase 2. Verdict: ship to Phase 2 after the 3 fix-now items (done — see commit). The table below is the Phase 2 cleanup backlog._

This is a synthesis/review task — no tools needed, the findings are already gathered. Here is the verdict report.

---

# PingWatch Phase 1 — Standards-Compliance Verdict

## Overall Verdict: **SHIP TO PHASE 2 — with 3 fix-now items first**

The codebase is a genuinely solid MVP. Core auth/crypto, tenant isolation, and the write/rollup data path are sound, with no crashes or silent data loss in steady state. The standards violations cluster into two themes: (1) the shared wire contract exists but the frontend bypasses it, and (2) a few user-visible correctness gaps (broken dark mode, swallowed errors). None are architectural rewrites. Three items are user-facing or correctness bugs that should be fixed before Phase 2 builds on top of them; the rest are legitimate, low-risk Phase 2 cleanups or acceptable MVP trade-offs.

## Fix Now vs. Defer to Phase 2

| Sev | Issue | File | Verdict | Recommendation |
|-----|-------|------|---------|----------------|
| HIGH | Dark-mode toggle does nothing (Tailwind v4 missing `@custom-variant dark`); light-OS users get mismatched theme | `apps/web/src/app/globals.css` | **Fix now** | Add `@custom-variant dark (&:where(.dark, .dark *));` and drive body bg/fg off `.dark` class, not OS media query |
| HIGH | Scheduler restart-during-in-flight-check race: stale tick mutates new runtime + clobbers freshly-armed timer; reachable via normal monitor edit/toggle | `apps/server/.../engine/scheduler.service.ts` | **Fix now** | Add a per-monitor generation/epoch token; bail the stale tick unless its epoch still matches |
| HIGH | Pause/resume + delete mutations have no `onError` — destructive delete can fail silently | `apps/web/.../monitors/[id]/page.tsx` | **Fix now** | Add `onError` surfacing the message (mirror `setError` pattern); delete failing silently is the worst case |
| HIGH | Frontend never imports `@pingwatch/shared` — hand-redeclares `AuthUser`, `ErrorEnvelope`, `MonitorStatus` (drift the package was built to prevent) | `apps/web/src/lib/api.ts` | **Defer (early P2)** | Import canonical types from shared; delete local copies. Not user-visible yet, but do it before P2 expands the contract |
| MED | Server vs web `MonitorView` already diverge (`Date` vs `string`, `unknown` vs object) — wire contract enforced by parallel declarations, not types | `apps/web/src/lib/api.ts` | **Defer (early P2)** | Promote view/response shapes into shared (ISO-string dates); map server internal types at controller boundary |
| MED | No security headers on Next-served dashboard HTML (clickjacking/nosniff/referrer) — helmet only on `/api` | `apps/web/next.config.ts` | **Defer** | Add `headers()` returning `X-Frame-Options`/CSP `frame-ancestors`, `nosniff`, `Referrer-Policy` |
| MED | No rate limiting on login/setup — unbounded brute force; `RATE_LIMITED` envelope already wired but never produced | `apps/server/.../auth.controller.ts` | **Defer** | Add `@nestjs/throttler`, ~5/min on login + setup, map to existing 429 envelope |
| MED | `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` disabled for all of web, overriding base strict flags | `apps/web/tsconfig.json` | **Defer** | Re-enable at least `noUncheckedIndexedAccess` (no Next conflict); scope any genuinely-needed relaxation narrowly with a comment |
| MED | Config JSON round-trip reimplemented inline in 3 places; shared `parseMonitorConfig` has zero call sites | `apps/server/.../monitor-engine.service.ts` | **Defer** | Add a `safeParseConfig` helper to shared, call from all 3 sites; wire or delete the dead `parseMonitorConfig` |
| MED | Query errors masked as empty state ("No monitors yet" on fetch failure); detail page stuck on "Loading…" forever | `apps/web/.../monitors/page.tsx`, `channels/page.tsx`, `[id]/page.tsx` | **Defer** | Destructure `isError`/`error`, render an explicit error state with retry, distinct from empty |
| MED | Channel `test` mutation has no `onError` — failed test looks like a no-op | `apps/web/.../channels/page.tsx` | **Defer** | Add `onError` writing a "Failed: …" result next to the channel |
| MED | Icon-only delete button has no accessible name; no aria attributes anywhere in web app | `apps/web/.../monitors/[id]/page.tsx` | **Defer** | Add `aria-label="Delete monitor"`; mark decorative lucide icons `aria-hidden` |
| LOW | `MonitorRecord` is a hand-written parallel of the Prisma model (drift surface) | `apps/server/.../monitor.service.ts` | **Defer** | Derive from Prisma (`Prisma.MonitorGetPayload` / `import('@pingwatch/db').Monitor`) |
| LOW | Org resolved via `findFirst` with no ordering — non-deterministic once multi-org exists (not exploitable today) | `jwt-auth.guard.ts`, `auth.service.ts`, `realtime.service.ts` | **Defer** | Carry `organizationId` in JWT claims + `findUnique`; or add stable `orderBy` + document single-membership invariant |
| LOW | Telegram bot token in URL could leak into `lastError`/logs on a URL-bearing error (secret-at-rest exfil path) | `packages/notifications/.../telegram.provider.ts` | **Defer** | Redact `/bot<token>/` before persisting/logging; prefer header/body over URL interpolation |
| LOW | Heartbeat bar uses magic int keys `{1,0,2,3}` and disagrees on shades with status-badge (user-visible color mismatch) | `apps/web/src/components/heartbeat-bar.tsx` | **Defer** | Key off `HEARTBEAT_STATUS`; factor one shared `STATUS_COLORS` map |
| LOW | HTTP method list hardcoded in form, copy of shared `HTTP_METHODS` (can drift from server zod enum) | `apps/web/src/components/monitor-form.tsx` | **Defer** | Export `HTTP_METHODS` from shared, import in the form |
| LOW | Ring mutated before awaited DB writes — in-memory uptime drifts from DB on repeated write failures | `apps/server/.../heartbeat-writer.service.ts` | **Defer** | Push to ring only after `heartbeat.create` succeeds |
| LOW | Incident transition DB work can fail silently (framework catch-all, `suppressErrors`) — confirmed outage dropped with only a generic log line | `apps/server/.../incident.listener.ts` | **Defer** | Wrap body in explicit try/catch with a dedicated `Logger` incl. monitorId + direction |
| LOW | `<Link><Button></Link>` produces invalid `<a><button>` — hydration warnings + inconsistent AT semantics | `apps/web/.../monitors/page.tsx`, `[id]/page.tsx` | **Defer** | Use `buttonVariants()` on `<Link>` (shadcn `asChild` pattern) instead of nesting |
| LOW | `<select id="method">` missing focus-visible ring (weaker keyboard focus than Input/Button) | `apps/web/src/components/monitor-form.tsx` | **Defer** | Add `focus-visible:ring-2 …`, or factor a shared `Select` |
| NIT | No-op `as UserRole` cast (target is `string`) | `apps/server/.../auth.service.ts:74` | **Defer** | Drop the cast; optionally tighten `AuthUser.role` to `UserRole` in shared |
| NIT | `heartbeatToMonitorStatus` / `monitorStatusToHeartbeat` exported but dead; status int re-derived inline | `packages/shared/src/constants.ts` | **Defer** | Use the helpers or remove the dead one |
| NIT | `orgByMonitor` cache never evicted — unbounded growth over process lifetime | `apps/server/.../realtime.service.ts` | **Defer** | Invalidate the entry on monitor stop/delete |
| NIT | Hand-rolled UI primitives instead of shadcn; no shared `Select`/`Toast` | `apps/web/src/components/ui.tsx` | **Acceptable MVP** | Keep primitives; add shared `Select` + `Toast`/inline-error so the fixes above land consistently |

## Closing Assessment

**Standards are substantially followed; this is not a "stop the line" situation.** The strongest part of the codebase — auth, crypto, tenant scoping, and the data-write path — holds up to scrutiny. The most material standards *violation* is a DRY/consistency one: a shared wire-contract package was deliberately created and then ignored by the frontend, with the server and web `MonitorView` types already drifting. That is worth fixing early in Phase 2 because every new endpoint widens the gap.

The three **fix-now** items are correctness/UX, not architecture: the dark-mode toggle is shipped broken, the scheduler has a real (if narrow) race reachable by ordinary admin actions, and destructive delete can fail with zero user feedback. They are small, localized fixes.

Everything else is honest Phase 2 housekeeping — security hardening (headers, rate limiting), re-enabling the two strict TS flags, consolidating the duplicated helpers, and a batch of error-state/a11y polish best done together once a shared `Toast`/`Select` primitive exists. The hand-rolled UI primitives are a reasonable MVP trade-off, not a violation, despite the global CLAUDE.md "shadcn only" rule — but note that rule explicitly, and plan to reconcile it (adopt shadcn or get sign-off on the lightweight primitives) rather than let it drift silently.

**Verdict: proceed to Phase 2 after clearing the three fix-now items.**

## Fixed now (this commit)
- Dark-mode `@custom-variant dark` (globals.css) — toggle now works
- Scheduler restart-during-in-flight race — per-monitor generation token (verified: no leaked timer)
- Pause/resume + delete mutations now surface errors (no silent destructive failure)
- Frontend now imports the `@pingwatch/shared` wire contract (no more hand-redeclared types)
