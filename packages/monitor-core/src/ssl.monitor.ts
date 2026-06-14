import { connect } from 'node:tls';
import {
  type CheckResult,
  type MonitorCheckContext,
  type MonitorType,
  type SslMonitorConfig,
  sslMonitorConfigSchema,
} from '@pingwatch/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/** SSL/TLS certificate expiry — down if the cert is expired or expires within `warnDays`. */
export const sslMonitorType: MonitorType<SslMonitorConfig> = {
  type: 'ssl',
  configSchema: sslMonitorConfigSchema,
  validateConfig: (raw: unknown): SslMonitorConfig => sslMonitorConfigSchema.parse(raw),

  check(ctx: MonitorCheckContext<SslMonitorConfig>): Promise<CheckResult> {
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
      // rejectUnauthorized:false so we can inspect expired/self-signed certs and decide ourselves.
      const socket = connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: false });
      if (signal.aborted) {
        finish({ status: 'down', responseTimeMs: 0, message: 'Timeout' });
        return;
      }
      signal.addEventListener('abort', () => finish({ status: 'down', responseTimeMs: elapsed(), message: 'Timeout' }), { once: true });

      socket.once('secureConnect', () => {
        const cert = socket.getPeerCertificate();
        if (!cert.valid_to) {
          finish({ status: 'down', responseTimeMs: elapsed(), message: 'No certificate presented' });
          return;
        }
        const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / DAY_MS);
        if (daysLeft < 0) {
          finish({ status: 'down', responseTimeMs: elapsed(), message: `Certificate expired ${-daysLeft}d ago`, meta: { daysLeft } });
        } else if (daysLeft <= config.warnDays) {
          finish({ status: 'down', responseTimeMs: elapsed(), message: `Certificate expires in ${daysLeft}d`, meta: { daysLeft } });
        } else {
          finish({ status: 'up', responseTimeMs: elapsed(), message: `Certificate valid — ${daysLeft}d left`, meta: { daysLeft } });
        }
      });
      socket.once('error', (err: NodeJS.ErrnoException) =>
        finish({ status: 'down', responseTimeMs: elapsed(), message: err.code ?? err.message }),
      );
    });
  },
};
