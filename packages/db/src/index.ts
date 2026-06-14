/**
 * @pingwatch/db — one canonical Prisma model, two generated clients (SQLite = zero-config
 * default, Postgres = scale). This module re-exports the SQLite-generated typed surface as the
 * canonical types and exposes `createPrismaClient()`, which selects the datasource + Prisma 7
 * driver adapter by DATABASE_URL.
 *
 * Both generated schemas are identical, so the two PrismaClient types are structurally the same;
 * the Postgres client is returned cast to the canonical SQLite-generated `PrismaClient` type.
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as SqlitePrismaClient } from './generated-sqlite/client';
import { PrismaClient as PostgresPrismaClient } from './generated-postgres/client';

// Canonical typed surface: PrismaClient (type), the `Prisma` namespace, model + input types.
export * from './generated-sqlite/client';

// First-boot migrate + SQLite tuning (co-located with the schema).
export { deployMigrations, applySqlitePragmas } from './migrate';

/** The canonical PrismaClient type used across the app (SQLite-generated; structurally shared). */
export type PingWatchPrismaClient = SqlitePrismaClient;

export interface CreatePrismaClientOptions {
  /** Connection string. Defaults to `process.env.DATABASE_URL`. */
  databaseUrl?: string;
}

/** A DATABASE_URL is Postgres iff it uses the postgres(ql) scheme; everything else is SQLite. */
export function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * Build a PrismaClient wired to the right datasource + driver adapter. The actual connection is
 * lazy (Prisma connects on first query); first-boot migrate + SQLite WAL pragmas live in T4.
 */
export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PingWatchPrismaClient {
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set (e.g. "file:./pingwatch.db" or "postgresql://user:pass@host/db").',
    );
  }

  if (isPostgresUrl(url)) {
    const adapter = new PrismaPg(url);
    return new PostgresPrismaClient({ adapter }) as unknown as PingWatchPrismaClient;
  }

  const adapter = new PrismaBetterSqlite3({ url });
  return new SqlitePrismaClient({ adapter });
}
