/**
 * Resolve effective config with precedence: CLI flag > env (PINGWATCH_*) > config file
 * (cosmiconfig) > zod default. The config file holds runtime/infra knobs only (PLAN §1.5).
 */
import path from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import { configSchema, type ResolvedConfig } from './schema';

export interface CliFlags {
  port?: number;
  dataDir?: string;
  config?: string;
}

function numberEnv(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fromEnv(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const port = numberEnv(process.env.PINGWATCH_PORT);
  if (port !== undefined) out.port = port;
  if (process.env.PINGWATCH_DATA_DIR) out.dataDir = process.env.PINGWATCH_DATA_DIR;
  if (process.env.DATABASE_URL) out.databaseUrl = process.env.DATABASE_URL;
  if (process.env.PINGWATCH_SCHEDULER) out.scheduler = process.env.PINGWATCH_SCHEDULER;
  if (process.env.REDIS_URL) out.redisUrl = process.env.REDIS_URL;

  // Auth frontend (P4.5) — opt-in. Only the provided keys are set; zod fills the rest.
  const auth: Record<string, unknown> = {};
  const e = process.env;
  if (e.PINGWATCH_AUTH_MODE) auth.mode = e.PINGWATCH_AUTH_MODE;
  if (e.PINGWATCH_AUTH_ALLOW_LOCAL_FALLBACK) auth.allowLocalFallback = e.PINGWATCH_AUTH_ALLOW_LOCAL_FALLBACK !== 'false';
  if (e.PINGWATCH_AUTH_DEFAULT_ROLE) auth.defaultRole = e.PINGWATCH_AUTH_DEFAULT_ROLE;
  if (e.PINGWATCH_TRUSTED_PROXY_CIDRS)
    auth.trustedProxyCidrs = e.PINGWATCH_TRUSTED_PROXY_CIDRS.split(',').map((s) => s.trim()).filter(Boolean);
  if (e.PINGWATCH_HEADER_USER) auth.headerUser = e.PINGWATCH_HEADER_USER.toLowerCase();
  if (e.PINGWATCH_HEADER_EMAIL) auth.headerEmail = e.PINGWATCH_HEADER_EMAIL.toLowerCase();
  if (e.PINGWATCH_HEADER_GROUPS) auth.headerGroups = e.PINGWATCH_HEADER_GROUPS.toLowerCase();
  if (e.PINGWATCH_OIDC_ISSUER) auth.oidcIssuer = e.PINGWATCH_OIDC_ISSUER;
  if (e.PINGWATCH_OIDC_CLIENT_ID) auth.oidcClientId = e.PINGWATCH_OIDC_CLIENT_ID;
  if (e.PINGWATCH_OIDC_CLIENT_SECRET) auth.oidcClientSecret = e.PINGWATCH_OIDC_CLIENT_SECRET;
  if (e.PINGWATCH_OIDC_REDIRECT_URI) auth.oidcRedirectUri = e.PINGWATCH_OIDC_REDIRECT_URI;
  if (e.PINGWATCH_AUTH_GROUP_ROLE_MAP) {
    try {
      auth.groupRoleMap = JSON.parse(e.PINGWATCH_AUTH_GROUP_ROLE_MAP);
    } catch {
      // ignore malformed map
    }
  }
  if (Object.keys(auth).length > 0) out.auth = auth;

  // Secret backend (P4.5) — opt-in.
  const secretBackend: Record<string, unknown> = {};
  if (e.PINGWATCH_SECRET_BACKEND) secretBackend.kind = e.PINGWATCH_SECRET_BACKEND;
  if (e.PINGWATCH_KMS_ENDPOINT) secretBackend.kmsEndpoint = e.PINGWATCH_KMS_ENDPOINT;
  if (e.PINGWATCH_KMS_TOKEN) secretBackend.kmsToken = e.PINGWATCH_KMS_TOKEN;
  if (e.PINGWATCH_KMS_COMMAND) secretBackend.kmsCommand = e.PINGWATCH_KMS_COMMAND;
  if (e.PINGWATCH_KMS_KEY_ID) secretBackend.kmsKeyId = e.PINGWATCH_KMS_KEY_ID;
  if (Object.keys(secretBackend).length > 0) out.secretBackend = secretBackend;
  const raw = numberEnv(process.env.PINGWATCH_RAW_RETENTION_DAYS);
  if (raw !== undefined) out.rawRetentionDays = raw;
  const hourly = numberEnv(process.env.PINGWATCH_HOURLY_RETENTION_DAYS);
  if (hourly !== undefined) out.hourlyRetentionDays = hourly;
  const conc = numberEnv(process.env.PINGWATCH_MAX_CONCURRENCY);
  if (conc !== undefined) out.maxConcurrency = conc;
  return out;
}

function fromFile(configPath: string | undefined): Record<string, unknown> {
  const explorer = cosmiconfigSync('pingwatch');
  const result = configPath ? explorer.load(configPath) : explorer.search();
  const config = result?.config as Record<string, unknown> | undefined;
  return config ?? {};
}

export function resolveConfig(flags: CliFlags = {}): ResolvedConfig {
  const flagLayer: Record<string, unknown> = {};
  if (flags.port !== undefined) flagLayer.port = flags.port;
  if (flags.dataDir !== undefined) flagLayer.dataDir = flags.dataDir;

  const merged = { ...fromFile(flags.config), ...fromEnv(), ...flagLayer };
  const parsed = configSchema.parse(merged);

  const databaseUrl =
    parsed.databaseUrl ?? `file:${path.join(parsed.dataDir, 'pingwatch.db')}`;

  // Graceful fallback (P4.2): the BullMQ scheduler needs a shared Redis AND a shared (Postgres) DB.
  // If either is missing, downgrade to the in-process scheduler rather than crash — the zero-config
  // SQLite default must always boot.
  let scheduler = parsed.scheduler;
  if (scheduler === 'bullmq') {
    const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
    if (!parsed.redisUrl) {
      console.warn('[pingwatch] PINGWATCH_SCHEDULER=bullmq but REDIS_URL is unset — using the in-process scheduler.');
      scheduler = 'in-process';
    } else if (!isPostgres) {
      console.warn('[pingwatch] PINGWATCH_SCHEDULER=bullmq requires a Postgres DATABASE_URL — using the in-process scheduler.');
      scheduler = 'in-process';
    }
  }

  // Fail closed (P4.5): a misconfigured non-local auth or KMS backend must NOT silently fall back to
  // something less secure — refuse to start with a clear error instead.
  if (parsed.auth.mode === 'trusted-header' && parsed.auth.trustedProxyCidrs.length === 0) {
    throw new Error('PINGWATCH_AUTH_MODE=trusted-header requires PINGWATCH_TRUSTED_PROXY_CIDRS (else headers are spoofable).');
  }
  if (parsed.auth.mode === 'oidc' && (!parsed.auth.oidcIssuer || !parsed.auth.oidcClientId || !parsed.auth.oidcRedirectUri)) {
    throw new Error('PINGWATCH_AUTH_MODE=oidc requires PINGWATCH_OIDC_ISSUER, PINGWATCH_OIDC_CLIENT_ID, and PINGWATCH_OIDC_REDIRECT_URI.');
  }
  if (parsed.secretBackend.kind === 'kms' && !parsed.secretBackend.kmsEndpoint && !parsed.secretBackend.kmsCommand) {
    throw new Error('PINGWATCH_SECRET_BACKEND=kms requires PINGWATCH_KMS_ENDPOINT or PINGWATCH_KMS_COMMAND.');
  }

  return { ...parsed, scheduler, databaseUrl };
}
