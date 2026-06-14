import { Resolver } from 'node:dns/promises';
import {
  type CheckResult,
  type DnsMonitorConfig,
  type MonitorCheckContext,
  type MonitorType,
  dnsMonitorConfigSchema,
} from '@pingwatch/shared';

/** DNS resolution — up if the record resolves (and, if set, contains `expectedValue`). */
export const dnsMonitorType: MonitorType<DnsMonitorConfig> = {
  type: 'dns',
  configSchema: dnsMonitorConfigSchema,
  validateConfig: (raw: unknown): DnsMonitorConfig => dnsMonitorConfigSchema.parse(raw),

  async check(ctx: MonitorCheckContext<DnsMonitorConfig>): Promise<CheckResult> {
    const { config, signal, now } = ctx;
    const start = now();
    const resolver = new Resolver();
    signal.addEventListener('abort', () => resolver.cancel(), { once: true });

    try {
      const records = await resolver.resolve(config.hostname, config.recordType);
      const responseTimeMs = Math.round(now() - start);
      if (config.expectedValue !== undefined && !JSON.stringify(records).includes(config.expectedValue)) {
        return {
          status: 'down',
          responseTimeMs,
          message: `"${config.expectedValue}" not found in ${config.recordType} records`,
        };
      }
      const count = Array.isArray(records) ? records.length : 0;
      return { status: 'up', responseTimeMs, message: `Resolved ${count} ${config.recordType} record(s)` };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return {
        status: 'down',
        responseTimeMs: Math.round(now() - start),
        message: code ?? (err instanceof Error ? err.message : 'DNS resolution failed'),
      };
    }
  },
};
