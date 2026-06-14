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
 * Apply pending migrations idempotently (`prisma migrate deploy`). SQLite only for MVP — the
 * Postgres migration set is validated/added in P2.7, so a Postgres URL is a no-op here (the
 * schema + generated client stay in parity regardless).
 */
export function deployMigrations(databaseUrl: string): void {
  const isPostgres =
    databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
  if (isPostgres) {
    console.warn(
      '[pingwatch/db] Postgres detected — skipping migrate deploy (migrations added in P2.7).',
    );
    return;
  }
  const prismaCli = localRequire.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
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
