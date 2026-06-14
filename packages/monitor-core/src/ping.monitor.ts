import ping from 'ping';
import {
  type CheckResult,
  type MonitorCheckContext,
  type MonitorType,
  type PingMonitorConfig,
  pingMonitorConfigSchema,
} from '@pingwatch/shared';

/** ICMP ping — unprivileged shell-out to the system `ping` (iputils in the Docker image). */
export const pingMonitorType: MonitorType<PingMonitorConfig> = {
  type: 'ping',
  configSchema: pingMonitorConfigSchema,
  validateConfig: (raw: unknown): PingMonitorConfig => pingMonitorConfigSchema.parse(raw),

  async check(ctx: MonitorCheckContext<PingMonitorConfig>): Promise<CheckResult> {
    const { config, now } = ctx;
    const start = now();
    try {
      const res = await ping.promise.probe(config.host, { timeout: 10, extra: ['-c', '1'] });
      const elapsed = Math.round(now() - start);
      if (res.alive) {
        const rtt = typeof res.time === 'number' ? Math.round(res.time) : elapsed;
        return { status: 'up', responseTimeMs: rtt, message: `Host alive (${res.time} ms)` };
      }
      return { status: 'down', responseTimeMs: elapsed, message: `${config.host} is unreachable` };
    } catch (err) {
      return {
        status: 'down',
        responseTimeMs: Math.round(now() - start),
        message: err instanceof Error ? err.message : 'Ping failed',
      };
    }
  },
};
