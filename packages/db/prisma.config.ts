import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config (datasource URLs live here, not in schema.prisma). This drives the SQLite
 * migrate workflow — the zero-config self-host default. The Postgres schema + generated client
 * exist and stay in parity, but Postgres migrations are validated/added in P2.7 (Postgres
 * hardening); generate for both clients is done via the `generate` script with explicit --schema.
 */
const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';

export default defineConfig({
  schema: 'prisma/sqlite/schema.prisma',
  migrations: {
    path: 'prisma/sqlite/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
