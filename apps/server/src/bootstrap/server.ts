/**
 * The single-process server (PLAN §1.4): one Express instance owns the port, NestJS serves `/api`
 * + (later) the WebSocket gateway, and everything else falls through to the embedded Next.js
 * dashboard via `next().getRequestHandler()`. No second process, no CORS.
 *
 * Load-bearing order: (1) body parsers scoped to `/api` ONLY — added BEFORE Nest registers routes
 * so they run first, and scoped so they never touch Next (avoids the double-parse hang); (2) Nest
 * routes under the `api` global prefix; (3) the Next catch-all LAST. Next's request handler serves
 * `/_next/static` and `/public` itself, so no separate static middleware is needed.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import next from 'next';
import { Logger } from 'nestjs-pino';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import type { ResolvedConfig } from '../config/schema';

export interface ServerHandle {
  close(): Promise<void>;
}

export interface StartServerOptions {
  port: number;
  db: PingWatchPrismaClient;
  secret: string;
  config: ResolvedConfig;
  /** Next dev mode (HMR). Default false — production embed serves the prebuilt `.next`. */
  dev?: boolean;
}

/** Locate the @pingwatch/web package dir (holds `.next` + next config) robustly. */
function resolveWebDir(): string {
  try {
    const localRequire = createRequire(__filename);
    return path.dirname(localRequire.resolve('@pingwatch/web/package.json'));
  } catch {
    // Fallback: monorepo-relative (apps/server/dist/bootstrap → apps/web).
    return path.resolve(__dirname, '../../../web');
  }
}

export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const dev = options.dev ?? false;
  const nextApp = next({ dev, dir: resolveWebDir() });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  const expressApp = express();
  // (1) security headers + body parsers FIRST, scoped to /api only (Next manages its own).
  expressApp.use('/api', helmet());
  expressApp.use('/api', express.json());
  expressApp.use('/api', express.urlencoded({ extended: true }));

  // (2) Route everything that is NOT /api to Next, BEFORE Nest — otherwise Nest's router 404s
  // unmatched paths ("Cannot GET /") and the dashboard never renders. /api falls through to Nest.
  expressApp.use((req, res, nextFn) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      nextFn();
      return;
    }
    void handle(req, res);
  });

  // (3) Nest under the `api` global prefix (its own body parsing disabled) — registered LAST so it
  // only ever sees /api requests that fell through the Next router above.
  const nestApp = await NestFactory.create(
    AppModule.register({ secret: options.secret, db: options.db, config: options.config }),
    new ExpressAdapter(expressApp),
    { bodyParser: false, bufferLogs: true },
  );
  nestApp.useLogger(nestApp.get(Logger));
  nestApp.useGlobalFilters(new AllExceptionsFilter());
  nestApp.setGlobalPrefix('api');
  await nestApp.init();

  const httpServer = expressApp.listen(options.port);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', () => resolve());
    httpServer.once('error', reject);
  });

  return {
    async close(): Promise<void> {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await nestApp.close();
    },
  };
}
