/**
 * Runtime/infra config (PLAN §1.5). The config FILE is scoped to these knobs ONLY — monitors are
 * never declared in config for MVP (DB is the single source of truth). Env names are the canonical
 * ones used across the engine + settings UI.
 */
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { SECRET_BACKENDS, SSO_MODES, USER_ROLES } from '@pingwatch/shared';

export const DEFAULT_PORT = 3001;
export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.pingwatch');

// All OPT-IN (P4.5). Defaults keep local-password auth + a file-based secret = today's behavior.
const authConfigSchema = z
  .object({
    mode: z.enum(SSO_MODES).default('local'),
    autoProvision: z.boolean().default(true),
    defaultRole: z.enum(USER_ROLES).default('viewer'),
    groupRoleMap: z.record(z.enum(USER_ROLES)).default({}),
    trustedProxyCidrs: z.array(z.string()).default([]),
    headerUser: z.string().default('x-forwarded-user'),
    headerEmail: z.string().default('x-forwarded-email'),
    headerGroups: z.string().default('x-forwarded-groups'),
    oidcIssuer: z.string().url().optional(),
    oidcClientId: z.string().optional(),
    oidcClientSecret: z.string().optional(),
    oidcRedirectUri: z.string().url().optional(),
    oidcEmailClaim: z.string().default('email'),
    oidcGroupsClaim: z.string().default('groups'),
  })
  .default({});

const secretBackendConfigSchema = z
  .object({
    kind: z.enum(SECRET_BACKENDS).default('file'),
    kmsEndpoint: z.string().url().optional(),
    kmsToken: z.string().optional(),
    kmsCommand: z.string().optional(),
    kmsKeyId: z.string().optional(),
  })
  .default({});

export const configSchema = z.object({
  port: z.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  dataDir: z.string().min(1).default(DEFAULT_DATA_DIR),
  /** When unset, derived as `file:<dataDir>/pingwatch.db`. A postgres(ql):// URL selects Postgres. */
  databaseUrl: z.string().min(1).optional(),
  scheduler: z.enum(['in-process', 'bullmq']).default('in-process'),
  /** Redis connection for the BullMQ scheduler (P4.2). Required when scheduler is `bullmq`. */
  redisUrl: z.string().url().optional(),
  rawRetentionDays: z.number().int().min(1).default(7),
  hourlyRetentionDays: z.number().int().min(1).default(90),
  maxConcurrency: z.number().int().min(1).max(1_000).default(50),
  separate: z.boolean().default(false),
  auth: authConfigSchema,
  secretBackend: secretBackendConfigSchema,
});

export type PingWatchConfig = z.infer<typeof configSchema>;

/** Config after resolution: `databaseUrl` is always present (derived from `dataDir` if unset). */
export type ResolvedConfig = Omit<PingWatchConfig, 'databaseUrl'> & { databaseUrl: string };
