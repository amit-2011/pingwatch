import si from 'systeminformation';
import {
  type CheckResult,
  type MonitorCheckContext,
  type MonitorType,
  type SystemMonitorConfig,
  systemMonitorConfigSchema,
} from '@pingwatch/shared';

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Local system metrics (P3.2) — CPU/RAM/Disk/Network of the PingWatch host via `systeminformation`.
 * The metrics ride in `meta` (flagged `isMetric`); a writer persists them to MetricSample. An
 * `agent`-sourced monitor is push-based (P3.3) and isn't actively checked here.
 */
export const systemMonitorType: MonitorType<SystemMonitorConfig> = {
  type: 'system',
  configSchema: systemMonitorConfigSchema,
  validateConfig: (raw: unknown): SystemMonitorConfig => systemMonitorConfigSchema.parse(raw),

  async check(ctx: MonitorCheckContext<SystemMonitorConfig>): Promise<CheckResult> {
    const { config, now } = ctx;
    const start = now();
    if (config.source === 'agent') {
      return { status: 'up', responseTimeMs: 0, message: 'Awaiting agent push' };
    }
    try {
      const [load, mem, fs, net] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
      ]);
      const cpuPct = round(load.currentLoad);
      const memPct = round((mem.active / mem.total) * 100);
      const diskPct = fs.length > 0 ? round(Math.max(...fs.map((f) => f.use))) : 0;
      const netInKbps = round(net.reduce((s, n) => s + Math.max(0, n.rx_sec ?? 0), 0) / 1024);
      const netOutKbps = round(net.reduce((s, n) => s + Math.max(0, n.tx_sec ?? 0), 0) / 1024);
      return {
        status: 'up',
        responseTimeMs: Math.round(now() - start),
        message: `CPU ${cpuPct}% · MEM ${memPct}% · Disk ${diskPct}%`,
        meta: { isMetric: true, cpuPct, memPct, diskPct, netInKbps, netOutKbps },
      };
    } catch (err) {
      return {
        status: 'down',
        responseTimeMs: Math.round(now() - start),
        message: err instanceof Error ? err.message : 'Metric collection failed',
      };
    }
  },
};
