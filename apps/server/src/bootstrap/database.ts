/**
 * First-boot DB bring-up: apply migrations, open the client via the right driver adapter, and
 * (for SQLite) apply the WAL pragmas. Migration + pragma logic lives in @pingwatch/db.
 */
import {
  applySqlitePragmas,
  createPrismaClient,
  deployMigrations,
  isPostgresUrl,
  type PingWatchPrismaClient,
} from '@pingwatch/db';

export async function initDatabase(databaseUrl: string): Promise<PingWatchPrismaClient> {
  deployMigrations(databaseUrl); // idempotent; SQLite for MVP (Postgres migrations: P2.7)
  const client = createPrismaClient({ databaseUrl });
  if (!isPostgresUrl(databaseUrl)) {
    await applySqlitePragmas(client);
  }
  // Touch the connection so a bad DATABASE_URL fails fast at boot, not on first request.
  await client.$queryRawUnsafe('SELECT 1');
  return client;
}
