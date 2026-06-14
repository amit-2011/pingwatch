import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config for the Postgres datasource (the scale path — P2.7). Same canonical model as
 * SQLite; only the provider + migrations differ. Used via `--config` for Postgres migrate commands.
 */
const databaseUrl = process.env.DATABASE_URL ?? '';

export default defineConfig({
  schema: 'prisma/postgres/schema.prisma',
  migrations: {
    path: 'prisma/postgres/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
