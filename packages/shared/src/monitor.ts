/**
 * Per-type monitor config schemas + the create/update monitor DTOs (PLAN §3.3, §5.4).
 * MVP validates only the `http` type; every later monitor type adds ONE branch to
 * `createMonitorSchema` + one entry in `MONITOR_CONFIG_SCHEMAS` + one executor in
 * @pingwatch/monitor-core — no other code changes.
 *
 * Discriminator lives at the TOP level (`type`), matching the Prisma `Monitor.type` column 1:1;
 * `config` holds only the type-specific fields (persisted as the `Monitor.config` JSON string).
 * `type` is never duplicated inside `config` — single source of truth, no drift.
 *
 * Defaults match the owner-confirmed knobs: interval 60s, timeout 30s, 3 retries, retry 30s.
 */
import { z, type ZodType, type ZodTypeDef } from 'zod';
import type { MonitorTypeId } from './constants';

const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

/** A status assertion entry: exact `"200"`, range `"200-299"`, or family `"2XX"`. */
const statusAssertion = z
  .string()
  .regex(/^([1-5]xx|[1-5]\d{2}(-[1-5]\d{2})?)$/i, 'Use a status like "200", "200-299", or "2XX"');

const httpMonitorConfigObject = z.object({
  url: z.string().url().max(2048),
  method: z.enum(HTTP_METHODS).default('GET'),
  expectedStatus: z.array(statusAssertion).min(1).default(['2XX']),
  keyword: z.string().max(1000).optional(),
  /** When true, the check FAILS if the keyword IS present (inverted match). */
  keywordInverted: z.boolean().default(false),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().int().min(0).max(10).default(5),
  ignoreTls: z.boolean().default(false),
  headers: z.record(z.string()).optional(),
});

export const httpMonitorConfigSchema = httpMonitorConfigObject.refine(
  (c) => !c.keywordInverted || c.keyword != null,
  { message: 'keywordInverted requires a keyword', path: ['keywordInverted'] },
);
export type HttpMonitorConfig = z.infer<typeof httpMonitorConfigSchema>;

/** The config schema for each monitor type, keyed by type id. Add a branch per new type. */
export const MONITOR_CONFIG_SCHEMAS: Partial<
  Record<MonitorTypeId, ZodType<unknown, ZodTypeDef, unknown>>
> = {
  http: httpMonitorConfigSchema,
};

/** Output type of a parsed monitor config. Becomes a union as more monitor types are added. */
export type MonitorConfig = HttpMonitorConfig;

const baseMonitorFields = {
  name: z.string().min(1).max(120),
  projectId: z.string().min(1),
  intervalSeconds: z.number().int().min(20).max(86_400).default(60),
  retries: z.number().int().min(0).max(10).default(3),
  retryIntervalSeconds: z.number().int().min(5).max(3_600).default(30),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  isActive: z.boolean().default(true),
};

export const createMonitorSchema = z.discriminatedUnion('type', [
  z.object({ ...baseMonitorFields, type: z.literal('http'), config: httpMonitorConfigSchema }),
]);
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

/**
 * Update (PATCH) DTO. `type` is immutable (resolved server-side from the existing monitor) and
 * `projectId` cannot change, so neither appears here. `config`, when present, REPLACES the whole
 * config object (it is NOT deep-merged) — MVP validates the http shape.
 */
export const updateMonitorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  intervalSeconds: z.number().int().min(20).max(86_400).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  retryIntervalSeconds: z.number().int().min(5).max(3_600).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  isActive: z.boolean().optional(),
  config: httpMonitorConfigSchema.optional(),
});
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

/**
 * Parse a stored `Monitor.config` JSON string for a known monitor type and validate it.
 * The single home for the `config String` round-trip so T3/T8/T16 don't each reinvent it.
 * Throws if the type has no registered schema or the config is invalid.
 */
export function parseMonitorConfig(type: MonitorTypeId, rawJson: string): MonitorConfig {
  const schema = MONITOR_CONFIG_SCHEMAS[type];
  if (!schema) {
    throw new Error(`No config schema registered for monitor type: ${type}`);
  }
  return schema.parse(JSON.parse(rawJson)) as MonitorConfig;
}
