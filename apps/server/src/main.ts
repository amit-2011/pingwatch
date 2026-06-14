/**
 * @pingwatch/server bootstrap orchestrator. `startPingWatch` runs the full first-boot pipeline:
 * resolve config → ensure data dir + secret → migrate → connect (WAL) → listen. T5 grows the
 * placeholder server into NestJS + the embedded Next.js dashboard; T7 adds first-run seed/setup.
 */
import { deployMigrations } from '@pingwatch/db';
import { resolveConfig, type CliFlags } from './config/resolve';
import { initDatabase } from './bootstrap/database';
import { ensureDataDir } from './bootstrap/paths';
import { ensureSecret } from './bootstrap/secret';
import { startServer } from './bootstrap/server';

export async function startPingWatch(flags: CliFlags = {}): Promise<void> {
  const config = resolveConfig(flags);
  ensureDataDir(config.dataDir);
  ensureSecret(config.dataDir);

  console.log(`[pingwatch] data dir : ${config.dataDir}`);
  console.log(`[pingwatch] database : ${config.databaseUrl}`);

  const db = await initDatabase(config.databaseUrl);
  const server = await startServer({ port: config.port, db });

  console.log(`[pingwatch] running  → http://localhost:${config.port}`);

  const shutdown = (signal: string): void => {
    console.log(`\n[pingwatch] ${signal} received, shutting down…`);
    void Promise.allSettled([server.close(), db.$disconnect()]).then(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

export async function runMigrate(flags: CliFlags = {}): Promise<void> {
  const config = resolveConfig(flags);
  ensureDataDir(config.dataDir);
  deployMigrations(config.databaseUrl);
  console.log('[pingwatch] migrations applied.');
}
