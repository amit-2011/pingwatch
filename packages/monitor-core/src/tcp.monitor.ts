import { createConnection } from 'node:net';
import {
  type CheckResult,
  type MonitorCheckContext,
  type MonitorType,
  type TcpMonitorConfig,
  tcpMonitorConfigSchema,
} from '@pingwatch/shared';

/** TCP port reachability — up if a connection opens before the timeout. */
export const tcpMonitorType: MonitorType<TcpMonitorConfig> = {
  type: 'tcp',
  configSchema: tcpMonitorConfigSchema,
  validateConfig: (raw: unknown): TcpMonitorConfig => tcpMonitorConfigSchema.parse(raw),

  check(ctx: MonitorCheckContext<TcpMonitorConfig>): Promise<CheckResult> {
    const { config, signal, now } = ctx;
    const start = now();
    const elapsed = (): number => Math.round(now() - start);

    return new Promise<CheckResult>((resolve) => {
      let settled = false;
      const finish = (result: CheckResult): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      const socket = createConnection({ host: config.host, port: config.port });
      if (signal.aborted) {
        finish({ status: 'down', responseTimeMs: 0, message: 'Timeout' });
        return;
      }
      signal.addEventListener('abort', () => finish({ status: 'down', responseTimeMs: elapsed(), message: 'Timeout' }), { once: true });
      socket.once('connect', () =>
        finish({ status: 'up', responseTimeMs: elapsed(), message: `Connected to ${config.host}:${config.port}` }),
      );
      socket.once('error', (err: NodeJS.ErrnoException) =>
        finish({ status: 'down', responseTimeMs: elapsed(), message: err.code ?? err.message }),
      );
    });
  },
};
