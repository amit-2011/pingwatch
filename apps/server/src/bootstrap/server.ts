/**
 * Placeholder HTTP server. T5 replaces this with NestJS embedding the built Next.js dashboard
 * (single process, single port). For now it serves a liveness JSON so `pingwatch start` is a
 * fully runnable, testable command from T4 onward.
 */
import http from 'node:http';
import type { PingWatchPrismaClient } from '@pingwatch/db';

export interface ServerHandle {
  close(): Promise<void>;
}

export interface StartServerOptions {
  port: number;
  db: PingWatchPrismaClient;
}

export function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'pingwatch',
        note: 'bootstrap placeholder — API + dashboard land in T5',
      }),
    );
  });

  return new Promise<ServerHandle>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => {
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
