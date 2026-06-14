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

  return { ...parsed, databaseUrl };
}
