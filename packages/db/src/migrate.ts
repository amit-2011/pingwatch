/**
 * First-boot migration + SQLite tuning helpers. Co-located with the schema so the server just
 * calls `deployMigrations(url)` without knowing where the schema/migrations/config live.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PrismaClient } from './generated-sqlite/client';

const localRequire = createRequire(__filename);

/** The @pingwatch/db package root (holds prisma.config.ts + prisma/). At runtime: dist/.. */
function packageRoot(): string {
  return path.resolve(__dirname, '..');
}

/**
 * Apply pending migrations idempotently (`prisma migrate deploy`). Picks the SQLite or Postgres
 * migration set + config by the DATABASE_URL scheme (P2.7).
 */
export function deployMigrations(databaseUrl: string): void {
  const isPostgres =
    databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
  const prismaCli = localRequire.resolve('prisma/build/index.js');
  const args = ['migrate', 'deploy'];
  if (isPostgres) args.push('--config', 'prisma.config.postgres.ts');
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: packageRoot(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed (exit code ${result.status ?? 'null'})`);
  }
}

/**
 * SQLite tuning applied on connect (PLAN §1.5): WAL + NORMAL sync + a busy timeout so concurrent
 * writers never surface a transient SQLITE_BUSY as a false monitor outage.
 */
export async function applySqlitePragmas(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
  await client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  await client.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
}
