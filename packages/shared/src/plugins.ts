/**
 * The two plugin seams that keep PingWatch extensible: `MonitorType` (how a check runs) and
 * `NotificationProvider` (how an alert is delivered). Both are STATELESS — no DB, no retries,
 * no flap/incident logic (that lives in the engine/dispatch layers) — see PLAN §3.1 and §4.2.
 *
 * `configSchema` is typed `ZodType<TConfig, ZodTypeDef, unknown>` (Input = unknown): zod schemas
 * with defaults/optionals have Input ≠ Output, so the naive `ZodType<TConfig>` (Input = TConfig)
 * would reject every real schema. `unknown` input also matches `validateConfig(raw: unknown)`.
 *
 * Note: the string-union of monitor types is `MonitorTypeId` in ./constants; `MonitorType` here
 * is the executor interface. `MonitorType.type` is pinned to `MonitorTypeId` so a registry Map is
 * key-safe and the compiler can prove every type has (or deliberately lacks) an implementation.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import type { ChannelType, MonitorTypeId } from './constants';
import type { NotificationEvent } from './notification';

// ───────────────────────── MonitorType ─────────────────────────

/** Result of a single check. Executors return `{status:'down'}` on failure; they never throw. */
export interface CheckResult {
  status: 'up' | 'down';
  responseTimeMs: number;
  message: string;
  statusCode?: number | undefined;
  /** Ephemeral diagnostic bag (never persisted) — e.g. resolved host, cert days remaining. */
  meta?: Record<string, string | number | boolean> | undefined;
}

export interface MonitorCheckContext<TConfig> {
  /** Aborted when the per-check timeout elapses; executors MUST honour it. */
  signal: AbortSignal;
  config: TConfig;
  /** Injected clock (monotonic ms) so executors stay testable. */
  now: () => number;
}

export interface MonitorType<TConfig = unknown> {
  readonly type: MonitorTypeId;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  validateConfig(raw: unknown): TConfig;
  check(ctx: MonitorCheckContext<TConfig>): Promise<CheckResult>;
}

// ───────────────────── NotificationProvider ─────────────────────

/** Result of a single delivery attempt. `transient` errors may be retried; `permanent` may not. */
export interface SendResult {
  ok: boolean;
  errorKind?: 'transient' | 'permanent' | undefined;
  message?: string | undefined;
  providerMessageId?: string | undefined;
}

export interface NotificationRendered {
  title: string;
  body: string;
}

export interface NotificationProviderMeta {
  label: string;
  description: string;
  icon?: string | undefined;
}

export interface NotificationSendArgs<TConfig> {
  config: TConfig;
  event: NotificationEvent;
  rendered: NotificationRendered;
}

export interface NotificationProvider<TConfig = unknown> {
  readonly id: ChannelType;
  readonly meta: NotificationProviderMeta;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  send(args: NotificationSendArgs<TConfig>): Promise<SendResult>;
}
